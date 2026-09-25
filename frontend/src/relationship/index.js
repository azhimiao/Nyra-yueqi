/**
 * RelationshipContinuity public API — App and phone-shell share this module.
 */

import { isFeatureEnabled } from "../features/flags.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { validateRelationshipContinuityV1 } from "../contracts/relationship-continuity-v1.js";
import { getClock } from "../temporal/clock.js";
import {
  projectRelationshipContinuity,
  continuityHasFactualClaims,
  SOFT_PRESENCE_FALLBACKS,
  SOFT_INTENTION_FALLBACKS,
} from "./continuity-projector.js";
import {
  loadContinuity,
  saveContinuity,
  clearContinuity,
  CONTINUITY_STORE_KEY,
  CONTINUITY_STORE_META,
  __setContinuityStorageForTests,
  __clearContinuityStoreForTests,
} from "./continuity-store.js";
import {
  maybeRewriteContinuity,
  shouldSkipRegenerate,
  validateClaimToEvidence,
  collectEvidenceCorpus,
} from "./continuity-rewrite.js";

export {
  CONTINUITY_STORE_KEY,
  CONTINUITY_STORE_META,
  loadContinuity,
  saveContinuity,
  clearContinuity,
  __setContinuityStorageForTests,
  __clearContinuityStoreForTests,
};

export {
  projectRelationshipContinuity,
  selectContinuityEvidence,
  computeSourceFingerprint,
  buildDeterministicPhrases,
  continuityHasFactualClaims,
  SOFT_PRESENCE_FALLBACKS,
  SOFT_INTENTION_FALLBACKS,
} from "./continuity-projector.js";

export {
  validateClaimToEvidence,
  collectEvidenceCorpus,
  applyValidatedRewrite,
  maybeRewriteContinuity,
  shouldSkipRegenerate,
} from "./continuity-rewrite.js";

export {
  COMPANION_SURFACES,
  normalizeCompanionSurface,
  getCompanionSurfaceModel,
  mapContinuityToSurfaceModel,
  loadContinuityForSurface,
  listRealityTimelineForSurface,
  surfaceModelHasNumericIntimacy,
  surfaceHomeLines,
} from "./surface-service.js";

/**
 * Source rows for the neutral "为什么ta这样说" UI.
 * @param {object|null} continuity
 */
export function getContinuitySources(continuity) {
  if (!continuity || typeof continuity !== "object") return [];
  /** @type {Array<{ field: string, text: string, sourceIds: string[], evidenceRefs: string[], confidence: number }>} */
  const rows = [];
  const push = (field, item) => {
    if (!item?.text) return;
    rows.push({
      field,
      text: String(item.text),
      sourceIds: [...(item.sourceIds || [])],
      evidenceRefs: [...(item.evidenceRefs || [])],
      confidence: Number(item.confidence) || 0,
    });
  };
  push("recentSharedMoment", continuity.recentSharedMoment);
  push("currentCareFocus", continuity.currentCareFocus);
  push("characterIntentionToday", continuity.characterIntentionToday);
  push("unresolvedMatter", continuity.unresolvedMatter);
  (continuity.openLoops || []).forEach((loop, i) => push(`openLoops[${i}]`, loop));
  (continuity.userBoundaries || []).forEach((b, i) => push(`userBoundaries[${i}]`, b));
  return rows;
}

/**
 * 2–3 non-numeric home lines from Continuity (or soft fallback).
 * @param {object|null} continuity
 * @param {{ locale?: string, presenceFallback?: string }} [opts]
 * @returns {string[]}
 */
export function continuityHomeLines(continuity, opts = {}) {
  const locale = opts.locale === "en" ? "en" : "zh-CN";
  const softPresence = opts.presenceFallback
    || SOFT_PRESENCE_FALLBACKS[locale]
    || SOFT_PRESENCE_FALLBACKS["zh-CN"];
  const softIntention = SOFT_INTENTION_FALLBACKS[locale] || SOFT_INTENTION_FALLBACKS["zh-CN"];

  if (!continuity) {
    return [softPresence, softIntention].slice(0, 2);
  }

  const lines = [];
  const add = (text) => {
    const t = String(text || "").trim();
    if (!t) return;
    if (lines.includes(t)) return;
    // Strip any numeric intimacy residue if somehow present
    if (/\b\d{1,3}%\b/.test(t) || /亲密度|intimacy|trust\s*\d/i.test(t)) return;
    lines.push(t);
  };

  add(continuity.recentSharedMoment?.text);
  add(continuity.currentCareFocus?.text || continuity.unresolvedMatter?.text);
  add(continuity.characterIntentionToday?.text);

  if (!lines.length) {
    add(softPresence);
    add(softIntention);
  } else if (lines.length === 1) {
    add(softIntention);
  }

  return lines.slice(0, 3);
}

/**
 * Token-light prompt block — facts only; no soft “陪你/关心” director fallbacks.
 * Soft presence phrases stay on UI/home surfaces, not Character Reality.
 * @param {object|null} continuity
 * @param {{ locale?: string }} [opts]
 */
export function formatContinuityPromptBlock(continuity, opts = {}) {
  if (!continuity) return "";
  const locale = opts.locale === "en" ? "en" : "zh-CN";
  const header = locale === "en" ? "【Relationship continuity】" : "【关系连续性】";
  const lines = [];
  const add = (text) => {
    const t = String(text || "").trim();
    if (!t) return;
    if (lines.includes(t)) return;
    if (/\b\d{1,3}%\b/.test(t) || /亲密度|intimacy|trust\s*\d/i.test(t)) return;
    // Never inject soft companion-director fallbacks into Final messages[].
    if (t === SOFT_PRESENCE_FALLBACKS["zh-CN"] || t === SOFT_PRESENCE_FALLBACKS.en) return;
    if (t === SOFT_INTENTION_FALLBACKS["zh-CN"] || t === SOFT_INTENTION_FALLBACKS.en) return;
    if (/陪你|关心你|主动关心|表达在意|维持关系/.test(t)) return;
    lines.push(t);
  };
  add(continuity.recentSharedMoment?.text);
  add(continuity.currentCareFocus?.text || continuity.unresolvedMatter?.text);
  add(continuity.characterIntentionToday?.text);
  for (const loop of continuity.openLoops || []) {
    if (loop?.status === "resolved") continue;
    add(loop?.text);
  }
  if (!lines.length) return "";
  const boundaries = (continuity.userBoundaries || [])
    .slice(0, 2)
    .map((b) => `- ${b.text}`)
    .filter(Boolean);
  const parts = [header, ...lines.map((l) => `- ${l}`)];
  if (boundaries.length) {
    parts.push(locale === "en" ? "Boundaries:" : "用户边界：");
    parts.push(...boundaries);
  }
  parts.push(
    locale === "en"
      ? "(Only use the lines above; do not invent dates or events. Do not treat this as a directive to be warmer.)"
      : "（仅可使用以上有来源的句子，不得编造日期或事件；这不是要求你更温柔的导演指令。）",
  );
  return parts.join("\n");
}

/**
 * Refresh Continuity for a companion day. Best-effort; safe when flag off.
 *
 * @param {{
 *   companionId: string,
 *   userId?: string,
 *   snapshot?: object,
 *   timelineEvents?: object[],
 *   stableMemories?: object[],
 *   todayContext?: object|null,
 *   rewriteFn?: Function,
 *   force?: boolean,
 *   locale?: string,
 *   clock?: object,
 * }} input
 */
export async function refreshRelationshipContinuity(input = {}) {
  if (!isFeatureEnabled("relationshipContinuityV1")) {
    return { ok: false, reason: "flag_off", continuity: null };
  }
  const companionId = String(input.companionId || "").trim();
  if (!companionId) return { ok: false, reason: "missing_companionId", continuity: null };

  const userId = String(input.userId || "local").trim() || "local";
  const snapshot = input.snapshot && typeof input.snapshot === "object"
    ? input.snapshot
    : createTemporalSnapshotV1({}, { clock: input.clock || getClock() });

  const projected = projectRelationshipContinuity({
    userId,
    companionId,
    snapshot,
    timelineEvents: input.timelineEvents,
    stableMemories: input.stableMemories,
    todayContext: input.todayContext,
    clock: input.clock,
    locale: input.locale,
  });

  const stored = loadContinuity({
    userId,
    companionId,
    localDate: projected.localDate,
  });

  if (!input.force && shouldSkipRegenerate(projected, stored)) {
    return {
      ok: true,
      reused: true,
      continuity: stored,
      reason: "same_fingerprint",
    };
  }

  let continuity = projected;
  if (typeof input.rewriteFn === "function") {
    const rewritten = await maybeRewriteContinuity(projected, {
      rewriteFn: input.rewriteFn,
      locale: input.locale,
    });
    continuity = rewritten.continuity;
  }

  const check = validateRelationshipContinuityV1(continuity);
  if (!check.ok) {
    return { ok: false, reason: "invalid_continuity", errors: check.errors, continuity: null };
  }

  const saved = saveContinuity(continuity);
  if (!saved.ok) return { ok: false, reason: saved.reason || "save_failed", continuity };

  return {
    ok: true,
    reused: false,
    continuity: saved.value,
    hasFactualClaims: continuityHasFactualClaims(saved.value),
  };
}

/**
 * Load or soft-refresh Continuity for UI/prompt (sync path uses store + project without rewrite).
 * @param {{ companionId: string, userId?: string, snapshot?: object, locale?: string, persist?: boolean }} input
 */
export function getOrProjectContinuity(input = {}) {
  if (!isFeatureEnabled("relationshipContinuityV1")) return null;
  const companionId = String(input.companionId || "").trim();
  if (!companionId) return null;
  const userId = String(input.userId || "local").trim() || "local";
  const snapshot = input.snapshot && typeof input.snapshot === "object"
    ? input.snapshot
    : createTemporalSnapshotV1();
  const stored = loadContinuity({
    userId,
    companionId,
    localDate: snapshot.localDate,
  });
  if (stored) return stored;
  const projected = projectRelationshipContinuity({
    userId,
    companionId,
    snapshot,
    locale: input.locale,
  });
  if (input.persist !== false) saveContinuity(projected);
  return projected;
}
