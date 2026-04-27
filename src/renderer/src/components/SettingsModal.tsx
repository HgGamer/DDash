import { useEffect, useMemo, useState } from 'react';
import type {
  AutoUpdateChannel,
  AutoUpdateState,
  NotificationSettings,
  TerminalCursorStyle,
  TerminalStyleOptions,
  TerminalStylePreset,
} from '@shared/types';
import { resolveTerminalStyleOptions } from '@shared/types';
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
    description: 'Black background, SF Mono / Menlo font stack, 13px.',
  },
];

const CURSOR_STYLES: Array<{ id: TerminalCursorStyle; label: string }> = [
  { id: 'block', label: 'Block' },
  { id: 'underline', label: 'Underline' },
  { id: 'bar', label: 'Bar' },
];

type TabId = 'terminal' | 'notifications' | 'git' | 'integrated-terminal' | 'updates';

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
            className={`settings-nav-item${tab === 'integrated-terminal' ? ' active' : ''}`}
            onClick={() => setTab('integrated-terminal')}
          >
            Integrated terminal
          </button>
          <button
            className={`settings-nav-item${tab === 'updates' ? ' active' : ''}`}
            onClick={() => setTab('updates')}
          >
            Updates
          </button>
        </nav>
        <div className="settings-body">
          {tab === 'terminal' ? (
            <TerminalPanel />
          ) : tab === 'notifications' ? (
            <NotificationsPanel />
          ) : tab === 'integrated-terminal' ? (
            <IntegratedTerminalPanel />
          ) : tab === 'updates' ? (
            <UpdatesPanel />
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
        <p className="preset-desc">
          Leave blank to use the value of <code>$SHELL</code> (or <code>%COMSPEC%</code> on
          Windows). Shortcut: <code>Ctrl/Cmd+`</code> toggles the panel;{' '}
          <code>Ctrl/Cmd+Shift+`</code> opens a new tab.
        </p>
      </section>
    </div>
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
