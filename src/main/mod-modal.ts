import type * as http from 'node:http';
import type { ModModalView, ModSendOffer } from '../shared/ipc';

// A floating modal any Claude Code mod running in a dash terminal can draw
// (sessions dash spawns get DASH_MOD_MODAL=1; the port is the hook server's,
// ~/.claude/dash-hook-port). Loopback only, same as the hook endpoint:
//   POST /mod/show   ModModalView     show or replace the modal for view.id
//                                     (placement 'sidebar' docks it on the right,
//                                     'bottom' adds it as a tab beside the shell dock;
//                                     tabs: [{ key, label, markdown, buttons }])
//   POST /mod/close  { id }           hide it
//   GET  /mod/wait?id=<id>            long-poll: { key } of the next button
//                                     pressed ('__close' = dismissed), 204 after
//                                     WAIT_MS with nothing. A press made while
//                                     no poll is open is queued (10 per view)
//                                     and handed to the next one; closing the
//                                     view clears that queue.
//   POST /mod/send-offer { id, title, text }
//                                     offer a prompt for a console the user picks
//                                     in dash; nothing is typed until they press
//                                     Send ('__sent' / '__cancel' on /mod/wait)
const WAIT_MS = 20_000;
const MAX_BODY = 1_000_000;
const MAX_OFFER_TEXT = 100_000;

const cleanButtons = (bs: unknown): ModModalView['buttons'] =>
  Array.isArray(bs)
    ? bs.slice(0, 40).map((b: { key?: unknown; label?: unknown; primary?: unknown; row?: unknown; detail?: unknown; dot?: unknown }) => ({
        key: String(b.key),
        label: String(b.label),
        primary: !!b.primary,
        ...(b.row ? { row: true } : {}),
        ...(b.detail != null ? { detail: String(b.detail) } : {}),
        ...(b.dot ? { dot: true } : {}),
      }))
    : [];

export class ModModal {
  private readonly waiters = new Map<string, http.ServerResponse>();
  private readonly queued = new Map<string, string[]>();
  /** Views currently on screen, so a /mod/show that replaces a view's contents
   *  is told apart from one that opens it again after it was closed. */
  private readonly shown = new Set<string>();

  constructor(
    private readonly send: (channel: 'show' | 'close' | 'offer', payload: ModModalView | ModSendOffer | string) => void,
  ) {}

  /** Handles /mod/* requests; false for anything else. */
  handle(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (!url.pathname.startsWith('/mod/')) return false;

    if (req.method === 'GET' && url.pathname === '/mod/wait') {
      const id = url.searchParams.get('id') ?? '';
      const next = this.queued.get(id)?.shift();
      if (next !== undefined) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ key: next }));
        return true;
      }
      this.waiters.get(id)?.writeHead(204).end(); // one poller per modal: the newest wins
      this.waiters.set(id, res);
      const t = setTimeout(() => this.release(id, res, null), WAIT_MS);
      res.on('close', () => {
        clearTimeout(t);
        if (this.waiters.get(id) === res) this.waiters.delete(id);
      });
      return true;
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return true;
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      let p: Partial<ModModalView>;
      try {
        p = JSON.parse(body) as Partial<ModModalView>;
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (typeof p.id !== 'string' || !p.id) {
        res.writeHead(400).end();
        return;
      }
      if (url.pathname === '/mod/show') {
        // Presses still queued belong to the view shown before (e.g. its ✕ while
        // the mod was reloading): replaying them on the new one closed it right
        // after it opened. A show for a view that is already up only replaces its
        // contents, so a press waiting for the mod there is still that view's own.
        if (!this.shown.has(p.id)) this.queued.delete(p.id);
        this.shown.add(p.id);
        this.send('show', {
          id: p.id,
          title: String(p.title ?? ''),
          markdown: String(p.markdown ?? ''),
          placement: p.placement === 'sidebar' || p.placement === 'bottom' ? p.placement : 'float',
          buttons: cleanButtons(p.buttons),
          ...(typeof p.html === 'string' && p.html ? { html: p.html.slice(0, 512_000) } : {}),
          ...(Array.isArray(p.tabs) && p.tabs.length
            ? {
                tabs: p.tabs.slice(0, 12).map((t) => ({
                  key: String(t.key),
                  label: String(t.label),
                  markdown: String(t.markdown ?? ''),
                  buttons: cleanButtons(t.buttons),
                })),
              }
            : {}),
        });
      } else if (url.pathname === '/mod/close') {
        this.queued.delete(p.id); // same, for the mod closing the view itself
        this.shown.delete(p.id);
        this.send('close', p.id);
      } else if (url.pathname === '/mod/send-offer') {
        const text = (p as { text?: unknown }).text;
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_OFFER_TEXT) {
          res.writeHead(400).end();
          return;
        }
        this.send('offer', { id: p.id, title: String(p.title ?? ''), text });
      } else {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(204).end();
    });
    req.on('error', () => res.writeHead(400).end());
    return true;
  }

  /** A button press (or '__close') from the renderer, handed to the mod's poll,
   *  or queued for the next one when that poll can no longer take it. */
  press(id: string, key: string): void {
    if (key === '__close') this.shown.delete(id); // dismissed in dash, not by the mod
    const w = this.waiters.get(id);
    if (w && this.release(id, w, key)) return;
    this.queue(id, key);
  }

  private queue(id: string, key: string): void {
    const q = this.queued.get(id) ?? [];
    q.push(key);
    this.queued.set(id, q.slice(-10));
  }

  /** Hands `key` to a poll; false when the poll could not take it, so the press
   *  goes back in the queue for the next one. A poll whose socket died (the
   *  machine slept, the session was killed, the network dropped) may not have
   *  fired 'close' yet, and writing the key into it would lose the press. */
  private release(id: string, res: http.ServerResponse, key: string | null): boolean {
    if (this.waiters.get(id) === res) this.waiters.delete(id);
    if (res.writableEnded || res.destroyed || res.socket?.writable === false) return key === null;
    try {
      if (key === null) {
        res.writeHead(204).end();
        return true;
      }
      // The poll can also die between its last byte and this write, and the
      // socket only errors once the write is attempted: hand the press back
      // then (writableFinished tells a failed write from a later, harmless
      // error on an already-flushed response) instead of losing it.
      res.once('error', () => {
        if (!res.writableFinished) this.press(id, key);
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ key }));
      return true;
    } catch {
      return false;
    }
  }
}
