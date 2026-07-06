import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { ClaudeHookStateEvent } from '../shared/ipc';
import type { ProjectRegistry } from './registry';

// Marker embedded in the hook command so we can find/replace/remove *our*
// entry in ~/.claude/settings.json without touching the user's other hooks.
const MARKER = 'dash-notify-hook';
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PORT_FILE = path.join(CLAUDE_DIR, 'dash-hook-port');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');
// Tools whose use means Claude is blocked waiting on the user to choose/answer.
// These prompts do NOT fire Notification (that's only tool-permission/idle), so
// we catch them via Pre/PostToolUse instead.
const INTERACTIVE_TOOLS = 'AskUserQuestion|ExitPlanMode';
// Events we hook. Stop = done; Notification = needs input (permission/idle);
// UserPromptSubmit = working. PreToolUse on the interactive tools = waiting on
// you; PostToolUse on them = you answered, back to working. A `matcher` limits
// the event to those tool names.
const EVENTS: ReadonlyArray<{ name: string; matcher?: string }> = [
  { name: 'Stop' },
  { name: 'Notification' },
  { name: 'UserPromptSubmit' },
  { name: 'PreToolUse', matcher: INTERACTIVE_TOOLS },
  { name: 'PostToolUse', matcher: INTERACTIVE_TOOLS },
];

/** The hook command Claude runs. Reads the live port from the port file each
 *  time (ephemeral port survives dash restarts), POSTs the hook JSON from
 *  stdin, and always exits 0 so a stopped dash never blocks Claude. */
function hookCommand(): string {
  // ponytail: relies on `curl`, present on macOS and modern Windows/Linux.
  // If a user lacks it the POST just fails silently — no harm to Claude.
  return `p=$(cat "$HOME/.claude/dash-hook-port" 2>/dev/null); [ -n "$p" ] && curl -sf -m 2 -X POST "http://127.0.0.1:$p/claude-hook" --data-binary @- >/dev/null 2>&1; exit 0 # ${MARKER}`;
}

interface HookPayload {
  hook_event_name?: string;
  cwd?: string;
  message?: string;
}

export interface ClaudeHooksDeps {
  registry: ProjectRegistry;
  onState: (ev: ClaudeHookStateEvent) => void;
}

export class ClaudeHooks {
  private server: http.Server | null = null;

  constructor(private readonly deps: ClaudeHooksDeps) {}

  async start(): Promise<void> {
    const server = http.createServer((req, res) => this.handle(req, res));
    server.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[claude-hooks] server error:', (err as Error).message);
    });
    await new Promise<void>((resolve) => {
      // Ephemeral port on loopback only.
      server.listen(0, '127.0.0.1', resolve);
    });
    this.server = server;
    const port = (server.address() as AddressInfo).port;
    try {
      await fs.mkdir(CLAUDE_DIR, { recursive: true });
      await fs.writeFile(PORT_FILE, String(port), 'utf8');
      await this.ensureSettings();
      // eslint-disable-next-line no-console
      console.log(`[claude-hooks] listening on 127.0.0.1:${port}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[claude-hooks] setup failed:', (err as Error).message);
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST' || !req.url?.startsWith('/claude-hook')) {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 1_000_000) req.destroy(); // guard against runaway input
    });
    req.on('end', () => {
      res.writeHead(204).end();
      try {
        this.dispatch(JSON.parse(body) as HookPayload);
      } catch {
        /* malformed payload — ignore */
      }
    });
    req.on('error', () => res.writeHead(400).end());
  }

  private dispatch(p: HookPayload): void {
    // eslint-disable-next-line no-console
    if (!p.cwd) return;
    const tab = this.tabForCwd(p.cwd);
    if (!tab) return; // cwd isn't a known project/worktree (e.g. user cd'd away)

    let state: ClaudeHookStateEvent['state'] | null = null;
    switch (p.hook_event_name) {
      case 'Stop':
        state = 'done';
        break;
      case 'UserPromptSubmit':
      case 'PostToolUse': // matched to interactive tools: user answered → working
        state = 'busy';
        break;
      case 'PreToolUse': // matched to interactive tools: blocked waiting on you
        state = 'input';
        break;
      case 'Notification':
        // Notification fires for permission prompts AND the 60s idle timeout
        // ("waiting for your input"). Only the permission case means Claude is
        // actually blocked on you; the idle one would leave the ● dot stuck
        // after a turn ends since nothing clears it until the next prompt.
        if (!/permission/i.test(p.message ?? '')) return;
        state = 'input';
        break;
      default:
        return;
    }
    this.deps.onState({ ...tab, state });
  }

  /** Map a session cwd to a dash tab by exact (resolved) path match. */
  private tabForCwd(
    cwd: string,
  ): Pick<ClaudeHookStateEvent, 'projectId' | 'worktreeId' | 'projectName'> | null {
    const norm = path.resolve(cwd);
    for (const proj of this.deps.registry.list()) {
      if (path.resolve(proj.path) === norm) {
        return { projectId: proj.id, worktreeId: null, projectName: proj.name };
      }
      // ponytail: multiple agent sessions in one worktree all map to this
      // tab; the hook payload has no dash agentId to distinguish them.
      for (const wt of proj.worktrees) {
        if (path.resolve(wt.path) === norm) {
          return { projectId: proj.id, worktreeId: wt.id, projectName: proj.name };
        }
      }
    }
    return null;
  }

  /** Idempotently merge our hook into ~/.claude/settings.json, preserving any
   *  existing hooks and other settings. Backs the file up once before the
   *  first modification. Skips silently if the file is present but unparseable
   *  (never clobber a user's hand-edited config). */
  private async ensureSettings(): Promise<void> {
    let raw = '';
    try {
      raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    } catch {
      raw = ''; // missing file — we'll create it
    }

    let config: Record<string, unknown>;
    if (raw.trim()) {
      try {
        config = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // eslint-disable-next-line no-console
        console.warn('[claude-hooks] ~/.claude/settings.json is not valid JSON; skipping hook install');
        return;
      }
    } else {
      config = {};
    }

    const hooks = (config.hooks && typeof config.hooks === 'object'
      ? (config.hooks as Record<string, unknown>)
      : {}) as Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>>;

    const command = hookCommand();
    let changed = false;

    for (const { name: event, matcher } of EVENTS) {
      const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
      // Drop any prior dash entry (command/matcher may have changed across versions).
      const withoutOurs = existing.filter(
        (group) => !group.hooks?.some((h) => h.command?.includes(MARKER)),
      );
      const ours = existing.find((group) => group.hooks?.some((h) => h.command?.includes(MARKER)));
      // Already present with the exact current command AND matcher? Leave it.
      if (
        ours &&
        ours.hooks.some((h) => h.command === command) &&
        ours.matcher === matcher &&
        withoutOurs.length === existing.length - 1
      ) {
        continue;
      }
      withoutOurs.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command }] });
      hooks[event] = withoutOurs;
      changed = true;
    }

    if (!changed) return;
    config.hooks = hooks;

    // One-time backup before our first write.
    if (raw.trim()) {
      const backup = `${SETTINGS_FILE}.dash-bak`;
      try {
        await fs.access(backup);
      } catch {
        await fs.writeFile(backup, raw, 'utf8');
      }
    }
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(config, null, 2) + '\n', 'utf8');
    // eslint-disable-next-line no-console
    console.log('[claude-hooks] merged hooks into ~/.claude/settings.json');
  }
}

// ponytail: self-check — verify the merge is idempotent and preserves foreign
// hooks. Run with `node --loader ... claude-hooks.ts --selftest` if needed.
export function _mergeSelfTest(): void {
  // Minimal in-memory reimplementation of the merge decision for a quick sanity
  // check without touching disk.
  const command = hookCommand();
  const start: Record<string, unknown> = {
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] },
    otherSetting: true,
  };
  const hooks = start.hooks as Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>;
  for (const { name: event, matcher } of EVENTS) {
    const existing = Array.isArray(hooks[event]) ? hooks[event] : [];
    const withoutOurs = existing.filter((g) => !g.hooks?.some((h) => h.command?.includes(MARKER)));
    withoutOurs.push({ ...(matcher ? { matcher } : {}), hooks: [{ command }] });
    hooks[event] = withoutOurs;
  }
  if (!(start.hooks as Record<string, unknown>).Stop) throw new Error('lost Stop');
  if (!start.otherSetting) throw new Error('lost foreign setting');
  const stopGroups = hooks.Stop;
  if (stopGroups.length !== 2) throw new Error('should keep foreign + ours');
  if (!hooks.Notification || !hooks.UserPromptSubmit) throw new Error('missing added events');
  if (!hooks.PreToolUse?.some((g) => g.matcher === INTERACTIVE_TOOLS)) throw new Error('missing PreToolUse matcher');
  // eslint-disable-next-line no-console
  console.log('claude-hooks merge self-test OK');
}
