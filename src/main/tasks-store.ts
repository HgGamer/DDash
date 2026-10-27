import { promises as fs } from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import {
  TASK_ID_RE,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type Task,
  type TaskSession,
  type TaskStatus,
  type TasksState,
  type TaskUserEdit,
  type TaskUserEditResult,
} from '@shared/tasks';

const MAX_BODY = 256 * 1024;
const MAX_TEXT = 4000;
const MAX_COMMENTS = 50;
const MAX_TASKS = 2000;

/** Types `text` into a console as the user would (bracketed paste, then Enter);
 *  false when that console is not open. */
export type ConsoleTyper = (consoleKey: string, text: string) => boolean;

function str(v: unknown, max = MAX_TEXT): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined;
}

function isStatus(v: unknown): v is TaskStatus {
  return typeof v === 'string' && (TASK_STATUSES as string[]).includes(v);
}

/**
 * Dash's task board: persisted in `tasks.json`, written by sessions over the
 * loopback hook server (`/tasks/*`) and by the user from the Tasks view.
 *
 * A session only ever writes; nothing it posts is typed anywhere. A console is
 * typed into only on the user's own action in the Tasks view (status change or
 * comment), the same rule the mod channel follows (a mod can only offer).
 */
export class TasksStore {
  private state: TasksState = { tasks: [], sessions: [] };
  private readonly file: string;
  private saving: Promise<void> = Promise.resolve();
  private listeners = new Set<(s: TasksState) => void>();

  constructor(
    dir: string,
    private readonly typeInto: ConsoleTyper,
  ) {
    this.file = path.join(dir, 'tasks.json');
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<TasksState>;
      this.state = {
        tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
        sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      };
    } catch {
      /* first run or unreadable: start empty */
    }
  }

  get(): TasksState {
    return this.state;
  }

  onChange(fn: (s: TasksState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    const snapshot = JSON.stringify(this.state, null, 1);
    const tmp = this.file + '.tmp';
    this.saving = this.saving
      .then(() => fs.writeFile(tmp, snapshot, 'utf8'))
      .then(() => fs.rename(tmp, this.file))
      .catch(() => undefined);
    for (const fn of this.listeners) fn(this.state);
  }

  /** Create or merge a task. A new task needs a title; fields left out keep
   *  their value. Returns null when the body is unusable. */
  upsert(p: Record<string, unknown>, by: string): Task | null {
    const id = str(p.id, 80);
    if (!id || !TASK_ID_RE.test(id)) return null;
    const now = new Date().toISOString();
    const i = this.state.tasks.findIndex((t) => t.id === id);
    const prev = i >= 0 ? this.state.tasks[i] : null;
    const title = str(p.title, 300) ?? prev?.title;
    if (!title) return null;
    if (!prev && this.state.tasks.length >= MAX_TASKS) return null;
    const status = isStatus(p.status) ? p.status : (prev?.status ?? 'queued');
    const task: Task = {
      id,
      title,
      who: str(p.who, 120) ?? prev?.who ?? '',
      console: str(p.console, 200) ?? prev?.console ?? '',
      status,
      waitingFor:
        status === 'waiting'
          ? (str(p.waitingFor) ?? prev?.waitingFor ?? '')
          : (str(p.waitingFor) ?? ''),
      note: str(p.note) ?? prev?.note ?? '',
      project: str(p.project, 120) ?? prev?.project ?? '',
      jira: str(p.jira, 60) ?? prev?.jira ?? '',
      link: str(p.link, 1000) ?? prev?.link ?? '',
      comments: prev?.comments ?? [],
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      updatedBy: by,
    };
    const comment = str(p.comment);
    if (comment?.trim())
      task.comments = [...task.comments, { at: now, by, text: comment.trim() }].slice(
        -MAX_COMMENTS,
      );
    if (i >= 0) this.state.tasks[i] = task;
    else this.state.tasks.push(task);
    this.changed();
    return task;
  }

  remove(id: string): boolean {
    const n = this.state.tasks.length;
    this.state.tasks = this.state.tasks.filter((t) => t.id !== id);
    if (this.state.tasks.length === n) return false;
    this.changed();
    return true;
  }

  heartbeat(p: Record<string, unknown>): TaskSession | null {
    const name = str(p.name, 120);
    if (!name) return null;
    const i = this.state.sessions.findIndex((s) => s.name === name);
    const prev = i >= 0 ? this.state.sessions[i] : null;
    const s: TaskSession = {
      name,
      project: str(p.project, 120) ?? prev?.project ?? '',
      focus: str(p.focus, 300) ?? prev?.focus ?? '',
      console: str(p.console, 200) ?? prev?.console ?? '',
      lastSeen: new Date().toISOString(),
    };
    if (i >= 0) this.state.sessions[i] = s;
    else this.state.sessions.push(s);
    this.changed();
    return s;
  }

  /** The user's change from the Tasks view; types a one-line note about it into
   *  the owning session's console when asked to. */
  userEdit(e: TaskUserEdit): TaskUserEditResult {
    const prev = this.state.tasks.find((t) => t.id === e.id);
    if (!prev) return { ok: false, delivered: false, reason: 'not-found' };
    const patch: Record<string, unknown> = { id: e.id };
    if (e.status) patch.status = e.status;
    if (e.comment?.trim()) patch.comment = e.comment;
    if (e.assignTo) {
      patch.who = e.assignTo.who;
      patch.console = e.assignTo.console;
    }
    const task = this.upsert(patch, 'you');
    if (!task) return { ok: false, delivered: false, reason: 'not-found' };
    if (!e.notify) return { ok: true, delivered: false };
    if (!task.console) return { ok: true, delivered: false, reason: 'no-console' };
    const parts = [`[Task board] #${task.id} "${task.title}"`];
    if (e.assignTo) parts.push(`assigned to you (${task.who})`);
    if (e.status) parts.push(`status set to ${TASK_STATUS_LABEL[e.status]} by the user`);
    if (e.comment?.trim()) parts.push(`user's comment: ${e.comment.trim()}`);
    const delivered = this.typeInto(task.console, parts.join(' — '));
    return { ok: true, delivered, reason: delivered ? undefined : 'console-closed' };
  }

  /** The open tasks (waiting, then running) owned by a console, as a note for
   *  the session's model; empty when there are none. A UserPromptSubmit hook
   *  prints it, so an answer given in the chat gets written back to the board
   *  (scripts/setup-tasks.mjs installs that hook). */
  reminder(consoleKey: string): string {
    if (!consoleKey) return '';
    const mine = this.state.tasks
      .filter((t) => t.console === consoleKey && (t.status === 'waiting' || t.status === 'running'))
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'waiting' ? -1 : 1));
    if (mine.length === 0) return '';
    const lines = ['[Dash task board] Your open tasks (owned by this console):'];
    for (const t of mine) {
      const waiting =
        t.status === 'waiting' && t.waitingFor ? ` — waiting for: ${t.waitingFor}` : '';
      lines.push(`- #${t.id} [${t.status}] ${t.title}${waiting}`);
    }
    lines.push(
      "If the user's message answers, decides or changes one of these, update it on the board " +
        '(POST /tasks with the same id: new status, note; see docs/tasks-channel.md). ' +
        'Also update a task when you start or finish it. Otherwise ignore this note.',
    );
    return lines.join('\n') + '\n';
  }

  /** Serves `/tasks*` on the loopback hook server; false for other paths. */
  handle(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/tasks' && !url.pathname.startsWith('/tasks/')) return false;
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    };
    if (req.method === 'GET' && url.pathname === '/tasks') {
      json(200, this.state);
      return true;
    }
    if (req.method === 'GET' && url.pathname === '/tasks/reminder') {
      const text = this.reminder(url.searchParams.get('console') ?? '');
      if (text) res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(text);
      else res.writeHead(204).end();
      return true;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return true;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      chunks.push(c);
      size += c.length;
      if (size > MAX_BODY) req.destroy();
    });
    req.on('end', () => {
      let p: Record<string, unknown>;
      try {
        // UTF-8 only; a body in a Windows code page (curl -d '…' from a console)
        // is refused rather than stored with broken accents.
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        p = JSON.parse(text) as Record<string, unknown>;
        if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('not an object');
      } catch {
        res
          .writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
          .end('Expected a UTF-8 JSON object, e.g. curl --data-binary @task.json\n');
        return;
      }
      const by = str(p.by, 120) || str(p.who, 120) || 'session';
      if (url.pathname === '/tasks') {
        const t = this.upsert(p, by);
        return t ? json(200, t) : res.writeHead(400).end();
      }
      if (url.pathname === '/tasks/delete') {
        return json(this.remove(String(p.id ?? '')) ? 200 : 404, {});
      }
      if (url.pathname === '/tasks/session') {
        const s = this.heartbeat(p);
        return s ? json(200, s) : res.writeHead(400).end();
      }
      res.writeHead(404).end();
    });
    req.on('error', () => res.writeHead(400).end());
    return true;
  }
}
