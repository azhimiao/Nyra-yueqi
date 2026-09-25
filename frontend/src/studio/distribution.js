/**
 * Phase-1 distribution: local import/export, private share, signature, version + compatibility.
 * NO payment, ads, settlement, or public catalog.
 */

import { buildCharacterPackage } from "./character-package.js";
import { normalizeWorldPackage } from "./world-studio.js";
import {
  hashStudioPackage,
  signPackageHash,
  verifyStudioPackageIntegrity,
} from "./signature.js";
import { checkStudioSdkCompatibility, checkPackageUpgradeCompatibility } from "./schema.js";

export const DISTRIBUTION_MODE = Object.freeze({
  localExport: "local-export",
  localImport: "local-import",
  privateShare: "private-share",
});

/** Explicitly out of scope for phase-1 */
export const DISTRIBUTION_OUT_OF_SCOPE = Object.freeze([
  "payment",
  "ads",
  "settlement",
  "public_catalog",
  "marketplace",
  "revenue_share",
]);

/**
 * @param {"character"|"world"} kind
 * @param {object} manifest
 * @param {Record<string, string>} [assets]
 * @param {{ publisherSecret?: string, mode?: string }} [opts]
 */
export function exportStudioPackage(kind, manifest, assets = {}, opts = {}) {
  if (DISTRIBUTION_OUT_OF_SCOPE.includes(String(opts.mode || ""))) {
    return { ok: false, reason: "distribution_mode_out_of_scope" };
  }

  let built;
  if (kind === "character") {
    built = buildCharacterPackage(manifest, { assets });
  } else if (kind === "world") {
    built = normalizeWorldPackage(manifest);
  } else {
    return { ok: false, reason: "unknown_kind" };
  }
  if (!built.ok) return built;

  const packageManifest = kind === "character" ? built.value.manifest : built.value;
  const packageAssets = kind === "character" ? built.value.assets : assets;

  const hash = hashStudioPackage({
    kind,
    manifest: packageManifest,
    assets: packageAssets,
  });
  const signature = opts.publisherSecret
    ? signPackageHash(hash, opts.publisherSecret)
    : null;

  return {
    ok: true,
    value: {
      format: "yueqi.studio.bundle.v1",
      kind,
      mode: opts.mode || DISTRIBUTION_MODE.localExport,
      version: packageManifest.version,
      compatibility: {
        minHostSdk: packageManifest.minHostSdk,
        maxHostSdk: packageManifest.maxHostSdk,
      },
      manifest: packageManifest,
      assets: packageAssets,
      hash,
      signature,
      // Phase-1: private share token is a local opaque handle — not a public listing id
      privateShareToken: opts.mode === DISTRIBUTION_MODE.privateShare
        ? `ps_${hash.slice(0, 16)}`
        : null,
      marketplace: null,
      payment: null,
    },
  };
}

/**
 * @param {object} bundle
 * @param {{ publisherSecret?: string }} [opts]
 */
export function importStudioPackage(bundle, opts = {}) {
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, reason: "bundle_not_object" };
  }
  if (bundle.format !== "yueqi.studio.bundle.v1") {
    return { ok: false, reason: "unsupported_bundle_format" };
  }
  if (bundle.marketplace || bundle.payment || bundle.publicListingId) {
    return { ok: false, reason: "public_marketplace_out_of_scope" };
  }

  const kind = bundle.kind === "world" ? "world" : bundle.kind === "character" ? "character" : null;
  if (!kind) return { ok: false, reason: "unknown_kind" };

  let built;
  if (kind === "character") {
    built = buildCharacterPackage(bundle.manifest, { assets: bundle.assets });
  } else {
    built = normalizeWorldPackage(bundle.manifest);
  }
  if (!built.ok) return built;

  const packageManifest = kind === "character" ? built.value.manifest : built.value;
  const compat = checkStudioSdkCompatibility(packageManifest);
  if (!compat.ok) return compat;

  const integrity = verifyStudioPackageIntegrity({
    kind,
    manifest: packageManifest,
    assets: bundle.assets,
    expectedHash: bundle.hash,
    signature: bundle.signature,
    publisherSecret: opts.publisherSecret || null,
  });
  if (!integrity.ok) return integrity;

  return {
    ok: true,
    value: {
      kind,
      manifest: packageManifest,
      assets: bundle.assets || {},
      hash: integrity.hash,
      signature: bundle.signature || null,
      privateShareToken: bundle.privateShareToken || null,
      mode: bundle.mode || DISTRIBUTION_MODE.localImport,
    },
  };
}

/**
 * Version + compatibility report for two package versions.
 */
export function packageCompatibilityReport(fromVersion, toVersion) {
  return checkPackageUpgradeCompatibility(fromVersion, toVersion);
}
