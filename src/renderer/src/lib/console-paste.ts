// A mod's offered prompt as terminal input: one bracketed paste, so a
// multi-line prompt lands whole instead of submitting at its first newline.
// Control characters other than newline and tab are dropped, so the text can
// neither close the paste early (ESC [201~) nor press keys (ESC, Ctrl-C, …).
// Enter is sent separately, after the TUI has taken the paste.
export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';
export const ENTER_DELAY_MS = 150;

export function pastePayload(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
  return PASTE_START + clean + PASTE_END;
}
