/**
 * Package signature / hash for character & world packages.
 * Reuses P5 canonical JSON + HMAC local signing semantics.
 */

import {
  canonicalJson,
  hashSkillPackage,
  signPackageHash,
  verifyPackageSignature,
} from "../skills/signature.js";

export { canonicalJson, signPackageHash, verifyPackageSignature };

/**
 * Hash a studio package (character or world).
 * @param {{
 *   kind: "character"|"world",
 *   manifest: object,
 *   assets?: Record<string, string>,
 * }} pkg
 */
export function hashStudioPackage(pkg) {
  return hashSkillPackage({
    manifest: { __studioKind: pkg.kind, ...pkg.manifest },
    entrySource: "",
    assets: pkg.assets && typeof pkg.assets === "object" ? pkg.assets : {},
  });
}

/**
 * @param {{
 *   kind: "character"|"world",
 *   manifest: object,
 *   assets?: Record<string, string>,
 *   expectedHash?: string,
 *   signature?: string|null,
 *   publisherSecret?: string|null,
 * }} input
 */
export function verifyStudioPackageIntegrity(input) {
  const hash = hashStudioPackage({
    kind: input.kind,
    manifest: input.manifest,
    assets: input.assets,
  });
  if (input.expectedHash && input.expectedHash !== hash) {
    return { ok: false, reason: "hash_mismatch", hash };
  }
  if (input.signature && input.publisherSecret) {
    const sig = verifyPackageSignature(hash, input.signature, input.publisherSecret);
    if (!sig.ok) return { ...sig, hash };
  } else if (input.signature && !input.publisherSecret) {
    return { ok: false, reason: "missing_publisher_secret", hash };
  }
  return { ok: true, hash };
}

/**
 * @param {{
 *   kind: "character"|"world",
 *   manifest: { id: string, version: string, author?: string },
 *   hash: string,
 *   signature?: string|null,
 *   source?: "local-template"|"local-import"|"private-share"|"dev",
 *   previousHash?: string|null,
 * }} input
 */
export function buildStudioProvenance(input) {
  return {
    kind: input.kind,
    packageId: String(input.manifest.id),
    version: String(input.manifest.version),
    hash: String(input.hash),
    signature: input.signature || null,
    publisher: String(input.manifest.author || "local"),
    source: input.source || "local-import",
    installedAt: new Date().toISOString(),
    previousHash: input.previousHash || null,
  };
}
