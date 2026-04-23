import { EventEmitter } from 'node:events';
import type {
  TerminalStyleOptions,
  TerminalStylePreset,
  TerminalStyleSettings,
} from '@shared/types';
import { DEFAULT_TERMINAL_STYLE, TERMINAL_STYLE_PRESET_IDS } from '@shared/types';
import type { JsonStore } from './store';

export interface SettingsManagerEvents {
  terminalStyleChanged: (settings: TerminalStyleSettings) => void;
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
    const next: TerminalStyleSettings = {
      version: 1,
      preset: 'custom',
      customStyle: style,
      customStyleName: name,
    };
    this.store.update((draft) => {
      draft.terminalStyle = next;
    });
    this.emit('terminalStyleChanged', next);
    return next;
  }
}
