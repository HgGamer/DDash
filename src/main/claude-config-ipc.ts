import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IPC,
  type ClaudeConfigArgs,
  type ClaudeConfigResult,
  type ClaudeHookEntry,
  type ClaudeHookScope,
  type ClaudeHooksSaveArgs,
  type ClaudeHooksSaveResult,
  type ClaudePluginInfo,
  type ClaudeScopeInfo,
} from '@shared/ipc';
import type { ProjectRegistry } from './registry';

// The Claude panel (renderer ClaudePanel.tsx): the hooks in Claude Code's three
// settings scopes, editable, and the plugins / dev mods installed. Every write
// keeps the file's other keys, the previous version in <file>.dash-bak, refuses a
// file that isn't valid JSON, and never touches dash's own notify hook.
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const DASH_MARKER = 'dash-notify-hook';

type HookGroup = { matcher?: string; hooks?: Array<{ type?: string; command?: string; timeout?: number }> };
type Settings = Record<string, unknown> & { hooks?: Record<string, HookGroup[]> };

function scopePath(scope: ClaudeHookScope, root: string | null): string | null {
  if (scope === 'user') return path.join(CLAUDE_DIR, 'settings.json');
  if (!root) return null;
  return path.join(root, '.claude', scope === 'project' ? 'settings.json' : 'settings.local.json');
}

async function readSettings(file: string): Promise<{ exists: boolean; settings: Settings | null }> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { exists: false, settings: {} };
  }
  if (!raw.trim()) return { exists: true, settings: {} };
  try {
    return { exists: true, settings: JSON.parse(raw) as Settings };
  } catch {
    return { exists: true, settings: null }; // unparseable: shown, never written
  }
}

/** settings.hooks ({ Event: [{ matcher, hooks: [...] }] }) -> one row per command. */
export function flattenHooks(s: Settings): ClaudeHookEntry[] {
  const out: ClaudeHookEntry[] = [];
  for (const [event, groups] of Object.entries(s.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      for (const h of g.hooks ?? []) {
        out.push({
          event,
          matcher: g.matcher ?? '',
          type: h.type ?? 'command',
          command: h.command ?? '',
          ...(h.timeout != null ? { timeout: h.timeout } : {}),
          managed: (h.command ?? '').includes(DASH_MARKER),
        });
      }
    }
  }
  return out;
}

/** The reverse: rows grouped by event, then by matcher (order kept). */
export function groupHooks(rows: ClaudeHookEntry[]): Record<string, HookGroup[]> {
  const out: Record<string, HookGroup[]> = {};
  for (const r of rows) {
    const groups = (out[r.event] ??= []);
    let g = groups.find((x) => (x.matcher ?? '') === r.matcher);
    if (!g) {
      g = { ...(r.matcher ? { matcher: r.matcher } : {}), hooks: [] };
      groups.push(g);
    }
    g.hooks!.push({ type: r.type || 'command', command: r.command, ...(r.timeout ? { timeout: r.timeout } : {}) });
  }
  return out;
}

async function listPlugins(enabled: Record<string, boolean>): Promise<ClaudePluginInfo[]> {
  const out: ClaudePluginInfo[] = [];
  const describe = async (dir: string): Promise<{ description: string; events: string[]; isMod: boolean }> => {
    let description = '';
    try {
      description = String((JSON.parse(await fs.readFile(path.join(dir, '.claude-plugin', 'plugin.json'), 'utf8')) as { description?: string }).description ?? '');
    } catch {
      /* no manifest */
    }
    try {
      const h = JSON.parse(await fs.readFile(path.join(dir, 'hooks', 'hooks.json'), 'utf8')) as { hooks?: object; modules?: unknown[] };
      return { description, events: Object.keys(h.hooks ?? {}), isMod: Array.isArray(h.modules) };
    } catch {
      return { description, events: [], isMod: false };
    }
  };
  try {
    const inst = JSON.parse(await fs.readFile(path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json'), 'utf8')) as {
      plugins?: Record<string, Array<{ scope?: string; installPath?: string; version?: string }>>;
    };
    for (const [id, entries] of Object.entries(inst.plugins ?? {})) {
      const e = entries[0];
      if (!e?.installPath) continue;
      out.push({ id, name: id.split('@')[0]!, kind: 'plugin', version: e.version ?? '', path: e.installPath, enabled: enabled[id] !== false, ...(await describe(e.installPath)) });
    }
  } catch {
    /* no plugins installed */
  }
  // Dev mods: ~/.claude/dev-mods/<session>/<mod>/ (plugin-authoring's hot-reload folders)
  try {
    for (const session of await fs.readdir(path.join(CLAUDE_DIR, 'dev-mods'))) {
      const sdir = path.join(CLAUDE_DIR, 'dev-mods', session);
      for (const mod of await fs.readdir(sdir).catch(() => [] as string[])) {
        const dir = path.join(sdir, mod);
        if (!(await fs.stat(path.join(dir, '.claude-plugin', 'plugin.json')).catch(() => null))) continue;
        out.push({ id: `${mod}@dev-mods/${session}`, name: mod, kind: 'dev-mod', version: '', path: dir, enabled: true, ...(await describe(dir)) });
      }
    }
  } catch {
    /* no dev mods */
  }
  return out;
}

export function registerClaudeConfigIpc({ registry }: { registry: ProjectRegistry }): void {
  const rootOf = (a: ClaudeConfigArgs): string | null => {
    const proj = a.projectId ? registry.getById(a.projectId) : undefined;
    if (!proj) return null;
    const wt = a.worktreeId ? proj.worktrees.find((w) => w.id === a.worktreeId) : undefined;
    return path.resolve(wt?.path ?? proj.path);
  };

  ipcMain.handle(IPC.ClaudeConfigRead, async (_e, a: ClaudeConfigArgs): Promise<ClaudeConfigResult> => {
    const root = rootOf(a);
    const scopes: ClaudeScopeInfo[] = [];
    let enabled: Record<string, boolean> = {};
    for (const scope of ['user', 'project', 'local'] as const) {
      const file = scopePath(scope, root);
      if (!file) continue;
      const { exists, settings } = await readSettings(file);
      if (scope === 'user' && settings) enabled = (settings.enabledPlugins as Record<string, boolean>) ?? {};
      scopes.push({ scope, path: file, exists, isValid: settings !== null, hooks: settings ? flattenHooks(settings) : [] });
    }
    return { scopes, plugins: await listPlugins(enabled) };
  });

  ipcMain.handle(IPC.ClaudeHooksSave, async (_e, a: ClaudeHooksSaveArgs): Promise<ClaudeHooksSaveResult> => {
    const file = scopePath(a.scope, rootOf(a));
    if (!file) return { ok: false, message: 'No project open for this scope.' };
    const { exists, settings } = await readSettings(file);
    if (!settings) return { ok: false, message: `${file} is not valid JSON; fix it by hand first.` };
    // dash's own hook stays as it is on disk, whatever the renderer sent
    const managed = flattenHooks(settings).filter((h) => h.managed);
    const rows = [...a.hooks.filter((h) => !h.managed && h.event && h.command.trim()), ...managed];
    const next: Settings = { ...settings, hooks: groupHooks(rows) };
    if (!rows.length) delete next.hooks;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      if (exists) await fs.copyFile(file, file + '.dash-bak').catch(() => undefined);
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
      await fs.rename(tmp, file);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  });
}
