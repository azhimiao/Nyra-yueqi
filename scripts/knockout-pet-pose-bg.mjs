/**
 * Convert Seedream JPEG outputs to transparent PNGs (aggressive pale-pink knockout) and resize.
 * Usage: node scripts/knockout-pet-pose-bg.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, "../assets/pet-poses");
const RAW_DIR = path.join(DIR, "_raw-jpg");
const MAX_EDGE = 768;

const POSE_IDS = [
  "idle_default",
  "sleep_pose",
  "greet",
  "selfie",
  "talking_default",
  "react_tap",
  "comfort",
];

function decodeRaster(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const decoded = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.data) };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: Buffer.from(png.data) };
  }
  throw new Error("Unsupported image format");
}

function isBackground(r, g, b) {
  // Pale pink / near-white paper bg from Seedream sticker style
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const bright = (r + g + b) / 3;
  if (bright < 210) return false;
  if (max - min > 42) return false; // too saturated (real clothing/hair)
  // Prefer pinkish whites: R slightly >= G/B
  if (r >= 228 && g >= 210 && b >= 210) return true;
  if (r >= 236 && g >= 220 && b >= 225 && bright >= 228) return true;
  return false;
}

function knockout({ width, height, data }) {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    if (isBackground(r, g, b)) {
      // Soft edge: fade mid-pink near character fringe
      const bright = (r + g + b) / 3;
      if (bright >= 238) out[i + 3] = 0;
      else if (bright >= 224) out[i + 3] = Math.round(((238 - bright) / 14) * 255);
      else out[i + 3] = 180;
    } else {
      out[i + 3] = 255;
    }
  }
  // Flood from corners to clear leftover bg islands (only already-near-bg pixels)
  const visited = new Uint8Array(width * height);
  const stack = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const i = idx << 2;
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const bright = (r + g + b) / 3;
    // Only spread through light pixels
    if (bright < 200 || Math.max(r, g, b) - Math.min(r, g, b) > 55) continue;
    out[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { width, height, data: out };
}

function resizeRGBA(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
    for (let x = 0; x < dw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const si = (sy * sw + sx) << 2;
      const di = (y * dw + x) << 2;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

function trimTransparent(raster, padding = 8) {
  const { width, height, data } = raster;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[((y * width + x) << 2) + 3] < 16) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return raster;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  const dw = maxX - minX + 1;
  const dh = maxY - minY + 1;
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const si = ((minY + y) * width + (minX + x)) << 2;
      const di = (y * dw + x) << 2;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return { width: dw, height: dh, data: out };
}

async function processFile(id) {
  const rawPath = path.join(RAW_DIR, `${id}.png`);
  const srcPath = path.join(DIR, `${id}.png`);
  let buf;
  try {
    buf = await fs.readFile(rawPath);
  } catch {
    buf = await fs.readFile(srcPath);
  }
  // Prefer jpeg bytes from raw backup even if extension is .png
  let raster = decodeRaster(buf);
  // If current file is already PNG with little alpha, and raw is jpeg, raw path used above.

  raster = knockout(raster);
  raster = trimTransparent(raster, 12);

  const scale = MAX_EDGE / Math.max(raster.width, raster.height);
  const dw = Math.max(1, Math.round(raster.width * Math.min(1, scale)));
  const dh = Math.max(1, Math.round(raster.height * Math.min(1, scale)));
  const resized = {
    width: dw,
    height: dh,
    data: resizeRGBA(raster.data, raster.width, raster.height, dw, dh),
  };

  const png = new PNG({ width: resized.width, height: resized.height });
  resized.data.copy(png.data);
  const outBuf = PNG.sync.write(png, { deflateLevel: 9 });
  await fs.writeFile(srcPath, outBuf);

  let transparent = 0;
  for (let i = 3; i < resized.data.length; i += 4) {
    if (resized.data[i] < 10) transparent += 1;
  }
  const pct = Math.round((100 * transparent) / (resized.width * resized.height));
  console.log(`ok ${id} ${dw}x${dh} transparent~${pct}% ${Math.round(outBuf.length / 1024)}KB`);
}

async function main() {
  for (const id of POSE_IDS) {
    await processFile(id);
  }
  await fs.copyFile(path.join(DIR, "idle_default.png"), path.join(DIR, "_character-lock.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
