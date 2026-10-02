/**
 * 扩展包解包 / 校验（F7 H1）
 */

import { unzipSync, strFromU8 } from "fflate";
import { validateManifest } from "./manifest-schema.js";

const TEXT_EXT = /\.(html?|js|css|json|svg|txt|md)$/i;

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * @param {ArrayBuffer|Uint8Array} input
 */
export async function sha256Hex(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  // Fallback (non-crypto) for Node verify without subtle — length + simple hash
  let h = 0;
  for (let i = 0; i < bytes.length; i += 1) h = ((h << 5) - h + bytes[i]) | 0;
  return `fallback-${bytes.length.toString(16)}-${(h >>> 0).toString(16)}`;
}

function normalizeZipPath(path) {
  return String(path || "").replace(/^\/+/, "").replace(/\\/g, "/");
}

function findManifestEntry(entries) {
  const keys = Object.keys(entries);
  const direct = keys.find((k) => normalizeZipPath(k) === "manifest.json");
  if (direct) return direct;
  const nested = keys.find((k) => {
    const parts = normalizeZipPath(k).split("/");
    return parts.length === 2 && parts[1] === "manifest.json";
  });
  return nested || null;
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ ok: true, manifest: object, files: Record<string,string>, iconDataUrl?: string, packageSha256: string }
 *   | { ok: false, code: string, message: string }}
 */
export async function unpackExtPackage(bytes) {
  let entries;
  try {
    entries = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    return { ok: false, code: "missing_manifest", message: "安装包无法识别，请检查是否为栖机扩展包" };
  }

  const manifestKey = findManifestEntry(entries);
  if (!manifestKey) {
    return { ok: false, code: "missing_manifest", message: "缺少 manifest" };
  }

  let manifestRaw;
  try {
    manifestRaw = JSON.parse(strFromU8(entries[manifestKey]));
  } catch {
    return { ok: false, code: "missing_manifest", message: "manifest 无法解析" };
  }

  const validated = validateManifest(manifestRaw);
  if (!validated.ok) return validated;

  const prefix = normalizeZipPath(manifestKey).includes("/")
    ? normalizeZipPath(manifestKey).split("/")[0] + "/"
    : "";

  /** @type {Record<string, string>} */
  const files = {};
  for (const [rawPath, data] of Object.entries(entries)) {
    let path = normalizeZipPath(rawPath);
    if (prefix && path.startsWith(prefix)) path = path.slice(prefix.length);
    if (!path || path.endsWith("/")) continue;
    if (path.includes("..")) continue;
    if (TEXT_EXT.test(path)) {
      files[path] = strFromU8(data);
    } else {
      // binary → data URL (small icons)
      const b64 = typeof btoa === "function"
        ? btoa(String.fromCharCode(...data))
        : Buffer.from(data).toString("base64");
      const mime = path.endsWith(".png") ? "image/png"
        : path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg"
          : path.endsWith(".webp") ? "image/webp"
            : "application/octet-stream";
      files[path] = `data:${mime};base64,${b64}`;
    }
  }

  const entry = validated.manifest.entry || "index.html";
  if (!files[entry]) {
    return { ok: false, code: "entry_missing", message: "入口文件缺失" };
  }

  let iconDataUrl;
  if (validated.manifest.icon && files[validated.manifest.icon]) {
    const iconContent = files[validated.manifest.icon];
    if (iconContent.startsWith("data:")) {
      iconDataUrl = iconContent;
    } else if (validated.manifest.icon.endsWith(".svg")) {
      iconDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconContent)}`;
    }
  }

  const packageSha256 = await sha256Hex(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

  return {
    ok: true,
    manifest: validated.manifest,
    files,
    iconDataUrl,
    packageSha256,
  };
}

/**
 * @param {File|Blob} file
 */
export async function unpackExtFile(file) {
  const buf = await file.arrayBuffer();
  return unpackExtPackage(new Uint8Array(buf));
}
