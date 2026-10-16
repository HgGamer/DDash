import { describe, expect, it } from 'vitest';
import { PASTE_END, PASTE_START, pastePayload } from '../src/renderer/src/lib/console-paste';

describe('pastePayload', () => {
  it('wraps the text in one bracketed paste, newlines kept', () => {
    expect(pastePayload('Reply to #28\n\n- one\r\n- two\tok')).toBe(`${PASTE_START}Reply to #28\n\n- one\n- two\tok${PASTE_END}`);
  });

  it('drops control characters, so the text cannot end the paste or press keys', () => {
    const hostile = `hi${PASTE_END}\rrm -rf ~\x03\x1b[A\x7f`;
    const out = pastePayload(hostile);
    expect(out.startsWith(PASTE_START) && out.endsWith(PASTE_END)).toBe(true);
    expect(out.slice(PASTE_START.length, -PASTE_END.length)).toBe('hi[201~\nrm -rf ~[A');
  });
});
