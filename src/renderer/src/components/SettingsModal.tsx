import { useEffect, useMemo, useState } from 'react';
import type {
  AgentDef,
  AutoUpdateChannel,
  AutoUpdateState,
  ConsoleCommandSettings,
  NotificationSettings,
  TerminalCursorStyle,
  TerminalStyleOptions,
  TerminalStylePreset,
} from '@shared/types';
import { resolveTerminalStyleOptions } from '@shared/types';
import type { AppTheme } from '../lib/theme';
import { useStore } from '../store';
import { useAutoUpdate } from '../hooks/useAutoUpdate';

interface PresetOption {
  id: Exclude<TerminalStylePreset, 'custom'>;
  label: string;
  description: string;
}

const BUILTIN_OPTIONS: PresetOption[] = [
  {
    id: 'default',
    label: 'Default terminal style (xterm)',
    description: "Uses xterm.js's built-in defaults — no custom theme, font, or size.",
  },
  {
    id: 'dash-dark',
    label: 'Dash dark',
    description: 'Black background, SF Mono / Menlo font stack, 14px.',
  },
];

const CURSOR_STYLES: Array<{ id: TerminalCursorStyle; label: string }> = [
  { id: 'block', label: 'Block' },
  { id: 'underline', label: 'Underline' },
  { id: 'bar', label: 'Bar' },
];

type TabId =
  | 'appearance'
  | 'startup'
  | 'terminal'
  | 'notifications'
  | 'git'
  | 'integrated-terminal'
  | 'agents'
  | 'updates'
  | 'web-access'
  | 'board'
  | 'keybindings';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const tab = useStore((s) => s.settingsModalTab);
  const setTab = (t: TabId) => useStore.setState({ settingsModalTab: t });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="settings-card"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="settings-nav">
          <div className="settings-nav-title">Settings</div>
          <button
            className={`settings-nav-item${tab === 'appearance' ? ' active' : ''}`}
            onClick={() => setTab('appearance')}
          >
            Appearance
          </button>
          <button
            className={`settings-nav-item${tab === 'startup' ? ' active' : ''}`}
            onClick={() => setTab('startup')}
          >
            Startup
          </button>
          <button
            className={`settings-nav-item${tab === 'terminal' ? ' active' : ''}`}
            onClick={() => setTab('terminal')}
          >
            Terminal
          </button>
          <button
            className={`settings-nav-item${tab === 'notifications' ? ' active' : ''}`}
            onClick={() => setTab('notifications')}
          >
            Notifications
          </button>
          <button
            className={`settings-nav-item${tab === 'git' ? ' active' : ''}`}
            onClick={() => setTab('git')}
          >
            Git
          </button>
          <button
            className={`settings-nav-item${tab === 'board' ? ' active' : ''}`}
            onClick={() => setTab('board')}
          >
            Board
          </button>
          <button
            className={`settings-nav-item${tab === 'integrated-terminal' ? ' active' : ''}`}
            onClick={() => setTab('integrated-terminal')}
          >
            Integrated terminal
          </button>
          <button
            className={`settings-nav-item${tab === 'agents' ? ' active' : ''}`}
            onClick={() => setTab('agents')}
          >
            Agents
          </button>
          <button
            className={`settings-nav-item${tab === 'updates' ? ' active' : ''}`}
            onClick={() => setTab('updates')}
          >
            Updates
          </button>
          <button
            className={`settings-nav-item${tab === 'web-access' ? ' active' : ''}`}
            onClick={() => setTab('web-access')}
          >
            Web access
          </button>
          <button
            className={`settings-nav-item${tab === 'keybindings' ? ' active' : ''}`}
            onClick={() => setTab('keybindings')}
          >
            Keybindings
          </button>
        </nav>
        <div className="settings-body">
          {tab === 'appearance' ? (
            <AppearancePanel />
          ) : tab === 'startup' ? (
            <StartupPanel />
          ) : tab === 'terminal' ? (
            <TerminalPanel />
          ) : tab === 'notifications' ? (
            <NotificationsPanel />
          ) : tab === 'integrated-terminal' ? (
            <IntegratedTerminalPanel />
          ) : tab === 'agents' ? (
            <AgentsPanel />
          ) : tab === 'updates' ? (
            <UpdatesPanel />
          ) : tab === 'web-access' ? (
            <WebAccessPanel />
          ) : tab === 'keybindings' ? (
            <KeybindingsPanel />
          ) : tab === 'board' ? (
            <BoardPanel />
          ) : (
            <GitPanel />
          )}
          <div className="modal-actions">
            <button onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const APP_THEME_OPTIONS: Array<{ id: AppTheme; label: string; description: string }> = [
  { id: 'dark', label: 'Dark', description: 'The default dark token set.' },
  {
    id: 'light',
    label: 'Light',
    description: 'Bright surfaces; the terminal also switches to a light palette.',
  },
  { id: 'pink', label: 'Pink', description: 'Dark base with a pink accent.' },
];

function StartupPanel() {
  const restoreSession = useStore((s) => s.restoreSession);
  const setRestoreSession = useStore((s) => s.setRestoreSession);
  return (
    <div className="settings-panel">
      <section>
        <h4>On launch</h4>
        <div className="field-row">
          <label className="field-label">Reopen the last session and resume Claude</label>
          <input
            type="checkbox"
            checked={restoreSession}
            onChange={(e) => setRestoreSession(e.target.checked)}
          />
        </div>
        <p className="preset-desc">
          Reopens the project/worktree you last had active (plus any board-pinned windows) and
          continues each one&rsquo;s most recent Claude conversation via{' '}
          <code>claude --continue</code>. When off, Dash opens to your most recent project with a
          fresh Claude session.
        </p>
      </section>
    </div>
  );
}

function AppearancePanel() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <div className="settings-panel">
      <section>
        <h4>Theme</h4>
        <div className="preset-list">
          {APP_THEME_OPTIONS.map((opt) => (
            <label key={opt.id} className="preset-row">
              <input
                type="radio"
                name="app-theme"
                value={opt.id}
                checked={theme === opt.id}
                onChange={() => setTheme(opt.id)}
              />
              <div>
                <div className="preset-label">{opt.label}</div>
                <div className="preset-desc">{opt.description}</div>
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

// Read-only reference. Keep in sync with the accelerators in `main/menu.ts`
// and the renderer key handlers in `App.tsx` / `MarkdownViewer.tsx` — there's
// no rebind engine yet, so this is hand-maintained.
const KEYBINDING_GROUPS: Array<{
  title: string;
  items: Array<{ mac: string; other: string; desc: string }>;
}> = [
  {
    title: 'General',
    items: [
      { mac: '⌘ ,', other: 'Ctrl+,', desc: 'Open settings' },
      { mac: '⌘ O', other: 'Ctrl+O', desc: 'Add project' },
      { mac: '⌘ ⌫', other: 'Ctrl+Delete', desc: 'Remove active project' },
      { mac: '⌃ ⌘ F', other: 'F11', desc: 'Toggle full screen' },
    ],
  },
  {
    title: 'Tabs',
    items: [
      { mac: '⌘ ⌥ →', other: 'Ctrl+Tab', desc: 'Next tab' },
      { mac: '⌘ ⌥ ←', other: 'Ctrl+Shift+Tab', desc: 'Previous tab' },
      { mac: '⌘ 1–9', other: 'Ctrl+1–9', desc: 'Select tab by number' },
    ],
  },
  {
    title: 'Integrated terminal',
    items: [
      { mac: '⌘ `', other: 'Ctrl+`', desc: 'Toggle the terminal panel' },
      { mac: '⌘ ⇧ `', other: 'Ctrl+Shift+`', desc: 'Open a new terminal tab' },
    ],
  },
  {
    title: 'Editor',
    items: [{ mac: '⌘ S', other: 'Ctrl+S', desc: 'Save the open Markdown file' }],
  },
];

function KeybindingsPanel() {
  const isMac = window.api.platform === 'darwin';
  return (
    <div className="settings-panel">
      {KEYBINDING_GROUPS.map((group) => (
        <section key={group.title}>
          <h4>{group.title}</h4>
          {group.items.map((item) => (
            <div className="field-row" key={item.desc}>
              <label className="field-label">{item.desc}</label>
              <kbd className="keybinding">{isMac ? item.mac : item.other}</kbd>
            </div>
          ))}
        </section>
      ))}
      <p className="preset-desc">Shortcuts are fixed for now and cannot be remapped.</p>
    </div>
  );
}

function TerminalPanel() {
  const current = useStore((s) => s.terminalStyle);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Effective options after preset + overrides are resolved. We read from
  // this (not the raw overrides object) so the UI shows what the terminal
  // is actually using right now, regardless of which layer set it.
  const effective = useMemo(() => resolveTerminalStyleOptions(current), [current]);

  const pickPreset = async (preset: TerminalStylePreset) => {
    if (preset === current.preset) return;
    setLoadError(null);
    await window.api.settings.setTerminalStyle(preset);
  };

  const browse = async () => {
    setLoadError(null);
    const result = await window.api.settings.browseTerminalStyle();
    if (result.ok) return;
    if (result.reason === 'canceled') return;
    setLoadError(result.message);
  };

  // Apply an override patch. Passing a field as `undefined` clears it —
  // the resolved value then falls through to the preset's value.
  const patchOverrides = async (patch: Partial<TerminalStyleOptions>) => {
    const next: TerminalStyleOptions = { ...(current.overrides ?? {}), ...patch };
    for (const k of Object.keys(patch) as Array<keyof TerminalStyleOptions>) {
      if (patch[k] === undefined) delete next[k];
    }
    await window.api.settings.setTerminalStyleOverrides(
      Object.keys(next).length > 0 ? next : null,
    );
  };

  const hasCustom = !!current.customStyle;
  const customLabel = current.customStyleName
    ? `Custom — ${current.customStyleName}`
    : 'Custom';

  return (
    <div className="settings-panel">
      <section>
        <h4>Preset</h4>
        <div className="preset-list">
          {BUILTIN_OPTIONS.map((opt) => (
            <label key={opt.id} className="preset-row">
              <input
                type="radio"
                name="terminal-style-preset"
                value={opt.id}
                checked={current.preset === opt.id}
                onChange={() => void pickPreset(opt.id)}
              />
              <div>
                <div className="preset-label">{opt.label}</div>
                <div className="preset-desc">{opt.description}</div>
              </div>
            </label>
          ))}
          {hasCustom && (
            <label className="preset-row">
              <input
                type="radio"
                name="terminal-style-preset"
                value="custom"
                checked={current.preset === 'custom'}
                onChange={() => void pickPreset('custom')}
              />
              <div>
                <div className="preset-label">{customLabel}</div>
                <div className="preset-desc">Loaded from a JSON style file.</div>
              </div>
            </label>
          )}
        </div>
        <div className="preset-browse-row">
          <button onClick={() => void browse()}>Browse…</button>
          <span className="preset-desc">
            Load a JSON style file or a macOS <code>.terminal</code> profile.
          </span>
        </div>
        {loadError && <div className="preset-error">{loadError}</div>}
      </section>

      <section>
        <h4>Font</h4>
        <div className="field-row">
          <label className="field-label">Family</label>
          <input
            className="field-input"
            type="text"
            value={effective.fontFamily ?? ''}
            placeholder="system default"
            onChange={(e) =>
              void patchOverrides({ fontFamily: e.target.value || undefined })
            }
          />
        </div>
        <div className="field-row">
          <label className="field-label">Size (px)</label>
          <input
            className="field-input field-narrow"
            type="number"
            min={6}
            max={48}
            value={effective.fontSize ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              void patchOverrides({ fontSize: v });
            }}
          />
        </div>
        <div className="field-row">
          <label className="field-label">Weight</label>
          <input
            className="field-input field-narrow"
            type="number"
            min={100}
            max={900}
            step={100}
            placeholder="normal"
            value={effective.fontWeight ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              void patchOverrides({ fontWeight: v });
            }}
          />
        </div>
        <div className="field-row">
          <label className="field-label">Bold weight</label>
          <input
            className="field-input field-narrow"
            type="number"
            min={100}
            max={900}
            step={100}
            placeholder="bold"
            value={effective.fontWeightBold ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              void patchOverrides({ fontWeightBold: v });
            }}
          />
        </div>
        <div className="field-row">
          <label className="field-label">Line height</label>
          <input
            className="field-input field-narrow"
            type="number"
            min={0.5}
            max={3}
            step={0.05}
            placeholder="1.0"
            value={effective.lineHeight ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              void patchOverrides({ lineHeight: v });
            }}
          />
        </div>
        <div className="field-row">
          <label className="field-label">Letter spacing (px)</label>
          <input
            className="field-input field-narrow"
            type="number"
            min={-2}
            max={10}
            step={0.5}
            placeholder="0"
            value={effective.letterSpacing ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              void patchOverrides({ letterSpacing: v });
            }}
          />
        </div>
      </section>

      <section>
        <h4>Cursor</h4>
        <div className="field-row">
          <label className="field-label">Style</label>
          <select
            className="field-input field-narrow"
            value={effective.cursorStyle ?? 'block'}
            onChange={(e) =>
              void patchOverrides({ cursorStyle: e.target.value as TerminalCursorStyle })
            }
          >
            {CURSOR_STYLES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label className="field-label">Blink</label>
          <input
            type="checkbox"
            checked={effective.cursorBlink ?? true}
            onChange={(e) => void patchOverrides({ cursorBlink: e.target.checked })}
          />
        </div>
      </section>

      <section>
        <h4>Scrollback</h4>
        <div className="field-row">
          <label className="field-label">Lines</label>
          <input
            className="field-input field-narrow"
            type="number"
            min={0}
            max={1_000_000}
            step={1000}
            value={effective.scrollback ?? 10000}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              void patchOverrides({ scrollback: v });
            }}
          />
        </div>
      </section>

      {window.api.platform === 'darwin' && (
        <section>
          <h4>Keyboard</h4>
          <div className="field-row">
            <label className="field-label">Use Option as Meta key</label>
            <input
              type="checkbox"
              checked={effective.macOptionIsMeta ?? false}
              onChange={(e) => void patchOverrides({ macOptionIsMeta: e.target.checked })}
            />
          </div>
          <p className="preset-desc">
            When on, the Option key sends Meta (e.g. Option+B jumps a word) instead of composing
            accented characters.
          </p>
        </section>
      )}
    </div>
  );
}

function GitPanel() {
  const gv = useStore((s) => s.gitView);
  return (
    <div className="settings-panel">
      <section>
        <h4>Git view</h4>
        <div className="field-row">
          <label className="field-label">
            Show the Git view panel alongside the terminal
          </label>
          <input
            type="checkbox"
            checked={gv.enabled}
            onChange={(e) => void window.api.settings.setGitView({ enabled: e.target.checked })}
          />
        </div>
        <p className="preset-desc">
          When off, the Git toggle button and panel are hidden. Turn this off to reclaim the
          window width for the terminal.
        </p>
      </section>
    </div>
  );
}

function BoardPanel() {
  const layout = useStore((s) => s.boardLayout);
  const columns = useStore((s) => s.boardColumns);
  const setBoardLayout = useStore((s) => s.setBoardLayout);
  const setBoardColumns = useStore((s) => s.setBoardColumns);

  return (
    <div className="settings-panel">
      <section>
        <h4>Layout</h4>
        <label className="preset-row">
          <input
            type="radio"
            name="board-layout"
            checked={layout === 'tile'}
            onChange={() => setBoardLayout('tile')}
          />
          <div>
            <div className="preset-label">Auto-fit (tile)</div>
            <div className="preset-desc">
              All pinned windows are tiled to fill the workspace evenly. No manual sizing.
            </div>
          </div>
        </label>
        <label className="preset-row">
          <input
            type="radio"
            name="board-layout"
            checked={layout === 'main'}
            onChange={() => setBoardLayout('main')}
          />
          <div>
            <div className="preset-label">Main + stack</div>
            <div className="preset-desc">
              The first window gets the roomiest column — full height while it is alone there
              (2 windows split in half, 3 give it a column beside a stack of two, 4 become a
              2×2). The board is always filled completely. Drag a tile to the front to make it
              the main one.
            </div>
          </div>
        </label>
        <label className="preset-row">
          <input
            type="radio"
            name="board-layout"
            checked={layout === 'free'}
            onChange={() => setBoardLayout('free')}
          />
          <div>
            <div className="preset-label">Free</div>
            <div className="preset-desc">Drag tiles to reorder and resize each one.</div>
          </div>
        </label>
      </section>
      {layout === 'tile' && (
        <section>
          <h4>Columns</h4>
          <div className="field-row">
            <label className="field-label">Number of columns (0 = auto)</label>
            <input
              className="field-input field-narrow"
              type="number"
              min={0}
              max={12}
              value={columns}
              onChange={(e) => setBoardColumns(Number(e.target.value) || 0)}
            />
          </div>
          <p className="preset-desc">
            Auto arranges tiles in a roughly square grid based on how many windows are pinned.
          </p>
        </section>
      )}
    </div>
  );
}

// Common Windows shells offered as one-click presets. An empty value means
// "use %COMSPEC%" (Command Prompt). `pwsh.exe` (PowerShell 7+) only resolves if
// the user installed it, but spawning falls back gracefully if it's missing.
const WIN_SHELL_PRESETS = [
  { value: '', label: 'Command Prompt (cmd.exe) — default' },
  { value: 'powershell.exe', label: 'Windows PowerShell' },
  { value: 'pwsh.exe', label: 'PowerShell 7+ (pwsh.exe)' },
] as const;

const WIN_CUSTOM = '__custom__';

/** Windows-only shell picker: presets in a dropdown plus a custom-path escape hatch. */
function WindowsShellField({ value }: { value: string }) {
  const isPreset = WIN_SHELL_PRESETS.some((p) => p.value === value);
  const [custom, setCustom] = useState(!isPreset && value.length > 0);

  const apply = (next: string) =>
    void window.api.settings.setIntegratedTerminal({ defaultShell: next || undefined });

  return (
    <>
      <div className="field-row">
        <label className="field-label">Default shell</label>
        <select
          className="field-input"
          value={custom ? WIN_CUSTOM : value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === WIN_CUSTOM) {
              setCustom(true);
            } else {
              setCustom(false);
              apply(v);
            }
          }}
        >
          {WIN_SHELL_PRESETS.map((p) => (
            <option key={p.value || 'default'} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value={WIN_CUSTOM}>Custom…</option>
        </select>
      </div>
      {custom && (
        <div className="field-row">
          <label className="field-label">Custom shell path</label>
          <input
            className="field-input"
            type="text"
            value={value}
            placeholder="e.g. C:\Program Files\Git\bin\bash.exe"
            onChange={(e) => apply(e.target.value)}
          />
        </div>
      )}
    </>
  );
}

function IntegratedTerminalPanel() {
  const it = useStore((s) => s.integratedTerminal);
  return (
    <div className="settings-panel">
      <section>
        <h4>Integrated terminal</h4>
        <div className="field-row">
          <label className="field-label">Enable the bottom-docked terminal panel</label>
          <input
            type="checkbox"
            checked={it.enabled}
            onChange={(e) =>
              void window.api.settings.setIntegratedTerminal({ enabled: e.target.checked })
            }
          />
        </div>
        {window.api.platform === 'win32' ? (
          <WindowsShellField value={it.defaultShell ?? ''} />
        ) : (
          <div className="field-row">
            <label className="field-label">Default shell</label>
            <input
              className="field-input"
              type="text"
              value={it.defaultShell ?? ''}
              placeholder="$SHELL (e.g. /bin/zsh)"
              onChange={(e) =>
                void window.api.settings.setIntegratedTerminal({
                  defaultShell: e.target.value || undefined,
                })
              }
            />
          </div>
        )}
        <p className="preset-desc">
          {window.api.platform === 'win32' ? (
            <>
              Pick the shell new terminal tabs launch. Choose <code>Custom…</code> to point at any
              executable (e.g. Git Bash). Leaving it on the default uses <code>%COMSPEC%</code>.
            </>
          ) : (
            <>
              Leave blank to use the value of <code>$SHELL</code> (or <code>%COMSPEC%</code> on
              Windows).
            </>
          )}{' '}
          Shortcut: <code>Ctrl/Cmd+`</code> toggles the panel; <code>Ctrl/Cmd+Shift+`</code> opens a
          new tab.
        </p>
      </section>
    </div>
  );
}

function AgentsPanel() {
  // Seed once from the store; this panel is the sole editor while open, so we
  // keep a local draft (which may hold half-typed rows) and persist a
  // sanitized copy on every change.
  const [rows, setRows] = useState<AgentDef[]>(() => useStore.getState().agents.map((a) => ({ ...a })));

  const persist = (next: AgentDef[]) => {
    setRows(next);
    void window.api.settings.setAgents(next);
  };

  const addRow = () => {
    const id = `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    persist([...rows, { id, name: '', command: '' }]);
  };
  const updateRow = (id: string, patch: Partial<AgentDef>) =>
    persist(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => persist(rows.filter((r) => r.id !== id));

  return (
    <div className="settings-panel">
      <section>
        <h4>Agents</h4>
        <p className="preset-desc">
          Define extra agents to launch from the workspace tab bar alongside Claude Code. Each is
          run through your login shell in the active project/worktree, so anything on your{' '}
          <code>PATH</code> works (e.g. <code>opencode</code> or <code>omlx launch opencode</code>).
        </p>
        {rows.length === 0 && (
          <p className="preset-desc">No agents yet. Add one below.</p>
        )}
        {rows.map((row) => (
          <div className="field-row agent-row" key={row.id}>
            <input
              className="field-input"
              type="text"
              value={row.name}
              placeholder="Name (e.g. opencode)"
              aria-label="Agent name"
              onChange={(e) => updateRow(row.id, { name: e.target.value })}
            />
            <input
              className="field-input"
              type="text"
              value={row.command}
              placeholder="Command (e.g. opencode)"
              aria-label="Agent command"
              onChange={(e) => updateRow(row.id, { command: e.target.value })}
            />
            <button
              type="button"
              className="danger"
              aria-label={`Remove ${row.name || 'agent'}`}
              onClick={() => removeRow(row.id)}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="field-row">
          <button type="button" onClick={addRow}>
            Add agent
          </button>
        </div>
      </section>
      <ConsoleCommandSection />
    </div>
  );
}

/** The one-click command button shown on the board toolbar and in the
 *  workspace tab bar. Both its label and what it types are the user's. */
function ConsoleCommandSection() {
  const cfg = useStore((s) => s.consoleCommand);
  // Local drafts so a half-typed value isn't trimmed mid-keystroke; the
  // sanitized value is persisted on blur.
  const [label, setLabel] = useState(cfg.label);
  const [command, setCommand] = useState(cfg.command);
  useEffect(() => setLabel(cfg.label), [cfg.label]);
  useEffect(() => setCommand(cfg.command), [cfg.command]);

  const patch = (p: Partial<Omit<ConsoleCommandSettings, 'version'>>) =>
    void window.api.settings.setConsoleCommand(p);

  return (
    <section>
      <h4>Command button</h4>
      <p className="preset-desc">
        A button in the workspace tab bar and on the board toolbar that types a command into the
        active console and presses Enter — as if you typed it. It starts out as the agent-mail
        mod&rsquo;s inbox (<code>/mail right</code>), but any slash command or line of text works.
      </p>
      <div className="field-row">
        <label className="field-label">Show the button</label>
        <input
          type="checkbox"
          checked={cfg.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
      </div>
      <div className="field-row">
        <label className="field-label">Button name</label>
        <input
          className="field-input"
          type="text"
          value={label}
          placeholder="✉ Mail"
          aria-label="Command button name"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => patch({ label })}
        />
      </div>
      <div className="field-row">
        <label className="field-label">Command</label>
        <input
          className="field-input"
          type="text"
          value={command}
          placeholder="/mail right"
          aria-label="Command typed into the console"
          onChange={(e) => setCommand(e.target.value)}
          onBlur={() => patch({ command })}
        />
      </div>
    </section>
  );
}

function describeState(state: AutoUpdateState): string {
  switch (state.kind) {
    case 'idle':
      if (state.disabledReason === 'development') return 'Disabled in development';
      if (state.disabledReason === 'unsupported-platform')
        return 'Updates managed by your package manager';
      return 'Up to date';
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `Update available: ${state.version}`;
    case 'downloading':
      return `Downloading ${state.version} (${state.percent}%)`;
    case 'downloaded':
      return `Update ready: ${state.version} — restart to install`;
    case 'error':
      return `Update error: ${state.message}`;
  }
}

function formatLastChecked(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function UpdatesPanel() {
  const { info, settings, check, installNow, setSettings } = useAutoUpdate();
  const [busy, setBusy] = useState(false);

  if (!info || !settings) {
    return (
      <div className="settings-panel">
        <section>
          <p className="preset-desc">Loading…</p>
        </section>
      </div>
    );
  }

  const state = info.state;
  const disabledReason = state.kind === 'idle' ? state.disabledReason : undefined;
  const canCheck =
    !disabledReason &&
    state.kind !== 'checking' &&
    state.kind !== 'downloading' &&
    state.kind !== 'downloaded' &&
    !busy;
  const canInstall = state.kind === 'downloaded' && !busy;

  const onCheck = async () => {
    setBusy(true);
    try {
      await check();
    } finally {
      setBusy(false);
    }
  };

  const onInstall = async () => {
    setBusy(true);
    try {
      await installNow();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-panel">
      <section>
        <h4>Application</h4>
        <div className="field-row">
          <label className="field-label">Current version</label>
          <span>{info.currentVersion}</span>
        </div>
        <div className="field-row">
          <label className="field-label">Last checked</label>
          <span>{formatLastChecked(info.lastCheckedAt)}</span>
        </div>
        <div className="field-row">
          <label className="field-label">Status</label>
          <span>{describeState(state)}</span>
        </div>
        <div className="preset-browse-row">
          <button onClick={() => void onCheck()} disabled={!canCheck}>
            Check for updates…
          </button>
          {canInstall && (
            <button onClick={() => void onInstall()}>Restart and update</button>
          )}
        </div>
      </section>

      {!disabledReason && (
        <section>
          <h4>Preferences</h4>
          <div className="field-row">
            <label className="field-label">Automatically check for updates</label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => void setSettings({ enabled: e.target.checked })}
            />
          </div>
          <div className="field-row">
            <label className="field-label">Update channel</label>
            <select
              className="field-input field-narrow"
              value={settings.channel}
              onChange={(e) =>
                void setSettings({ channel: e.target.value as AutoUpdateChannel })
              }
            >
              <option value="stable">Stable</option>
              <option value="beta">Beta (pre-releases)</option>
            </select>
          </div>
          <p className="preset-desc">
            Updates are downloaded in the background and installed when you quit the app, or
            immediately if you click <em>Restart and update</em>.
          </p>
        </section>
      )}
    </div>
  );
}

function NotificationsPanel() {
  const prefs = useStore((s) => s.notifications);

  const patch = async (p: Partial<Omit<NotificationSettings, 'version'>>) => {
    await window.api.settings.setNotifications(p);
  };

  return (
    <div className="settings-panel">
      <section>
        <h4>When Claude needs input on an inactive tab</h4>
        <div className="field-row">
          <label className="field-label">Bounce the dock until the app is focused</label>
          <input
            type="checkbox"
            checked={prefs.dockBounce}
            onChange={(e) => void patch({ dockBounce: e.target.checked })}
          />
        </div>
        <div className="field-row">
          <label className="field-label">Show a system notification</label>
          <input
            type="checkbox"
            checked={prefs.systemNotifications}
            onChange={(e) => void patch({ systemNotifications: e.target.checked })}
          />
        </div>
        <p className="preset-desc">
          The pulsing sidebar indicator always shows; these toggles control the dock and OS
          notification behavior.
        </p>
      </section>
    </div>
  );
}

function WebAccessPanel() {
  const wa = useStore((s) => s.webAccess);
  const [port, setPortLocal] = useState(String(wa.port));
  const [password, setPasswordLocal] = useState(wa.password);
  useEffect(() => { setPortLocal(String(wa.port)); }, [wa.port]);
  useEffect(() => { setPasswordLocal(wa.password); }, [wa.password]);

  const commitPort = () => {
    const n = Number(port);
    if (Number.isFinite(n) && n >= 1 && n <= 65535 && Math.floor(n) !== wa.port) {
      void window.api.settings.setWebAccess({ port: Math.floor(n) });
    } else {
      setPortLocal(String(wa.port));
    }
  };
  const commitPassword = () => {
    if (password !== wa.password) {
      void window.api.settings.setWebAccess({ password });
    }
  };
  const canEnable = wa.password.length > 0;

  return (
    <div className="settings-panel">
      <section>
        <h4>Web access (LAN)</h4>
        <p className="preset-desc">
          When enabled, Dash serves a mobile-friendly web UI on this machine so you can
          attach to any active Claude session from another device on the same network.
          Protected by the password set below. Disabled by default.
        </p>
        <div className="field-row">
          <label className="field-label">Enable</label>
          <input
            type="checkbox"
            checked={wa.enabled}
            disabled={!canEnable}
            onChange={(e) => void window.api.settings.setWebAccess({ enabled: e.target.checked })}
          />
        </div>
        {!canEnable && (
          <p className="preset-desc" style={{ color: 'var(--color-warn)' }}>
            Set a password before enabling.
          </p>
        )}
        <div className="field-row">
          <label className="field-label">Password</label>
          <input
            className="field-input"
            type="password"
            value={password}
            placeholder="(unset)"
            onChange={(e) => setPasswordLocal(e.target.value)}
            onBlur={commitPassword}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        <div className="field-row">
          <label className="field-label">Port</label>
          <input
            className="field-input"
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPortLocal(e.target.value)}
            onBlur={commitPort}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        <p className="preset-desc">
          {wa.enabled
            ? `Listening on port ${wa.port}. Open http://<this-machine-lan-ip>:${wa.port} from another device on your Wi-Fi.`
            : `Default port ${wa.port} (chosen to avoid common dev servers).`}
        </p>
      </section>
    </div>
  );
}
