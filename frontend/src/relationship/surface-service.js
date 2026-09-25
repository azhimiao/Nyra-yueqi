/**
 * C3 — Unified Continuity display model for App / phone / pet / proactive.
 * Surfaces must not invent facts or re-derive intimacy numerics; they read this model only.
 *
 */

import { isFeatureEnabled } from "../features/flags.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { relationshipIdFor } from "../memory/companion-scope.js";
import { listTimelineEvents } from "../timeline/repository.js";
import { getClock } from "../temporal/clock.js";
import {
  SOFT_INTENTION_FALLBACKS,
  SOFT_PRESENCE_FALLBACKS,
  projectRelationshipContinuity,
  continuityHasFactualClaims,
} from "./continuity-projector.js";
import { loadContinuity, saveContinuity } from "./continuity-store.js";
import { shouldSkipRegenerate } from "./continuity-rewrite.js";

export const COMPANION_SURFACES = Object.freeze(["app", "phone", "pet", "proactive"]);

const NUMERIC_FIELD_DENY = Object.freeze([
  "intimacy",
  "trust",
  "tension",
  "intimacyScore",
  "trustScore",
  "tensionScore",
  "affinity",
  "score",
]);

/**
 * @param {string} surface
 */
export function normalizeCompanionSurface(surface) {
  const s = String(surface || "").trim().toLowerCase();
  return COMPANION_SURFACES.includes(s) ? s : "app";
}

/**
 * Reality-only timeline rows for Continuity projection (excludes shared_fiction).
 * @param {{ companionId: string, relationshipId?: string }} opts
 */
export function listRealityTimelineForSurface(opts = {}) {
  const companionId = String(opts.companionId || "").trim();
  if (!companionId) return [];
  return listTimelineEvents({
    companionId,
    relationshipId: opts.relationshipId,
    realityNamespace: "reality",
    limit: 120,
    statusFilter: ["confirmed", "active", "completed"],
    requireCompanion: true,
  });
}

function softTodayLine(locale) {
  const loc = locale === "en" ? "en" : "zh-CN";
  return SOFT_INTENTION_FALLBACKS[loc] || SOFT_INTENTION_FALLBACKS["zh-CN"];
}

function softHeadline(locale) {
  const loc = locale === "en" ? "en" : "zh-CN";
  return SOFT_PRESENCE_FALLBACKS[loc] || SOFT_PRESENCE_FALLBACKS["zh-CN"];
}

function stripNumericResidue(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  if (/\b\d{1,3}%\b/.test(t)) return "";
  if (/亲密度|intimacy|trust\s*\d|tension\s*\d/i.test(t)) return "";
  return t;
}

function collectEvidenceRefs(continuity) {
  if (!continuity || typeof continuity !== "object") return [];
  /** @type {string[]} */
  const ids = [];
  const pushItem = (item) => {
    if (!item) return;
    for (const id of item.evidenceRefs || []) {
      const s = String(id || "").trim();
      if (s && !s.startsWith("soft:")) ids.push(s);
    }
    for (const id of item.sourceIds || []) {
      const s = String(id || "").trim();
      if (s && !s.startsWith("soft:")) ids.push(s);
    }
  };
  pushItem(continuity.recentSharedMoment);
  pushItem(continuity.currentCareFocus);
  pushItem(continuity.unresolvedMatter);
  for (const loop of continuity.openLoops || []) pushItem(loop);
  for (const b of continuity.userBoundaries || []) pushItem(b);
  return [...new Set(ids)];
}

function clockFromNow(now, baseClock = getClock()) {
  if (now == null) return baseClock;
  const nowMs = () => {
    if (typeof now === "number") return now;
    if (now instanceof Date) return now.getTime();
    const parsed = Date.parse(String(now));
    return Number.isFinite(parsed) ? parsed : Date.now();
  };
  return {
    nowMs,
    timezone: typeof baseClock.timezone === "function"
      ? () => baseClock.timezone()
      : () => "Asia/Shanghai",
  };
}

/**
 * @param {object|null} continuity
 * @param {{ locale?: string, surface?: string }} [opts]
 */
export function mapContinuityToSurfaceModel(continuity, opts = {}) {
  const locale = opts.locale === "en" ? "en" : "zh-CN";
  const surface = normalizeCompanionSurface(opts.surface);
  const recent = stripNumericResidue(continuity?.recentSharedMoment?.text);
  const care = stripNumericResidue(continuity?.currentCareFocus?.text);
  const unresolved = stripNumericResidue(continuity?.unresolvedMatter?.text);
  const intention = stripNumericResidue(continuity?.characterIntentionToday?.text)
    || softTodayLine(locale);
  const openLoopRaw = Array.isArray(continuity?.openLoops)
    ? continuity.openLoops.find((l) => l && l.status !== "resolved" && String(l.text || "").trim())
    : null;
  const openLoop = openLoopRaw ? stripNumericResidue(openLoopRaw.text) : "";

  const headline = recent || care || unresolved || softHeadline(locale);
  const todayLine = care || intention || softTodayLine(locale);

  /** @type {string|null} */
  let suggestedAction = null;
  if (openLoop) {
    suggestedAction = locale === "en"
      ? `Follow up: ${openLoop}`
      : `跟进：${openLoop}`;
  } else if (care && continuityHasFactualClaims(continuity)) {
    suggestedAction = locale === "en"
      ? `Check in about: ${care}`
      : `关心一下：${care}`;
  }

  const evidenceRefs = collectEvidenceRefs(continuity);
  const fingerprint = String(continuity?.sourceFingerprint || "").trim() || "empty";

  return {
    surface,
    companionId: String(continuity?.companionId || "").trim(),
    userId: String(continuity?.userId || "local").trim() || "local",
    relationshipId: String(continuity?.relationshipId || "").trim(),
    localDate: String(continuity?.localDate || "").trim(),
    headline,
    todayLine,
    recentSharedMoment: recent || null,
    openLoop: openLoop || null,
    suggestedAction,
    evidenceRefs,
    fingerprint,
    pet: {
      todayLine,
      openLoop: openLoop || null,
    },
  };
}

/**
 * Load Continuity (store or project) without inventing facts. Reality timeline only.
 * @param {{
 *   companionId: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   snapshot?: object,
 *   locale?: string,
 *   clock?: object,
 *   timelineEvents?: object[],
 *   forceProject?: boolean,
 * }} input
 */
export function loadContinuityForSurface(input = {}) {
  const companionId = String(input.companionId || "").trim();
  if (!companionId) return null;
  if (!isFeatureEnabled("relationshipContinuityV1")) return null;

  const userId = String(input.userId || "local").trim() || "local";
  const relationshipId = String(input.relationshipId || relationshipIdFor(userId, companionId)).trim();
  const snapshot = input.snapshot && typeof input.snapshot === "object"
    ? input.snapshot
    : createTemporalSnapshotV1({}, { clock: input.clock || getClock() });

  const timelineEvents = Array.isArray(input.timelineEvents)
    ? input.timelineEvents
    : listRealityTimelineForSurface({ companionId, relationshipId });

  const projected = projectRelationshipContinuity({
    userId,
    companionId,
    snapshot,
    timelineEvents,
    locale: input.locale,
    clock: input.clock,
  });
  if (relationshipId) {
    projected.relationshipId = relationshipId;
  }

  const stored = loadContinuity({
    userId,
    companionId,
    localDate: snapshot.localDate,
  });
  if (!input.forceProject && shouldSkipRegenerate(projected, stored)) {
    return stored;
  }

  saveContinuity(projected);
  return projected;
}

/**
 * Unified Continuity display model for one surface.
 * Same companion + time → same fingerprint across app/phone/pet/proactive.
 *
 * @param {{
 *   companionId: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   surface?: string,
 *   now?: Date|number|string,
 *   snapshot?: object,
 *   locale?: string,
 *   clock?: object,
 *   timelineEvents?: object[],
 *   forceProject?: boolean,
 * }} input
 */
export function getCompanionSurfaceModel(input = {}) {
  const surface = normalizeCompanionSurface(input.surface);
  const companionId = String(input.companionId || "").trim();
  const userId = String(input.userId || "local").trim() || "local";
  const relationshipId = String(input.relationshipId || relationshipIdFor(userId, companionId)).trim();
  const locale = input.locale === "en" ? "en" : "zh-CN";

  const clock = input.clock || clockFromNow(input.now);
  const snapshot = input.snapshot && typeof input.snapshot === "object"
    ? input.snapshot
    : createTemporalSnapshotV1({ locale }, { clock });

  if (!companionId) {
    const empty = mapContinuityToSurfaceModel({
      companionId: "",
      userId,
      relationshipId: "",
      localDate: snapshot.localDate,
      sourceFingerprint: "missing_companion",
    }, { locale, surface });
    empty.headline = softHeadline(locale);
    empty.todayLine = softTodayLine(locale);
    empty.recentSharedMoment = null;
    empty.openLoop = null;
    empty.suggestedAction = null;
    empty.evidenceRefs = [];
    empty.fingerprint = "missing_companion";
    empty.pet = { todayLine: empty.todayLine, openLoop: null };
    return empty;
  }

  if (!isFeatureEnabled("relationshipContinuityV1")) {
    const soft = mapContinuityToSurfaceModel({
      companionId,
      userId,
      relationshipId,
      localDate: snapshot.localDate,
      sourceFingerprint: "flag_off",
    }, { locale, surface });
    soft.headline = softHeadline(locale);
    soft.todayLine = softTodayLine(locale);
    soft.recentSharedMoment = null;
    soft.openLoop = null;
    soft.suggestedAction = null;
    soft.evidenceRefs = [];
    soft.fingerprint = "flag_off";
    soft.pet = { todayLine: soft.todayLine, openLoop: null };
    return soft;
  }

  const continuity = loadContinuityForSurface({
    companionId,
    userId,
    relationshipId,
    snapshot,
    locale,
    clock,
    timelineEvents: input.timelineEvents,
    forceProject: input.forceProject,
  });

  const model = mapContinuityToSurfaceModel(continuity, { locale, surface });
  model.companionId = companionId;
  model.userId = userId;
  model.relationshipId = relationshipId || model.relationshipId;
  model.localDate = model.localDate || snapshot.localDate;

  // Pet: short copy only — same fingerprint / evidence, no invented facts.
  if (surface === "pet") {
    return {
      ...model,
      headline: model.todayLine,
      recentSharedMoment: null,
      suggestedAction: null,
    };
  }

  return model;
}

/**
 * Assert model has no intimacy/trust/tension numeric fields (for tests / guards).
 * @param {object} model
 */
export function surfaceModelHasNumericIntimacy(model) {
  if (!model || typeof model !== "object") return false;
  for (const key of NUMERIC_FIELD_DENY) {
    if (Object.prototype.hasOwnProperty.call(model, key) && model[key] != null) return true;
  }
  const blob = JSON.stringify(model);
  return /"intimacy"\s*:|"trust"\s*:|"tension"\s*:/.test(blob);
}

/**
 * Convenience: home lines from surface model (phone/app).
 * @param {ReturnType<typeof getCompanionSurfaceModel>} model
 */
export function surfaceHomeLines(model) {
  if (!model) return [];
  const lines = [];
  for (const part of [model.headline, model.todayLine, model.openLoop]) {
    const t = stripNumericResidue(part);
    if (t && !lines.includes(t)) lines.push(t);
  }
  return lines.slice(0, 3);
}
