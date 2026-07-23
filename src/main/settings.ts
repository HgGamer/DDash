import { EventEmitter } from 'node:events';
import type {
  AgentDef,
  AgentsSettings,
  AutoUpdateSettings,
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  DocsViewSettings,
  WebAccessSettings,
} from '@shared/types';
import {
  DEFAULT_AUTO_UPDATE_SETTINGS,
  DEFAULT_GIT_VIEW_SETTINGS,
  DEFAULT_INTEGRATED_TERMINAL_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_TERMINAL_STYLE,
  DEFAULT_DOCS_VIEW_SETTINGS,
  DEFAULT_WEB_ACCESS_SETTINGS,
  DEFAULT_WEB_ACCESS_PORT,
  GIT_VIEW_MAX_WIDTH,
  GIT_VIEW_MIN_WIDTH,
  INTEGRATED_TERMINAL_MIN_HEIGHT,
  TERMINAL_STYLE_PRESET_IDS,
  DOCS_VIEW_MAX_WIDTH,
  DOCS_VIEW_MIN_WIDTH,
} from '@shared/types';
import type { JsonStore } from './store';

export interface SettingsManagerEvents {
  terminalStyleChanged: (settings: TerminalStyleSettings) => void;
  notificationsChanged: (settings: NotificationSettings) => void;
  gitViewChanged: (settings: GitViewSettings) => void;
  docsViewChanged: (settings: DocsViewSettings) => void;
  integratedTerminalChanged: (settings: IntegratedTerminalSettings) => void;
  autoUpdateChanged: (settings: AutoUpdateSettings) => void;
  webAccessChanged: (settings: WebAccessSettings) => void;
  agentsChanged: (settings: AgentsSettings) => void;
}

export class SettingsManager extends EventEmitter {
  constructor(private readonly store: JsonStore) {
    super();
  }

  getTerminalStyle(): TerminalStyleSettings {
    const raw = this.store.get().terminalStyle;
    // JsonStore.migrate already normalizes, but be defensive if the in-memory
    // state was mutated by something other than setTerminalStyle.
    if (!raw || !TERMINAL_STYLE_PRESET_IDS.includes(raw.preset)) {
      // eslint-disable-next-line no-console
      console.warn('[settings] invalid terminalStyle, falling back to default');
      return { ...DEFAULT_TERMINAL_STYLE };
    }
    if (raw.preset === 'custom' && !raw.customStyle) {
      // eslint-disable-next-line no-console
      console.warn('[settings] custom preset selected but no customStyle; falling back');
      return { ...DEFAULT_TERMINAL_STYLE };
    }
    const out: TerminalStyleSettings = { version: 1, preset: raw.preset };
    if (raw.customStyle) out.customStyle = raw.customStyle;
    if (raw.customStyleName) out.customStyleName = raw.customStyleName;
    if (raw.overrides && Object.keys(raw.overrides).length > 0) out.overrides = raw.overrides;
    return out;
  }

  setTerminalStyle(preset: TerminalStylePreset): TerminalStyleSettings {
    if (!TERMINAL_STYLE_PRESET_IDS.includes(preset)) {
      throw new Error(`Unknown terminal style preset: ${String(preset)}`);
    }
    if (preset === 'custom') {
      // Only valid when a customStyle already exists in the store.
      const current = this.store.get().terminalStyle;
      if (!current.customStyle) {
        throw new Error('Cannot select "custom" preset: no custom style has been loaded.');
      }
    }
    const current = this.store.get().terminalStyle;
    const next: TerminalStyleSettings = {
      version: 1,
      preset,
      ...(current.customStyle ? { customStyle: current.customStyle } : {}),
      ...(current.customStyleName ? { customStyleName: current.customStyleName } : {}),
    };
    this.store.update((draft) => {
      draft.terminalStyle = next;
    });
    this.emit('terminalStyleChanged', next);
    return next;
  }

  setCustomTerminalStyle(style: TerminalStyleOptions, name: string): TerminalStyleSettings {
    const current = this.store.get().terminalStyle;
    const next: TerminalStyleSettings = {
      version: 1,
      preset: 'custom',
      customStyle: style,
      customStyleName: name,
      ...(current.overrides ? { overrides: current.overrides } : {}),
    };
    this.store.update((draft) => {
      draft.terminalStyle = next;
    });
    this.emit('terminalStyleChanged', next);
    return next;
  }

  setTerminalStyleOverrides(overrides: TerminalStyleOptions | null): TerminalStyleSettings {
    const current = this.store.get().terminalStyle;
    const next: TerminalStyleSettings = {
      version: 1,
      preset: current.preset,
      ...(current.customStyle ? { customStyle: current.customStyle } : {}),
      ...(current.customStyleName ? { customStyleName: current.customStyleName } : {}),
      ...(overrides && Object.keys(overrides).length > 0 ? { overrides } : {}),
    };
    this.store.update((draft) => {
      draft.terminalStyle = next;
    });
    this.emit('terminalStyleChanged', next);
    return next;
  }

  getNotifications(): NotificationSettings {
    const raw = this.store.get().notifications;
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return { ...raw };
  }

  setNotifications(patch: Partial<Omit<NotificationSettings, 'version'>>): NotificationSettings {
    const current = this.getNotifications();
    const next: NotificationSettings = { ...current, ...patch, version: 1 };
    this.store.update((draft) => {
      draft.notifications = next;
    });
    this.emit('notificationsChanged', next);
    return next;
  }

  getGitView(): GitViewSettings {
    const raw = this.store.get().gitView;
    if (!raw) return { ...DEFAULT_GIT_VIEW_SETTINGS };
    return { ...raw };
  }

  setGitView(patch: Partial<Omit<GitViewSettings, 'version'>>): GitViewSettings {
    const current = this.getGitView();
    let panelWidth = patch.panelWidth ?? current.panelWidth;
    panelWidth = Math.min(GIT_VIEW_MAX_WIDTH, Math.max(GIT_VIEW_MIN_WIDTH, Math.round(panelWidth)));
    const next: GitViewSettings = {
      version: 1,
      enabled: patch.enabled ?? current.enabled,
      expanded: patch.expanded ?? current.expanded,
      panelWidth,
    };
    this.store.update((draft) => {
      draft.gitView = next;
    });
    this.emit('gitViewChanged', next);
    return next;
  }

  getDocsView(): DocsViewSettings {
    const raw = this.store.get().docsView;
    if (!raw) return { ...DEFAULT_DOCS_VIEW_SETTINGS };
    return { ...raw };
  }

  setDocsView(patch: Partial<Omit<DocsViewSettings, 'version'>>): DocsViewSettings {
    const current = this.getDocsView();
    let panelWidth = patch.panelWidth ?? current.panelWidth;
    panelWidth = Math.min(DOCS_VIEW_MAX_WIDTH, Math.max(DOCS_VIEW_MIN_WIDTH, Math.round(panelWidth)));
    const next: DocsViewSettings = { version: 1, panelWidth };
    this.store.update((draft) => {
      draft.docsView = next;
    });
    this.emit('docsViewChanged', next);
    return next;
  }

  getIntegratedTerminal(): IntegratedTerminalSettings {
    const raw = this.store.get().integratedTerminal;
    if (!raw) return { ...DEFAULT_INTEGRATED_TERMINAL_SETTINGS };
    return { ...raw };
  }

  setIntegratedTerminal(
    patch: Partial<Omit<IntegratedTerminalSettings, 'version'>>,
  ): IntegratedTerminalSettings {
    const current = this.getIntegratedTerminal();
    let height = patch.height ?? current.height;
    height = Math.max(INTEGRATED_TERMINAL_MIN_HEIGHT, Math.round(height));
    const next: IntegratedTerminalSettings = {
      version: 1,
      enabled: patch.enabled ?? current.enabled,
      expanded: patch.expanded ?? current.expanded,
      height,
    };
    const defaultShell =
      'defaultShell' in patch ? patch.defaultShell : current.defaultShell;
    if (typeof defaultShell === 'string' && defaultShell.trim().length > 0) {
      next.defaultShell = defaultShell;
    }
    this.store.update((draft) => {
      draft.integratedTerminal = next;
    });
    this.emit('integratedTerminalChanged', next);
    return next;
  }

  getAgents(): AgentsSettings {
    const raw = this.store.get().agents;
    if (!raw || !Array.isArray(raw.agents)) return { version: 1, agents: [] };
    return { version: 1, agents: raw.agents.map((a) => ({ ...a })) };
  }

  setAgents(agents: AgentDef[]): AgentsSettings {
    // Sanitize: keep only well-formed entries with a non-empty name + command.
    const cleaned: AgentDef[] = (Array.isArray(agents) ? agents : [])
      .map((a) => ({
        id: typeof a?.id === 'string' && a.id ? a.id : '',
        name: typeof a?.name === 'string' ? a.name.trim() : '',
        command: typeof a?.command === 'string' ? a.command.trim() : '',
      }))
      .filter((a) => a.id && a.name && a.command);
    const next: AgentsSettings = { version: 1, agents: cleaned };
    this.store.update((draft) => {
      draft.agents = next;
    });
    this.emit('agentsChanged', next);
    return next;
  }

  getAutoUpdate(): AutoUpdateSettings {
    const raw = this.store.get().autoUpdate;
    if (!raw) return { ...DEFAULT_AUTO_UPDATE_SETTINGS };
    return { ...raw };
  }

  getWebAccess(): WebAccessSettings {
    const raw = this.store.get().webAccess;
    if (!raw) return { ...DEFAULT_WEB_ACCESS_SETTINGS };
    return { ...raw };
  }

  // Password is stored as plaintext; this is a deliberate trade-off for the
  // LAN-only web access feature (user picked this auth model). Treat the
  // settings file as a secret on multi-user machines.
  setWebAccess(patch: Partial<Omit<WebAccessSettings, 'version'>>): WebAccessSettings {
    const current = this.getWebAccess();
    let port = typeof patch.port === 'number' ? Math.floor(patch.port) : current.port;
    if (!Number.isFinite(port) || port < 1 || port > 65535) port = DEFAULT_WEB_ACCESS_PORT;
    const password =
      typeof patch.password === 'string' ? patch.password : current.password;
    let enabled = typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled;
    // Refuse to be 'enabled' without a non-empty password.
    if (enabled && password.length === 0) enabled = false;
    const next: WebAccessSettings = { version: 1, enabled, port, password };
    this.store.update((draft) => {
      draft.webAccess = next;
    });
    this.emit('webAccessChanged', next);
    return next;
  }

  setAutoUpdate(patch: Partial<Omit<AutoUpdateSettings, 'version'>>): AutoUpdateSettings {
    const current = this.getAutoUpdate();
    const channel =
      patch.channel === 'stable' || patch.channel === 'beta' ? patch.channel : current.channel;
    const next: AutoUpdateSettings = {
      version: 1,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
      channel,
      lastCheckedAt:
        'lastCheckedAt' in patch ? patch.lastCheckedAt ?? null : current.lastCheckedAt,
    };
    this.store.update((draft) => {
      draft.autoUpdate = next;
    });
    this.emit('autoUpdateChanged', next);
    return next;
  }
}
