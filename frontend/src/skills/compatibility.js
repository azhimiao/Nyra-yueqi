/**
 * Skill package compatibility rules vs host SDK.
 */

import {
  SKILL_SDK_MAX_SUPPORTED,
  SKILL_SDK_MIN_SUPPORTED,
  SKILL_SDK_VERSION,
  compareSemver,
  parseSemver,
} from "./schema.js";

/**
 * Host ↔ package SDK version window.
 * @param {{ minHostSdk?: number, maxHostSdk?: number, sdkVersion: number }} manifest
 * @param {{ hostSdkVersion?: number }} [opts]
 */
export function checkSdkCompatibility(manifest, opts = {}) {
  const host = opts.hostSdkVersion ?? SKILL_SDK_VERSION;
  if (host < SKILL_SDK_MIN_SUPPORTED || host > SKILL_SDK_MAX_SUPPORTED) {
    return { ok: false, reason: "host_sdk_unsupported", host };
  }
  const min = Number(manifest.minHostSdk ?? manifest.sdkVersion);
  const max = Number(manifest.maxHostSdk ?? manifest.sdkVersion);
  if (host < min || host > max) {
    return {
      ok: false,
      reason: "sdk_version_incompatible",
      host,
      packageWindow: { min, max },
    };
  }
  if (manifest.sdkVersion < SKILL_SDK_MIN_SUPPORTED
    || manifest.sdkVersion > SKILL_SDK_MAX_SUPPORTED) {
    return { ok: false, reason: "package_sdk_unknown", packageSdk: manifest.sdkVersion };
  }
  return { ok: true, host, packageSdk: manifest.sdkVersion };
}

/**
 * Upgrade path: same major, new ≥ old; or explicit major bump with rollback support.
 * @param {string} fromVersion
 * @param {string} toVersion
 */
export function checkUpgradeCompatibility(fromVersion, toVersion) {
  const from = parseSemver(fromVersion);
  const to = parseSemver(toVersion);
  if (!from || !to) return { ok: false, reason: "invalid_semver" };
  const cmp = compareSemver(fromVersion, toVersion);
  if (Number.isNaN(cmp)) return { ok: false, reason: "invalid_semver" };
  if (cmp === 0) return { ok: true, kind: "same", requiresRollbackSlot: false };
  if (cmp > 0) {
    return { ok: false, reason: "downgrade_not_upgrade", hint: "use_rollback" };
  }
  if (to.major !== from.major) {
    return {
      ok: true,
      kind: "major",
      requiresRollbackSlot: true,
      warning: "major_bump_requires_rollback_snapshot",
    };
  }
  return {
    ok: true,
    kind: to.minor !== from.minor ? "minor" : "patch",
    requiresRollbackSlot: true,
  };
}

/**
 * Whether a capability id declared by a skill may bind into agent registry.
 * Third-party skills cannot shadow first-party P1/P4 ids.
 * @param {string} capabilityId
 * @param {Iterable<string>} reservedIds
 */
export function canBindCapability(capabilityId, reservedIds) {
  const id = String(capabilityId || "");
  for (const r of reservedIds) {
    if (r === id) return { ok: false, reason: "reserved_capability_id", id };
  }
  return { ok: true, id };
}
