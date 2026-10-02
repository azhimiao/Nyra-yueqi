/**
 * Marked fixture raster art (gray #B8B8B8 + simple character).
 * Never publishable.
 */
import { PNG } from "pngjs";
import fs from "node:fs/promises";
import path from "node:path";

const KINDS = {
  idle: { arm: 0.1, mouth: 0.05, head: 0 },
  listening: { arm: -0.2, mouth: 0.02, head: -0.1 },
  thinking: { arm: 0.9, mouth: 0.08, head: 0.1 },
  speaking: { arm: -0.35, mouth: 0.55, head: 0.03 },
  happy: { arm: -0.5, mouth: 0.35, head: -0.05 },
  concerned: { arm: 0.2, mouth: 0.1, head: 0.08 },
  sleeping: { arm: 0.4, mouth: 0, head: 0.4 },
  tap_react: { arm: 0.3, mouth: 0.3, head: -0.08 },
  show_artifact: { arm: -0.6, mouth: 0.15, head: 0 },
  enter: { arm: 0.1, mouth: 0.1, head: 0 },
  exit: { arm: 0.1, mouth: 0.05, head: 0.05 },
  bust: { arm: 0.1, mouth: 0.05, head: 0, crop: "bust" },
  face: { arm: 0, mouth: 0.05, head: 0, crop: "face" },
  eyes_open: { part: "eyes", variant: "open" },
  eyes_closed: { part: "eyes", variant: "closed" },
  mouth_closed: { part: "mouth", variant: "closed" },
  mouth_open: { part: "mouth", variant: "open" },
};

function fill(png, r, g, b, a = 255) {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = a;
  }
}

function setPx(png, x, y, r, g, b, a = 255) {
  x |= 0;
  y |= 0;
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) * 4;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function ellipse(png, cx, cy, rx, ry, r, g, b, a = 255) {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(png.width - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(png.height - 1, Math.ceil(cy + ry));
  const rx2 = rx * rx || 1;
  const ry2 = ry * ry || 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if ((dx * dx) / rx2 + (dy * dy) / ry2 <= 1) setPx(png, x, y, r, g, b, a);
    }
  }
}

function hashHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export async function writeFixturePng(outPath, { kind = "idle", characterId = "x", size = 1024 } = {}) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  fill(png, 0xb8, 0xb8, 0xb8, 255);
  const hue = hashHue(characterId);
  const hair = [(hue % 80) + 60, 120 + (hue % 60), 100 + (hue % 80)];
  const dress = [240, 230, 220];
  const skin = [255, 216, 200];
  const k = KINDS[kind] || KINDS.idle;
  const cx = size / 2;
  const baseY = size * 0.86;

  if (k.part === "eyes") {
    fill(png, 0, 0, 0, 0);
    const open = k.variant === "open";
    if (open) {
      ellipse(png, cx - 40, size / 2, 28, 32, 255, 255, 255, 255);
      ellipse(png, cx + 40, size / 2, 28, 32, 255, 255, 255, 255);
      ellipse(png, cx - 40, size / 2, 14, 14, 80, 140, 200, 255);
      ellipse(png, cx + 40, size / 2, 14, 14, 80, 140, 200, 255);
    } else {
      ellipse(png, cx - 40, size / 2, 28, 4, 90, 64, 56, 255);
      ellipse(png, cx + 40, size / 2, 28, 4, 90, 64, 56, 255);
    }
  } else if (k.part === "mouth") {
    fill(png, 0, 0, 0, 0);
    const open = k.variant === "open" ? 18 : 4;
    ellipse(png, cx, size / 2, 22, open, 196, 90, 106, 255);
  } else {
    const torsoY = k.crop === "face" ? size * 0.55 : k.crop === "bust" ? size * 0.62 : baseY - 170;
    const headY = k.crop === "face" ? size * 0.48 : torsoY - 100;
    ellipse(png, cx, headY + 30, 90, 120, hair[0], hair[1], hair[2]);
    if (k.crop !== "face") {
      ellipse(png, cx, torsoY + 50, 85, 130, dress[0], dress[1], dress[2]);
      ellipse(png, cx - 70, torsoY, 18, 70, skin[0], skin[1], skin[2]);
      ellipse(png, cx + 70 + k.arm * 30, torsoY - k.arm * 20, 18, 70, skin[0], skin[1], skin[2]);
    }
    ellipse(png, cx + k.head * 20, headY, 70, 80, skin[0], skin[1], skin[2]);
    ellipse(png, cx, headY - 40, 72, 30, hair[0], hair[1], hair[2]);
    ellipse(png, cx - 22, headY, 12, 14, 255, 255, 255);
    ellipse(png, cx + 22, headY, 12, 14, 255, 255, 255);
    ellipse(png, cx - 22, headY + 1, 6, 6, 60, 100, 180);
    ellipse(png, cx + 22, headY + 1, 6, 6, 60, 100, 180);
    const mh = Math.max(2, 2 + (k.mouth || 0) * 12);
    ellipse(png, cx, headY + 32, 10, mh, 196, 90, 106);
    if (!k.crop) {
      ellipse(png, cx - 24, baseY, 20, 10, 100, 70, 50);
      ellipse(png, cx + 24, baseY, 20, 10, 100, 70, 50);
    }
    // fixture watermark strip (top-left) — proves non-publishable
    for (let y = 4; y < 18; y++) {
      for (let x = 4; x < 120; x++) setPx(png, x, y, 255, 80, 80, 220);
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, PNG.sync.write(png));
  return outPath;
}

/** Gray-edge flood to RGBA (fixture matting; production uses rembg worker). */
export async function matteGrayFixture(inPath, outPath) {
  const buf = await fs.readFile(inPath);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const visited = new Uint8Array(width * height);
  const q = [];
  const isGray = (i) => {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const avg = (r + g + b) / 3;
    return avg >= 160 && avg <= 210 && Math.max(r, g, b) - Math.min(r, g, b) <= 18;
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    if (!isGray(idx * 4)) return;
    visited[idx] = 1;
    q.push(idx);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (q.length) {
    const idx = q.pop();
    data[idx * 4 + 3] = 0;
    const x = idx % width;
    const y = (idx / width) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, PNG.sync.write(png));
}
