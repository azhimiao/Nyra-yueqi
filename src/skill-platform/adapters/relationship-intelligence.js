/**
 * P5 — Relationship Intelligence host adapter.
 * Maps package schemas to host state whitelist; validates turns before commit.
 */

import { RELATIONSHIP_ACTIONS } from "../state-machine.js";

export const SKILL_ID = "relationship-intelligence";

const MAX_HYPOTHESES = 2;
const EXECUTABLE_CONFIDENCE = 0.5;

/** Blocked prose patterns — diagnosis, manipulation, match scores, exclusive bonding. */
const BLOCKED_CONTENT_PATTERNS = Object.freeze([
  { id: "diagnosis", re: /(?:患有|确诊|诊断为|你就是.*(?:症|障碍|人格)|(?:PTSD|NPD|BPD|回避型依恋|焦虑型依恋|创伤后应激))/i },
  { id: "match_percent", re: /\d+\s*[%％]\s*(?:匹配|契合|适合)|匹配度\s*\d+/i },
  {
    id: "manipulation",
    re: /(?:精神控制|冷暴力技巧|欲擒故纵|让他(?:离不开|追着我)|跟踪查岗|测忠软件)/i,
  },
  { id: "exclusive_bonding", re: /(?:只有我能|非我不可|离不开我|绑在一起)/i },
]);

/** Romance-advice overlay blocked under SAFETY_OVERRIDE. */
const ROMANCE_ADVICE_PATTERNS = Object.freeze([
  /(?:复合|挽回|匹配|适合在一起|依恋类型|沟通技巧改善关系)/i,
  /(?:他(?:爱|不爱)你|你们(?:很|不)合适)/i,
]);

/**
 * @param {string} text
 */
export function endsWithAcquisitionQuestion(text) {
  const t = String(text || "").trim();
  if (!/[?？]$/.test(t)) return false;
  return /(?:什么|怎么|为何|为什么|是否|会不会|有没有|能不能|愿不愿意|多大|多久|哪(?:里|种|些)|who|what|how|why|would you|could you|can you|do you|are you|is it|tell me)/i.test(
    t,
  );
}

/**
 * @param {string} text
 * @param {{ allowRomanceAdvice?: boolean }} [opts]
 */
export function scanBlockedContent(text, opts = {}) {
  const prose = String(text || "");
  /** @type {{ id: string, match: string }[]} */
  const hits = [];
  for (const rule of BLOCKED_CONTENT_PATTERNS) {
    const match = prose.match(rule.re);
    if (match) hits.push({ id: rule.id, match: match[0] });
  }
  if (!opts.allowRomanceAdvice) {
    for (const re of ROMANCE_ADVICE_PATTERNS) {
      const match = prose.match(re);
      if (match) hits.push({ id: "romance_advice_under_safety", match: match[0] });
    }
  }
  return hits;
}

/**
 * @param {unknown} wf
 */
export function normalizeWorkingFormulation(wf) {
  if (!wf || typeof wf !== "object" || Array.isArray(wf)) return null;
  const row = /** @type {Record<string, unknown>} */ (wf);
  const primary = normalizeHypothesis(row.primaryHypothesis ?? row.leadHypothesis);
  const alternate = normalizeHypothesis(row.alternateHypothesis);
  if (!primary && !alternate) return null;
  return {
    primaryHypothesis: primary,
    alternateHypothesis: alternate,
  };
}

/**
 * @param {unknown} raw
 */
function normalizeHypothesis(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const text = String(row.text ?? row.statement ?? row.hypothesis ?? "").trim();
  if (!text) return null;
  const confidence = clamp01(Number(row.confidence ?? 0));
  const testable = row.testable != null ? Boolean(row.testable) : confidence >= EXECUTABLE_CONFIDENCE;
  return { text, confidence, testable };
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {object} patch
 * @param {object} state
 */
export function validateHypothesisCap(patch, state) {
  const merged = {
    ...state,
    ...(patch && typeof patch === "object" ? patch : {}),
  };
  const wf = normalizeWorkingFormulation(merged.workingFormulation);
  if (!wf) return { ok: true };

  let count = 0;
  if (wf.primaryHypothesis) count += 1;
  if (wf.alternateHypothesis) count += 1;

  const raw = merged.workingFormulation;
  if (raw && typeof raw === "object" && Array.isArray(/** @type {object} */ (raw).hypotheses)) {
    const extra = /** @type {object} */ (raw).hypotheses.length;
    if (extra > MAX_HYPOTHESES) {
      return { ok: false, reason: "hypothesis_cap_exceeded", count: extra };
    }
  }

  if (count > MAX_HYPOTHESES) {
    return { ok: false, reason: "hypothesis_cap_exceeded", count };
  }

  if (raw && typeof raw === "object" && /** @type {object} */ (raw).tertiaryHypothesis) {
    return { ok: false, reason: "hypothesis_cap_exceeded", count: count + 1 };
  }

  return { ok: true, value: wf };
}

/**
 * Prefer SIMULATE when primary confidence ≥0.5 and testable.
 * @param {object} turn
 * @param {object} state
 */
export function validateSimulatePreference(turn, state) {
  const wf = normalizeWorkingFormulation(state.workingFormulation);
  if (!wf?.primaryHypothesis) return { ok: true };

  const { confidence, testable } = wf.primaryHypothesis;
  if (confidence < EXECUTABLE_CONFIDENCE || !testable) return { ok: true };

  const action = String(turn.nextAction || "");
  const interviewing = ["REFLECT", "CONTAIN", "DISCRIMINATE"].includes(action);
  if (!interviewing) return { ok: true };

  if (endsWithAcquisitionQuestion(turn.assistantText)) {
    return {
      ok: false,
      reason: "prefer_simulate",
      detail: "primary hypothesis is executable; use SIMULATE instead of more acquisition",
    };
  }
  return { ok: true };
}

/**
 * @param {object} turn
 * @param {object} state
 */
export function validateQuestionBudget(turn, state) {
  const streak = Number(state.questionEndingStreak ?? 0);
  if (streak < 2) return { ok: true };

  if (endsWithAcquisitionQuestion(turn.assistantText)) {
    const action = String(turn.nextAction || "");
    const allowedDespiteQuestion = ["FORMULATE", "SYNTHESIZE", "DEBRIEF", "SAFETY_OVERRIDE"].includes(
      action,
    );
    if (!allowedDespiteQuestion) {
      return {
        ok: false,
        reason: "question_budget_exceeded",
        detail: "two consecutive question-ending turns; reflect or formulate instead",
      };
    }
  }
  return { ok: true };
}

/**
 * @param {object} turn
 * @param {object} state
 */
export function validateActionRules(turn, state) {
  const action = String(turn.nextAction || "");
  const patch = turn.statePatch && typeof turn.statePatch === "object" ? turn.statePatch : {};

  if (action === "FORMULATE") {
    const wf =
      normalizeWorkingFormulation(patch.workingFormulation) ||
      normalizeWorkingFormulation(state.workingFormulation);
    if (!wf?.primaryHypothesis) {
      return { ok: false, reason: "formulate_missing_hypothesis" };
    }
  }

  if (action === "SIMULATE") {
    const wf =
      normalizeWorkingFormulation(patch.workingFormulation) ||
      normalizeWorkingFormulation(state.workingFormulation);
    if (!wf?.primaryHypothesis) {
      return { ok: false, reason: "simulate_missing_hypothesis" };
    }
    if (!wf.primaryHypothesis.testable && wf.primaryHypothesis.confidence < EXECUTABLE_CONFIDENCE) {
      return { ok: false, reason: "simulate_not_testable" };
    }
  }

  if (action === "DISCRIMINATE") {
    const questions = (turn.assistantText.match(/[?？]/g) || []).length;
    if (questions > 1) {
      return { ok: false, reason: "discriminate_too_many_questions" };
    }
  }

  if (action === "SAFETY_OVERRIDE") {
    const hits = scanBlockedContent(turn.assistantText, { allowRomanceAdvice: false });
    const romanceHits = hits.filter((h) => h.id === "romance_advice_under_safety");
    if (romanceHits.length > 0) {
      return { ok: false, reason: "safety_override_romance_blocked", hits: romanceHits };
    }
  }

  if (action === "ADVISE" && Array.isArray(state.safetyFlags) && state.safetyFlags.length > 0) {
    return { ok: false, reason: "advise_blocked_by_safety_flags" };
  }

  return { ok: true };
}

/**
 * @param {object} turn
 * @param {object} state
 */
export function validateRelationshipTurn(turn, state) {
  if (!turn || typeof turn !== "object") {
    return { ok: false, reason: "invalid_turn" };
  }

  const action = String(turn.nextAction || "");
  if (!RELATIONSHIP_ACTIONS.includes(action)) {
    return { ok: false, reason: "unknown_next_action", nextAction: action };
  }

  const contentHits = scanBlockedContent(turn.assistantText, {
    allowRomanceAdvice: action === "SAFETY_OVERRIDE" ? false : action !== "ADVISE",
  });
  const filteredHits =
    action === "SAFETY_OVERRIDE"
      ? contentHits
      : contentHits.filter((h) => h.id !== "romance_advice_under_safety");
  if (filteredHits.length > 0) {
    const romanceUnderSafety = filteredHits.some((h) => h.id === "romance_advice_under_safety");
    if (action === "SAFETY_OVERRIDE" && romanceUnderSafety) {
      return { ok: false, reason: "safety_override_romance_blocked", hits: filteredHits };
    }
    return { ok: false, reason: "blocked_content", hits: filteredHits };
  }

  const patch = turn.statePatch && typeof turn.statePatch === "object" ? turn.statePatch : {};
  const cap = validateHypothesisCap(patch, state);
  if (!cap.ok) return cap;

  const budget = validateQuestionBudget(turn, state);
  if (!budget.ok) return budget;

  const simulate = validateSimulatePreference(turn, state);
  if (!simulate.ok) return simulate;

  const actions = validateActionRules(turn, state);
  if (!actions.ok) return actions;

  return { ok: true };
}

/**
 * Merge host patch with relationship-specific normalization (question streak, formulation shape).
 * @param {Record<string, unknown>} patch
 * @param {object} state
 * @param {{ assistantText?: string, nextAction?: string }} [turn]
 */
export function applyRelationshipPatch(patch, state, turn = {}) {
  const base = patch && typeof patch === "object" ? { ...patch } : {};
  const prevStreak = Number(state.questionEndingStreak ?? 0);
  const endedWithQuestion = endsWithAcquisitionQuestion(turn.assistantText || "");
  const nextStreak = endedWithQuestion ? prevStreak + 1 : 0;

  if (base.workingFormulation != null) {
    const normalized = normalizeWorkingFormulation(base.workingFormulation);
    if (normalized) base.workingFormulation = normalized;
  }

  if (String(turn.nextAction) === "FORMULATE") {
    base.questionEndingStreak = 0;
  } else if (base.questionEndingStreak == null) {
    base.questionEndingStreak = nextStreak;
  }

  if (Array.isArray(state.safetyFlags) && state.safetyFlags.length > 0) {
    if (!Array.isArray(base.safetyFlags)) {
      base.safetyFlags = [...state.safetyFlags];
    }
  }

  return base;
}

/** Adapter hook surface for runtime. */
export const relationshipIntelligenceAdapter = Object.freeze({
  skillId: SKILL_ID,
  allowedActions: RELATIONSHIP_ACTIONS,
  validateTurn(turn, state) {
    return validateRelationshipTurn(turn, state);
  },
  preparePatch(patch, state, turn) {
    return applyRelationshipPatch(patch, state, turn);
  },
});
