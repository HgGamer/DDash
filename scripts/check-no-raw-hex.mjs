#!/usr/bin/env node
/*
 * Rejects raw hex color literals in renderer component code. All colors must be
 * defined as tokens in `src/renderer/src/styles/tokens.css` and consumed via
 * `var(--token)`. See the visual-design-system capability.
 *
 * Usage:
 *   node scripts/check-no-raw-hex.mjs          # report offenders, exit 0 (warn)
 *   node scripts/check-no-raw-hex.mjs --strict # exit 1 if any offenders found
 *
 * The token stylesheet itself is the one allowed place for raw hex.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCAN_DIR = join(root, 'src', 'renderer', 'src');
const TOKEN_FILE = join('src', 'renderer', 'src', 'styles', 'tokens.css');

const strict = process.argv.includes('--strict');

// #rgb, #rrggbb, #rgba, #rrggbbaa — 3/4/6/8 hex digits with a word boundary.
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'assets' || entry === 'node_modules') continue;
      out.push(...walk(full));
    } else if (/\.(css|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** @type {{ file: string, line: number, text: string }[]} */
const offenders = [];
for (const file of walk(SCAN_DIR)) {
  const rel = relative(root, file).split(sep).join('/');
  if (rel === TOKEN_FILE.split(sep).join('/')) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    // Skip comment-only lines to reduce noise.
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    const matches = text.match(HEX);
    if (matches) offenders.push({ file: rel, line: i + 1, text: trimmed });
  });
}

if (offenders.length === 0) {
  console.log('check-no-raw-hex: OK — no raw hex colors in component code.');
  process.exit(0);
}

console.error(`check-no-raw-hex: found ${offenders.length} raw hex color(s) outside tokens.css:`);
for (const o of offenders) {
  console.error(`  ${o.file}:${o.line}  ${o.text}`);
}
process.exit(strict ? 1 : 0);
