import { promises as fs } from 'node:fs';
import { EventEmitter } from 'node:events';
import type * as NodePty from 'node-pty';
import type { PtySpawnError, PtySpawnResult } from '@shared/types';
import { CLAUDE_INSTALL_URL, resolveClaudeEnv } from './claude-resolver';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pty: typeof NodePty = require('node-pty');

export interface PtySessionOpts {
  key: string;
  cwd: string;
  cols: number;
  rows: number;
  /** When set, launch this command line via the user's login shell instead of
   *  the built-in Claude Code session. */
  command?: string;
  /** Windows-only: when set, launch Claude Code / the command through this shell
   *  (e.g. `powershell.exe`) instead of spawning the binary / cmd.exe directly. */
  shell?: string;
  onData: (data: string) => void;
  onExit: (code: number | null, signal: number | null) => void;
}

export class PtySession {
  readonly key: string;
  private proc: NodePty.IPty;
  private emitter = new EventEmitter();
  private exited = false;

  private constructor(proc: NodePty.IPty, key: string) {
    this.proc = proc;
    this.key = key;
  }

  static async spawn(opts: PtySessionOpts): Promise<PtySession | PtySpawnError> {
    try {
      const st = await fs.stat(opts.cwd);
      if (!st.isDirectory()) {
        return { kind: 'path-missing', path: opts.cwd };
      }
    } catch {
      return { kind: 'path-missing', path: opts.cwd };
    }

    // Reuse the Claude resolver to obtain a login-shell-resolved PATH. Custom
    // agents don't need the claude binary itself, only the enriched env.
    const { claudePath, env: baseEnv } = await resolveClaudeEnv();
    const env = { ...baseEnv };

    // Backstop against a misbehaving third-party Stop hook (e.g. a plugin whose
    // background daemon is dead) that keeps failing and blocking the turn from
    // ending — that spins Claude up to the default cap (~9) of noisy retries.
    // Cap it low so a stuck hook recovers fast inside dash. User override wins.
    // ponytail: also throttles a *legitimately* blocking Stop hook to 2 retries;
    // raise/remove if a real hook workflow needs more.
    if (!env.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP) env.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP = '2';

    const isWin = process.platform === 'win32';
    // Windows-only shell override (e.g. PowerShell). When set, Claude Code and
    // agent commands launch *through* this shell so PATH/profile resolve the
    // same way an interactive session would. Empty keeps the direct launch.
    const winShell = isWin ? opts.shell?.trim() : undefined;
    const isPwsh = !!winShell && /(powershell|pwsh)/i.test(winShell);

    let file: string;
    let spawnArgs: string[];
    if (opts.command) {
      // Run the user-supplied command line through their login shell so PATH,
      // aliases, and shell functions resolve the same way an interactive
      // terminal would.
      if (isWin) {
        file = winShell || process.env.COMSPEC || 'cmd.exe';
        spawnArgs = isPwsh ? ['-NoLogo', '-Command', opts.command] : ['/d', '/s', '/c', opts.command];
      } else {
        file = process.env.SHELL || '/bin/bash';
        spawnArgs = ['-lc', opts.command];
      }
    } else {
      if (!claudePath) {
        return { kind: 'claude-not-found', installUrl: CLAUDE_INSTALL_URL };
      }
      if (winShell) {
        // Launch Claude Code through the chosen Windows shell.
        file = winShell;
        spawnArgs = isPwsh
          ? ['-NoLogo', '-Command', `& '${claudePath.replace(/'/g, "''")}'`]
          : ['/d', '/s', '/c', `"${claudePath}"`];
      } else {
        file = claudePath;
        spawnArgs = [];
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `[pty:${opts.key.slice(0, 8)}] spawning ${opts.command ? `command=${opts.command}` : `claude=${file}`} cwd=${opts.cwd} cols=${opts.cols} rows=${opts.rows} PATH=${(env.PATH ?? '').slice(0, 60)}…`,
    );

    const proc = pty.spawn(file, spawnArgs, {
      name: 'xterm-256color',
      cwd: opts.cwd,
      cols: Math.max(1, opts.cols | 0),
      rows: Math.max(1, opts.rows | 0),
      env: env as { [key: string]: string },
    });

    const session = new PtySession(proc, opts.key);
    proc.onData((data) => opts.onData(data));
    proc.onExit(({ exitCode, signal }) => {
      session.exited = true;
      opts.onExit(exitCode ?? null, signal ?? null);
    });
    return session;
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
      /* pty may have just exited; ignore */
    }
  }

  async kill(): Promise<void> {
    if (this.exited) return;
    return new Promise((resolve) => {
      const done = () => resolve();
      this.emitter.once('killed', done);
      try {
        this.proc.onExit(() => {
          this.exited = true;
          this.emitter.emit('killed');
        });
        this.proc.kill();
        // Safety timeout in case kill is a no-op.
        setTimeout(() => {
          this.exited = true;
          this.emitter.emit('killed');
        }, 1500);
      } catch {
        this.exited = true;
        this.emitter.emit('killed');
      }
    });
  }

  isExited(): boolean {
    return this.exited;
  }
}

export class PtySessionManager {
  private sessions = new Map<string, PtySession>();

  get(key: string): PtySession | undefined {
    return this.sessions.get(key);
  }

  set(key: string, session: PtySession): void {
    this.sessions.set(key, session);
  }

  delete(key: string): void {
    this.sessions.delete(key);
  }

  keys(): string[] {
    return [...this.sessions.keys()];
  }

  async killAll(): Promise<void> {
    const all = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(all.map((s) => s.kill()));
  }

  async spawn(args: {
    key: string;
    cwd: string;
    cols: number;
    rows: number;
    command?: string;
    shell?: string;
    onData: (data: string) => void;
    onExit: (code: number | null, signal: number | null) => void;
  }): Promise<PtySpawnResult> {
    // Close any previous exited session for this key.
    const existing = this.sessions.get(args.key);
    if (existing && existing.isExited()) this.sessions.delete(args.key);
    if (this.sessions.has(args.key)) {
      return { ok: true };
    }

    const result = await PtySession.spawn(args);
    if (result instanceof PtySession) {
      this.sessions.set(args.key, result);
      return { ok: true };
    }
    return { ok: false, error: result };
  }
}
