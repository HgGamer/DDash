#!/usr/bin/env node
// Mask build/icon-source.png into a macOS-style squircle and write
// build/icon.png. Run once after replacing the source artwork:
//
//   node scripts/round-icon.mjs
//
// macOS renders dock/bundle icons exactly as provided — whatever shape is in
// build/icon.png is what shows up. electron-builder also derives .icns/.ico
// from this PNG at package time. To get the familiar rounded-square shape we
// bake the mask into the PNG itself rather than applying it at runtime.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(here, '..', 'build');
const inPath = path.join(buildDir, 'icon-source.png');
const outPath = path.join(buildDir, 'icon.png');

// Squircle shape. Apple's app-icon grid uses ~22.37% corner radius of the
// outer bounding box, with a small inset so the art does not touch the very
// edge of the canvas (matches how macOS renders .icns at small sizes).
const CORNER_RADIUS_FRAC = 0.2237;
const INSET_FRAC = 0.05; // keep 5% padding around the art

const raw = await fs.readFile(inPath);
const img = PNG.sync.read(raw);
const { width, height } = img;
const inset = Math.round(Math.min(width, height) * INSET_FRAC);
const innerW = width - inset * 2;
const innerH = height - inset * 2;
const radius = Math.round(Math.min(innerW, innerH) * CORNER_RADIUS_FRAC);

// Pre-compute the horizontal extent of the rounded rect for each row inside
// the inset region. Outside the corner bands the extent is the full inner
// width; inside a corner band it follows the circle equation.
const rowHalfSpan = new Array(innerH);
const innerHalfW = innerW / 2;
const innerHalfH = innerH / 2;
for (let yy = 0; yy < innerH; yy++) {
  const dy = yy - innerHalfH + 0.5;
  const topDist = innerHalfH - Math.abs(dy);
  if (topDist >= radius) {
    rowHalfSpan[yy] = innerHalfW;
    continue;
  }
  // Distance from the near horizontal edge of the rounded region.
  const t = radius - topDist;
  // Solve for horizontal half-extent at this row: the corner is a quarter
  // circle of radius `radius` whose center is `radius` in from each edge.
  const dx = Math.sqrt(Math.max(0, radius * radius - t * t));
  rowHalfSpan[yy] = innerHalfW - radius + dx;
}

for (let y = 0; y < height; y++) {
  const yy = y - inset;
  for (let x = 0; x < width; x++) {
    const idx = (y * width + x) * 4;
    let keep = false;
    if (yy >= 0 && yy < innerH) {
      const dx = x - inset - innerHalfW + 0.5;
      if (Math.abs(dx) <= rowHalfSpan[yy]) keep = true;
    }
    if (!keep) {
      img.data[idx + 3] = 0; // fully transparent
    }
  }
}

// Ensure the PNG color type preserves alpha.
img.colorType = 6;
const out = PNG.sync.write(img);
await fs.writeFile(outPath, out);

// eslint-disable-next-line no-console
console.log(
  `Wrote ${path.relative(process.cwd(), outPath)} ` +
    `(${width}×${height}, inset=${inset}, radius=${radius})`,
);
