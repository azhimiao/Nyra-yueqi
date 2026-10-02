/**
 * Optional model rewrite of Continuity evidence into character voice (plan §8.2).
 * Must claim-to-evidence validate; on fail use deterministic phrases.
 * Same-day same sourceFingerprint skips regenerate.
 */

import { createEvidenceBackedText } from "../contracts/relationship-continuity-v1.js";
import { createRelationshipContinuityV1 } from "../contracts/relationship-continuity-v1.js";
import { buildDeterministicPhrases, selectContinuityEvidence } from "./continuity-projector.js";

/** Patterns that imply concrete past/future events — must appear in evidence if used. */
const FABRICATED_FACT_HINT = /昨天|前天|上周|明天|后天|下周|yesterday|tomorrow|last week|next week|\d{1,2}月\d{1,2}日|\d{4}-\d{2}-\d{2}/i;

/**
 * Collect all evidence texts + source ids from a Continuity (or projected draft).
 * @param {object} continuity
 */
export function collectEvidenceCorpus(continuity) {
  const texts = [];
  const sourceIds = new Set();
  const push = (item) => {
    if (!item) return;
    if (item.text) texts.push(String(item.text));
    for (const id of item.sourceIds || []) sourceIds.add(String(id));
    for (const id of item.evidenceRefs || []) sourceIds.add(String(id));
  };
  push(continuity?.recentSharedMoment);
  push(continuity?.currentCareFocus);
  push(continuity?.characterIntentionToday);
  push(continuity?.unresolvedMatter);
  for (const loop of continuity?.openLoops || []) push(loop);
  for (const b of continuity?.userBoundaries || []) push(b);
  return { texts, sourceIds: [...sourceIds] };
}

/**
 * Claim-to-evidence: rewritten text may not invent dates/events absent from evidence.
 * Soft presence phrases without factual hints are allowed.
 *
 * @param {string} claimText
 * @param {string[]} evidenceTexts
 * @param {{ allowSoft?: boolean }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateClaimToEvidence(claimText, evidenceTexts = [], opts = {}) {
  const claim = String(claimText || "").trim();
  if (!claim) return { ok: false, reason: "empty_claim" };

  const corpus = (evidenceTexts || []).map((t) => String(t || "").trim()).filter(Boolean);
  const joined = corpus.join("\n");

  if (FABRICATED_FACT_HINT.test(claim)) {
    // Every matched factual token must appear in evidence corpus.
    const matches = claim.match(new RegExp(FABRICATED_FACT_HINT.source, "gi")) || [];
    for (const token of matches) {
      if (!joined.includes(token)) {
        return { ok: false, reason: "fabricated_temporal_claim" };
      }
    }
  }

  // If claim asserts a concrete shared event phrase and corpus is empty → reject.
  const assertsFact = /经历了|惦记|确认|约定|答辩|一起|shared|still on my mind|something still open/i.test(claim);
  if (assertsFact && corpus.length === 0) {
    return { ok: false, reason: "claim_without_evidence" };
  }

  if (assertsFact && corpus.length) {
    // Require at least one content word from claim to overlap evidence (CJK bigrams / latin tokens).
    const overlap = hasContentOverlap(claim, joined);
    if (!overlap) return { ok: false, reason: "no_evidence_overlap" };
  }

  if (opts.allowSoft === false && !corpus.length) {
    return { ok: false, reason: "soft_disallowed" };
  }

  return { ok: true };
}

function hasContentOverlap(claim, corpus) {
  const c = String(corpus || "");
  const latin = String(claim).toLowerCase().match(/[a-z]{3,}/g) || [];
  for (const w of latin) {
    if (c.toLowerCase().includes(w)) return true;
  }
  // CJK: any 2-char window from claim that appears in corpus (excluding common fillers)
  const fillers = new Set(["我们", "一起", "最近", "还惦", "惦记", "还有", "一件", "想跟", "确认", "今天", "我想", "陪你"]);
  const text = String(claim).replace(/\s+/g, "");
  for (let i = 0; i < text.length - 1; i += 1) {
    const bi = text.slice(i, i + 2);
    if (/[\u4e00-\u9fff]{2}/.test(bi) && !fillers.has(bi) && c.includes(bi)) return true;
  }
  // Also accept if any evidence summary substring (≥2) appears in claim
  for (const line of c.split("\n")) {
    const core = line.replace(/^最近我们一起经历了：|^我还惦记着：|^还有一件事想跟你确认：|^Recently we shared: |^Still on my mind: |^Something still open: /, "").trim();
    if (core.length >= 2 && claim.includes(core.slice(0, Math.min(core.length, 8)))) return true;
  }
  return false;
}

/**
 * Apply rewrite patch fields onto continuity, validating each claim.
 * Invalid fields fall back to deterministic originals.
 *
 * @param {object} baseContinuity
 * @param {{
 *   recentSharedMoment?: string,
 *   currentCareFocus?: string,
 *   characterIntentionToday?: string,
 *   unresolvedMatter?: string,
 * }} rewrite
 * @param {string[]} evidenceTexts
 */
export function applyValidatedRewrite(baseContinuity, rewrite = {}, evidenceTexts = []) {
  const next = createRelationshipContinuityV1(baseContinuity);
  const fields = [
    "recentSharedMoment",
    "currentCareFocus",
    "characterIntentionToday",
    "unresolvedMatter",
  ];
  for (const field of fields) {
    const proposed = rewrite[field];
    if (proposed == null || proposed === "") continue;
    const base = baseContinuity[field];
    const check = validateClaimToEvidence(String(proposed), evidenceTexts, {
      allowSoft: field === "characterIntentionToday",
    });
    if (!check.ok) {
      // keep base (deterministic)
      continue;
    }
    if (!base?.sourceIds?.length) {
      // Cannot attach rewritten fact without sources
      if (field !== "characterIntentionToday") continue;
    }
    next[field] = createEvidenceBackedText({
      text: String(proposed).trim(),
      sourceIds: base?.sourceIds || ["soft:presence"],
      evidenceRefs: base?.evidenceRefs || base?.sourceIds || ["soft:presence"],
      confidence: Math.min(0.75, Number(base?.confidence) || 0.5),
    });
  }
  return next;
}

/**
 * @param {object} continuity
 * @param {object} stored
 */
export function shouldSkipRegenerate(continuity, stored) {
  if (!stored || !continuity) return false;
  return String(stored.localDate) === String(continuity.localDate)
    && String(stored.companionId) === String(continuity.companionId)
    && String(stored.userId || "local") === String(continuity.userId || "local")
    && String(stored.sourceFingerprint) === String(continuity.sourceFingerprint)
    && String(stored.sourceFingerprint || "").length > 0;
}

/**
 * Optional rewrite step. `rewriteFn` may be async and return field strings.
 * On model failure or validation failure → deterministic base kept.
 *
 * @param {object} continuity
 * @param {{
 *   rewriteFn?: (continuity: object, evidenceTexts: string[]) => (object|Promise<object>),
 *   locale?: string,
 *   evidenceBundle?: object,
 * }} [opts]
 */
export async function maybeRewriteContinuity(continuity, opts = {}) {
  const evidenceTexts = collectEvidenceCorpus(continuity).texts
    .filter((t) => !String(t).includes("今天我想陪你") && !String(t).includes("Today I just want"));

  if (typeof opts.rewriteFn !== "function") {
    return { continuity, rewritten: false, reason: "no_rewrite_fn" };
  }

  let patch;
  try {
    patch = await opts.rewriteFn(continuity, evidenceTexts);
  } catch {
    return { continuity, rewritten: false, reason: "model_failed" };
  }
  if (!patch || typeof patch !== "object") {
    return { continuity, rewritten: false, reason: "empty_patch" };
  }

  const applied = applyValidatedRewrite(continuity, patch, evidenceTexts);
  return { continuity: applied, rewritten: true, reason: "ok" };
}

/**
 * Build deterministic continuity when rewrite is unavailable (explicit export for tests).
 * @param {Parameters<typeof selectContinuityEvidence>[0] & { locale?: string }} input
 */
export function deterministicContinuityFromEvidence(input = {}) {
  const evidence = selectContinuityEvidence(input);
  const locale = input.locale || (evidence.snapshot?.locale === "en" ? "en" : "zh-CN");
  const phrases = buildDeterministicPhrases(evidence, { locale });
  return { evidence, phrases };
}
