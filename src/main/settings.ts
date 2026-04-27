import { EventEmitter } from 'node:events';
import type {
  GitViewSettings,
  IntegratedTerminalSettings,
  NotificationSettings,
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
  TodoViewSettings,
} from '@shared/types';
import {
  DEFAULT_GIT_VIEW_SETTINGS,
  DEFAULT_INTEGRATED_TERMINAL_SETTINGS,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_TERMINAL_STYLE,
  DEFAULT_TODO_VIEW_SETTINGS,
  GIT_VIEW_MAX_WIDTH,
  GIT_VIEW_MIN_WIDTH,
  INTEGRATED_TERMINAL_MIN_HEIGHT,
  TERMINAL_STYLE_PRESET_IDS,
  TODO_VIEW_MAX_WIDTH,
  TODO_VIEW_MIN_WIDTH,
} from '@shared/types';
import type { JsonStore } from './store';

export interface SettingsManagerEvents {
  terminalStyleChanged: (settings: TerminalStyleSettings) => void;
  notificationsChanged: (settings: NotificationSettings) => void;
  gitViewChanged: (settings: GitViewSettings) => void;
  todoViewChanged: (settings: TodoViewSettings) => void;
  integratedTerminalChanged: (settings: IntegratedTerminalSettings) => void;
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

  getTodoView(): TodoViewSettings {
    const raw = this.store.get().todoView;
    if (!raw) return { ...DEFAULT_TODO_VIEW_SETTINGS };
    return { ...raw };
  }

  setTodoView(patch: Partial<Omit<TodoViewSettings, 'version'>>): TodoViewSettings {
    const current = this.getTodoView();
    let panelWidth = patch.panelWidth ?? current.panelWidth;
    panelWidth = Math.min(TODO_VIEW_MAX_WIDTH, Math.max(TODO_VIEW_MIN_WIDTH, Math.round(panelWidth)));
    const next: TodoViewSettings = {
      version: 1,
      expanded: patch.expanded ?? current.expanded,
      panelWidth,
    };
    this.store.update((draft) => {
      draft.todoView = next;
    });
    this.emit('todoViewChanged', next);
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
}
