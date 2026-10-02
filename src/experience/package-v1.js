/**
 * ExperiencePackage V1 (R6) — shared envelope for scenario/adventure/scroll/cocreate.
 */
export const EXPERIENCE_KINDS = Object.freeze([
  "scenario",
  "adventure",
  "scroll",
  "cocreate",
  "yeos",
  "play_skill",
]);

export const EXPERIENCE_PACKAGE_SCHEMA_VERSION = 1;

export function createExperiencePackageV1(input = {}) {
  return {
    schemaVersion: EXPERIENCE_PACKAGE_SCHEMA_VERSION,
    experienceId: String(input.experienceId || ""),
    kind: EXPERIENCE_KINDS.includes(input.kind) ? input.kind : "scenario",
    title: String(input.title || "").trim(),
    companionId: String(input.companionId || ""),
    openings: Array.isArray(input.openings) ? input.openings : [],
    worldBook: input.worldBook && typeof input.worldBook === "object" ? input.worldBook : {},
    rules: Array.isArray(input.rules) ? input.rules : [],
    replyFormat: String(input.replyFormat || "im"),
    visualAssets: input.visualAssets && typeof input.visualAssets === "object" ? input.visualAssets : {},
    endingConditions: Array.isArray(input.endingConditions) ? input.endingConditions : [],
    realityNamespace: "shared_fiction",
  };
}

export function validateExperiencePackageV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== EXPERIENCE_PACKAGE_SCHEMA_VERSION) errors.push("schemaVersion");
  if (!String(raw.experienceId || "").trim()) errors.push("experienceId");
  if (!EXPERIENCE_KINDS.includes(raw.kind)) errors.push("kind");
  if (!String(raw.title || "").trim()) errors.push("title");
  if (raw.realityNamespace !== "shared_fiction") errors.push("must_be_shared_fiction");
  return { ok: errors.length === 0, errors };
}

export function createExperienceSessionV1(input = {}) {
  return {
    schemaVersion: 1,
    sessionId: String(input.sessionId || ""),
    experienceId: String(input.experienceId || ""),
    companionId: String(input.companionId || ""),
    state: String(input.state || "active"),
    turn: Number(input.turn) || 0,
    ending: input.ending || null,
    realityNamespace: "shared_fiction",
  };
}
