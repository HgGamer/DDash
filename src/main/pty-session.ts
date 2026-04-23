import { promises as fs } from 'node:fs';
import { EventEmitter } from 'node:events';
import type * as NodePty from 'node-pty';
import type { PtySpawnError, PtySpawnResult } from '@shared/types';
import { CLAUDE_INSTALL_URL, resolveClaudeEnv } from './claude-resolver';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const pty: typeof NodePty = require('node-pty');

export interface PtySessionOpts {
  projectId: string;
  cwd: string;
  cols: number;
  rows: number;
  onData: (data: string) => void;
  onExit: (code: number | null, signal: number | null) => void;
}

export class PtySession {
  readonly projectId: string;
  private proc: NodePty.IPty;
  private emitter = new EventEmitter();
  private exited = false;

  private constructor(proc: NodePty.IPty, projectId: string) {
    this.proc = proc;
    this.projectId = projectId;
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

    const { claudePath, env } = await resolveClaudeEnv();
    if (!claudePath) {
      return { kind: 'claude-not-found', installUrl: CLAUDE_INSTALL_URL };
    }

    // eslint-disable-next-line no-console
    console.log(
      `[pty:${opts.projectId.slice(0, 6)}] spawning claude=${claudePath} cwd=${opts.cwd} cols=${opts.cols} rows=${opts.rows} PATH=${(env.PATH ?? '').slice(0, 60)}…`,
    );

    const proc = pty.spawn(claudePath, [], {
      name: 'xterm-256color',
      cwd: opts.cwd,
      cols: Math.max(1, opts.cols | 0),
      rows: Math.max(1, opts.rows | 0),
      env: env as { [key: string]: string },
    });

    const session = new PtySession(proc, opts.projectId);
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

  get(projectId: string): PtySession | undefined {
    return this.sessions.get(projectId);
  }

  set(projectId: string, session: PtySession): void {
    this.sessions.set(projectId, session);
  }

  delete(projectId: string): void {
    this.sessions.delete(projectId);
  }

  async killAll(): Promise<void> {
    const all = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(all.map((s) => s.kill()));
  }

  async spawn(args: {
    projectId: string;
    cwd: string;
    cols: number;
    rows: number;
    onData: (data: string) => void;
    onExit: (code: number | null, signal: number | null) => void;
  }): Promise<PtySpawnResult> {
    // Close any previous exited session for this project.
    const existing = this.sessions.get(args.projectId);
    if (existing && existing.isExited()) this.sessions.delete(args.projectId);
    if (this.sessions.has(args.projectId)) {
      return { ok: true };
    }

    const result = await PtySession.spawn(args);
    if (result instanceof PtySession) {
      this.sessions.set(args.projectId, result);
      return { ok: true };
    }
    return { ok: false, error: result };
  }
}
