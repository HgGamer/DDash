/**
 * Monogram helpers for the sidebar project avatars.
 *
 * - `initials`: up to two uppercase letters derived from the display name.
 * - `tint`: a deterministic background color derived from a hash of the
 *   project id, so the same project always gets the same avatar color across
 *   sessions. Returned as an `hsl()` string tuned for the dark theme.
 */

export interface Monogram {
  initials: string;
  tint: string;
}

/** Two-letter initials from a display name. Uses the first letter of the first
 *  two words; for a single word, the first two characters. Falls back to '?'. */
export function initialsFromName(name: string): string {
  const words = name
    .trim()
    .split(/[\s/_\-.]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    const w = words[0];
    return (w.length >= 2 ? w.slice(0, 2) : w).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable 32-bit FNV-1a hash of a string. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic background tint from a project id, as an hsl() string. */
export function tintFromId(id: string): string {
  const hue = hash(id) % 360;
  return `hsl(${hue} 42% 32%)`;
}

export function monogramFor(id: string, name: string): Monogram {
  return { initials: initialsFromName(name), tint: tintFromId(id) };
}
