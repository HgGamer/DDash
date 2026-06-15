// Integration test for the LAN web server: boots a real HTTP server against a
// temp git repository and exercises auth, the projects API, the git
// status/stage/diff/commit API, and the sandboxed files API.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WebServer } from '../src/main/web-server';
import { compositeKey } from '../src/shared/ipc';
import type { ProjectRegistry } from '../src/main/registry';
import type { PtySessionManager } from '../src/main/pty-session';
import type { TerminalStyleOptions } from '@shared/types';

const PASSWORD = 'test-password';
const PORT = 48000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

let repoDir: string;
let server: WebServer;
let cookie: string;

const project = {
  id: 'proj-1',
  name: 'demo',
  path: '', // set in beforeAll
  addedAt: new Date().toISOString(),
  lastOpenedAt: new Date().toISOString(),
  order: 0,
  worktrees: [],
  todos: [],
  isGitRepo: true,
};

const fakeRegistry = {
  list: () => [project],
  getById: (id: string) => (id === project.id ? project : undefined),
} as unknown as ProjectRegistry;

const fakePtyManager = {
  keys: () => ['proj-1'],
  get: () => undefined,
} as unknown as PtySessionManager;

async function api(p: string, init?: RequestInit): Promise<Response> {
  return fetch(BASE + p, {
    redirect: 'manual',
    ...init,
    headers: { cookie, ...(init?.headers ?? {}) },
  });
}

// res.json() is typed `unknown` under strict TS; tests assert on loose JSON shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(res: Response): Promise<any> {
  return res.json();
}

beforeAll(async () => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-web-test-'));
  project.path = repoDir;
  git(repoDir, 'init', '-b', 'main');
  git(repoDir, 'config', 'user.email', 'test@example.com');
  git(repoDir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'hello\n');
  fs.mkdirSync(path.join(repoDir, 'src'));
  fs.writeFileSync(path.join(repoDir, 'src', 'index.ts'), 'export const x = 1;\n');
  git(repoDir, 'add', '-A');
  git(repoDir, 'commit', '-m', 'init');
  // One modified + one untracked file for the status/stage/commit flow.
  fs.appendFileSync(path.join(repoDir, 'README.md'), 'more\n');
  fs.writeFileSync(path.join(repoDir, 'new.txt'), 'fresh\n');

  server = new WebServer({
    registry: fakeRegistry,
    ptyManager: fakePtyManager,
    compositeKey,
    getTerminalStyle: () => ({ fontSize: 13 }) as TerminalStyleOptions,
  });
  await server.start({ port: PORT, password: PASSWORD });

  // Log in once; reuse the session cookie for all API calls.
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `password=${encodeURIComponent(PASSWORD)}`,
  });
  expect(res.status).toBe(303);
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0];
  expect(cookie).toMatch(/^dash_web=/);
});

afterAll(async () => {
  await server?.stop();
  fs.rmSync(repoDir, { recursive: true, force: true });
});

describe('auth', () => {
  it('redirects unauthenticated requests to /login', async () => {
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
  });

  it('rejects a wrong password', async () => {
    const res = await fetch(`${BASE}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=nope',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Incorrect password');
  });

  it('serves the app shell when authenticated', async () => {
    const res = await api('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('scr-projects');
    expect(html).toContain('scr-git');
  });
});

describe('legacy UI (BlackBerry 10)', () => {
  const BB10_UA =
    'Mozilla/5.0 (BB10; Touch) AppleWebKit/537.35+ (KHTML, like Gecko) Version/10.3.3.2205 Mobile Safari/537.35+';

  it('serves the ES5 legacy shell to a BB10 user agent', async () => {
    const res = await api('/', { headers: { 'user-agent': BB10_UA } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Legacy (BB10)');
    expect(html).toContain('scr-projects');
    expect(html).not.toContain('xterm'); // no xterm.js on legacy WebKit
    // Physical-keyboard capture: keys must feed the pty, not BB10 browser shortcuts.
    expect(html).toContain('termHasKeyboard');
  });

  it('serves the modern shell to other browsers', async () => {
    const res = await api('/', {
      headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15' },
    });
    expect(await res.text()).toContain('xterm');
  });

  it('honours ?ui=legacy and ?ui=modern overrides', async () => {
    const forcedLegacy = await api('/?ui=legacy');
    expect(await forcedLegacy.text()).toContain('Legacy (BB10)');
    const forcedModern = await api('/?ui=modern', { headers: { 'user-agent': BB10_UA } });
    expect(await forcedModern.text()).toContain('xterm');
  });
});

describe('/api/projects', () => {
  it('lists projects with branch and session state', async () => {
    const res = await api('/api/projects');
    const body = await json(res);
    expect(body.projects).toHaveLength(1);
    const p = body.projects[0];
    expect(p.name).toBe('demo');
    expect(p.branch).toBe('main');
    expect(p.active).toBe(true); // fakePtyManager reports a 'proj-1' session
    expect(p.sessionKeys).toEqual(['proj-1']);
  });
});

describe('/api/git', () => {
  it('reports status with unstaged + untracked files', async () => {
    const res = await api('/api/git/status?projectId=proj-1');
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.status.branch).toBe('main');
    const byPath = Object.fromEntries(body.status.files.map((f: { path: string }) => [f.path, f]));
    expect(byPath['README.md'].stage).toBe('unstaged');
    expect(byPath['new.txt'].change).toBe('untracked');
  });

  it('produces a diff for an unstaged file', async () => {
    const res = await api('/api/git/diff?projectId=proj-1&path=README.md&stage=unstaged');
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.diff).toContain('+more');
  });

  it('produces a diff for an untracked file', async () => {
    const res = await api('/api/git/diff?projectId=proj-1&path=new.txt&stage=untracked');
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.diff).toContain('+fresh');
  });

  it('stages, commits, and ends clean', async () => {
    const stage = await api('/api/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1', paths: ['README.md', 'new.txt'] }),
    });
    expect((await json(stage)).ok).toBe(true);

    const mid = await json(await api('/api/git/status?projectId=proj-1'));
    expect(mid.status.files.every((f: { stage: string }) => f.stage === 'staged')).toBe(true);

    const unstage = await api('/api/git/unstage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1', paths: ['new.txt'] }),
    });
    expect((await json(unstage)).ok).toBe(true);

    const restage = await api('/api/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1', paths: ['new.txt'] }),
    });
    expect((await json(restage)).ok).toBe(true);

    const commit = await api('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1', subject: 'feat: web commit' }),
    });
    expect((await json(commit)).ok).toBe(true);

    const after = await json(await api('/api/git/status?projectId=proj-1'));
    expect(after.status.files).toHaveLength(0);
    expect(git(repoDir, 'log', '-1', '--format=%s').trim()).toBe('feat: web commit');
  });

  it('rejects an empty commit subject', async () => {
    const res = await api('/api/git/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'proj-1', subject: '   ' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('/api/files', () => {
  it('lists the project root, dirs first, .git excluded', async () => {
    const res = await api('/api/files?projectId=proj-1&path=');
    const body = await json(res);
    expect(body.ok).toBe(true);
    const names = body.entries.map((e: { name: string }) => e.name);
    expect(names).not.toContain('.git');
    expect(names[0]).toBe('src'); // dirs sort first
    expect(names).toContain('README.md');
  });

  it('reads a file', async () => {
    const res = await api('/api/file?projectId=proj-1&path=src/index.ts');
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.binary).toBe(false);
    expect(body.content).toContain('export const x = 1;');
  });

  it('blocks path traversal', async () => {
    for (const p of ['..', '../..', '..%2F..%2Fetc%2Fpasswd', '/etc/passwd']) {
      const res = await api(`/api/files?projectId=proj-1&path=${p}`);
      expect(res.status).toBe(400);
    }
    const res = await api('/api/file?projectId=proj-1&path=../web-server.test.ts');
    expect(res.status).toBe(400);
  });

  it('404s for an unknown project', async () => {
    const res = await api('/api/files?projectId=nope&path=');
    expect(res.status).toBe(404);
  });
});
