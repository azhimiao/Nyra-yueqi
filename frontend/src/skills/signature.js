/**
 * Package hash, signature (HMAC-style local), provenance metadata.
 * Local-first: uses WebCrypto when available, Node crypto otherwise.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Canonical JSON stringify (sorted keys) for stable hashing.
 * @param {unknown} value
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/**
 * SHA-256 hex of package payload (manifest + entry source + assets map).
 * @param {{
 *   manifest: object,
 *   entrySource: string,
 *   assets?: Record<string, string>,
 * }} pkg
 */
export function hashSkillPackage(pkg) {
  const payload = canonicalJson({
    manifest: pkg.manifest,
    entrySource: String(pkg.entrySource || ""),
    assets: pkg.assets && typeof pkg.assets === "object" ? pkg.assets : {},
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Sign package hash with a local developer/publisher key (HMAC-SHA256).
 * @param {string} packageHash
 * @param {string} secret
 */
export function signPackageHash(packageHash, secret) {
  return createHmac("sha256", String(secret || ""))
    .update(String(packageHash || ""), "utf8")
    .digest("hex");
}

/**
 * @param {string} packageHash
 * @param {string} signature
 * @param {string} secret
 */
export function verifyPackageSignature(packageHash, signature, secret) {
  const expected = signPackageHash(packageHash, secret);
  const a = Buffer.from(String(signature || ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return { ok: false, reason: "signature_mismatch" };
  }
  try {
    const match = timingSafeEqual(a, b);
    return match ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_mismatch" };
  }
}

/**
 * @typedef {{
 *   skillId: string,
 *   version: string,
 *   hash: string,
 *   signature: string|null,
 *   publisher: string,
 *   source: "local-template"|"local-import"|"dev",
 *   installedAt: string,
 *   previousHash: string|null,
 * }} SkillProvenance
 */

/**
 * Build provenance record for an install/upgrade.
 * @param {{
 *   manifest: { id: string, version: string, author?: string },
 *   hash: string,
 *   signature?: string|null,
 *   source?: SkillProvenance["source"],
 *   previousHash?: string|null,
 * }} input
 * @returns {SkillProvenance}
 */
export function buildProvenance(input) {
  return {
    skillId: String(input.manifest.id),
    version: String(input.manifest.version),
    hash: String(input.hash),
    signature: input.signature != null ? String(input.signature) : null,
    publisher: String(input.manifest.author || "unknown"),
    source: input.source || "local-import",
    installedAt: new Date().toISOString(),
    previousHash: input.previousHash != null ? String(input.previousHash) : null,
  };
}

/**
 * Verify hash matches recomputed package + optional signature.
 * @param {{
 *   pkg: { manifest: object, entrySource: string, assets?: Record<string, string> },
 *   expectedHash: string,
 *   signature?: string|null,
 *   publisherSecret?: string|null,
 * }} input
 */
export function verifyPackageIntegrity(input) {
  const actual = hashSkillPackage(input.pkg);
  if (actual !== String(input.expectedHash || "")) {
    return { ok: false, reason: "hash_mismatch", actual, expected: input.expectedHash };
  }
  if (input.signature && input.publisherSecret) {
    const sig = verifyPackageSignature(actual, input.signature, input.publisherSecret);
    if (!sig.ok) return sig;
  } else if (input.signature && !input.publisherSecret) {
    return { ok: false, reason: "missing_publisher_secret" };
  }
  return { ok: true, hash: actual };
}
