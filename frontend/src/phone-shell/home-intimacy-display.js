/**
 * W1/W6/W8 — Phone home relationship display helpers.
 * Ordinary companion: never show intimacy % / bar.
 * When relationshipContinuityV1 is on, prefer Continuity 2–3 lines (shared store)
 * and must not READ intimacy/trust for ordinary UX decisions (scenario exempt).
 */

import { isFeatureEnabled } from "../features/flags.js";
import {
  getContinuitySources,
  getCompanionSurfaceModel,
  surfaceHomeLines,
  loadContinuityForSurface,
  SOFT_PRESENCE_FALLBACKS,
  SOFT_INTENTION_FALLBACKS,
} from "../relationship/index.js";

/**
 * Soft presence/intention phrases are stored per projection locale.
 * When the UI locale flips, re-map known soft fallbacks so EN UI never
 * shows leftover zh soft lines (and vice versa).
 */
function localizeSoftLine(text, locale = "zh-CN") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const wantEn = locale === "en";
  const zhPresence = SOFT_PRESENCE_FALLBACKS["zh-CN"];
  const enPresence = SOFT_PRESENCE_FALLBACKS.en;
  const zhIntention = SOFT_INTENTION_FALLBACKS["zh-CN"];
  const enIntention = SOFT_INTENTION_FALLBACKS.en;
  if (wantEn) {
    if (raw === zhPresence) return enPresence;
    if (raw === zhIntention) return enIntention;
  } else {
    if (raw === enPresence) return zhPresence;
    if (raw === enIntention) return zhIntention;
  }
  return raw;
}

/**
 * Whether ordinary phone-home may show intimacy/trust-derived numeric score.
 * Always false for ordinary companion. Scenario/shared_fiction may opt in via
 * `showNumericScore: true` AND an isolated realityNamespace — never when
 * relationshipContinuityV1 is on for ordinary (reality) surfaces.
 *
 * @param {{
 *   showNumericScore?: boolean,
 *   realityNamespace?: string,
 *   forceOrdinary?: boolean,
 * }} [opts]
 * @returns {boolean}
 */
export function isHomeIntimacyNumericEnabled(opts = {}) {
  // W8: Continuity-on ordinary path never uses numeric intimacy for UX.
  if (opts.forceOrdinary !== false && isFeatureEnabled("relationshipContinuityV1")) {
    const ns = String(opts.realityNamespace || "").trim();
    if (ns !== "shared_fiction" && ns !== "simulation") return false;
  }
  if (opts.showNumericScore === true) {
    const ns = String(opts.realityNamespace || "").trim();
    // Explicit scenario opt-in only when namespace is isolated (or caller sets ns).
    if (!ns || ns === "shared_fiction" || ns === "simulation") return true;
    return false;
  }
  return false;
}

/**
 * Compute 0–100 intimacy score from experience relationship state, or null when disabled.
 * Does not read intimacy/trust when numeric UX is disabled (W8 harden).
 *
 * @param {{ intimacy?: number, trust?: number }|null|undefined} relationState
 * @param {{ showNumericScore?: boolean, realityNamespace?: string }} [opts]
 * @returns {number|null}
 */
export function computeHomeIntimacyScore(relationState, opts = {}) {
  if (!isHomeIntimacyNumericEnabled(opts)) return null;
  if (!relationState || typeof relationState !== "object") return null;
  const intimacy = Number(relationState.intimacy) || 0;
  const trust = Number(relationState.trust) || 0;
  return Math.max(0, Math.min(100, Math.round((intimacy * 0.65 + trust * 0.35) / 5 * 100)));
}

/**
 * Build non-numeric home relation card fields for ordinary companion.
 * When Continuity flag is on and continuity is available, meta uses Continuity lines.
 *
 * @param {{
 *   presenceCopy?: string,
 *   presenceStatus?: string,
 *   relationBody?: string,
 *   togetherDays?: number|null,
 *   togetherDaysLabel?: string,
 *   continuity?: object|null,
 *   companionId?: string,
 *   userId?: string,
 *   snapshot?: object,
 *   locale?: string,
 *   useContinuity?: boolean,
 * }} [input]
 */
export function buildHomeRelationCardDisplay(input = {}) {
  const score = computeHomeIntimacyScore(null);
  const presenceCopy = String(input.presenceCopy || "").trim();
  const presenceStatus = String(input.presenceStatus || "").trim();
  const relationBody = String(input.relationBody || "").trim();
  const togetherDays = input.togetherDays;
  const togetherDaysLabel = String(input.togetherDaysLabel || "").trim();

  const continuityOn = input.useContinuity === true
    || (input.useContinuity !== false && isFeatureEnabled("relationshipContinuityV1"));

  /** @type {ReturnType<typeof getCompanionSurfaceModel>|null} */
  let surfaceModel = input.surfaceModel || null;
  /** @type {object|null} */
  let continuity = input.continuity || null;

  if (continuityOn && input.companionId) {
    try {
      surfaceModel = getCompanionSurfaceModel({
        companionId: input.companionId,
        userId: input.userId,
        relationshipId: input.relationshipId,
        surface: "phone",
        snapshot: input.snapshot,
        locale: input.locale,
        now: input.now,
      });
      if (!continuity) {
        continuity = loadContinuityForSurface({
          companionId: input.companionId,
          userId: input.userId,
          relationshipId: input.relationshipId,
          snapshot: input.snapshot,
          locale: input.locale,
        });
      }
    } catch {
      surfaceModel = null;
      continuity = null;
    }
  }

  const locale = input.locale === "en" ? "en" : "zh-CN";

  /** @type {string[]} */
  let continuityLines = [];
  if (continuityOn && surfaceModel) {
    continuityLines = surfaceHomeLines(surfaceModel)
      .map((line) => localizeSoftLine(line, locale))
      .filter(Boolean);
    if (!continuityLines.length && presenceCopy) {
      continuityLines = [localizeSoftLine(presenceCopy, locale)];
    }
  }

  let meta = "";
  if (continuityLines.length) {
    // Card body shows at most two short lines — avoid stuffing 3 long sentences.
    meta = continuityLines.slice(0, 2).join("\n");
  } else {
    meta = localizeSoftLine(presenceCopy || presenceStatus || relationBody || "", locale);
    if (togetherDays != null && togetherDaysLabel) {
      meta = meta ? `${meta} · ${togetherDaysLabel}` : togetherDaysLabel;
    }
  }

  return {
    score,
    showNumericScore: score != null,
    showProgressBar: false,
    labelKey: continuityOn ? "home.relationContinuity" : "home.relationStatus",
    meta,
    continuityLines,
    continuity,
    surfaceModel,
    fingerprint: surfaceModel?.fingerprint || null,
    continuitySources: continuity ? getContinuitySources(continuity) : [],
    usesContinuity: Boolean(continuityOn && continuityLines.length && surfaceModel?.fingerprint !== "flag_off"),
  };
}
