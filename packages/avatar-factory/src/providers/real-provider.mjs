/**
 * Real ARK / Seedream HTTP adapter (CP-AV4).
 * Secrets from env / F:/beautiful/.env — never logged.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { ProviderError, PROVIDER_NOT_CONFIGURED } from "./types.mjs";
import {
  promptIdentityCandidate,
  promptCanonical,
  promptActionFrame,
  promptFacePart,
} from "./prompts.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const DEFAULT_BASE = "https://ark.cn-beijing.volces.com";
// Ark Seedream requires ≥ 3686400 pixels (e.g. 1920×1920).
const DEFAULT_SIZE = "1920x1920";
const FACE_SIZE = "1920x1920";

/**
 * Load KEY=VALUE from .env into process.env when missing (dotenv-style).
 * Does not print values.
 * @param {string} [envPath]
 */
export async function loadDotenv(envPath = path.join(REPO_ROOT, ".env")) {
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  } catch {
    /* optional */
  }
}

/**
 * @param {Buffer} buf
 */
export function ensurePngBuffer(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return buf;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const decoded = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    const png = new PNG({ width: decoded.width, height: decoded.height });
    png.data = Buffer.from(decoded.data);
    return PNG.sync.write(png);
  }
  // WebP / unknown: write raw and hope; prefer fail loudly
  throw new ProviderError("UNSUPPORTED_IMAGE", "Provider returned unsupported image format (need PNG/JPEG)");
}

async function fileToDataUrl(filePath) {
  const buf = await fs.readFile(filePath);
  const png = ensurePngBuffer(buf);
  return `data:image/png;base64,${png.toString("base64")}`;
}

export class RealProvider {
  id = "real";
  promptTemplateVersion = "v1-visual-protocol";

  /**
   * @param {{ skipEnvFile?: boolean, baseUrl?: string, apiKey?: string, model?: string }} [opts]
   */
  constructor(opts = {}) {
    this.opts = opts;
    this._ready = false;
    this.model = opts.model || process.env.ARK_IMAGE_MODEL || "";
  }

  async ensureConfigured() {
    if (this._ready && this.apiKey) return;
    if (!this.opts.skipEnvFile) {
      await loadDotenv();
    }
    this.apiKey = (this.opts.apiKey ?? process.env.ARK_API_KEY ?? "").trim();
    this.baseUrl = (this.opts.baseUrl || process.env.ARK_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
    this.model = (this.opts.model || process.env.ARK_IMAGE_MODEL || "").trim();
    if (!this.apiKey) {
      throw new ProviderError(
        PROVIDER_NOT_CONFIGURED,
        "ARK_API_KEY missing — set env or F:/beautiful/.env (real provider cannot invent images)",
      );
    }
    if (!this.model) {
      throw new ProviderError(
        PROVIDER_NOT_CONFIGURED,
        "ARK_IMAGE_MODEL missing — set env or F:/beautiful/.env",
      );
    }
    this._ready = true;
  }

  /**
   * @param {{ prompt: string, imageDataUrls?: string[], outPath: string, size?: string }} args
   */
  async generateOne({ prompt, imageDataUrls, outPath, size = DEFAULT_SIZE }) {
    await this.ensureConfigured();
    const body = {
      model: this.model,
      prompt,
      size,
      response_format: "url",
      watermark: false,
      sequential_image_generation: "disabled",
    };
    if (imageDataUrls?.length) {
      body.image = imageDataUrls.length === 1 ? imageDataUrls[0] : imageDataUrls;
    }

    const res = await fetch(`${this.baseUrl}/api/v3/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ProviderError(
        "PROVIDER_HTTP_ERROR",
        `Non-JSON response (${res.status})`,
        { status: res.status, errorClass: classifyHttp(res.status) },
      );
    }
    if (!res.ok) {
      throw new ProviderError(
        "PROVIDER_HTTP_ERROR",
        `API ${res.status}: ${safeErr(json)}`,
        { status: res.status, errorClass: classifyHttp(res.status) },
      );
    }

    const url = json?.data?.[0]?.url;
    const b64 = json?.data?.[0]?.b64_json;
    if (!url && !b64) {
      throw new ProviderError("PROVIDER_EMPTY", "No image in provider response");
    }

    let bytes;
    if (b64) bytes = Buffer.from(b64, "base64");
    else {
      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        throw new ProviderError("PROVIDER_DOWNLOAD", `Download failed ${imgRes.status}`, {
          status: imgRes.status,
          errorClass: classifyHttp(imgRes.status),
        });
      }
      bytes = Buffer.from(await imgRes.arrayBuffer());
    }

    const png = ensurePngBuffer(bytes);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, png);
    return outPath;
  }

  async generateIdentity({ spec, outDir, count = 4 }) {
    await this.ensureConfigured();
    const paths = [];
    for (let i = 1; i <= count; i++) {
      const out = path.join(outDir, `candidate-0${i}.png`);
      await this.generateOne({
        prompt: promptIdentityCandidate(spec, i),
        outPath: out,
        size: DEFAULT_SIZE,
      });
      paths.push(out);
    }
    return paths;
  }

  async generateCanonical({ spec, lockedPath, outDir }) {
    await this.ensureConfigured();
    const ref = await fileToDataUrl(lockedPath);
    /** @type {Record<string, string>} */
    const out = {};
    const jobs = [
      ["full-body.png", "full-body", DEFAULT_SIZE],
      ["bust.png", "bust", FACE_SIZE],
      ["face.png", "face", FACE_SIZE],
      ["neutral-reference.png", "neutral-reference", DEFAULT_SIZE],
    ];
    for (const [name, kind, size] of jobs) {
      const p = path.join(outDir, name);
      await this.generateOne({
        prompt: promptCanonical(spec, kind),
        imageDataUrls: [ref],
        outPath: p,
        size,
      });
      out[name] = p;
    }
    return out;
  }

  async generateActionFrame({ spec, lockedPath, action, frameIndex, outPath }) {
    await this.ensureConfigured();
    const ref = await fileToDataUrl(lockedPath);
    await this.generateOne({
      prompt: promptActionFrame(spec, action, frameIndex),
      imageDataUrls: [ref],
      outPath,
      size: DEFAULT_SIZE,
    });
    return outPath;
  }

  /**
   * Seedream path has no true mask-inpaint in this adapter.
   * - base: best-effort I2I from face ref
   * - other parts: local crop from face ref (DEGRADED_PASS; does not fail pack)
   */
  async inpaintFacePart({ spec, faceRefPath, part, variant, outPath }) {
    await this.ensureConfigured();
    await fs.mkdir(path.dirname(outPath), { recursive: true });

    if (part === "base") {
      try {
        const ref = await fileToDataUrl(faceRefPath);
        await this.generateOne({
          prompt: promptFacePart(spec, part, variant),
          imageDataUrls: [ref],
          outPath,
          size: FACE_SIZE,
        });
        return {
          path: outPath,
          degraded: true,
          note: "no_mask_inpaint; best-effort I2I for face base",
        };
      } catch (e) {
        await fs.copyFile(faceRefPath, outPath);
        return {
          path: outPath,
          degraded: true,
          note: `face_base_fallback_copy: ${e?.code || e?.message || e}`,
        };
      }
    }

    try {
      await cropFaceRegion(faceRefPath, outPath, part);
      return {
        path: outPath,
        degraded: true,
        note: `no_mask_inpaint; local crop for ${part}/${variant}`,
      };
    } catch (e) {
      await fs.copyFile(faceRefPath, outPath);
      return {
        path: outPath,
        degraded: true,
        note: `face_part_fallback_copy: ${e?.message || e}`,
      };
    }
  }
}

/**
 * Best-effort region crop from a face reference (no true inpaint).
 * @param {string} srcPath
 * @param {string} outPath
 * @param {string} part
 */
async function cropFaceRegion(srcPath, outPath, part) {
  const buf = ensurePngBuffer(await fs.readFile(srcPath));
  const src = PNG.sync.read(buf);
  const w = src.width;
  const h = src.height;
  /** @type {{x0:number,y0:number,x1:number,y1:number}} */
  let box;
  if (part === "eyes" || part === "brows") {
    box = { x0: 0.22, y0: 0.28, x1: 0.78, y1: 0.52 };
  } else if (part === "mouth") {
    box = { x0: 0.32, y0: 0.52, x1: 0.68, y1: 0.72 };
  } else if (part === "blush") {
    box = { x0: 0.18, y0: 0.42, x1: 0.82, y1: 0.62 };
  } else {
    box = { x0: 0.15, y0: 0.15, x1: 0.85, y1: 0.85 };
  }
  const x0 = Math.max(0, Math.floor(w * box.x0));
  const y0 = Math.max(0, Math.floor(h * box.y0));
  const x1 = Math.min(w, Math.ceil(w * box.x1));
  const y1 = Math.min(h, Math.ceil(h * box.y1));
  const cw = Math.max(1, x1 - x0);
  const ch = Math.max(1, y1 - y0);
  const out = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y0 + y) * w + (x0 + x)) * 4;
      const di = (y * cw + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  await fs.writeFile(outPath, PNG.sync.write(out));
}

function classifyHttp(status) {
  if (status === 401 || status === 403) return "AUTH";
  if (status === 402) return "PAYMENT_REQUIRED";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "UPSTREAM_5XX";
  if (status === 0 || !status) return "NETWORK";
  return `HTTP_${status}`;
}

function safeErr(json) {
  try {
    const msg = json?.error?.message || json?.message || JSON.stringify(json);
    return String(msg).slice(0, 400);
  } catch {
    return "unknown error";
  }
}

/**
 * Factory
 * @param {string} name
 * @param {object} [opts]
 */
export async function createProvider(name, opts = {}) {
  if (name === "fixture") {
    const { FixtureProvider } = await import("./fixture-provider.mjs");
    return new FixtureProvider();
  }
  if (name === "real") {
    return new RealProvider(opts);
  }
  throw new ProviderError("UNKNOWN_PROVIDER", `Unknown provider: ${name}`);
}
