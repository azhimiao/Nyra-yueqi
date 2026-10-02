/** Scenario run phase machine — CEV2 §6.1 */

import { SCENARIO_PHASES } from "./schema.js";

const PHASE_SET = new Set(SCENARIO_PHASES);

/** Explicit transitions only. */
const TRANSITIONS = Object.freeze({
  library: ["setup"],
  setup: ["opening", "library"],
  opening: ["playing", "paused", "library"],
  playing: ["waiting_choice", "waiting_user", "resolving", "paused", "finale"],
  waiting_choice: ["resolving", "waiting_user", "paused", "finale"],
  waiting_user: ["resolving", "waiting_choice", "paused", "finale"],
  resolving: ["playing", "waiting_choice", "finale", "paused"],
  paused: ["playing", "waiting_choice", "waiting_user", "opening", "library", "finale"],
  finale: ["memory_commit", "library"],
  memory_commit: ["library"],
});

/**
 * @param {string} phase
 */
export function normalizePhase(phase) {
  const p = String(phase || "").trim();
  return PHASE_SET.has(p) ? p : "library";
}

/**
 * @param {string} from
 * @param {string} to
 */
export function canTransition(from, to) {
  const a = normalizePhase(from);
  const b = normalizePhase(to);
  if (a === b) return true;
  return (TRANSITIONS[a] || []).includes(b);
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {{ ok: boolean, phase: string, error?: string }}
 */
export function transitionPhase(from, to) {
  const a = normalizePhase(from);
  const b = normalizePhase(to);
  if (a === b) return { ok: true, phase: a };
  if (!canTransition(a, b)) {
    return { ok: false, phase: a, error: `illegal_transition:${a}->${b}` };
  }
  return { ok: true, phase: b };
}

/**
 * Map store run.status + director phase into canonical phase.
 * @param {{ status?: string, phase?: string, directorState?: { phase?: string } }} run
 */
export function phaseFromRun(run) {
  if (!run) return "library";
  const explicit = run.phase || run.directorState?.phase;
  if (explicit && PHASE_SET.has(explicit)) return explicit;
  if (run.status === "paused") return "paused";
  if (run.status === "ended") {
    return run.memoryCommitted ? "memory_commit" : "finale";
  }
  if (run.status === "active") {
    const beats = run.beats?.length || 0;
    if (beats <= 1) return "opening";
    return "playing";
  }
  return "library";
}

/**
 * After applying a ScenarioTurn, pick waiting_* vs finale.
 * @param {object} turn
 * @param {{ beatCount?: number }} [ctx]
 */
export function phaseAfterTurn(turn, ctx = {}) {
  if (turn?.suggestEnding && (ctx.beatCount || 0) >= 6) return "finale";
  if (Array.isArray(turn?.choices) && turn.choices.length >= 2) return "waiting_choice";
  return "waiting_user";
}

export function isInteractivePhase(phase) {
  const p = normalizePhase(phase);
  return p === "waiting_choice" || p === "waiting_user" || p === "playing";
}

export function isPausedPhase(phase) {
  return normalizePhase(phase) === "paused";
}
