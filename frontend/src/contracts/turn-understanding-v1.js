/**
 * TurnUnderstanding V1 — unified chat-turn interpretation (plan §5.3).
 * Produces evidence-backed proposals; does not execute side effects (W3 shadow).
 */

import { mintId } from "./ids.js";
import { createTemporalSnapshotV1, validateTemporalSnapshotV1 } from "./temporal-snapshot-v1.js";

export const TURN_UNDERSTANDING_SCHEMA_VERSION = 1;

export const CONVERSATIONAL_INTENTS = Object.freeze([
  "chat",
  "question",
  "control",
  "task",
  "mixed",
]);

export const TURN_INTERPRETERS = Object.freeze(["model", "deterministic"]);

/**
 * @param {object} raw
 */
export function validateTurnUnderstandingV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== TURN_UNDERSTANDING_SCHEMA_VERSION) errors.push("schemaVersion");
  if (!String(raw.turnId ?? "").trim()) errors.push("turnId");
  if (!raw.scope || typeof raw.scope !== "object") errors.push("scope");
  const snap = validateTemporalSnapshotV1(raw.temporalSnapshot);
  if (!snap.ok) errors.push("temporalSnapshot");
  if (!CONVERSATIONAL_INTENTS.includes(raw.conversationalIntent)) {
    errors.push("conversationalIntent_enum");
  }
  if (!TURN_INTERPRETERS.includes(raw.interpreter)) errors.push("interpreter_enum");
  for (const key of [
    "memoryCandidates",
    "temporalMentions",
    "eventProposals",
    "actionProposals",
    "relationshipSignals",
    "webRequests",
    "evidenceRefs",
  ]) {
    if (!Array.isArray(raw[key])) errors.push(key);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 * @param {{ clock?: object }} [opts]
 */
export function createTurnUnderstandingV1(input = {}, opts = {}) {
  const intent = CONVERSATIONAL_INTENTS.includes(input.conversationalIntent)
    ? input.conversationalIntent
    : "chat";
  const interpreter = TURN_INTERPRETERS.includes(input.interpreter)
    ? input.interpreter
    : "deterministic";
  const temporalSnapshot =
    input.temporalSnapshot && validateTemporalSnapshotV1(input.temporalSnapshot).ok
      ? input.temporalSnapshot
      : createTemporalSnapshotV1(
        {
          timezone: input.timezone,
          locale: input.locale,
          ...(input.temporalSnapshot && typeof input.temporalSnapshot === "object"
            ? input.temporalSnapshot
            : {}),
        },
        opts,
      );

  return {
    schemaVersion: TURN_UNDERSTANDING_SCHEMA_VERSION,
    turnId: String(input.turnId || mintId("requestId", "turn")).trim(),
    scope: input.scope && typeof input.scope === "object" ? { ...input.scope } : {},
    temporalSnapshot,
    conversationalIntent: intent,
    memoryCandidates: Array.isArray(input.memoryCandidates) ? [...input.memoryCandidates] : [],
    temporalMentions: Array.isArray(input.temporalMentions) ? [...input.temporalMentions] : [],
    eventProposals: Array.isArray(input.eventProposals) ? [...input.eventProposals] : [],
    actionProposals: Array.isArray(input.actionProposals) ? [...input.actionProposals] : [],
    relationshipSignals: Array.isArray(input.relationshipSignals)
      ? [...input.relationshipSignals]
      : [],
    webRequests: Array.isArray(input.webRequests) ? [...input.webRequests] : [],
    evidenceRefs: Array.isArray(input.evidenceRefs)
      ? input.evidenceRefs.map((r) => String(r)).filter(Boolean)
      : [],
    interpreter,
  };
}
