/**
 * Companion V2 cutover names. Does not change the product default (legacy).
 * Rollback only switches the read/execute path; V2 records stay.
 */

export const COMPANION_V2_PROFILES = Object.freeze(["internal_v2", "production_v2"]);

export function isCompanionV2Profile(name) {
  return COMPANION_V2_PROFILES.includes(String(name || ""));
}

export function rollbackCompanionV2(setProfile) {
  const next = typeof setProfile === "function" ? setProfile("legacy") : "legacy";
  return { profile: next, dataDeleted: false };
}
