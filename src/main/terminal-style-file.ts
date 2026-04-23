import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TerminalStyleOptions, TerminalStyleTheme } from '@shared/types';
import { parseAppleTerminalProfile } from './apple-terminal-profile';

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const THEME_KEYS: (keyof TerminalStyleTheme)[] = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

export interface LoadedStyleFile {
  name: string;
  style: TerminalStyleOptions;
}

export async function loadStyleFromFile(filePath: string): Promise<LoadedStyleFile> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.terminal') {
    const parsed = await parseAppleTerminalProfile(filePath);
    return { name: parsed.name, style: parsed.style };
  }
  const raw = await fs.readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`File is not valid JSON: ${(err as Error).message}`);
  }
  const style = validateStyle(parsed);
  return { name: path.basename(filePath), style };
}

export function validateStyle(raw: unknown): TerminalStyleOptions {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Style file must contain a JSON object.');
  }
  const r = raw as Record<string, unknown>;
  const out: TerminalStyleOptions = {};

  if (r.theme !== undefined) {
    if (!r.theme || typeof r.theme !== 'object') {
      throw new Error('`theme` must be an object.');
    }
    const theme = r.theme as Record<string, unknown>;
    const validated: TerminalStyleTheme = {};
    for (const key of THEME_KEYS) {
      const v = theme[key];
      if (v === undefined) continue;
      if (typeof v !== 'string' || !HEX_COLOR.test(v)) {
        throw new Error(`theme.${key} must be a hex color string (e.g. "#1e1e1e").`);
      }
      (validated as Record<string, string>)[key] = v;
    }
    if (Object.keys(validated).length > 0) out.theme = validated;
  }

  if (r.fontFamily !== undefined) {
    if (typeof r.fontFamily !== 'string' || r.fontFamily.trim() === '') {
      throw new Error('`fontFamily` must be a non-empty string.');
    }
    out.fontFamily = r.fontFamily;
  }

  if (r.fontSize !== undefined) {
    if (typeof r.fontSize !== 'number' || !Number.isFinite(r.fontSize) || r.fontSize < 6 || r.fontSize > 72) {
      throw new Error('`fontSize` must be a number between 6 and 72.');
    }
    out.fontSize = r.fontSize;
  }

  if (Object.keys(out).length === 0) {
    throw new Error('Style file must set at least one of: theme, fontFamily, fontSize.');
  }
  return out;
}
