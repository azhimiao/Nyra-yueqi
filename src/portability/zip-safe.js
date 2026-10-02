/**
 * Safe ZIP helpers for portability archives (ZIP slip / bomb / path guards).
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { PortabilityError } from "./errors.js";

export const DEFAULT_ZIP_LIMITS = Object.freeze({
  maxEntries: 20_000,
  maxTotalUncompressed: 4 * 1024 * 1024 * 1024,
  maxEntrySize: 1 * 1024 * 1024 * 1024,
  maxPathLength: 240,
  maxCompressionRatio: 100,
});

/**
 * @param {string} path
 * @param {{ maxPathLength?: number }} [limits]
 */
export function assertSafeArchivePath(path, limits = {}) {
  const maxPathLength = limits.maxPathLength ?? DEFAULT_ZIP_LIMITS.maxPathLength;
  const raw = String(path || "");
  if (!raw || raw.length > maxPathLength) {
    throw new PortabilityError("archive_invalid_path", raw);
  }
  if (raw.includes("\\") || raw.includes("\0")) {
    throw new PortabilityError("archive_invalid_path", raw);
  }
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    throw new PortabilityError("archive_invalid_path", raw);
  }
  const parts = raw.split("/");
  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      throw new PortabilityError("archive_invalid_path", raw);
    }
  }
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(raw)) {
    throw new PortabilityError("archive_invalid_path", raw);
  }
  return raw;
}

/**
 * @param {Uint8Array} bytes
 * @param {Partial<typeof DEFAULT_ZIP_LIMITS>} [limits]
 * @returns {Record<string, Uint8Array>}
 */
export function safeUnzip(bytes, limits = {}) {
  const cfg = { ...DEFAULT_ZIP_LIMITS, ...limits };
  let entries;
  try {
    entries = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []));
  } catch {
    throw new PortabilityError("archive_schema_invalid", "zip_decode_failed");
  }
  const names = Object.keys(entries || {});
  if (names.length > cfg.maxEntries) {
    throw new PortabilityError("archive_limit_exceeded", "too_many_entries");
  }
  let total = 0;
  const out = {};
  const seen = new Set();
  for (const name of names) {
    if (name.endsWith("/")) continue;
    const path = assertSafeArchivePath(name, cfg);
    const normalized = path.toLowerCase();
    if (seen.has(normalized)) {
      throw new PortabilityError("archive_invalid_path", `duplicate:${path}`);
    }
    seen.add(normalized);
    const data = entries[name];
    const size = data?.length || 0;
    if (size > cfg.maxEntrySize) {
      throw new PortabilityError("archive_limit_exceeded", path);
    }
    total += size;
    if (total > cfg.maxTotalUncompressed) {
      throw new PortabilityError("archive_limit_exceeded", "total_size");
    }
    out[path] = data;
  }
  const compressed = bytes?.length || 1;
  if (total / compressed > cfg.maxCompressionRatio) {
    throw new PortabilityError("archive_limit_exceeded", "compression_ratio");
  }
  return out;
}

/**
 * @param {Record<string, Uint8Array|string>} files
 * @returns {Uint8Array}
 */
export function safeZip(files, level = 6) {
  const mapped = {};
  for (const [path, value] of Object.entries(files || {})) {
    const safe = assertSafeArchivePath(path);
    mapped[safe] = typeof value === "string" ? strToU8(value) : value;
  }
  return zipSync(mapped, { level });
}

export function zipJson(path, value) {
  return { [assertSafeArchivePath(path)]: strToU8(JSON.stringify(value, null, 2)) };
}

export { strToU8, strFromU8 };
