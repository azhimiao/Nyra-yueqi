/**
 * Host sandbox bridge — zip extract to private temp storage (no code execution).
 *
 * TODO(Capacitor/Android): Wire to @capacitor/filesystem private cache dir +
 *       system file picker; same interface as extractZipToSandbox / cleanupSandbox.
 */

import { unzipSync, strFromU8 } from "fflate";
import { normalizeRelativePath } from "./integrity.js";

/** @type {Map<string, Record<string, string>>} */
const sandboxes = new Map();

let sandboxCounter = 0;

/**
 * @param {string} path
 */
function isTextSkillPath(path) {
  const norm = normalizeRelativePath(path);
  if (!norm || norm.endsWith("/")) return false;
  return /\.(md|json|txt|yml|yaml|csv)$/i.test(norm) || norm.toLowerCase().endsWith("skill.md");
}

/**
 * Extract zip bytes into an in-memory sandbox. Never executes code.
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {{ ok: true, tempId: string, files: Record<string,string> } | { ok: false, reason: string }}
 */
export function extractZipToSandbox(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let entries;
  try {
    entries = unzipSync(arr);
  } catch {
    return { ok: false, reason: "invalid_zip" };
  }

  /** @type {Record<string, string>} */
  const files = {};
  for (const [rawPath, data] of Object.entries(entries)) {
    const path = normalizeRelativePath(rawPath);
    if (!path || path.endsWith("/")) continue;
    if (!isTextSkillPath(path)) continue;
    try {
      files[path] = strFromU8(data);
    } catch {
      /* skip unreadable */
    }
  }

  const tempId = `sandbox_${Date.now()}_${++sandboxCounter}`;
  sandboxes.set(tempId, files);
  return { ok: true, tempId, files };
}

/**
 * Test helper — simulate zip extraction from a pre-built files map.
 * @param {Record<string, string>} files
 */
export function simulateZipExtract(files) {
  const tempId = `sandbox_sim_${Date.now()}_${++sandboxCounter}`;
  sandboxes.set(tempId, { ...files });
  return { ok: true, tempId, files: { ...files } };
}

/**
 * @param {string} tempId
 */
export function getSandboxFiles(tempId) {
  return sandboxes.get(String(tempId || "")) || null;
}

/**
 * @param {string} tempId
 */
export function cleanupSandbox(tempId) {
  const id = String(tempId || "").trim();
  if (!id) return { ok: false, reason: "missing_temp_id" };
  sandboxes.delete(id);
  return { ok: true };
}

/**
 * Capacitor/Android bridge stub — same interface, not yet wired.
 * @returns {{ ok: false, reason: string }}
 */
export function extractZipViaNativeHost() {
  return {
    ok: false,
    reason: "native_host_not_implemented",
    todo: "Capacitor Filesystem cache + Android SAF file picker",
  };
}

export function cleanupNativeSandbox() {
  return {
    ok: false,
    reason: "native_host_not_implemented",
  };
}
