import { EventEmitter } from 'node:events';
import { existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

// Files/dirs under `.git/` that, when touched, imply the renderer's view is
// stale. HEAD moves on checkout; index on stage/unstage/commit; refs/ on
// branch create/delete/fetch/push.
const WATCH_TARGETS = ['HEAD', 'index', 'refs'];

interface WatcherEntry {
  subscribers: number;
  handles: FSWatcher[];
  debounce: NodeJS.Timeout | null;
}

/**
 * A reference-counted watcher for repository `.git/` directories. The main
 * process creates one of these at startup, and the IPC layer calls
 * `subscribe(cwd)` when the renderer mounts the Git View for a repo and
 * `unsubscribe(cwd)` when it unmounts or switches away. Emits `changed`
 * with the `cwd` after a short debounce.
 */
export class GitWatcher extends EventEmitter {
  private readonly entries = new Map<string, WatcherEntry>();
  private readonly debounceMs: number;

  constructor(opts: { debounceMs?: number } = {}) {
    super();
    this.debounceMs = opts.debounceMs ?? 250;
  }

  subscribe(cwd: string): void {
    const existing = this.entries.get(cwd);
    if (existing) {
      existing.subscribers++;
      return;
    }
    const gitDir = path.join(cwd, '.git');
    if (!existsSync(gitDir)) {
      // Not a repo — record a zero-handle entry so later subscribe/unsubscribe
      // calls don't re-check the filesystem repeatedly.
      this.entries.set(cwd, { subscribers: 1, handles: [], debounce: null });
      return;
    }
    const handles: FSWatcher[] = [];
    for (const target of WATCH_TARGETS) {
      const full = path.join(gitDir, target);
      if (!existsSync(full)) continue;
      try {
        const w = watch(full, { recursive: true }, () => this.fire(cwd));
        w.on('error', () => {
          // Swallow watcher errors — the renderer still has a manual refresh
          // affordance, and some filesystems (network mounts) don't support
          // fs.watch cleanly.
        });
        handles.push(w);
      } catch {
        // Same rationale as above.
      }
    }
    this.entries.set(cwd, { subscribers: 1, handles, debounce: null });
  }

  unsubscribe(cwd: string): void {
    const entry = this.entries.get(cwd);
    if (!entry) return;
    entry.subscribers--;
    if (entry.subscribers > 0) return;
    for (const h of entry.handles) h.close();
    if (entry.debounce) clearTimeout(entry.debounce);
    this.entries.delete(cwd);
  }

  dispose(): void {
    for (const [, entry] of this.entries) {
      for (const h of entry.handles) h.close();
      if (entry.debounce) clearTimeout(entry.debounce);
    }
    this.entries.clear();
    this.removeAllListeners();
  }

  private fire(cwd: string): void {
    const entry = this.entries.get(cwd);
    if (!entry) return;
    if (entry.debounce) clearTimeout(entry.debounce);
    entry.debounce = setTimeout(() => {
      entry.debounce = null;
      this.emit('changed', { cwd });
    }, this.debounceMs);
  }
}
