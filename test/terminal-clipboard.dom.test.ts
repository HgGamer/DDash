// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from 'xterm';
import { attachTerminalClipboard } from '../src/renderer/src/lib/terminal-clipboard';

/** Just enough of xterm's surface to drive the key handler. `attachCustomKey-
 *  EventHandler` keeps only the last handler — the same single slot the real
 *  terminal has. */
function fakeTerm(selection = '') {
  const state = {
    handler: null as ((e: KeyboardEvent) => boolean) | null,
    cleared: 0,
    pasted: [] as string[],
  };
  const term = {
    attachCustomKeyEventHandler: (h: (e: KeyboardEvent) => boolean) => {
      state.handler = h;
    },
    getSelection: () => selection,
    hasSelection: () => selection.length > 0,
    clearSelection: () => {
      state.cleared += 1;
    },
    paste: (t: string) => {
      state.pasted.push(t);
    },
  } as unknown as Terminal;
  return { term, state };
}

const press = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
  new KeyboardEvent('keydown', { key, ctrlKey: true, ...mods });

let written: string[];

beforeEach(() => {
  written = [];
  (window as unknown as { api: unknown }).api = {
    clipboard: {
      writeText: (t: string) => written.push(t),
      readText: () => 'from clipboard',
    },
  };
});

describe('terminal clipboard', () => {
  it('copies the selection on Ctrl+C and consumes the event', () => {
    const { term, state } = fakeTerm('selected text');
    attachTerminalClipboard(term, document.createElement('div'));

    expect(state.handler!(press('c'))).toBe(false);
    expect(written).toEqual(['selected text']);
    expect(state.cleared).toBe(1);
  });

  it('lets Ctrl+C through as SIGINT when nothing is selected', () => {
    const { term, state } = fakeTerm('');
    attachTerminalClipboard(term, document.createElement('div'));

    expect(state.handler!(press('c'))).toBe(true);
    expect(written).toEqual([]);
  });

  it('pastes on Ctrl+V', () => {
    const { term, state } = fakeTerm('');
    attachTerminalClipboard(term, document.createElement('div'));

    expect(state.handler!(press('v'))).toBe(false);
    expect(state.pasted).toEqual(['from clipboard']);
  });

  // Regression: a terminal with its own shortcut used to call
  // `attachCustomKeyEventHandler` a second time, which replaced these bindings
  // and left Ctrl+C copying nothing.
  it('keeps copy working for a terminal that adds its own shortcut', () => {
    const { term, state } = fakeTerm('selected text');
    const onFind = vi.fn();
    attachTerminalClipboard(term, document.createElement('div'), (e) => {
      if (e.key.toLowerCase() === 'f') {
        onFind();
        return false;
      }
      return true;
    });

    // The terminal's own shortcut still fires...
    expect(state.handler!(press('f'))).toBe(false);
    expect(onFind).toHaveBeenCalledTimes(1);

    // ...and copy/paste survived alongside it.
    expect(state.handler!(press('c'))).toBe(false);
    expect(written).toEqual(['selected text']);
    expect(state.handler!(press('v'))).toBe(false);
    expect(state.pasted).toEqual(['from clipboard']);
  });
});
