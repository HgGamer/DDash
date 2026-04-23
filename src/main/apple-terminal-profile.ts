import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { TerminalStyleOptions, TerminalStyleTheme } from '@shared/types';

// Apple's `.terminal` / Terminal.app profile files are XML property lists
// where each color is a base64-encoded binary plist produced by
// `NSKeyedArchiver` wrapping an `NSColor`. A full NSKeyedArchiver decoder
// would be heavyweight and fragile, so we exploit a convenient property of
// the format instead: the RGB components are serialized as a plain ASCII
// string under the `NSRGB` key, looking like `"0.098 0.113 0.152 0.952"`
// (space-separated floats, optionally with an alpha component). Scanning the
// decoded buffer for that pattern is enough for every profile Terminal.app
// emits.

interface ColorKeyMapping {
  apple: string;
  theme: keyof TerminalStyleTheme;
}

const COLOR_KEYS: ColorKeyMapping[] = [
  { apple: 'BackgroundColor', theme: 'background' },
  { apple: 'TextColor', theme: 'foreground' },
  { apple: 'CursorColor', theme: 'cursor' },
  { apple: 'SelectionColor', theme: 'selectionBackground' },
  { apple: 'ANSIBlackColor', theme: 'black' },
  { apple: 'ANSIRedColor', theme: 'red' },
  { apple: 'ANSIGreenColor', theme: 'green' },
  { apple: 'ANSIYellowColor', theme: 'yellow' },
  { apple: 'ANSIBlueColor', theme: 'blue' },
  { apple: 'ANSIMagentaColor', theme: 'magenta' },
  { apple: 'ANSICyanColor', theme: 'cyan' },
  { apple: 'ANSIWhiteColor', theme: 'white' },
  { apple: 'ANSIBrightBlackColor', theme: 'brightBlack' },
  { apple: 'ANSIBrightRedColor', theme: 'brightRed' },
  { apple: 'ANSIBrightGreenColor', theme: 'brightGreen' },
  { apple: 'ANSIBrightYellowColor', theme: 'brightYellow' },
  { apple: 'ANSIBrightBlueColor', theme: 'brightBlue' },
  { apple: 'ANSIBrightMagentaColor', theme: 'brightMagenta' },
  { apple: 'ANSIBrightCyanColor', theme: 'brightCyan' },
  { apple: 'ANSIBrightWhiteColor', theme: 'brightWhite' },
];

export interface AppleTerminalProfileResult {
  name: string;
  style: TerminalStyleOptions;
}

export async function parseAppleTerminalProfile(
  filePath: string,
): Promise<AppleTerminalProfileResult> {
  const xml = await fs.readFile(filePath, 'utf8');
  if (!/^<\?xml/.test(xml.trimStart()) || !xml.includes('<plist')) {
    throw new Error('File does not look like an XML property list.');
  }

  const entries = extractTopLevelEntries(xml);

  const theme: TerminalStyleTheme = {};
  for (const { apple, theme: themeKey } of COLOR_KEYS) {
    const data = entries.data.get(apple);
    if (!data) continue;
    const hex = decodeNSColorToHex(data);
    if (hex) theme[themeKey] = hex;
  }

  const style: TerminalStyleOptions = {};
  if (Object.keys(theme).length > 0) style.theme = theme;

  // Font family extraction from an NSKeyedArchiver'd NSFont is fragile
  // without a full bplist decoder (ASCII runs in the archive include
  // bplist-internal strings like `$version` that can look like font names).
  // We only extract the font size, which is robustly encoded as a bplist
  // 8-byte IEEE double. Users who want a specific font can set
  // `fontFamily` via the JSON style file.
  const fontData = entries.data.get('Font');
  if (fontData) {
    const size = decodeNSFontSize(fontData);
    if (size) style.fontSize = size;
  }

  if (Object.keys(style).length === 0) {
    throw new Error('Profile did not contain any recognizable colors or font.');
  }

  const displayName =
    entries.string.get('name') ?? path.basename(filePath, path.extname(filePath));

  return { name: displayName, style };
}

interface Entries {
  data: Map<string, Buffer>;
  string: Map<string, string>;
}

function extractTopLevelEntries(xml: string): Entries {
  // Very narrow parser: we only look for `<key>NAME</key><TYPE>VALUE</TYPE>`
  // pairs at any nesting level. Apple's .terminal files use a single flat
  // top-level dict for the fields we care about, and anything nested (which
  // Terminal.app doesn't actually emit for these keys) we'd simply ignore.
  const data = new Map<string, Buffer>();
  const string = new Map<string, string>();

  const re = /<key>([^<]+)<\/key>\s*<(data|string|integer|real|true|false)(?:\s*\/>|>([\s\S]*?)<\/\2>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const key = m[1];
    const type = m[2];
    const value = m[3] ?? '';
    if (type === 'data') {
      // Whitespace (including newlines, tabs) is significant-free in plist
      // base64 blobs.
      const cleaned = value.replace(/\s+/g, '');
      try {
        data.set(key, Buffer.from(cleaned, 'base64'));
      } catch {
        /* ignore */
      }
    } else if (type === 'string') {
      string.set(key, decodeXmlEntities(value));
    }
  }
  return { data, string };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function decodeNSColorToHex(archive: Buffer): string | null {
  // The archive's `NSRGB` string is stored as ASCII bytes; we can just look
  // at the full buffer as latin1 text and extract the first run that looks
  // like 3-or-4 space-separated floats in [0,1].
  const text = archive.toString('latin1');
  const m = text.match(
    /([01](?:\.\d+)?)\s+([01](?:\.\d+)?)\s+([01](?:\.\d+)?)(?:\s+([01](?:\.\d+)?))?/,
  );
  if (!m) return null;
  const r = clamp01(parseFloat(m[1]));
  const g = clamp01(parseFloat(m[2]));
  const b = clamp01(parseFloat(m[3]));
  return toHex(r, g, b);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function toHex(r: number, g: number, b: number): string {
  const byte = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function decodeNSFontSize(archive: Buffer): number | undefined {
  // NSFont.NSSize is serialized as a bplist 64-bit IEEE double: marker byte
  // 0x23 followed by 8 big-endian bytes. In an NSFont archive this is the
  // only `0x23` marker, so we can pick the first one reliably.
  const sizeMarker = archive.indexOf(0x23);
  if (sizeMarker < 0 || sizeMarker + 8 >= archive.length) return undefined;
  const size = archive.readDoubleBE(sizeMarker + 1);
  if (!Number.isFinite(size) || size <= 0 || size >= 200) return undefined;
  return size;
}
