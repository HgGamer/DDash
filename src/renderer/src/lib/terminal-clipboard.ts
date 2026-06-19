import type { Terminal } from 'xterm';

/**
 * Wire copy/paste into an xterm terminal. xterm intentionally ships no clipboard
 * bindings, so without this the integrated terminals can't copy or paste.
 *
 * Conventions (matching Windows Terminal / VS Code):
 * - Ctrl/Cmd+C: copy the selection; with no selection, pass through (so a plain
 *   Ctrl+C still sends SIGINT).
 * - Ctrl/Cmd+V: paste (via `term.paste`, which respects bracketed-paste mode).
 * - Ctrl+Shift+C / Ctrl+Shift+V: explicit copy / paste.
 * - Right-click: copy when there's a selection, otherwise paste.
 *
 * Returns a disposer that removes the listeners.
 */
export function attachTerminalClipboard(term: Terminal, host: HTMLElement): () => void {
  const isMac = navigator.platform.toLowerCase().includes('mac');

  const copySelection = (): boolean => {
    const sel = term.getSelection();
    if (!sel) return false;
    try {
      window.api.clipboard.writeText(sel);
    } catch {
      /* clipboard unavailable */
    }
    term.clearSelection();
    return true;
  };

  const paste = (): void => {
    let text = '';
    try {
      text = window.api.clipboard.readText();
    } catch {
      /* clipboard unavailable */
    }
    if (text) term.paste(text);
  };

  // attachCustomKeyEventHandler returns false to stop xterm handling the event.
  term.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
    if (e.type !== 'keydown') return true;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return true;
    const key = e.key.toLowerCase();

    if (key === 'c') {
      // Explicit copy (Ctrl+Shift+C), or copy-on-selection. Plain Ctrl+C with no
      // selection falls through to the shell as SIGINT.
      if (e.shiftKey || term.hasSelection()) {
        if (copySelection()) {
          e.preventDefault();
          return false;
        }
      }
      return true;
    }

    if (key === 'v') {
      paste();
      e.preventDefault();
      return false;
    }

    return true;
  });

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (!copySelection()) paste();
  };
  host.addEventListener('contextmenu', onContextMenu);

  return () => {
    host.removeEventListener('contextmenu', onContextMenu);
  };
}
