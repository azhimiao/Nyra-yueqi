/**
 * Experience package hash / signature — mirrors skills/signature patterns (local HMAC).
 * Node-oriented; used by package-io export integrity + verify scripts.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson, signPackageHash, verifyPackageSignature } from "../skills/signature.js";

export { canonicalJson, signPackageHash, verifyPackageSignature };

/**
 * Stable payload for hashing — excludes signature envelope fields.
 * @param {object} pkg
 */
export function experiencePackageHashPayload(pkg) {
  if (!pkg || typeof pkg !== "object") return {};
  const {
    signature: _sig,
    packageHash: _hash,
    exportMeta: _meta,
    ...rest
  } = pkg;
  return rest;
}

/**
 * SHA-256 hex of canonical package body.
 * @param {object} pkg
 */
export function hashExperiencePackage(pkg) {
  const payload = canonicalJson(experiencePackageHashPayload(pkg));
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * @param {object} pkg
 * @param {string} secret
 */
export function signExperiencePackage(pkg, secret) {
  const hash = hashExperiencePackage(pkg);
  return {
    hash,
    signature: signPackageHash(hash, secret),
  };
}

/**
 * @param {object} pkg
 * @param {{
 *   expectedHash?: string,
 *   signature?: string|null,
 *   publisherSecret?: string|null,
 * }} [opts]
 */
export function verifyExperiencePackageIntegrity(pkg, opts = {}) {
  const actual = hashExperiencePackage(pkg);
  if (opts.expectedHash && actual !== String(opts.expectedHash)) {
    return { ok: false, reason: "hash_mismatch", actual, expected: opts.expectedHash };
  }
  if (opts.signature && opts.publisherSecret) {
    const sig = verifyPackageSignature(actual, opts.signature, opts.publisherSecret);
    if (!sig.ok) return { ...sig, hash: actual };
  } else if (opts.signature && !opts.publisherSecret) {
    return { ok: false, reason: "missing_publisher_secret", hash: actual };
  }
  return { ok: true, hash: actual };
}

/**
 * Constant-time compare for exported digests (tests / IO).
 * @param {string} a
 * @param {string} b
 */
export function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export { createHmac };
