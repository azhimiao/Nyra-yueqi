/**
 * Skill bundle integrity — hash, path safety, size limits, text-only v1.
 */

export const INTEGRITY_LIMITS = Object.freeze({
  maxTotalBytes: 5 * 1024 * 1024,
  maxFileCount: 200,
  maxPathDepth: 8,
  maxSingleFileBytes: 1024 * 1024,
});

const EXECUTABLE_EXT = /\.(js|mjs|cjs|py|exe|sh|bat|cmd|ps1)$/i;

const ALLOWED_TEXT_EXT = /\.(md|json|txt|yml|yaml|csv)$/i;

function rotr(n, s) {
  return (n >>> s) | (n << (32 - s));
}

function sha256Bytes(bytes) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  const view = new DataView(withOne.buffer);
  view.setUint32(withOne.length - 4, bitLen >>> 0, false);
  view.setUint32(withOne.length - 8, Math.floor(bitLen / 0x100000000), false);
  const w = new Uint32Array(64);
  for (let i = 0; i < withOne.length; i += 64) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = view.getUint32(i + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = (rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3)) >>> 0;
      const s1 = (rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];
    for (let t = 0; t < 64; t += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return [...H].map((n) => n.toString(16).padStart(8, "0")).join("");
}

function utf8ByteLength(text) {
  return new TextEncoder().encode(String(text || "")).length;
}

/**
 * @param {string} content
 */
export function sha256Text(content) {
  return sha256Bytes(new TextEncoder().encode(String(content || "")));
}

/**
 * @param {Record<string, string>} files
 */
export function computeBundleHash(files) {
  const paths = Object.keys(files).sort();
  const parts = paths.map((p) => `${p}\0${sha256Text(files[p])}`);
  return sha256Text(parts.join("\n"));
}

/**
 * @param {string} path
 */
export function normalizeRelativePath(path) {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

/**
 * @param {string} path
 */
export function isPathTraversal(path) {
  const norm = normalizeRelativePath(path);
  if (!norm || norm.startsWith("/") || norm.includes("..")) return true;
  const segments = norm.split("/");
  return segments.some((s) => s === "..");
}

/**
 * @param {string} path
 */
export function isExecutablePath(path) {
  return EXECUTABLE_EXT.test(normalizeRelativePath(path));
}

/**
 * @param {string} path
 */
export function isAllowedTextPath(path) {
  const norm = normalizeRelativePath(path);
  if (!norm || norm.endsWith("/")) return false;
  if (isExecutablePath(norm)) return false;
  return ALLOWED_TEXT_EXT.test(norm) || norm === "SKILL.md";
}

/**
 * @param {string} path
 */
export function pathDepth(path) {
  const norm = normalizeRelativePath(path);
  if (!norm) return 0;
  return norm.split("/").filter(Boolean).length;
}

/**
 * @param {Record<string, string>} files
 * @returns {{ ok: true } | { ok: false, reason: string, path?: string }}
 */
export function validateSkillBundleFiles(files) {
  if (!files || typeof files !== "object") {
    return { ok: false, reason: "missing_files" };
  }

  const paths = Object.keys(files);
  if (paths.length === 0) {
    return { ok: false, reason: "empty_bundle" };
  }
  if (paths.length > INTEGRITY_LIMITS.maxFileCount) {
    return { ok: false, reason: "too_many_files" };
  }

  let totalBytes = 0;
  for (const rawPath of paths) {
    const path = normalizeRelativePath(rawPath);
    if (isPathTraversal(path)) {
      return { ok: false, reason: "path_traversal", path };
    }
    if (isExecutablePath(path)) {
      return { ok: false, reason: "executable_rejected", path };
    }
    if (!isAllowedTextPath(path)) {
      return { ok: false, reason: "unknown_binary", path };
    }
    const depth = pathDepth(path);
    if (depth > INTEGRITY_LIMITS.maxPathDepth) {
      return { ok: false, reason: "path_too_deep", path };
    }
    const content = String(files[rawPath] ?? "");
    const bytes = utf8ByteLength(content);
    if (bytes > INTEGRITY_LIMITS.maxSingleFileBytes) {
      return { ok: false, reason: "file_too_large", path };
    }
    totalBytes += bytes;
    if (totalBytes > INTEGRITY_LIMITS.maxTotalBytes) {
      return { ok: false, reason: "bundle_too_large" };
    }
  }

  const skillMd = paths.find((p) => normalizeRelativePath(p).toLowerCase().endsWith("skill.md"));
  if (!skillMd) {
    return { ok: false, reason: "missing_skill_md" };
  }

  return { ok: true };
}
