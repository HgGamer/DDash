import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_APP_STATE,
  DEFAULT_TERMINAL_STYLE,
  TERMINAL_STYLE_PRESET_IDS,
  type AppState,
  type TerminalStyleSettings,
} from '@shared/types';

export interface StoreOptions {
  dir: string;
  filename?: string;
  debounceMs?: number;
}

export class JsonStore {
  private readonly filePath: string;
  private readonly debounceMs: number;
  private state: AppState = structuredClone(DEFAULT_APP_STATE);
  private loaded = false;
  private pendingTimer: NodeJS.Timeout | null = null;
  private writeInFlight: Promise<void> | null = null;

  constructor(opts: StoreOptions) {
    this.filePath = path.join(opts.dir, opts.filename ?? 'app-state.json');
    this.debounceMs = opts.debounceMs ?? 150;
  }

  async load(): Promise<AppState> {
    if (this.loaded) return this.state;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as AppState;
      this.state = this.migrate(parsed);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') {
        // Corrupt file — back it up and start fresh rather than crashing.
        try {
          await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
      this.state = structuredClone(DEFAULT_APP_STATE);
    }
    this.loaded = true;
    return this.state;
  }

  get(): AppState {
    return this.state;
  }

  update(mutator: (draft: AppState) => void): AppState {
    mutator(this.state);
    this.scheduleSave();
    return this.state;
  }

  private scheduleSave(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    // Serialize writes so concurrent flushes don't interleave.
    if (this.writeInFlight) await this.writeInFlight;
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeInFlight = this.writeAtomic(snapshot).finally(() => {
      this.writeInFlight = null;
    });
    await this.writeInFlight;
  }

  private async writeAtomic(contents: string): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, this.filePath);
  }

  private migrate(raw: unknown): AppState {
    const base = structuredClone(DEFAULT_APP_STATE);
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Partial<AppState>;
    return {
      version: 1,
      projects: Array.isArray(r.projects) ? r.projects : [],
      lastActiveProjectId: r.lastActiveProjectId ?? null,
      window: { ...base.window, ...(r.window ?? {}) },
      terminalStyle: migrateTerminalStyle(r.terminalStyle),
    };
  }
}

function migrateTerminalStyle(raw: unknown): TerminalStyleSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TERMINAL_STYLE };
  const r = raw as Partial<TerminalStyleSettings>;
  const preset =
    r.preset && TERMINAL_STYLE_PRESET_IDS.includes(r.preset)
      ? r.preset
      : DEFAULT_TERMINAL_STYLE.preset;
  // A 'custom' preset is only valid if a customStyle payload accompanies it.
  if (preset === 'custom' && (!r.customStyle || typeof r.customStyle !== 'object')) {
    return { ...DEFAULT_TERMINAL_STYLE };
  }
  const out: TerminalStyleSettings = { version: 1, preset };
  if (r.customStyle && typeof r.customStyle === 'object') out.customStyle = r.customStyle;
  if (typeof r.customStyleName === 'string') out.customStyleName = r.customStyleName;
  return out;
}
