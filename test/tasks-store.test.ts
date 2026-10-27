import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TasksStore } from '../src/main/tasks-store';

function store() {
  const typed: Array<[string, string]> = [];
  const dir = mkdtempSync(path.join(tmpdir(), 'dash-tasks-'));
  const s = new TasksStore(dir, (key, text) => {
    if (key === 'closed') return false;
    typed.push([key, text]);
    return true;
  });
  return { s, typed, dir };
}

describe('TasksStore', () => {
  it('creates, then merges without dropping fields', () => {
    const { s } = store();
    s.upsert({ id: 'k66', title: 'Measure', who: 'a', console: 'p::w::c', note: 'n' }, 'a');
    const t = s.upsert({ id: 'k66', status: 'running' }, 'a');
    expect(t).toMatchObject({ title: 'Measure', who: 'a', note: 'n', status: 'running' });
    expect(s.get().tasks).toHaveLength(1);
  });

  it('rejects a new task without a title or with a bad id', () => {
    const { s } = store();
    expect(s.upsert({ id: 'x' }, 'a')).toBeNull();
    expect(s.upsert({ id: 'a b', title: 't' }, 'a')).toBeNull();
  });

  it('types the user change into the owner console', () => {
    const { s, typed } = store();
    s.upsert({ id: 't1', title: 'Do it', who: 'sess', console: 'p::w::c' }, 'sess');
    const r = s.userEdit({ id: 't1', status: 'queued', comment: 'go', notify: true });
    expect(r).toEqual({ ok: true, delivered: true, reason: undefined });
    expect(typed[0][0]).toBe('p::w::c');
    expect(typed[0][1]).toContain('Queued');
    expect(typed[0][1]).toContain('go');
    expect(s.get().tasks[0].comments[0]).toMatchObject({ by: 'you', text: 'go' });
  });

  it('saves but does not type when there is no open console', () => {
    const { s, typed } = store();
    s.upsert({ id: 'a', title: 'A' }, 'x');
    s.upsert({ id: 'b', title: 'B', console: 'closed' }, 'x');
    expect(s.userEdit({ id: 'a', status: 'done', notify: true }).reason).toBe('no-console');
    expect(s.userEdit({ id: 'b', status: 'done', notify: true }).reason).toBe('console-closed');
    expect(typed).toHaveLength(0);
    expect(s.get().tasks.every((t) => t.status === 'done')).toBe(true);
  });

  it('persists to tasks.json and loads it back', async () => {
    const { s, dir } = store();
    s.upsert({ id: 'p', title: 'Persist' }, 'x');
    await new Promise((r) => setTimeout(r, 50));
    expect(JSON.parse(readFileSync(path.join(dir, 'tasks.json'), 'utf8')).tasks[0].id).toBe('p');
    const again = new TasksStore(dir, () => false);
    await again.load();
    expect(again.get().tasks[0].title).toBe('Persist');
  });
});

describe('TasksStore over HTTP', () => {
  it('stores UTF-8 and refuses a body that is not UTF-8', async () => {
    const http = await import('node:http');
    const { s } = store();
    const server = http.createServer((req, res) => {
      if (!s.handle(req, res)) res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const post = (body: Buffer) =>
      fetch(`http://127.0.0.1:${port}/tasks`, { method: 'POST', body });
    await post(Buffer.from('{"id":"u","title":"Nézet ő"}', 'utf8'));
    const bad = await post(Buffer.from('{"id":"w","title":"Nézet"}', 'latin1'));
    server.close();
    expect(bad.status).toBe(400);
    expect(s.get().tasks.map((t) => t.title)).toEqual(['Nézet ő']);
  });
});
