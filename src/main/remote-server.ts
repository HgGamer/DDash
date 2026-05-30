// Remote-server: exposes Dash's open PTY sessions over a TCP socket so a
// remote device (e.g. the DECK handheld) can list tabs, attach, see the
// terminal output, and type into the underlying Claude Code session.
//
// Wire format: length-prefixed frames.
//
//   [u8 type][u32 BE length][payload of `length` bytes]
//
// Types (client → server):
//   0x01 LIST_TABS_REQ      payload: empty
//   0x03 ATTACH_REQ         payload: <u16 BE key_len><key bytes><u16 cols><u16 rows>
//   0x06 INPUT              payload: raw bytes to write to the PTY
//   0x07 RESIZE             payload: <u16 cols><u16 rows>
//   0x09 DETACH             payload: empty
//
// Types (server → client):
//   0x02 LIST_TABS_RESP     payload: UTF-8 JSON [{id, title}]
//   0x04 ATTACH_OK          payload: empty
//   0x05 DATA               payload: raw PTY bytes (xterm-encoded)
//   0x0A ATTACH_FAIL        payload: UTF-8 reason
//
// `id`/`key` are the composite project/worktree keys Dash already uses
// internally, sent verbatim so the client doesn't have to know the format.

import * as net from 'node:net';
import type { PtySessionManager } from './pty-session';
import type { ProjectRegistry } from './registry';

const T_LIST_REQ   = 0x01;
const T_LIST_RESP  = 0x02;
const T_ATTACH     = 0x03;
const T_ATTACH_OK  = 0x04;
const T_DATA       = 0x05;
const T_INPUT      = 0x06;
const T_RESIZE     = 0x07;
const T_DETACH     = 0x09;
const T_ATTACH_NO  = 0x0a;

export interface RemoteServerDeps {
  registry: ProjectRegistry;
  ptyManager: PtySessionManager;
  /** Returns the composite key Dash uses for a project+worktree pair. */
  compositeKey(projectId: string, worktreeId: string | null): string;
}

interface ClientState {
  socket: net.Socket;
  buf: Buffer;
  attachedKey: string | null;
}

export class RemoteServer {
  private server: net.Server | null = null;
  private clients = new Set<ClientState>();
  // Per-key listeners that fan PTY data out to attached clients.
  private fanouts = new Map<string, Set<ClientState>>();

  constructor(private deps: RemoteServerDeps) {}

  /** Feed PTY output for a given key into all attached clients. Call this
   *  from the same `onData` callback Dash already uses for renderer IPC. */
  feed(key: string, data: string): void {
    const subs = this.fanouts.get(key);
    if (!subs || subs.size === 0) return;
    const payload = Buffer.from(data, 'binary');
    const frame = this.frame(T_DATA, payload);
    for (const c of subs) {
      c.socket.write(frame);
    }
  }

  start(port = 7779, host = '0.0.0.0'): void {
    if (this.server) return;
    this.server = net.createServer((socket) => this.onConnection(socket));
    this.server.on('error', (err) => {
      console.error('[remote-server] error:', err.message);
    });
    this.server.listen(port, host, () => {
      const addr = this.server!.address();
      console.log('[remote-server] listening:', addr);
    });
  }

  stop(): void {
    if (!this.server) return;
    for (const c of this.clients) c.socket.destroy();
    this.clients.clear();
    this.fanouts.clear();
    this.server.close();
    this.server = null;
  }

  // ── Internals ────────────────────────────────────────────────────────

  private onConnection(socket: net.Socket): void {
    const client: ClientState = { socket, buf: Buffer.alloc(0), attachedKey: null };
    this.clients.add(client);
    socket.on('data', (chunk) => this.onData(client, chunk));
    socket.on('close', () => this.cleanup(client));
    socket.on('error', () => this.cleanup(client));
  }

  private cleanup(client: ClientState): void {
    this.detach(client);
    this.clients.delete(client);
  }

  private detach(client: ClientState): void {
    if (!client.attachedKey) return;
    const subs = this.fanouts.get(client.attachedKey);
    if (subs) {
      subs.delete(client);
      if (subs.size === 0) this.fanouts.delete(client.attachedKey);
    }
    client.attachedKey = null;
  }

  private onData(client: ClientState, chunk: Buffer): void {
    client.buf = Buffer.concat([client.buf, chunk]);
    // Parse as many frames as are complete in the buffer.
    while (client.buf.length >= 5) {
      const type = client.buf[0];
      const len  = client.buf.readUInt32BE(1);
      if (client.buf.length < 5 + len) break;
      const payload = client.buf.subarray(5, 5 + len);
      client.buf = client.buf.subarray(5 + len);
      this.handleFrame(client, type, payload);
    }
  }

  private handleFrame(client: ClientState, type: number, payload: Buffer): void {
    switch (type) {
      case T_LIST_REQ:
        this.sendList(client);
        break;
      case T_ATTACH: {
        if (payload.length < 6) return;
        const keyLen = payload.readUInt16BE(0);
        if (payload.length < 2 + keyLen + 4) return;
        const key  = payload.subarray(2, 2 + keyLen).toString('utf8');
        const cols = payload.readUInt16BE(2 + keyLen);
        const rows = payload.readUInt16BE(2 + keyLen + 2);
        this.attach(client, key, cols, rows);
        break;
      }
      case T_INPUT: {
        if (!client.attachedKey) return;
        const sess = this.deps.ptyManager.get(client.attachedKey);
        sess?.write(payload.toString('binary'));
        break;
      }
      case T_RESIZE: {
        if (!client.attachedKey || payload.length < 4) return;
        const cols = payload.readUInt16BE(0);
        const rows = payload.readUInt16BE(2);
        this.deps.ptyManager.get(client.attachedKey)?.resize(cols, rows);
        break;
      }
      case T_DETACH:
        this.detach(client);
        break;
    }
  }

  private sendList(client: ClientState): void {
    const list = this.deps.ptyManager
      .keys()
      .map((key) => ({ id: key, title: this.titleForKey(key) }));
    const json = Buffer.from(JSON.stringify(list), 'utf8');
    client.socket.write(this.frame(T_LIST_RESP, json));
  }

  private titleForKey(key: string): string {
    // Composite key format is "<projectId>" or "<projectId>:<worktreeId>".
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

  private attach(client: ClientState, key: string, cols: number, rows: number): void {
    // Verify the key exists; otherwise refuse.
    if (!this.deps.ptyManager.get(key)) {
      const msg = Buffer.from(`no such tab: ${key}`, 'utf8');
      client.socket.write(this.frame(T_ATTACH_NO, msg));
      return;
    }
    this.detach(client);
    client.attachedKey = key;
    let subs = this.fanouts.get(key);
    if (!subs) { subs = new Set(); this.fanouts.set(key, subs); }
    subs.add(client);
    this.deps.ptyManager.get(key)?.resize(cols, rows);
    client.socket.write(this.frame(T_ATTACH_OK, Buffer.alloc(0)));
  }

  private frame(type: number, payload: Buffer): Buffer {
    const hdr = Buffer.alloc(5);
    hdr[0] = type;
    hdr.writeUInt32BE(payload.length, 1);
    return Buffer.concat([hdr, payload]);
  }
}
