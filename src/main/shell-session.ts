import { promises as fs } from 'node:fs';
import { platform } from 'node:os';
import type * as NodePty from 'node-pty';
import type { ShellTab } from '@shared/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pty: typeof NodePty = require('node-pty');

const RING_BUFFER_LIMIT = 100_000; // characters

export interface ShellSpawnOpts {
  tabId: string;
  projectId: string;
  worktreeId: string | null;
  cwd: string;
  shell: string;
  label: string;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: (code: number | null, signal: number | null) => void;
}

export type ShellSpawnResult =
  | { ok: true; tab: ShellTab; replay: string }
  | { ok: false; reason: 'spawn-failed'; message: string };

class ShellSession {
  readonly tab: ShellTab;
  private proc: NodePty.IPty;
  private buffer = '';
  private exited = false;

  constructor(proc: NodePty.IPty, tab: ShellTab) {
    this.proc = proc;
    this.tab = tab;
  }

  appendBuffer(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > RING_BUFFER_LIMIT) {
      this.buffer = this.buffer.slice(this.buffer.length - RING_BUFFER_LIMIT);
    }
  }

  replay(): string {
    return this.buffer;
  }

  write(data: string): void {
    if (this.exited) return;
    this.proc.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.exited) return;
    try {
      this.proc.resize(Math.max(1, cols | 0), Math.max(1, rows | 0));
    } catch {
      /* ignore */
    }
  }

  markExited(code: number | null) {
    this.exited = true;
    this.tab.exitCode = code;
  }

  isExited() {
    return this.exited;
  }

  kill(): void {
    if (this.exited) return;
    try {
      this.proc.kill();
    } catch {
      /* ignore */
    }
  }
}

export class ShellSessionManager {
  private sessions = new Map<string, ShellSession>();

  get(tabId: string): ShellSession | undefined {
    return this.sessions.get(tabId);
  }

  listFor(projectId: string, worktreeId: string | null): ShellTab[] {
    const wt = worktreeId ?? null;
    const out: ShellTab[] = [];
    for (const s of this.sessions.values()) {
      if (s.tab.projectId === projectId && s.tab.worktreeId === wt) {
        out.push({ ...s.tab });
      }
    }
    return out;
  }

  async spawn(opts: ShellSpawnOpts): Promise<ShellSpawnResult> {
    try {
      const st = await fs.stat(opts.cwd);
      if (!st.isDirectory()) {
        return { ok: false, reason: 'spawn-failed', message: `cwd not a directory: ${opts.cwd}` };
      }
    } catch {
      return { ok: false, reason: 'spawn-failed', message: `cwd missing: ${opts.cwd}` };
    }

    const env: { [key: string]: string } = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string') env[k] = v;
    }
    env.TERM = env.TERM ?? 'xterm-256color';

    // Run as a login shell on macOS/Linux so that /etc/zprofile, ~/.zprofile,
    // ~/.bash_profile, etc. are sourced. That's where tools like dotnet, nvm,
    // rustup, and Homebrew's path_helper typically add to PATH. Without this,
    // the integrated terminal inherits only Electron's bare PATH.
    const shellArgs = platform() === 'win32' ? [] : ['-l'];

    let proc: NodePty.IPty;
    try {
      proc = pty.spawn(opts.shell, shellArgs, {
        name: 'xterm-256color',
        cwd: opts.cwd,
        cols: Math.max(1, opts.cols | 0),
        rows: Math.max(1, opts.rows | 0),
        env,
      });
    } catch (e) {
      return {
        ok: false,
        reason: 'spawn-failed',
        message: e instanceof Error ? e.message : String(e),
      };
    }

    const tab: ShellTab = {
      tabId: opts.tabId,
      projectId: opts.projectId,
      worktreeId: opts.worktreeId,
      cwd: opts.cwd,
      shell: opts.shell,
      label: opts.label,
      startedAt: new Date().toISOString(),
      exitCode: null,
    };

    const session = new ShellSession(proc, tab);
    this.sessions.set(opts.tabId, session);

    proc.onData((data) => {
      session.appendBuffer(data);
      opts.onData(data);
    });
    proc.onExit(({ exitCode, signal }) => {
      session.markExited(exitCode ?? null);
      opts.onExit(exitCode ?? null, signal ?? null);
    });

    return { ok: true, tab: { ...tab }, replay: '' };
  }

  rename(tabId: string, label: string): void {
    const s = this.sessions.get(tabId);
    if (s) s.tab.label = label;
  }

  close(tabId: string): void {
    const s = this.sessions.get(tabId);
    if (!s) return;
    s.kill();
    this.sessions.delete(tabId);
  }

  killAll(): void {
    for (const s of this.sessions.values()) s.kill();
    this.sessions.clear();
  }

  /** Kill every session whose owning project (and optional worktree) matches. */
  killForProject(projectId: string, worktreeId?: string | null): void {
    const targetWt = worktreeId === undefined ? undefined : (worktreeId ?? null);
    for (const [id, s] of [...this.sessions.entries()]) {
      if (s.tab.projectId !== projectId) continue;
      if (targetWt !== undefined && s.tab.worktreeId !== targetWt) continue;
      s.kill();
      this.sessions.delete(id);
    }
  }
}

export function resolveDefaultShell(override?: string): string {
  if (override && override.trim().length > 0) return override;
  if (platform() === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || '/bin/zsh';
}
