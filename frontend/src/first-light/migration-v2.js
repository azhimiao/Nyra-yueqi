/** Idempotent read-only migration of legacy First Light structural choices. */

import { getAllRecords } from "../storage/db.js";
import { createExplicitValue } from "../contracts/companion-v2-shared.js";
import { commitFirstLightV2 } from "./commit-v2.js";
import { createEmptyDraftV2 } from "./state-v2.js";

const V1_KEY = "yueqi.firstLight.v1";
const V1_PREFS_KEY = "yueqi.firstLight.companionPrefs.v1";

function readJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function slot(value, source = "explicit") {
  return createExplicitValue(value, source);
}

function copyIfPresent(draft, path, value, source = "explicit") {
  if (value === undefined || value === null || value === "") return;
  const [domain, key] = path.split(".");
  if (!draft[domain]) draft[domain] = {};
  draft[domain][key] = slot(value, source);
}

export async function migrateFirstLightV1Preference(characterId, existingCharacter) {
  const id = String(characterId || "").trim();
  if (!id) return { ok: false, reason: "missing_character_id" };
  const rows = await getAllRecords("preferences").catch(() => []);
  const existing = rows.find((row) => row?.characterId === id && row?.userId === "local");
  if (existing) return { ok: true, migrated: false, preference: existing };

  const state = readJson(V1_KEY, {});
  const draft = createEmptyDraftV2();
  const legacyDraft = state?.draft || {};
  const structural = readJson(V1_PREFS_KEY, {})?.byCharacter?.[id] || {};
  const boundaries = structural.hardBoundaries || {};

  // v1 did not ask for a user name. Keep the slot skipped; never borrow the
  // character alias as a callUserAs value.
  draft.preference.callUserAs = slot("", "skipped");
  draft.preference.userPronouns = slot([], "skipped");
  draft.preference.values = slot([], "skipped");
  copyIfPresent(draft, "preference.relationshipType", legacyDraft.relationshipType || structural.relationshipType);
  copyIfPresent(draft, "preference.relationshipStart", legacyDraft.relationshipStart || structural.relationshipStart);
  copyIfPresent(draft, "preference.sharedHistory", legacyDraft.sharedHistory || structural.sharedHistory || structural.customRelationshipText);
  copyIfPresent(draft, "preference.purposes", legacyDraft.purposes || structural.purposes);
  copyIfPresent(draft, "preference.supportStyle", legacyDraft.supportStyle || structural.supportStyle);
  copyIfPresent(draft, "preference.initiativeStyle", legacyDraft.initiativeStyle || structural.initiativeStyle);
  copyIfPresent(draft, "preference.conflictStyle", legacyDraft.conflictStyle || structural.conflictStyle);
  copyIfPresent(draft, "preference.intimacyStyle", legacyDraft.intimacyStyle || structural.intimacyStyle);
  copyIfPresent(draft, "preference.autonomyPreference", legacyDraft.autonomyPreference || structural.autonomyPreference);
  copyIfPresent(draft, "preference.nudgePolicy", legacyDraft.allowNudge === true ? "gentle" : structural.allowNudge === true ? "gentle" : "off");
  copyIfPresent(draft, "preference.allowProactive", boundaries.allowProactive ?? legacyDraft.allowProactive, "explicit");
  copyIfPresent(draft, "preference.allowJealousy", boundaries.allowJealousy ?? legacyDraft.allowJealousy, "explicit");
  copyIfPresent(draft, "preference.quietHours", boundaries.quietNight === false
    ? { start: "23:30", end: "08:00" }
    : { start: "22:00", end: "08:00" }, "explicit");
  copyIfPresent(draft, "preference.hardBoundaries", [] , "skipped");
  copyIfPresent(draft, "preference.autoDiary", boundaries.autoDiary ?? legacyDraft.autoDiary ?? false, "explicit");
  copyIfPresent(draft, "preference.autoMoments", boundaries.autoMoments ?? legacyDraft.autoMoments ?? false, "explicit");

  const result = await commitFirstLightV2({
    schemaVersion: 2,
    stage: "COMMIT",
    path: "quick",
    draft,
  }, { characterId: id, existingCharacter });
  return { ...result, migrated: Boolean(result.ok) };
}

// Compatibility helpers for the existing offline CharacterProfileV2 migration
// gate. They remain pure and do not enable the production cutover.
export function dryRunCompanionV2Migration(payload = {}) {
  const characters = Array.isArray(payload.characters) ? payload.characters : [];
  return {
    schemaVersion: 1,
    permissionsEnabled: false,
    reports: characters.map((character) => ({
      characterId: String(character?.id || ""),
      customPromptPreserved: Boolean(character?.profile?.promptSystem || character?.profile?.promptDeveloper),
    })),
  };
}

export function applyCompanionV2Migration(payload = {}, prior = null) {
  if (prior?.migrationKey === "companion-v2") {
    return { ...prior, duplicate: true };
  }
  const next = {
    ...payload,
    migrationKey: "companion-v2",
    permissionsEnabled: false,
    reports: dryRunCompanionV2Migration(payload).reports,
    duplicate: false,
  };
  return next;
}
