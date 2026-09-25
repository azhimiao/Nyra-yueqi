/**
 * First Light persistence + state machine.
 * Deterministic flow; model only optional for preview polish.
 */

export const FIRST_LIGHT_KEY = "yueqi.firstLight.v1";
export const FIRST_LIGHT_CHANGED = "yueqi:first-light-changed";

export const FL_STAGES = Object.freeze([
  "BOOT",
  "WELCOME",
  "ENTRY_MODE",
  "PURPOSE",
  "RELATIONSHIP_TYPE",
  "RELATIONSHIP_START",
  "SHARED_HISTORY",
  "STYLE_SUPPORT",
  "STYLE_INITIATIVE",
  "STYLE_CONFLICT",
  "STYLE_INTIMACY",
  "STYLE_AUTONOMY",
  "LIVE_PREVIEW",
  "BOUNDARIES_CORE",
  "BOUNDARIES_ADVANCED",
  "APPEARANCE_OPTIONAL",
  "DRAFT_REVIEW",
  "COMMITTING",
  "FIRST_REAL_MESSAGE",
  "COMPLETED",
  "PAUSED",
  "ERROR_RECOVERABLE",
]);

export const FL_TRACK = Object.freeze([
  { id: "meet", label: "相遇", stages: ["BOOT", "WELCOME", "ENTRY_MODE", "PURPOSE"] },
  { id: "bond", label: "关系", stages: ["RELATIONSHIP_TYPE", "RELATIONSHIP_START", "SHARED_HISTORY"] },
  { id: "temper", label: "性格", stages: ["STYLE_SUPPORT", "STYLE_INITIATIVE", "STYLE_CONFLICT", "STYLE_INTIMACY", "STYLE_AUTONOMY", "LIVE_PREVIEW"] },
  { id: "edge", label: "边界", stages: ["BOUNDARIES_CORE", "BOUNDARIES_ADVANCED", "APPEARANCE_OPTIONAL"] },
  { id: "begin", label: "开始", stages: ["DRAFT_REVIEW", "COMMITTING", "FIRST_REAL_MESSAGE", "COMPLETED"] },
]);

export const PURPOSE_MAX = 3;
export const PURPOSE_UNSURE = "unsure";
export const ORDINARY_PURPOSES = Object.freeze([
  "daily",
  "romance",
  "listen",
  "grow",
  "create",
  "roleplay",
  "assist",
]);
export const RELATIONSHIP_TYPE_IDS = Object.freeze([
  "lover",
  "friend",
  "family",
  "partner",
  "roleplay",
  "undefined",
  "custom",
]);
export const CUSTOM_RELATIONSHIP_MAX = 80;
export const STYLE_FIELD_BY_STAGE = Object.freeze({
  STYLE_SUPPORT: "supportStyle",
  STYLE_INITIATIVE: "initiativeStyle",
  STYLE_CONFLICT: "conflictStyle",
  STYLE_INTIMACY: "intimacyStyle",
  STYLE_AUTONOMY: "autonomyPreference",
});

/** @type {null | object} */
let testBag = null;

export function __setFirstLightBagForTests(bag) {
  testBag = bag && typeof bag === "object" ? bag : null;
}

export function __clearFirstLightForTests() {
  testBag = null;
  try {
    localStorage?.removeItem(FIRST_LIGHT_KEY);
  } catch {
    /* ignore */
  }
}

function storageGet() {
  if (testBag) return testBag;
  try {
    return JSON.parse(localStorage.getItem(FIRST_LIGHT_KEY) || "null");
  } catch {
    return null;
  }
}

function storageSet(bag) {
  if (testBag) {
    Object.keys(testBag).forEach((k) => delete testBag[k]);
    Object.assign(testBag, bag);
    return;
  }
  try {
    localStorage.setItem(FIRST_LIGHT_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

export function createEmptyDraft() {
  return {
    entryMode: "", // quick | careful | import | skip
    purposes: [],
    relationshipType: "", // lover | friend | family | partner | roleplay | undefined | custom
    relationshipStart: "", // now | long | slow | scenario
    sharedHistory: "",
    customRelationLabel: "",
    customRelationshipText: "",
    supportStyle: "",
    initiativeStyle: "",
    conflictStyle: "",
    intimacyStyle: "",
    autonomyPreference: "",
    previewTone: "balanced",
    previewFeedback: "",
    allowProactive: true,
    allowJealousy: false,
    allowNudge: false,
    quietNight: true,
    autoDiary: false,
    autoMoments: false,
    name: "",
    appearanceDeferred: true,
  };
}

export function createDefaultFirstLightState() {
  return {
    schemaVersion: 1,
    done: false,
    paused: false,
    stage: "WELCOME",
    entryPath: "careful", // quick | careful
    draft: createEmptyDraft(),
    previewLines: [],
    /** Pack locale id last used to build previewLines: zh-CN | en */
    previewLinesLocale: "",
    errorMessage: "",
    updatedAt: "",
    committedCharacterId: "",
    migratedFromLegacy: false,
    deferredFromMandatoryOnboarding: false,
    resumeStage: "",
  };
}

export function normalizeFirstLightState(raw = {}) {
  const base = createDefaultFirstLightState();
  const draft = { ...createEmptyDraft(), ...(raw.draft && typeof raw.draft === "object" ? raw.draft : {}) };
  const purposeIds = Array.isArray(draft.purposes) ? draft.purposes.map(String) : [];
  if (purposeIds.includes(PURPOSE_UNSURE)) {
    draft.purposes = [PURPOSE_UNSURE];
  } else {
    const seen = new Set();
    draft.purposes = purposeIds.filter((id) => {
      if (!ORDINARY_PURPOSES.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, PURPOSE_MAX);
  }
  const customText = String(draft.customRelationshipText || draft.customRelationLabel || "")
    .slice(0, CUSTOM_RELATIONSHIP_MAX);
  draft.customRelationshipText = customText;
  draft.customRelationLabel = customText;
  const stage = FL_STAGES.includes(raw.stage) ? raw.stage : "WELCOME";
  return {
    ...base,
    ...raw,
    schemaVersion: 1,
    done: Boolean(raw.done),
    paused: Boolean(raw.paused),
    stage,
    entryPath: raw.entryPath === "quick" ? "quick" : "careful",
    draft,
    previewLines: Array.isArray(raw.previewLines) ? raw.previewLines.map(String).slice(0, 6) : [],
    previewLinesLocale: raw.previewLinesLocale === "en" ? "en" : (raw.previewLinesLocale === "zh-CN" ? "zh-CN" : ""),
    errorMessage: String(raw.errorMessage || "").slice(0, 200),
    updatedAt: String(raw.updatedAt || ""),
    committedCharacterId: String(raw.committedCharacterId || ""),
    migratedFromLegacy: Boolean(raw.migratedFromLegacy),
    deferredFromMandatoryOnboarding: Boolean(raw.deferredFromMandatoryOnboarding),
    resumeStage: FL_STAGES.includes(raw.resumeStage) ? raw.resumeStage : "",
  };
}

export function loadFirstLightState() {
  const raw = storageGet();
  if (!raw || typeof raw !== "object") return createDefaultFirstLightState();
  return normalizeFirstLightState(raw);
}

export function saveFirstLightState(patch = {}) {
  const cur = loadFirstLightState();
  const merged = normalizeFirstLightState({
    ...cur,
    ...patch,
    draft: { ...cur.draft, ...(patch.draft || {}) },
    updatedAt: new Date().toISOString(),
  });
  storageSet(merged);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIRST_LIGHT_CHANGED, { detail: merged }));
  }
  return merged;
}

/**
 * Legacy users who already lived with a companion before  must not be
 * pulled back into First Light. Everyone else runs it after the product gate,
 * and an already-started draft is preserved so it can be finished deliberately.
 * @param {{ hasProductOnboardingDone: boolean, hasPriorCompanionUse?: boolean }} opts
 */
export function ensureFirstLightMigration({ hasProductOnboardingDone, hasPriorCompanionUse = false }) {
  const state = loadFirstLightState();
  if (state.done) {
    // Repairs installs auto-completed by the old deferral branch, which skipped
    // First Light for brand-new users the moment the product gate finished.
    const autoDeferred = state.deferredFromMandatoryOnboarding
      && !state.migratedFromLegacy
      && !state.committedCharacterId
      && !hasPriorCompanionUse;
    if (autoDeferred) {
      return saveFirstLightState({
        done: false,
        paused: false,
        stage: "WELCOME",
        deferredFromMandatoryOnboarding: false,
      });
    }
    return state;
  }
  if (state.updatedAt || state.draft?.relationshipType || state.draft?.entryMode) {
    return state; // in progress
  }
  if (hasProductOnboardingDone && hasPriorCompanionUse) {
    return saveFirstLightState({
      done: true,
      stage: "COMPLETED",
      migratedFromLegacy: true,
      deferredFromMandatoryOnboarding: false,
    });
  }
  return state;
}

export function hasFirstLightDone() {
  return loadFirstLightState().done === true;
}

export function markFirstLightDone(extra = {}) {
  return saveFirstLightState({
    done: true,
    paused: false,
    stage: "COMPLETED",
    ...extra,
  });
}

export function resetFirstLight() {
  const fresh = createDefaultFirstLightState();
  storageSet(fresh);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FIRST_LIGHT_CHANGED, { detail: fresh }));
  }
  return fresh;
}

export function pauseFirstLight() {
  const cur = loadFirstLightState();
  const resumeStage = cur.stage === "PAUSED" ? "WELCOME" : cur.stage;
  return saveFirstLightState({
    paused: true,
    stage: "PAUSED",
    resumeStage,
  });
}

export function trackIndexForStage(stage) {
  const idx = FL_TRACK.findIndex((t) => t.stages.includes(stage));
  return idx < 0 ? 0 : idx;
}

/**
 * Next stage given entry path and draft.
 * @param {string} stage
 * @param {ReturnType<typeof createDefaultFirstLightState>} state
 */
export function nextStage(stage, state) {
  const quick = state.entryPath === "quick";
  const draft = state.draft || {};
  const map = {
    BOOT: "WELCOME",
    WELCOME: "ENTRY_MODE",
    ENTRY_MODE: draft.entryMode === "skip"
      ? "DRAFT_REVIEW"
      : draft.entryMode === "import"
        ? "DRAFT_REVIEW"
        : "PURPOSE",
    PURPOSE: "RELATIONSHIP_TYPE",
    RELATIONSHIP_TYPE: draft.relationshipType === "lover" || draft.relationshipType === "roleplay"
      ? "RELATIONSHIP_START"
      : (quick ? "STYLE_INTIMACY" : "STYLE_SUPPORT"),
    RELATIONSHIP_START: draft.relationshipStart === "long"
      ? "SHARED_HISTORY"
      : (quick ? "STYLE_INTIMACY" : "STYLE_SUPPORT"),
    SHARED_HISTORY: quick ? "STYLE_INTIMACY" : "STYLE_SUPPORT",
    STYLE_SUPPORT: "STYLE_INITIATIVE",
    STYLE_INITIATIVE: "STYLE_CONFLICT",
    STYLE_CONFLICT: "STYLE_INTIMACY",
    STYLE_INTIMACY: quick ? "BOUNDARIES_CORE" : "STYLE_AUTONOMY",
    STYLE_AUTONOMY: "LIVE_PREVIEW",
    LIVE_PREVIEW: "BOUNDARIES_CORE",
    BOUNDARIES_CORE: "APPEARANCE_OPTIONAL",
    BOUNDARIES_ADVANCED: "APPEARANCE_OPTIONAL",
    APPEARANCE_OPTIONAL: "DRAFT_REVIEW",
    DRAFT_REVIEW: "COMMITTING",
    COMMITTING: "FIRST_REAL_MESSAGE",
    FIRST_REAL_MESSAGE: "COMPLETED",
    PAUSED: state.stage === "PAUSED" ? "WELCOME" : stage,
    ERROR_RECOVERABLE: "DRAFT_REVIEW",
  };
  return map[stage] || "DRAFT_REVIEW";
}

/**
 * @param {string} stage
 * @param {ReturnType<typeof createDefaultFirstLightState>} state
 */
export function prevStage(stage, state) {
  const quick = state.entryPath === "quick";
  const draft = state.draft || {};
  const map = {
    ENTRY_MODE: "WELCOME",
    PURPOSE: "ENTRY_MODE",
    RELATIONSHIP_TYPE: "PURPOSE",
    RELATIONSHIP_START: "RELATIONSHIP_TYPE",
    SHARED_HISTORY: "RELATIONSHIP_START",
    STYLE_SUPPORT: draft.relationshipStart === "long"
      ? "SHARED_HISTORY"
      : (draft.relationshipType === "lover" || draft.relationshipType === "roleplay"
        ? "RELATIONSHIP_START"
        : "RELATIONSHIP_TYPE"),
    STYLE_INITIATIVE: "STYLE_SUPPORT",
    STYLE_CONFLICT: "STYLE_INITIATIVE",
    STYLE_INTIMACY: quick
      ? (draft.relationshipStart === "long"
        ? "SHARED_HISTORY"
        : (draft.relationshipType === "lover" || draft.relationshipType === "roleplay"
          ? "RELATIONSHIP_START"
          : "RELATIONSHIP_TYPE"))
      : "STYLE_CONFLICT",
    STYLE_AUTONOMY: "STYLE_INTIMACY",
    LIVE_PREVIEW: "STYLE_AUTONOMY",
    BOUNDARIES_CORE: quick ? "STYLE_INTIMACY" : "LIVE_PREVIEW",
    BOUNDARIES_ADVANCED: "BOUNDARIES_CORE",
    APPEARANCE_OPTIONAL: "BOUNDARIES_CORE",
    DRAFT_REVIEW: "APPEARANCE_OPTIONAL",
  };
  return map[stage] || "WELCOME";
}
