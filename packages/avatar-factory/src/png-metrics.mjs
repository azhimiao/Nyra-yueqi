/**
 * Pure-JS alpha bbox metrics (pngjs). No Live2D/Rive.
 */
import { PNG } from "pngjs";
import fs from "node:fs/promises";
import path from "node:path";

export const ALPHA_THRESHOLD = 24;

/** @typedef {{ minX:number, minY:number, maxX:number, maxY:number, width:number, height:number, centerX:number, footBottom:number, coverage:number }} SubjectMetrics */

/**
 * @param {PNG} png
 * @param {number} [alphaThreshold]
 * @returns {SubjectMetrics|null}
 */
export function measureAlphaBBox(png, alphaThreshold = ALPHA_THRESHOLD) {
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a <= alphaThreshold) continue;
      opaque += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: w,
    height: h,
    centerX: minX + (w - 1) / 2,
    footBottom: maxY,
    coverage: opaque / (width * height),
  };
}

export async function readPng(filePath) {
  const buf = await fs.readFile(filePath);
  return PNG.sync.read(buf);
}

export async function writePng(filePath, png) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, PNG.sync.write(png));
}

/**
 * Translate opaque subject by integer (dx, dy). Transparent fill.
 * @param {PNG} png
 * @param {number} dx
 * @param {number} dy
 */
export function translatePng(png, dx, dy) {
  dx = Math.round(dx);
  dy = Math.round(dy);
  if (!dx && !dy) return png;
  const { width, height, data } = png;
  const out = new PNG({ width, height, colorType: 6 });
  out.data.fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const si = (sy * width + sx) * 4;
      const di = (y * width + x) * 4;
      out.data[di] = data[si];
      out.data[di + 1] = data[si + 1];
      out.data[di + 2] = data[si + 2];
      out.data[di + 3] = data[si + 3];
    }
  }
  return out;
}

export const REG_THRESHOLDS = Object.freeze({
  footPx: 4,
  centerPx: 8,
  heightPct: 3,
});

/**
 * @param {SubjectMetrics} frame
 * @param {SubjectMetrics} canonical
 * @param {{ footPx?:number, centerPx?:number, heightPct?:number }} [thresholds]
 */
export function compareToCanonical(frame, canonical, thresholds = REG_THRESHOLDS) {
  const footDelta = Math.abs(frame.footBottom - canonical.footBottom);
  const centerDelta = Math.abs(frame.centerX - canonical.centerX);
  const heightDeltaPct =
    canonical.height > 0 ? (Math.abs(frame.height - canonical.height) / canonical.height) * 100 : 100;
  const ok =
    footDelta <= thresholds.footPx &&
    centerDelta <= thresholds.centerPx &&
    heightDeltaPct <= thresholds.heightPct;
  return {
    footDelta,
    centerDelta,
    heightDeltaPct,
    ok,
    translateDx: canonical.centerX - frame.centerX,
    translateDy: canonical.footBottom - frame.footBottom,
  };
}
