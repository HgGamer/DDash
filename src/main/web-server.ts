// Mobile-friendly LAN web UI for Dash. Serves a small single-page app
// (Projects / Workspace / Git / Settings) protected by a session cookie.
// PTY I/O flows over a hand-rolled WebSocket (RFC 6455) so we don't add a
// dependency; everything else is a JSON REST API.
//
// Wire protocol (JSON text frames over the WebSocket):
//
//   client → server:
//     { type: "list" }
//     { type: "attach", key, cols, rows }
//     { type: "input",  data }            // base64 bytes
//     { type: "resize", cols, rows }
//     { type: "detach" }
//
//   server → client:
//     { type: "tabs",      tabs: [{ key, title }] }
//     { type: "attached",  key }
//     { type: "data",      data }         // base64 PTY bytes
//     { type: "error",     message }
//     { type: "closed" }
//
// REST API (all auth-gated, JSON):
//   GET  /api/tabs                         active PTY sessions
//   GET  /api/style                        resolved xterm style options
//   GET  /api/projects                     registry + live session keys + branch
//   GET  /api/git/status?projectId&worktreeId
//   GET  /api/git/diff?projectId&worktreeId&path&stage
//   POST /api/git/stage     { projectId, worktreeId, paths }
//   POST /api/git/unstage   { projectId, worktreeId, paths }
//   POST /api/git/commit    { projectId, worktreeId, subject }
//   GET  /api/files?projectId&worktreeId&path   directory listing
//   GET  /api/file?projectId&worktreeId&path    file content (capped)

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import type { Socket } from 'node:net';
import type { PtySessionManager } from './pty-session';
import type { ProjectRegistry } from './registry';
import type { TerminalStyleOptions } from '@shared/types';
import { runGit, runWriteGit } from './git-runner';
import { parsePorcelainV2, STATUS_ARGS } from './git-parsers';
import { APP_HTML, LOGIN_HTML } from './web-ui';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const COOKIE_NAME = 'dash_web';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export interface WebServerDeps {
  registry: ProjectRegistry;
  ptyManager: PtySessionManager;
  compositeKey(projectId: string, worktreeId: string | null): string;
  /** Resolved xterm options matching whatever the desktop window is using. */
  getTerminalStyle: () => TerminalStyleOptions;
}

interface WebSocketClient {
  socket: Socket;
  attachedKey: string | null;
  buffer: Buffer;
  alive: boolean;
}

interface SessionEntry {
  expiresAt: number;
}

export interface WebServerStartOpts {
  port: number;
  password: string;
}

export class WebServer {
  private server: http.Server | null = null;
  private currentPort = 0;
  private password = '';
  private sessions = new Map<string, SessionEntry>();
  private wsClients = new Set<WebSocketClient>();
  private fanouts = new Map<string, Set<WebSocketClient>>();

  constructor(private deps: WebServerDeps) {}

  isRunning(): boolean { return this.server !== null; }
  getPort(): number { return this.currentPort; }

  /** Format addresses suitable for displaying to the user. */
  getLanUrls(): string[] {
    if (!this.isRunning()) return [];
    const ifaces = os.networkInterfaces();
    const urls: string[] = [];
    for (const list of Object.values(ifaces)) {
      for (const ni of list ?? []) {
        if (ni.family === 'IPv4' && !ni.internal) {
          urls.push(`http://${ni.address}:${this.currentPort}`);
        }
      }
    }
    urls.push(`http://localhost:${this.currentPort}`);
    return urls;
  }

  start(opts: WebServerStartOpts): Promise<void> {
    if (this.server) {
      // Already running — caller should have stopped first if changing port.
      return Promise.resolve();
    }
    if (!opts.password) {
      return Promise.reject(new Error('web access requires a non-empty password'));
    }
    this.password = opts.password;
    this.currentPort = opts.port;

    const server = http.createServer((req, res) => this.handleHttp(req, res));
    server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket as Socket, head));
    server.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[web-server] error:', err.message);
    });
    return new Promise((resolve, reject) => {
      const onErr = (err: Error) => { server.off('listening', onOk); reject(err); };
      const onOk = () => {
        server.off('error', onErr);
        this.server = server;
        // eslint-disable-next-line no-console
        console.log(`[web-server] listening on :${opts.port} — ${this.getLanUrls().join(' ')}`);
        resolve();
      };
      server.once('error', onErr);
      server.once('listening', onOk);
      server.listen(opts.port, '0.0.0.0');
    });
  }

  stop(): Promise<void> {
    const srv = this.server;
    if (!srv) return Promise.resolve();
    this.server = null;
    for (const c of this.wsClients) {
      try { c.socket.destroy(); } catch { /* ignore */ }
    }
    this.wsClients.clear();
    this.fanouts.clear();
    this.sessions.clear();
    this.password = '';
    return new Promise((resolve) => {
      srv.close(() => resolve());
    });
  }

  /** Called from ipc.ts for every chunk of PTY output. */
  feed(key: string, data: string): void {
    const subs = this.fanouts.get(key);
    if (!subs || subs.size === 0) return;
    const b64 = Buffer.from(data, 'binary').toString('base64');
    const msg = JSON.stringify({ type: 'data', data: b64 });
    for (const c of subs) this.sendText(c, msg);
  }

  // ── HTTP ─────────────────────────────────────────────────────────────

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url ?? '/';
    const path = url.split('?')[0];
    const query = new URLSearchParams(url.split('?')[1] ?? '');

    if (req.method === 'GET' && path === '/login') {
      this.sendLoginPage(res, null);
      return;
    }
    if (req.method === 'POST' && path === '/login') {
      this.handleLogin(req, res);
      return;
    }
    if (req.method === 'GET' && path === '/logout') {
      const tok = this.cookieToken(req);
      if (tok) this.sessions.delete(tok);
      res.writeHead(303, { Location: '/login', 'Set-Cookie': `${COOKIE_NAME}=; Max-Age=0; Path=/` });
      res.end();
      return;
    }

    // Auth gate for everything else.
    if (!this.isAuthed(req)) {
      res.writeHead(303, { Location: '/login' });
      res.end();
      return;
    }

    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.renderApp());
      return;
    }
    if (path.startsWith('/api/')) {
      void this.handleApi(req, res, path, query).catch((err: Error) => {
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: err.message });
        else res.end();
      });
      return;
    }
    res.writeHead(404); res.end('not found');
  }

  // ── REST API ─────────────────────────────────────────────────────────

  private async handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    path: string,
    query: URLSearchParams,
  ): Promise<void> {
    if (req.method === 'GET') {
      switch (path) {
        case '/api/tabs':
          sendJson(res, 200, { tabs: this.listTabs() });
          return;
        case '/api/style':
          sendJson(res, 200, this.deps.getTerminalStyle());
          return;
        case '/api/projects':
          sendJson(res, 200, { projects: await this.listProjects() });
          return;
        case '/api/git/status':
          await this.apiGitStatus(res, query);
          return;
        case '/api/git/diff':
          await this.apiGitDiff(res, query);
          return;
        case '/api/files':
          await this.apiFiles(res, query);
          return;
        case '/api/file':
          await this.apiFile(res, query);
          return;
      }
    }
    if (req.method === 'POST') {
      switch (path) {
        case '/api/git/stage':
        case '/api/git/unstage':
          await this.apiGitStagePaths(req, res, path === '/api/git/stage');
          return;
        case '/api/git/commit':
          await this.apiGitCommit(req, res);
          return;
      }
    }
    sendJson(res, 404, { ok: false, error: 'not found' });
  }

  /** Resolve a project/worktree pair to its working directory. */
  private resolveCwd(projectId: string, worktreeId: string | null): string | null {
    const proj = this.deps.registry.getById(projectId);
    if (!proj) return null;
    if (!worktreeId) return proj.path;
    const wt = proj.worktrees.find((w) => w.id === worktreeId);
    return wt ? wt.path : null;
  }

  private resolveCwdFromQuery(query: URLSearchParams): string | null {
    return this.resolveCwd(query.get('projectId') ?? '', query.get('worktreeId') || null);
  }

  private async listProjects(): Promise<unknown[]> {
    const keys = this.deps.ptyManager.keys();
    const keysFor = (base: string): string[] =>
      keys.filter((k) => k === base || k.startsWith(`${base}::agent:`));
    return Promise.all(this.deps.registry.list().map(async (p) => {
      let branch: string | null = null;
      if (p.isGitRepo !== false) {
        const r = await runGit(p.path, ['rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5_000 });
        if (r.ok) branch = r.stdout.trim() || null;
      }
      const rootKeys = keysFor(this.deps.compositeKey(p.id, null));
      return {
        id: p.id,
        name: p.name,
        path: p.path,
        lastOpenedAt: p.lastOpenedAt,
        branch,
        active: rootKeys.length > 0,
        sessionKeys: rootKeys,
        worktrees: p.worktrees.map((w) => {
          const wtKeys = keysFor(this.deps.compositeKey(p.id, w.id));
          return {
            id: w.id,
            branch: w.branch,
            lastOpenedAt: w.lastOpenedAt,
            active: wtKeys.length > 0,
            sessionKeys: wtKeys,
          };
        }),
      };
    }));
  }

  private async apiGitStatus(res: http.ServerResponse, query: URLSearchParams): Promise<void> {
    const cwd = this.resolveCwdFromQuery(query);
    if (!cwd) { sendJson(res, 404, { ok: false, error: 'project not found' }); return; }
    const r = await runGit(cwd, STATUS_ARGS);
    if (!r.ok) { sendJson(res, 200, { ok: false, error: gitFailMessage(r.stderr, 'git status failed') }); return; }
    sendJson(res, 200, { ok: true, status: parsePorcelainV2(r.stdout, cwd) });
  }

  private async apiGitDiff(res: http.ServerResponse, query: URLSearchParams): Promise<void> {
    const cwd = this.resolveCwdFromQuery(query);
    if (!cwd) { sendJson(res, 404, { ok: false, error: 'project not found' }); return; }
    const filePath = query.get('path') ?? '';
    const stage = query.get('stage') ?? 'unstaged';
    if (!filePath) { sendJson(res, 400, { ok: false, error: 'path required' }); return; }
    let args: string[];
    if (stage === 'untracked') {
      // `diff --no-index` exits 1 when there are differences — expected here.
      args = ['diff', '--no-index', '--no-color', '--', '/dev/null', filePath];
    } else {
      args = ['diff', '--no-color'];
      if (stage === 'staged') args.push('--cached');
      args.push('--', filePath);
    }
    const r = await runGit(cwd, args);
    const acceptableExit = stage === 'untracked' && r.exitCode === 1;
    if (!r.ok && !acceptableExit) {
      sendJson(res, 200, { ok: false, error: gitFailMessage(r.stderr, 'git diff failed') });
      return;
    }
    const binary = /^Binary files .* differ$/m.test(r.stdout);
    sendJson(res, 200, { ok: true, diff: r.stdout, binary });
  }

  private async apiGitStagePaths(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    stage: boolean,
  ): Promise<void> {
    const body = await readJsonBody(req);
    if (!body) { sendJson(res, 400, { ok: false, error: 'invalid body' }); return; }
    const cwd = this.resolveCwd(asString(body.projectId), asString(body.worktreeId) || null);
    if (!cwd) { sendJson(res, 404, { ok: false, error: 'project not found' }); return; }
    const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string') : [];
    if (paths.length === 0) { sendJson(res, 200, { ok: true }); return; }
    const args = stage ? ['add', '--', ...paths] : ['restore', '--staged', '--', ...paths];
    const r = await runWriteGit(cwd, args);
    if (!r.ok) {
      sendJson(res, 200, { ok: false, error: gitFailMessage(r.stderr, stage ? 'git add failed' : 'git restore failed') });
      return;
    }
    sendJson(res, 200, { ok: true });
  }

  private async apiGitCommit(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
    if (!body) { sendJson(res, 400, { ok: false, error: 'invalid body' }); return; }
    const cwd = this.resolveCwd(asString(body.projectId), asString(body.worktreeId) || null);
    if (!cwd) { sendJson(res, 404, { ok: false, error: 'project not found' }); return; }
    const subject = asString(body.subject).trim();
    if (!subject) { sendJson(res, 400, { ok: false, error: 'commit subject is empty' }); return; }
    const r = await runWriteGit(cwd, ['commit', '-m', subject]);
    if (!r.ok) {
      sendJson(res, 200, { ok: false, error: gitFailMessage(r.stderr || r.stdout, 'git commit failed') });
      return;
    }
    sendJson(res, 200, { ok: true });
  }

  /** Resolve `rel` inside `root`, rejecting anything that escapes the tree. */
  private safeJoin(root: string, rel: string): string | null {
    const abs = nodePath.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + nodePath.sep)) return null;
    return abs;
  }

  private async apiFiles(res: http.ServerResponse, query: URLSearchParams): Promise<void> {
    const cwd = this.resolveCwdFromQuery(query);
    if (!cwd) { sendJson(res, 404, { ok: false, error: 'project not found' }); return; }
    const abs = this.safeJoin(cwd, query.get('path') ?? '');
    if (!abs) { sendJson(res, 400, { ok: false, error: 'invalid path' }); return; }
    let dirents;
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch (err) {
      sendJson(res, 200, { ok: false, error: (err as Error).message });
      return;
    }
    const entries: Array<{ name: string; dir: boolean; size: number }> = [];
    for (const d of dirents) {
      if (d.name === '.git') continue;
      let size = 0;
      const dir = d.isDirectory();
      if (!dir) {
        try { size = (await fs.stat(nodePath.join(abs, d.name))).size; } catch { /* ignore */ }
      }
      entries.push({ name: d.name, dir, size });
    }
    entries.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    sendJson(res, 200, { ok: true, entries });
  }

  private async apiFile(res: http.ServerResponse, query: URLSearchParams): Promise<void> {
    const cwd = this.resolveCwdFromQuery(query);
    if (!cwd) { sendJson(res, 404, { ok: false, error: 'project not found' }); return; }
    const rel = query.get('path') ?? '';
    const abs = rel ? this.safeJoin(cwd, rel) : null;
    if (!abs) { sendJson(res, 400, { ok: false, error: 'invalid path' }); return; }
    const MAX_BYTES = 256 * 1024;
    let buf: Buffer;
    let truncated = false;
    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) { sendJson(res, 400, { ok: false, error: 'not a file' }); return; }
      if (st.size > MAX_BYTES) {
        truncated = true;
        const fh = await fs.open(abs, 'r');
        try {
          buf = Buffer.alloc(MAX_BYTES);
          const { bytesRead } = await fh.read(buf, 0, MAX_BYTES, 0);
          buf = buf.subarray(0, bytesRead);
        } finally {
          await fh.close();
        }
      } else {
        buf = await fs.readFile(abs);
      }
    } catch (err) {
      sendJson(res, 200, { ok: false, error: (err as Error).message });
      return;
    }
    const binary = buf.subarray(0, 8000).includes(0);
    sendJson(res, 200, {
      ok: true,
      binary,
      truncated,
      content: binary ? '' : buf.toString('utf8'),
    });
  }

  private handleLogin(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 4096) {
        res.writeHead(413); res.end('too large');
        req.destroy();
      }
    });
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const submitted = params.get('password') ?? '';
      const a = Buffer.from(submitted, 'utf8');
      const b = Buffer.from(this.password, 'utf8');
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) {
        this.sendLoginPage(res, 'Incorrect password.');
        return;
      }
      const token = crypto.randomBytes(32).toString('hex');
      this.sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
      res.writeHead(303, {
        Location: '/',
        'Set-Cookie': `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
      });
      res.end();
    });
  }

  private sendLoginPage(res: http.ServerResponse, error: string | null): void {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(LOGIN_HTML.replace('{{ERROR}}', error ? escapeHtml(error) : ''));
  }

  private isAuthed(req: http.IncomingMessage): boolean {
    const tok = this.cookieToken(req);
    if (!tok) return false;
    const entry = this.sessions.get(tok);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.sessions.delete(tok);
      return false;
    }
    return true;
  }

  private cookieToken(req: http.IncomingMessage): string | null {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of raw.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === COOKIE_NAME) return rest.join('=');
    }
    return null;
  }

  private listTabs(): Array<{ key: string; title: string }> {
    return this.deps.ptyManager.keys().map((key) => ({ key, title: this.titleForKey(key) }));
  }

  private titleForKey(key: string): string {
    const i = key.indexOf(':');
    const projId = i < 0 ? key : key.slice(0, i);
    const wtId   = i < 0 ? null : key.slice(i + 1);
    const proj = this.deps.registry.getById?.(projId);
    if (!proj) return key;
    const projName = (proj.name ?? proj.path ?? projId) as string;
    if (!wtId) return projName;
    const wt = proj.worktrees?.find((w: { id: string }) => w.id === wtId);
    return wt ? `${projName} · ${(wt.branch ?? wtId) as string}` : projName;
  }

  // ── WebSocket ────────────────────────────────────────────────────────

  private handleUpgrade(req: http.IncomingMessage, socket: Socket, head: Buffer): void {
    if (req.url?.split('?')[0] !== '/ws' || !this.isAuthed(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const client: WebSocketClient = { socket, attachedKey: null, buffer: head.length ? Buffer.from(head) : Buffer.alloc(0), alive: true };
    this.wsClients.add(client);
    socket.on('data', (chunk) => this.onWsData(client, chunk));
    socket.on('close', () => this.closeWs(client));
    socket.on('error', () => this.closeWs(client));
    // If `head` already contained frame bytes, process them.
    if (client.buffer.length > 0) this.parseFrames(client);
  }

  private closeWs(client: WebSocketClient): void {
    if (!client.alive) return;
    client.alive = false;
    this.detachWs(client);
    this.wsClients.delete(client);
    try { client.socket.destroy(); } catch { /* ignore */ }
  }

  private detachWs(client: WebSocketClient): void {
    if (!client.attachedKey) return;
    const subs = this.fanouts.get(client.attachedKey);
    if (subs) {
      subs.delete(client);
      if (subs.size === 0) this.fanouts.delete(client.attachedKey);
    }
    client.attachedKey = null;
  }

  private onWsData(client: WebSocketClient, chunk: Buffer): void {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    this.parseFrames(client);
  }

  private parseFrames(client: WebSocketClient): void {
    while (client.alive) {
      const f = parseFrame(client.buffer);
      if (!f) return;
      client.buffer = client.buffer.subarray(f.consumed);
      switch (f.opcode) {
        case 0x1: // text
          this.handleClientMessage(client, f.payload.toString('utf8'));
          break;
        case 0x8: // close
          this.sendClose(client);
          this.closeWs(client);
          return;
        case 0x9: // ping
          this.sendFrame(client, 0xA, f.payload);
          break;
        case 0xA: // pong
          break;
        default:
          // Unsupported (binary / continuation) — ignore.
          break;
      }
    }
  }

  private handleClientMessage(client: WebSocketClient, text: string): void {
    let msg: unknown;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    switch (m.type) {
      case 'list': {
        this.sendText(client, JSON.stringify({ type: 'tabs', tabs: this.listTabs() }));
        return;
      }
      case 'attach': {
        const key = typeof m.key === 'string' ? m.key : '';
        const cols = typeof m.cols === 'number' ? m.cols : 80;
        const rows = typeof m.rows === 'number' ? m.rows : 24;
        const sess = this.deps.ptyManager.get(key);
        if (!sess) {
          this.sendText(client, JSON.stringify({ type: 'error', message: `no such tab: ${key}` }));
          return;
        }
        this.detachWs(client);
        client.attachedKey = key;
        let subs = this.fanouts.get(key);
        if (!subs) { subs = new Set(); this.fanouts.set(key, subs); }
        subs.add(client);
        sess.resize(cols, rows);
        this.sendText(client, JSON.stringify({ type: 'attached', key }));
        return;
      }
      case 'input': {
        if (!client.attachedKey) return;
        const data = typeof m.data === 'string' ? m.data : '';
        const bytes = Buffer.from(data, 'base64');
        this.deps.ptyManager.get(client.attachedKey)?.write(bytes.toString('binary'));
        return;
      }
      case 'resize': {
        if (!client.attachedKey) return;
        const cols = typeof m.cols === 'number' ? m.cols : 80;
        const rows = typeof m.rows === 'number' ? m.rows : 24;
        this.deps.ptyManager.get(client.attachedKey)?.resize(cols, rows);
        return;
      }
      case 'detach': {
        this.detachWs(client);
        return;
      }
    }
  }

  private sendText(client: WebSocketClient, text: string): void {
    if (!client.alive) return;
    this.sendFrame(client, 0x1, Buffer.from(text, 'utf8'));
  }

  private sendClose(client: WebSocketClient): void {
    this.sendFrame(client, 0x8, Buffer.alloc(0));
  }

  private sendFrame(client: WebSocketClient, opcode: number, payload: Buffer): void {
    if (!client.alive) return;
    const fin = 0x80;
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = fin | (opcode & 0x0f);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = fin | (opcode & 0x0f);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = fin | (opcode & 0x0f);
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
    }
    try { client.socket.write(Buffer.concat([header, payload])); }
    catch { this.closeWs(client); }
  }

  /**
   * Serve the web app shell.
   */
  private renderApp(): string {
    return APP_HTML;
  }
}

// ── WebSocket frame parser ────────────────────────────────────────────

interface ParsedFrame { opcode: number; payload: Buffer; consumed: number }

function parseFrame(buf: Buffer): ParsedFrame | null {
  if (buf.length < 2) return null;
  const b0 = buf[0];
  const b1 = buf[1];
  const opcode = b0 & 0x0f;
  const masked = (b1 & 0x80) !== 0;
  let len = b1 & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    // High 32 bits ignored — we don't accept frames larger than 2^32.
    const high = buf.readUInt32BE(2);
    const low  = buf.readUInt32BE(6);
    if (high !== 0) return null;
    len = low;
    offset = 10;
  }
  if (!masked) return null; // client frames must be masked per RFC
  if (buf.length < offset + 4 + len) return null;
  const mask = buf.subarray(offset, offset + 4);
  offset += 4;
  const raw = buf.subarray(offset, offset + len);
  const payload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) payload[i] = raw[i] ^ mask[i & 3];
  return { opcode, payload, consumed: offset + len };
}

// ── Helpers ──────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;'  :
    c === '>' ? '&gt;'  :
    c === '"' ? '&quot;' : '&#39;'
  ));
}

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** First stderr line, or a fallback — keeps mobile toasts readable. */
function gitFailMessage(stderr: string, fallback: string): string {
  const line = stderr.split('\n').find((l) => l.trim().length > 0);
  return line ? line.trim() : fallback;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Parse a small JSON request body; null on malformed/oversized input. */
function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        resolve(null);
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed: unknown = JSON.parse(body);
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}
