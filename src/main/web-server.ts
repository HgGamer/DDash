// Mobile-friendly LAN web UI for Dash. Serves an xterm.js-based terminal
// page protected by a session cookie. PTY I/O flows over a hand-rolled
// WebSocket (RFC 6455) so we don't add a dependency.
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

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import type { Socket } from 'node:net';
import type { PtySessionManager } from './pty-session';
import type { ProjectRegistry } from './registry';
import type { TerminalStyleOptions } from '@shared/types';

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
    if (req.method === 'GET' && path === '/api/tabs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tabs: this.listTabs() }));
      return;
    }
    if (req.method === 'GET' && path === '/api/style') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.deps.getTerminalStyle()));
      return;
    }
    res.writeHead(404); res.end('not found');
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

// ── Embedded HTML ─────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;'  :
    c === '>' ? '&gt;'  :
    c === '"' ? '&quot;' : '&#39;'
  ));
}

const LOGIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dash — sign in</title>
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #0c0c0d; color: #eee;
    font: 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: grid; place-items: center;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  form {
    background: #161618; border: 1px solid #2a2a2e; border-radius: 12px;
    padding: 24px; width: min(360px, 90vw);
  }
  h1 { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
  p.err { color: #ff7676; margin: 0 0 12px; font-size: 13px; }
  input[type=password] {
    width: 100%; box-sizing: border-box;
    padding: 12px 14px; font-size: 16px;
    background: #0c0c0d; color: #eee;
    border: 1px solid #2a2a2e; border-radius: 8px;
    outline: none;
  }
  input[type=password]:focus { border-color: #5e5edb; }
  button {
    margin-top: 12px; width: 100%; padding: 12px;
    background: #5e5edb; color: white; border: 0; border-radius: 8px;
    font-size: 16px; font-weight: 600;
  }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>Dash · web access</h1>
  <p class="err">{{ERROR}}</p>
  <input name="password" type="password" placeholder="Password" autofocus autocomplete="current-password">
  <button type="submit">Sign in</button>
</form>
</body>
</html>`;

const APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>Dash</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.css">
<style>
  :root { color-scheme: dark; --bg:#000; --panel:#111; --border:#222; --fg:#ddd; --accent:#5e5edb; }
  html, body { margin: 0; background: var(--bg); color: var(--fg);
    font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overscroll-behavior: none; }
  /* Layout fills the visualViewport — JS keeps --app-h in sync so the
     on-screen keyboard pushes content up instead of overlaying it. */
  html, body { height: 100%; }
  body { position: fixed; inset: 0;
    display: flex; flex-direction: column;
    height: var(--app-h, 100dvh);
    width: 100%;
  }
  header { display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    border-bottom: 1px solid var(--border); background: var(--panel);
    padding-top: calc(8px + env(safe-area-inset-top)); }
  header button.icon { background: transparent; color: var(--fg); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 10px; font-size: 14px; }
  header .title { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #term { flex: 1; min-height: 0; background: #000; }
  #term .xterm { height: 100%; padding: 4px; }
  .softrow { display: flex; gap: 6px; padding: 6px 8px; background: var(--panel);
    border-top: 1px solid var(--border); overflow-x: auto;
    padding-bottom: calc(6px + env(safe-area-inset-bottom)); }
  .softrow button { flex: 0 0 auto; padding: 10px 12px; min-width: 44px; min-height: 40px;
    background: #1a1a1d; color: var(--fg); border: 1px solid var(--border); border-radius: 8px;
    font-size: 13px; font-weight: 500; }
  .softrow button:active { background: #2a2a30; }
  .drawer { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: none;
    z-index: 10; }
  .drawer.open { display: block; }
  .drawer .panel { position: absolute; top: 0; left: 0; bottom: 0; width: min(320px, 85vw);
    background: var(--panel); border-right: 1px solid var(--border); display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
  .drawer .panel header { background: transparent; }
  .drawer ul { list-style: none; margin: 0; padding: 4px 0; overflow-y: auto; flex: 1 1 auto; min-height: 0; -webkit-overflow-scrolling: touch; }
  .drawer li { padding: 14px 16px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .drawer li.active { background: rgba(94,94,219,0.15); }
  .drawer .footer { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  .drawer .footer a { color: #9090d0; text-decoration: none; font-size: 13px; }
  .empty { padding: 16px; color: #888; font-size: 13px; }
</style>
</head>
<body>
<header>
  <button class="icon" id="menu" aria-label="Tabs">☰</button>
  <div class="title" id="title">Dash</div>
  <button class="icon" id="refresh" aria-label="Refresh tabs">↻</button>
</header>
<div id="term"></div>
<div class="softrow" id="softrow">
  <button data-send="\\u001b">Esc</button>
  <button data-send="\\t">Tab</button>
  <button data-send="\\u0003">Ctrl-C</button>
  <button data-send="\\u0004">Ctrl-D</button>
  <button data-send="\\u001b[A">↑</button>
  <button data-send="\\u001b[B">↓</button>
  <button data-send="\\u001b[D">←</button>
  <button data-send="\\u001b[C">→</button>
  <button data-send="\\r">↵</button>
</div>
<div class="drawer" id="drawer">
  <div class="panel">
    <header><div class="title">Sessions</div><button class="icon" id="closeDrawer">✕</button></header>
    <ul id="tabs"></ul>
    <div class="footer">
      <span style="color:#888;font-size:12px">Dash · web</span>
      <a href="/logout">Log out</a>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.js"></script>
<script>
(async () => {
  const termEl = document.getElementById('term');
  const titleEl = document.getElementById('title');
  const drawer = document.getElementById('drawer');
  const tabsEl = document.getElementById('tabs');
  document.getElementById('menu').onclick = () => { drawer.classList.add('open'); refreshTabs(); };
  document.getElementById('closeDrawer').onclick = () => drawer.classList.remove('open');
  document.getElementById('refresh').onclick = () => refreshTabs();
  drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.classList.remove('open'); });

  // Pull the desktop's resolved terminal style so the web view matches.
  // Falls back to a sensible default if the fetch fails.
  let styleOpts = {
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    theme: { background: '#000000' },
  };
  try {
    const r = await fetch('/api/style', { credentials: 'same-origin' });
    if (r.ok) {
      const s = await r.json();
      if (s && typeof s === 'object') styleOpts = Object.assign(styleOpts, s);
    }
  } catch { /* ignore */ }

  const term = new window.Terminal({
    fontFamily: styleOpts.fontFamily,
    fontSize: styleOpts.fontSize,
    cursorStyle: styleOpts.cursorStyle,
    cursorBlink: styleOpts.cursorBlink !== false,
    scrollback: styleOpts.scrollback ?? 1000,
    theme: styleOpts.theme,
    convertEol: false,
  });
  const fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(termEl);

  let resizeTimer = null;
  function doFit() {
    try { fit.fit(); } catch { /* ignore */ }
    if (ws && ws.readyState === 1 && attachedKey) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  }
  function scheduleFit() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(doFit, 80);
  }
  // Keep layout sized to the visualViewport so the on-screen keyboard
  // pushes the terminal up rather than covering it.
  function applyViewportHeight() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-h', h + 'px');
  }
  applyViewportHeight();
  setTimeout(doFit, 50);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => { applyViewportHeight(); scheduleFit(); });
    window.visualViewport.addEventListener('scroll', applyViewportHeight);
  }
  window.addEventListener('resize', () => { applyViewportHeight(); scheduleFit(); });

  let ws = null;
  let attachedKey = null;
  let knownTabs = [];

  function b64encode(s) {
    // s is a string of binary bytes from xterm input. btoa handles latin-1.
    return btoa(s);
  }
  function b64decodeToBytes(b) {
    const bin = atob(b);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host + '/ws');
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'list' }));
    };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'tabs') {
        knownTabs = msg.tabs || [];
        renderTabs();
        if (!attachedKey && knownTabs.length > 0) attachTo(knownTabs[0]);
      } else if (msg.type === 'attached') {
        attachedKey = msg.key;
        const t = knownTabs.find(t => t.key === msg.key);
        titleEl.textContent = t ? t.title : msg.key;
        renderTabs();
        term.reset();
      } else if (msg.type === 'data') {
        const bytes = b64decodeToBytes(msg.data);
        term.write(bytes);
      } else if (msg.type === 'error') {
        term.write('\\r\\n\\x1b[31m[' + msg.message + ']\\x1b[0m\\r\\n');
      }
    };
    ws.onclose = () => {
      attachedKey = null;
      term.write('\\r\\n\\x1b[33m[disconnected — reconnecting…]\\x1b[0m\\r\\n');
      setTimeout(connect, 1500);
    };
  }

  function refreshTabs() {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'list' }));
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    if (knownTabs.length === 0) {
      const li = document.createElement('div');
      li.className = 'empty';
      li.textContent = 'No active sessions. Start a tab in the desktop app.';
      tabsEl.appendChild(li);
      return;
    }
    for (const t of knownTabs) {
      const li = document.createElement('li');
      li.textContent = t.title;
      if (t.key === attachedKey) li.classList.add('active');
      li.onclick = () => { attachTo(t); drawer.classList.remove('open'); };
      tabsEl.appendChild(li);
    }
  }

  function attachTo(t) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: 'attach', key: t.key, cols: term.cols, rows: term.rows }));
  }

  term.onData((d) => {
    if (ws && ws.readyState === 1 && attachedKey) {
      ws.send(JSON.stringify({ type: 'input', data: b64encode(d) }));
    }
  });

  for (const btn of document.querySelectorAll('.softrow button')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const raw = btn.getAttribute('data-send') || '';
      // Decode \\u escapes from the attribute.
      const s = JSON.parse('"' + raw.replace(/"/g, '\\\\"') + '"');
      if (ws && ws.readyState === 1 && attachedKey) {
        ws.send(JSON.stringify({ type: 'input', data: b64encode(s) }));
      }
      term.focus();
    });
  }

  termEl.addEventListener('click', () => term.focus());
  connect();
})();
</script>
</body>
</html>`;
