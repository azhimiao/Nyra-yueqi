/**
 * Deterministic RelationshipContinuity projector (plan §8.2).
 * Selects evidence from confirmed timeline, stable boundaries, open loops, recent moments.
 * Never invents facts — missing evidence → soft fields omitted / empty loops.
 */

import {
  createEvidenceBackedText,
  createContinuityLoop,
  createRelationshipContinuityV1,
} from "../contracts/relationship-continuity-v1.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { relationshipIdFor } from "../memory/companion-scope.js";
import { listTimelineEvents } from "../timeline/repository.js";
import { recallStableMemory } from "../memory/candidate-ledger.js";
import { resolveEventStatus, isEventEligibleForTodayContext } from "../temporal/contract.js";
import { applyExpiry } from "../temporal/expiry.js";
import { selectOpenFollowUps } from "../temporal/today-context.js";
import { getClock } from "../temporal/clock.js";

/** Soft presence phrases — no fabricated yesterday/events. */
export const SOFT_INTENTION_FALLBACKS = Object.freeze({
  "zh-CN": "今天我想陪你轻松一点。",
  en: "Today I just want to stay with you gently.",
});

export const SOFT_PRESENCE_FALLBACKS = Object.freeze({
  "zh-CN": "我在这里，陪你把今天过好。",
  en: "I'm here, staying with you through today.",
});

/** FNV-1a 32-bit hex */
export function hashContinuityText(text) {
  let hash = 2166136261;
  const seed = String(text || "");
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function eventSummary(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  return String(
    event?.title
    || payload.summary
    || payload.title
    || event?.temporalText
    || event?.eventType
    || "",
  ).trim();
}

function eventSourceIds(event) {
  const ids = [];
  if (event?.eventId) ids.push(String(event.eventId));
  if (event?.sourceId) ids.push(String(event.sourceId));
  const refs = Array.isArray(event?.evidenceRefs) ? event.evidenceRefs : [];
  for (const r of refs) {
    if (r) ids.push(String(r));
  }
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function isSharedMomentKind(event) {
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const kind = String(event?.kind || payload.kind || event?.eventType || "").toLowerCase();
  return [
    "shared_plan",
    "shared_moment",
    "schedule_commitment",
    "followup_promise",
    "observation",
    "completed",
  ].some((k) => kind.includes(k))
    || event?.status === "completed"
    || payload.shared === true;
}

function isBoundaryMemory(mem) {
  const cat = String(mem?.category || "").toLowerCase();
  const body = String(mem?.body || "");
  return cat.includes("boundary")
    || cat.includes("preference")
    || /不要|别再|不许|边界|别叫|don't|do not|never call|stop calling/i.test(body);
}

/**
 * Stable fingerprint of evidence selected for a day (dedupe regenerate).
 * @param {{
 *   localDate: string,
 *   companionId: string,
 *   moments?: object[],
 *   care?: object[],
 *   loops?: object[],
 *   boundaries?: object[],
 * }} parts
 */
export function computeSourceFingerprint(parts = {}) {
  const pack = (rows, pick) => (rows || [])
    .map(pick)
    .filter(Boolean)
    .sort()
    .join("|");
  const material = [
    String(parts.localDate || ""),
    String(parts.companionId || ""),
    pack(parts.moments, (e) => `${e.eventId || ""}:${eventSummary(e)}`),
    pack(parts.care, (e) => `${e.eventId || ""}:${eventSummary(e)}`),
    pack(parts.loops, (e) => `${e.eventId || ""}:${eventSummary(e)}`),
    pack(parts.boundaries, (m) => `${m.memoryId || m.id || ""}:${String(m.body || "").trim()}`),
  ].join("::");
  return hashContinuityText(material);
}

/**
 * Deterministic short phrases from evidence (no model).
 * @param {object} evidenceBundle
 * @param {{ locale?: string }} [opts]
 */
export function buildDeterministicPhrases(evidenceBundle, opts = {}) {
  const locale = opts.locale === "en" ? "en" : "zh-CN";
  const zh = locale !== "en";
  /** @type {Record<string, object|undefined>} */
  const out = {};

  if (evidenceBundle.recentMoment) {
    const summary = eventSummary(evidenceBundle.recentMoment);
    const ids = eventSourceIds(evidenceBundle.recentMoment);
    if (summary && ids.length) {
      out.recentSharedMoment = createEvidenceBackedText({
        text: zh ? `最近我们一起经历了：${summary}` : `Recently we shared: ${summary}`,
        sourceIds: ids,
        evidenceRefs: ids,
        confidence: 0.85,
      });
    }
  }

  if (evidenceBundle.careFocus) {
    const summary = eventSummary(evidenceBundle.careFocus);
    const ids = eventSourceIds(evidenceBundle.careFocus);
    if (summary && ids.length) {
      out.currentCareFocus = createEvidenceBackedText({
        text: zh ? `我还惦记着：${summary}` : `Still on my mind: ${summary}`,
        sourceIds: ids,
        evidenceRefs: ids,
        confidence: 0.8,
      });
    }
  }

  if (evidenceBundle.unresolved) {
    const summary = eventSummary(evidenceBundle.unresolved);
    const ids = eventSourceIds(evidenceBundle.unresolved);
    if (summary && ids.length) {
      out.unresolvedMatter = createEvidenceBackedText({
        text: zh ? `还有一件事想跟你确认：${summary}` : `Something still open: ${summary}`,
        sourceIds: ids,
        evidenceRefs: ids,
        confidence: 0.75,
      });
    }
  }

  // Soft intention only — never invents yesterday facts when no evidence.
  out.characterIntentionToday = createEvidenceBackedText({
    text: SOFT_INTENTION_FALLBACKS[locale] || SOFT_INTENTION_FALLBACKS["zh-CN"],
    sourceIds: ["soft:presence"],
    evidenceRefs: ["soft:presence"],
    confidence: 0.4,
  });

  return out;
}

/**
 * Select evidence rows (no narrative invention).
 * @param {{
 *   userId?: string,
 *   companionId: string,
 *   snapshot?: object,
 *   timelineEvents?: object[],
 *   stableMemories?: object[],
 *   todayContext?: object|null,
 *   clock?: object,
 * }} input
 */
export function selectContinuityEvidence(input = {}) {
  const companionId = String(input.companionId || "").trim();
  const userId = String(input.userId || "local").trim() || "local";
  const snapshot = input.snapshot && typeof input.snapshot === "object"
    ? input.snapshot
    : createTemporalSnapshotV1({}, { clock: input.clock || getClock() });

  const timeline = Array.isArray(input.timelineEvents)
    ? input.timelineEvents
    : companionId
      ? listTimelineEvents({ companionId, limit: 80, statusFilter: "today_context" })
      : [];

  const allScoped = Array.isArray(input.timelineEvents)
    ? input.timelineEvents
    : companionId
      ? listTimelineEvents({
        companionId,
        limit: 120,
        statusFilter: ["confirmed", "active", "completed"],
        requireCompanion: true,
      })
      : [];

  const expiredAware = (allScoped.length ? allScoped : timeline)
    .map((e) => applyExpiry(e, snapshot).event)
    .filter((e) => e && !e.tombstone && e.companionId === companionId)
    // Ordinary Continuity is reality-only — shared_fiction/simulation must not become headlines.
    .filter((e) => {
      const ns = String(e.realityNamespace || "reality").trim() || "reality";
      return ns !== "shared_fiction" && ns !== "simulation";
    });

  const confirmedOrActive = expiredAware.filter((e) => {
    const status = resolveEventStatus(e);
    return status === "confirmed" || status === "active" || status === "completed";
  });

  const openFollowUps = selectOpenFollowUps(confirmedOrActive, snapshot)
    .filter((e) => isEventEligibleForTodayContext(e, { allowProposed: false }));

  const sharedMoments = confirmedOrActive
    .filter((e) => isSharedMomentKind(e))
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));

  const recentMoment = sharedMoments[0] || null;
  const careFocus = openFollowUps[0] || null;
  const unresolved = openFollowUps[1] || openFollowUps[0] || null;

  const stable = Array.isArray(input.stableMemories)
    ? input.stableMemories
    : recallStableMemory({ companionId, userId, limit: 40 });

  const boundaries = (stable || []).filter(isBoundaryMemory).slice(0, 6);

  return {
    userId,
    companionId,
    snapshot,
    recentMoment,
    careFocus,
    unresolved,
    openFollowUps,
    boundaries,
    sharedMoments,
    hasFactualEvidence: Boolean(recentMoment || careFocus || boundaries.length || openFollowUps.length),
  };
}

/**
 * Project Continuity object without inventing facts.
 * Soft intention may use presence fallback with soft:presence source.
 *
 * @param {{
 *   userId?: string,
 *   companionId: string,
 *   snapshot?: object,
 *   timelineEvents?: object[],
 *   stableMemories?: object[],
 *   todayContext?: object|null,
 *   clock?: object,
 *   locale?: string,
 *   generatedAt?: string,
 * }} input
 */
export function projectRelationshipContinuity(input = {}) {
  const evidence = selectContinuityEvidence(input);
  const locale = input.locale
    || (evidence.snapshot?.locale === "en" ? "en" : "zh-CN");
  const phrases = buildDeterministicPhrases(evidence, { locale });

  const openLoops = (evidence.openFollowUps || []).slice(0, 4).map((event, index) => {
    const summary = eventSummary(event);
    const ids = eventSourceIds(event);
    return createContinuityLoop({
      loopId: `loop_${event.eventId || index}`,
      text: summary || (locale === "en" ? "Open follow-up" : "待跟进事项"),
      sourceIds: ids.length ? ids : [`timeline:${event.eventId || index}`],
      evidenceRefs: ids.length ? ids : [`timeline:${event.eventId || index}`],
      confidence: 0.8,
      status: "open",
    });
  }).filter((loop) => loop.sourceIds.length && loop.text);

  const userBoundaries = (evidence.boundaries || []).map((mem) => {
    const id = String(mem.memoryId || mem.id || "").trim();
    const refs = Array.isArray(mem.evidenceRefs) && mem.evidenceRefs.length
      ? mem.evidenceRefs.map(String)
      : id ? [id] : [];
    if (!id && !refs.length) return null;
    return createEvidenceBackedText({
      text: String(mem.body || "").trim(),
      sourceIds: id ? [id] : refs,
      evidenceRefs: refs.length ? refs : [id],
      confidence: 0.9,
    });
  }).filter(Boolean);

  const fingerprint = computeSourceFingerprint({
    localDate: evidence.snapshot.localDate,
    companionId: evidence.companionId,
    moments: evidence.recentMoment ? [evidence.recentMoment] : [],
    care: evidence.careFocus ? [evidence.careFocus] : [],
    loops: evidence.openFollowUps || [],
    boundaries: evidence.boundaries || [],
  });

  return createRelationshipContinuityV1({
    userId: evidence.userId,
    companionId: evidence.companionId,
    relationshipId: relationshipIdFor(evidence.userId, evidence.companionId),
    localDate: evidence.snapshot.localDate,
    recentSharedMoment: phrases.recentSharedMoment,
    currentCareFocus: phrases.currentCareFocus,
    openLoops,
    userBoundaries,
    characterIntentionToday: phrases.characterIntentionToday,
    unresolvedMatter: phrases.unresolvedMatter,
    sourceFingerprint: fingerprint,
    generatedAt: String(input.generatedAt || new Date().toISOString()),
  });
}

/**
 * Whether continuity contains any factual (non-soft) evidence-backed claim.
 * @param {object|null} continuity
 */
export function continuityHasFactualClaims(continuity) {
  if (!continuity) return false;
  const soft = (item) => {
    if (!item) return true;
    const ids = item.sourceIds || [];
    return ids.length === 1 && String(ids[0]).startsWith("soft:");
  };
  if (continuity.recentSharedMoment && !soft(continuity.recentSharedMoment)) return true;
  if (continuity.currentCareFocus && !soft(continuity.currentCareFocus)) return true;
  if (continuity.unresolvedMatter && !soft(continuity.unresolvedMatter)) return true;
  if (Array.isArray(continuity.openLoops) && continuity.openLoops.length) return true;
  if (Array.isArray(continuity.userBoundaries) && continuity.userBoundaries.length) return true;
  return false;
}
