/**
 * Product-level cutover profiles (C1).
 *
 * Profiles replace exposing ~12 raw W/M flags to end users.
 * DEFAULT_FEATURES stay false in-repo; the profile resolver is the switch.
 *
 * Until C4–C8 release evidence is green, new installs stay on `legacy`.
 * `production_v1` / `internal_v1` remain selectable for intentional cutover.
 */

import { DEFAULT_FEATURES, LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";

export const CUTOVER_PROFILE_KEY = LOCAL_KEYS.cutoverProfileKey || "yueqi.cutover.profile.v1";
export const CUTOVER_AUTO_MIGRATION_KEY = "yueqi.cutover.auto.production-v1";

/** @typedef {"legacy" | "internal_v1" | "production_v1"} CutoverProfileName */

/** Safe default until C8 release gate passes with ALLOW_PRODUCTION_DEFAULT=1. */
export const DEFAULT_CUTOVER_PROFILE = /** @type {CutoverProfileName} */ ("legacy");

export const CUTOVER_PROFILES = /** @type {const} */ (["legacy", "internal_v1", "production_v1"]);

/**
 * Companion-intelligence (W*) + unified-memory (M*) flags for the new product path.
 * Kept in one list so profiles and verify stay aligned.
 */
export const CUTOVER_NEW_PATH_FLAGS = Object.freeze([
  "temporalContextV1",
  "turnUnderstandingV1",
  "relationshipContinuityV1",
  "palaceProjectionV1",
  "webRetrievalV1",
  "unifiedMemoryAdaptersV1",
  "diaryRepositoryV1",
  "palaceProjectionOnlyV1",
  "contextGraphProjectionOnlyV1",
  "singleBrokerRetrievalV1",
  "unifiedMemoryForgetV1",
  "memoryProjectionOutboxV1",
]);

let resolvedProfile = /** @type {CutoverProfileName | null} */ (null);

function normalizeProfile(name) {
  const raw = String(name || "").trim();
  if (CUTOVER_PROFILES.includes(/** @type {CutoverProfileName} */ (raw))) {
    return /** @type {CutoverProfileName} */ (raw);
  }
  return DEFAULT_CUTOVER_PROFILE;
}

function readStoredProfileRaw() {
  try {
    const fromObject = readLocalObject(CUTOVER_PROFILE_KEY, null);
    if (typeof fromObject === "string") return fromObject;
    if (fromObject && typeof fromObject === "object" && typeof fromObject.profile === "string") {
      return fromObject.profile;
    }
  } catch {
    /* fall through */
  }
  try {
    const raw = globalThis.localStorage?.getItem?.(CUTOVER_PROFILE_KEY);
    if (raw == null || raw === "") return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object" && typeof parsed.profile === "string") {
        return parsed.profile;
      }
    } catch {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Effective overrides for the 12 new-path flags for a profile.
 * - legacy: all false
 * - internal_v1 / production_v1: all true
 */
export function resolveEffectiveFlags(profile = getCutoverProfile()) {
  const name = normalizeProfile(profile);
  /** @type {Record<string, boolean>} */
  const out = {};
  const on = name !== "legacy";
  for (const key of CUTOVER_NEW_PATH_FLAGS) {
    out[key] = on;
  }
  return out;
}

/**
 * Merge DEFAULT_FEATURES + storage + profile.
 * - legacy: profile forces new-path flags off (rollback), other keys use storage
 * - internal_v1: profile turns new-path ON, then storage may override for diagnosis
 * - production_v1: same flag set ON; new-path keys are profile-authoritative (no storage override)
 */
export function mergeFeatureFlagsWithProfile(defaults, stored, profile) {
  const name = normalizeProfile(profile);
  const base = { ...DEFAULT_FEATURES, ...(defaults || {}) };
  const storage = stored && typeof stored === "object" ? stored : {};
  const profileFlags = resolveEffectiveFlags(name);

  if (name === "legacy") {
    return { ...base, ...storage, ...profileFlags };
  }

  if (name === "internal_v1") {
    // Profile ON, then developer storage overrides for diagnosis.
    return { ...base, ...profileFlags, ...storage };
  }

  // production_v1 — profile wins on new-path keys; storage still applies to legacy product flags.
  const merged = { ...base, ...storage, ...profileFlags };
  return merged;
}

export function getCutoverProfile() {
  if (resolvedProfile) return resolvedProfile;
  const stored = readStoredProfileRaw();
  if (stored == null) return DEFAULT_CUTOVER_PROFILE;
  return normalizeProfile(stored);
}

export function setCutoverProfile(name) {
  const profile = normalizeProfile(name);
  writeLocalObject(CUTOVER_PROFILE_KEY, profile);
  writeLocalObject(CUTOVER_AUTO_MIGRATION_KEY, {
    completed: true,
    explicit: true,
    profile,
    at: new Date().toISOString(),
  });
  resolvedProfile = profile;
  try {
    globalThis.dispatchEvent?.(new CustomEvent("yueqi:cutover-profile-changed", { detail: { profile } }));
  } catch {
    /* ignore */
  }
  return profile;
}

/**
 * Resolve and pin the cutover profile before the first prompt / chat path.
 * Missing storage → DEFAULT_CUTOVER_PROFILE (`legacy` until C8).
 * Never auto-upgrade an explicit or historical `legacy` pin to production.
 */
export function ensureCutoverProfileResolved() {
  const stored = readStoredProfileRaw();
  const migration = readLocalObject(CUTOVER_AUTO_MIGRATION_KEY, null);
  const profile = stored == null ? DEFAULT_CUTOVER_PROFILE : normalizeProfile(stored);
  if (stored == null || normalizeProfile(stored) !== profile) {
    writeLocalObject(CUTOVER_PROFILE_KEY, profile);
  }
  if (!migration?.completed) {
    writeLocalObject(CUTOVER_AUTO_MIGRATION_KEY, {
      completed: true,
      explicit: stored != null,
      from: stored == null ? "missing" : normalizeProfile(stored),
      profile,
      at: new Date().toISOString(),
    });
  }
  resolvedProfile = profile;
  return profile;
}

/** @returns {{ key: string, value: boolean, source: "default" | "profile" | "storage" }[]} */
export function describeEffectiveFlagSources(profile = getCutoverProfile(), stored = null) {
  const name = normalizeProfile(profile);
  const storage = stored && typeof stored === "object"
    ? stored
    : (readLocalObject(LOCAL_KEYS.featuresKey, {}) || {});
  const profileFlags = resolveEffectiveFlags(name);
  const effective = mergeFeatureFlagsWithProfile(DEFAULT_FEATURES, storage, name);

  return CUTOVER_NEW_PATH_FLAGS.map((key) => {
    let source = "default";
    if (name === "legacy") {
      source = "profile";
    } else if (name === "production_v1") {
      source = "profile";
    } else if (name === "internal_v1") {
      if (Object.prototype.hasOwnProperty.call(storage, key)) source = "storage";
      else if (profileFlags[key] !== DEFAULT_FEATURES[key]) source = "profile";
      else source = "default";
    }
    return { key, value: effective[key] !== false, source };
  });
}

export function paintCutoverProfileUi(root = typeof document !== "undefined" ? document : null) {
  if (!root?.querySelector) return;
  const profile = getCutoverProfile();
  root.querySelectorAll("[data-cutover-profile-select]").forEach((select) => {
    if (select instanceof HTMLSelectElement) select.value = profile;
  });
  const lines = describeEffectiveFlagSources(profile)
    .map((row) => `${row.key}=${row.value ? "on" : "off"} (${row.source})`)
    .join("\n");
  root.querySelectorAll("[data-cutover-effective-flags]").forEach((node) => {
    node.textContent = lines || "(none)";
  });
  root.querySelectorAll("[data-cutover-profile-name]").forEach((node) => {
    node.textContent = profile;
  });
}

export function wireCutoverProfileControls({
  root = typeof document !== "undefined" ? document : null,
  onChange,
} = {}) {
  if (!root?.querySelectorAll) return () => {};
  const handler = (event) => {
    const select = event.target?.closest?.("[data-cutover-profile-select]");
    if (!select || !(select instanceof HTMLSelectElement)) return;
    const next = setCutoverProfile(select.value);
    paintCutoverProfileUi(root);
    onChange?.(next);
  };
  root.querySelectorAll("[data-cutover-profile-select]").forEach((select) => {
    select.addEventListener("change", handler);
  });
  paintCutoverProfileUi(root);
  return () => {
    root.querySelectorAll("[data-cutover-profile-select]").forEach((select) => {
      select.removeEventListener("change", handler);
    });
  };
}

/** Test helper — clears in-memory pin so storage is re-read. */
export function __resetCutoverProfileCacheForTests() {
  resolvedProfile = null;
}
