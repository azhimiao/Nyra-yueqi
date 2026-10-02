/**
 * First Light controller — deterministic state machine + optional preview polish.
 */

import { getFirstLightCopy } from "./copy.js";
import { commitFirstLightDraft } from "./commit.js";
import { getLocale } from "../i18n/index.js";
import { toPackLocale } from "../i18n/language-prefs.js";
import { buildPreviewLines, polishPreviewLines } from "./preview.js";
import {
  CUSTOM_RELATIONSHIP_MAX,
  ORDINARY_PURPOSES,
  PURPOSE_MAX,
  PURPOSE_UNSURE,
  RELATIONSHIP_TYPE_IDS,
  STYLE_FIELD_BY_STAGE,
  loadFirstLightState,
  nextStage,
  pauseFirstLight,
  prevStage,
  resetFirstLight,
  saveFirstLightState,
} from "./state.js";

export {
  CUSTOM_RELATIONSHIP_MAX,
  ORDINARY_PURPOSES,
  PURPOSE_MAX,
  PURPOSE_UNSURE,
  RELATIONSHIP_TYPE_IDS,
  STYLE_FIELD_BY_STAGE,
};

function patchDraft(partial) {
  return saveFirstLightState({ draft: partial });
}

function go(stage, extra = {}) {
  return saveFirstLightState({ stage, paused: false, ...extra });
}

function switchedFeedback(label, locale = getLocale()) {
  const copy = getFirstLightCopy(locale);
  const template = copy.preview?.switched || "已切换：{label}";
  return String(template).replace("{label}", String(label || "").trim());
}

function packLocale(locale = getLocale()) {
  return toPackLocale(locale);
}

export function advanceFrom(state = loadFirstLightState()) {
  const next = nextStage(state.stage, state);
  return go(next);
}

export function goBack(state = loadFirstLightState()) {
  const prev = prevStage(state.stage, state);
  return go(prev);
}

const ENTRY_MODES = ["careful", "quick", "import", "skip"];

export function selectEntryMode(mode) {
  const id = String(mode || "").trim();
  if (!ENTRY_MODES.includes(id)) return loadFirstLightState();
  return saveFirstLightState({
    stage: "ENTRY_MODE",
    draft: { entryMode: id },
  });
}

export function canConfirmEntryMode(draft = loadFirstLightState().draft) {
  return ENTRY_MODES.includes(String(draft?.entryMode || ""));
}

export function confirmEntryMode() {
  const current = loadFirstLightState();
  const mode = String(current.draft?.entryMode || "");
  if (!ENTRY_MODES.includes(mode)) return current;
  const entryPath = mode === "quick" ? "quick" : "careful";
  const draft = { ...current.draft, entryMode: mode };
  if (mode === "skip") {
    Object.assign(draft, {
      purposes: ["unsure"],
      relationshipType: "undefined",
      intimacyStyle: "easy",
      supportStyle: "judge",
      initiativeStyle: "occasional",
      conflictStyle: "gentle",
      autonomyPreference: "balanced",
      allowProactive: true,
    });
  }
  const state = saveFirstLightState({
    entryPath: mode === "skip" || mode === "import" ? "quick" : entryPath,
    draft,
    stage: "ENTRY_MODE",
  });
  if (mode === "import" || mode === "skip") {
    return go("DRAFT_REVIEW");
  }
  return go(nextStage("ENTRY_MODE", state));
}

/** Combined select + confirm. Tests and resume shortcuts keep this. */
export function chooseEntryMode(mode) {
  selectEntryMode(mode);
  return confirmEntryMode();
}

/**
 * Pure purpose toggle. Does not advance.
 * Ordinary ids toggle on/off, max 3; unsure is exclusive.
 * @returns {{ purposes: string[], result: "ok"|"limit_reached"|"unchanged" }}
 */
export function applyPurposeToggle(purposes = [], id) {
  const current = Array.isArray(purposes) ? purposes.map(String) : [];
  const key = String(id || "").trim();
  if (!key) return { purposes: current, result: "unchanged" };

  if (key === PURPOSE_UNSURE) {
    if (current.length === 1 && current[0] === PURPOSE_UNSURE) {
      return { purposes: [], result: "ok" };
    }
    return { purposes: [PURPOSE_UNSURE], result: "ok" };
  }

  if (!ORDINARY_PURPOSES.includes(key)) {
    return { purposes: current, result: "unchanged" };
  }

  const ordinary = current.filter((item) => item !== PURPOSE_UNSURE);
  if (ordinary.includes(key)) {
    return { purposes: ordinary.filter((item) => item !== key), result: "ok" };
  }
  if (ordinary.length >= PURPOSE_MAX) {
    return { purposes: ordinary, result: "limit_reached" };
  }
  return { purposes: [...ordinary, key], result: "ok" };
}

export function togglePurpose(id) {
  const state = loadFirstLightState();
  const { purposes, result } = applyPurposeToggle(state.draft.purposes, id);
  const next = patchDraft({ purposes });
  next.purposeToggleResult = result;
  return next;
}

export function confirmPurposes() {
  const state = loadFirstLightState();
  if (!(state.draft.purposes || []).length) {
    const blocked = { ...state, purposeConfirmResult: "empty" };
    return blocked;
  }
  const next = advanceFrom(state);
  next.purposeConfirmResult = "ok";
  return next;
}

export function selectRelationshipType(id) {
  const key = String(id || "");
  if (!RELATIONSHIP_TYPE_IDS.includes(key)) return loadFirstLightState();
  const state = loadFirstLightState();
  if (state.draft.relationshipType === key) return state;
  return patchDraft({ relationshipType: key });
}

/** @deprecated Use selectRelationshipType + confirmRelationshipType. Select only. */
export function chooseRelationshipType(id) {
  return selectRelationshipType(id);
}

export function setCustomRelationshipText(text) {
  const next = String(text || "").slice(0, CUSTOM_RELATIONSHIP_MAX);
  return patchDraft({
    customRelationshipText: next,
    customRelationLabel: next,
  });
}

export function canConfirmRelationshipType(draft = loadFirstLightState().draft) {
  const type = String(draft?.relationshipType || "");
  if (!RELATIONSHIP_TYPE_IDS.includes(type)) return false;
  if (type === "custom") return Boolean(String(draft.customRelationshipText || "").trim());
  return true;
}

export function confirmRelationshipType() {
  const state = loadFirstLightState();
  if (!canConfirmRelationshipType(state.draft)) {
    return { ...state, relationshipConfirmResult: "blocked" };
  }
  if (state.draft.relationshipType === "custom") {
    const trimmed = String(state.draft.customRelationshipText || "").trim();
    patchDraft({
      customRelationshipText: trimmed,
      customRelationLabel: trimmed,
    });
  }
  const next = advanceFrom(loadFirstLightState());
  next.relationshipConfirmResult = "ok";
  return next;
}

export function selectRelationshipStart(id) {
  const key = String(id || "");
  const allowed = ["now", "long", "slow", "scenario"];
  if (!allowed.includes(key)) return loadFirstLightState();
  const state = loadFirstLightState();
  if (state.draft.relationshipStart === key) return state;
  return patchDraft({ relationshipStart: key });
}

/** @deprecated Use selectRelationshipStart + confirmRelationshipStart. Select only. */
export function chooseRelationshipStart(id) {
  return selectRelationshipStart(id);
}

export function confirmRelationshipStart() {
  const state = loadFirstLightState();
  if (!state.draft.relationshipStart) {
    return { ...state, relationshipStartConfirmResult: "blocked" };
  }
  const next = advanceFrom(state);
  next.relationshipStartConfirmResult = "ok";
  return next;
}

export function setSharedHistory(text) {
  return patchDraft({ sharedHistory: String(text || "").slice(0, 280) });
}

export function confirmSharedHistory() {
  return advanceFrom(loadFirstLightState());
}

export function selectStyle(field, id) {
  const key = String(field || "");
  const value = String(id || "");
  if (!key || !value) return loadFirstLightState();
  const state = loadFirstLightState();
  if (state.draft[key] === value) return state;
  return patchDraft({ [key]: value });
}

/** @deprecated Use selectStyle + confirmStyle. Select only. */
export function chooseStyle(field, id) {
  return selectStyle(field, id);
}

/** Set style without advancing (e.g. before live preview). */
export function setStyleField(field, id) {
  return selectStyle(field, id);
}

export function canConfirmStyle(stage = loadFirstLightState().stage, draft = loadFirstLightState().draft) {
  const field = STYLE_FIELD_BY_STAGE[stage];
  if (!field) return false;
  return Boolean(draft?.[field]);
}

export function confirmStyle() {
  const state = loadFirstLightState();
  if (!canConfirmStyle(state.stage, state.draft)) {
    return { ...state, styleConfirmResult: "blocked" };
  }
  const next = advanceFrom(state);
  next.styleConfirmResult = "ok";
  return next;
}

export async function enterLivePreview(deps = {}) {
  const state = loadFirstLightState();
  const draft = state.draft;
  const locale = deps.locale || getLocale();
  const polished = await polishPreviewLines(draft, { ...deps, locale });
  return go("LIVE_PREVIEW", {
    previewLines: polished.lines,
    previewLinesLocale: packLocale(locale),
    errorMessage: polished.notice || "",
    draft: { previewFeedback: "" },
  });
}

/**
 * Rebuild LIVE_PREVIEW bubble + feedback for the current UI language.
 * Call after locale switch so stored Chinese/English lines don't linger.
 */
export function refreshLivePreviewLocale(locale = getLocale()) {
  const state = loadFirstLightState();
  if (state.stage !== "LIVE_PREVIEW") return state;
  const tone = state.draft?.previewTone || "balanced";
  const copy = getFirstLightCopy(locale);
  const lines = buildPreviewLines(state.draft, tone, locale);
  const hadFeedback = Boolean(String(state.draft?.previewFeedback || "").trim());
  const label = copy.preview?.adjust?.[tone] || tone;
  return saveFirstLightState({
    previewLines: lines,
    previewLinesLocale: packLocale(locale),
    errorMessage: "",
    draft: {
      previewFeedback: hadFeedback && tone !== "balanced" ? switchedFeedback(label, locale) : "",
    },
  });
}

/** If preview text was built in another language, rebuild for the current one. */
export function ensureLivePreviewLocale(locale = getLocale()) {
  const state = loadFirstLightState();
  if (state.stage !== "LIVE_PREVIEW") return state;
  if (state.previewLinesLocale === packLocale(locale) && Array.isArray(state.previewLines) && state.previewLines.length) {
    return state;
  }
  return refreshLivePreviewLocale(locale);
}

export function adjustPreviewTone(tone) {
  const nextTone = String(tone || "").trim() || "balanced";
  const locale = getLocale();
  const copy = getFirstLightCopy(locale);
  const label = copy.preview?.adjust?.[nextTone] || nextTone;
  const feedback = switchedFeedback(label, locale);

  if (nextTone === "good") {
    const state = loadFirstLightState();
    const lines = buildPreviewLines(state.draft, state.draft.previewTone || "balanced", locale);
    return advanceFrom(saveFirstLightState({
      previewLines: lines,
      previewLinesLocale: packLocale(locale),
      errorMessage: "",
      draft: { previewFeedback: "" },
    }));
  }

  // Always replace polished/LLM lines with the chosen tone template so the bubble visibly changes.
  const state = patchDraft({
    previewTone: nextTone,
    previewFeedback: feedback,
  });
  const lines = buildPreviewLines(state.draft, nextTone, locale);
  return saveFirstLightState({
    previewLines: lines,
    previewLinesLocale: packLocale(locale),
    errorMessage: "",
    draft: {
      previewTone: nextTone,
      previewFeedback: feedback,
    },
  });
}

export function setBoundary(key, value) {
  return patchDraft({ [key]: Boolean(value) });
}

export function openAdvancedBoundaries() {
  return go("BOUNDARIES_ADVANCED");
}

export function confirmBoundariesCore() {
  return advanceFrom(loadFirstLightState());
}

export function setAppearance({ name, deferred } = {}) {
  return patchDraft({
    name: name != null ? String(name).slice(0, 40) : loadFirstLightState().draft.name,
    appearanceDeferred: deferred !== false,
  });
}

export function confirmAppearance() {
  return advanceFrom(loadFirstLightState());
}

export function backToAdjust() {
  return go("BOUNDARIES_CORE");
}

/**
 * @param {{ onCommitted?: (result: object) => void, onError?: (result: object) => void }} [hooks]
 */
export async function confirmAndCommit(hooks = {}) {
  const state = loadFirstLightState();
  if (state.done && state.committedCharacterId) {
    const result = {
      ok: true,
      alreadyCommitted: true,
      characterId: state.committedCharacterId,
    };
    hooks.onCommitted?.(result);
    return result;
  }
  if (state.stage === "COMMITTING") {
    return { ok: false, reason: "commit_in_progress", draftPreserved: true };
  }
  saveFirstLightState({ stage: "COMMITTING" });
  const result = await commitFirstLightDraft(state.draft, { name: state.draft.name });
  if (result.ok) {
    // commitFirstLightDraft already marks done
    hooks.onCommitted?.(result);
    return result;
  }
  hooks.onError?.(result);
  return result;
}

export function resumeOrRestart(choice) {
  if (choice === "restart") {
    resetFirstLight();
    return go("WELCOME");
  }
  const state = loadFirstLightState();
  const stage = state.resumeStage && state.resumeStage !== "PAUSED"
    ? state.resumeStage
    : (state.stage === "PAUSED" || state.stage === "COMPLETED" ? "ENTRY_MODE" : state.stage);
  return go(stage === "BOOT" ? "WELCOME" : stage, { paused: false, resumeStage: "" });
}

export function pauseSession() {
  return pauseFirstLight();
}

export function purposeCountHint(purposes, locale) {
  const copy = getFirstLightCopy(locale);
  const ids = Array.isArray(purposes) ? purposes : [];
  const n = ids.includes(PURPOSE_UNSURE) ? 1 : ids.length;
  const template = copy.purpose.hintCount || copy.purpose.hint || "";
  return String(template).replace("{n}", String(n)).replace("{max}", String(PURPOSE_MAX));
}

export function purposeConfirmCopy(purposes, locale) {
  const copy = getFirstLightCopy(locale);
  const ids = Array.isArray(purposes) ? purposes : loadFirstLightState().draft.purposes || [];
  const echo = copy.purpose.echo || {};
  if (!ids.length) return "";
  if (ids.length === 1 && ids[0] === PURPOSE_UNSURE) {
    return echo.unsure || copy.purpose.confirm;
  }
  if (ids.length === 1 && echo[ids[0]]) return echo[ids[0]];
  if (ids.includes("romance") && ids.length === 1) return copy.purpose.confirm;
  if (ids.includes("romance")) return echo.romanceMix || copy.purpose.confirm;
  return echo.mix || copy.purpose.confirm;
}

export function afterLoverNowCopy(draft) {
  if (draft?.relationshipType === "lover" && draft?.relationshipStart === "now") {
    return getFirstLightCopy().loverStart.afterNow;
  }
  return "";
}
