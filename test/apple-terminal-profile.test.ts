import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { parseAppleTerminalProfile } from '../src/main/apple-terminal-profile';

const USER_PROFILE = path.join(os.homedir(), 'Desktop', 'Clear Dark.terminal');

describe('parseAppleTerminalProfile', () => {
  it('parses the Clear Dark.terminal profile on the user desktop', async () => {
    // This test is tolerant — if the file isn't present, skip silently so the
    // suite stays green on CI or other machines.
    try {
      await fs.access(USER_PROFILE);
    } catch {
      return;
    }
    const res = await parseAppleTerminalProfile(USER_PROFILE);
    expect(res.name).toBe('Clear Dark');
    expect(res.style.theme).toBeDefined();
    const theme = res.style.theme!;
    // Background/foreground and the eight base ANSI colors are always in
    // every Apple-exported profile. Cursor/selection are optional.
    for (const key of [
      'background',
      'foreground',
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
    ] as const) {
      expect(theme[key], `missing ${key}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Font metadata is best-effort, but should at least look plausible if
    // extracted.
    if (res.style.fontSize !== undefined) {
      expect(res.style.fontSize).toBeGreaterThan(6);
      expect(res.style.fontSize).toBeLessThan(72);
    }
  });

  it('rejects a file that is not a plist', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dash-appleprofile-'));
    try {
      const p = path.join(tmp, 'not-a-plist.terminal');
      await fs.writeFile(p, 'just some text', 'utf8');
      await expect(parseAppleTerminalProfile(p)).rejects.toThrow(/property list/);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
