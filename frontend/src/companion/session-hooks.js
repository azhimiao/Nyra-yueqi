/**
 * Minimal companion layer hooks (not per-message agent loop).
 * Operational Agent Memory (OpenClaw / studio-assist) stays separate from lover chat.
 */

import { consolidateSessionMemory } from "./memory-consolidator.js";
import { ingestRelationshipPlanIntoLifeState } from "./life-state.js";
import { planRelationship } from "./relationship-planner.js";
import { isFeatureEnabled } from "../features/flags.js";
import { refreshRelationshipContinuity } from "../relationship/index.js";

/**
 * Best-effort Continuity refresh after confirmed/important relationship signals (W6).
 * @param {{ characterId?: string, companionId?: string, userId?: string }} input
 */
function maybeRefreshContinuity(input = {}) {
  if (!isFeatureEnabled("relationshipContinuityV1")) return null;
  const companionId = String(input.companionId || input.characterId || "").trim();
  if (!companionId) return null;
  try {
    return refreshRelationshipContinuity({
      companionId,
      userId: String(input.userId || "local").trim() || "local",
    });
  } catch {
    return null;
  }
}

export const DEFAULT_PLAN_EVERY_N_TURNS = 8;
export const DEFAULT_CONSOLIDATE_EVERY_N_TURNS = 16;

/** @type {Map<string, { turns: number, lastUserText: string, lastAssistantText: string, messages: object[] }>} */
const sessionBuffers = new Map();

function bufferKey(characterId, sessionId) {
  return `${characterId}::${sessionId}`;
}

function getBuffer(characterId, sessionId) {
  const key = bufferKey(characterId, sessionId);
  if (!sessionBuffers.has(key)) {
    sessionBuffers.set(key, { turns: 0, lastUserText: "", lastAssistantText: "", messages: [] });
  }
  return sessionBuffers.get(key);
}

/**
 * After a completed chat turn — planner only on important events or every N turns.
 * Ordinary companion chat never applies intimacy/trust/tension deltas (W1).
 * @param {{
 *   characterId: string,
 *   sessionId: string,
 *   userText?: string,
 *   assistantText?: string,
 *   meta?: object,
 *   planEveryNTurns?: number,
 * }} input
 */
export function onCompanionChatTurn(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const sessionId = String(input.sessionId || "").trim();
  if (!characterId || !sessionId) {
    return { ok: false, reason: "missing_session_context" };
  }

  const buf = getBuffer(characterId, sessionId);
  const userText = String(input.userText || "").trim();
  const assistantText = String(input.assistantText || "").trim();
  if (userText) {
    buf.messages.push({ role: "user", content: userText });
    buf.lastUserText = userText;
  }
  if (assistantText) {
    buf.messages.push({ role: "assistant", content: assistantText });
    buf.lastAssistantText = assistantText;
  }
  buf.turns += 1;
  if (buf.messages.length > 48) buf.messages.splice(0, buf.messages.length - 48);

  const planEvery = Math.max(4, Number(input.planEveryNTurns) || DEFAULT_PLAN_EVERY_N_TURNS);
  // W1: ordinary reality chat — detect events / goals only; never apply numeric deltas.
  const important = planRelationship({
    characterId,
    sessionId,
    userText,
    assistantText,
    meta: input.meta,
    apply: true,
    allowNumericRelationship: false,
  });

  let periodicPlan = null;
  /** @type {Promise|object|null} */
  let continuityRefresh = null;
  if (!important.skipped && important.eventType) {
    ingestRelationshipPlanIntoLifeState(characterId, important);
    continuityRefresh = maybeRefreshContinuity({ characterId, userId: input.userId });
  } else if (buf.turns % planEvery === 0) {
    periodicPlan = planRelationship({
      characterId,
      sessionId,
      userText: buf.lastUserText,
      assistantText: buf.lastAssistantText,
      meta: { ...input.meta, companionPeriodic: true },
      apply: false,
      allowNumericRelationship: false,
    });
  }

  return {
    ok: true,
    turns: buf.turns,
    importantPlan: important.skipped ? null : important,
    periodicPlan: periodicPlan?.skipped ? null : periodicPlan,
    continuityRefresh,
  };
}

/**
 * Explicit important event (conflict, promise, offline return, etc.).
 * Numeric deltas only when caller opts in (scenario / simulation).
 */
export function onCompanionImportantEvent(input = {}) {
  const plan = planRelationship({
    ...input,
    apply: input.apply !== false,
    allowNumericRelationship: input.allowNumericRelationship === true
      || input.meta?.allowNumericRelationship === true
      || input.meta?.scenarioFinale === true
      || ["shared_fiction", "simulation"].includes(String(input.realityNamespace || input.meta?.realityNamespace || "")),
  });
  if (!plan.skipped && input.characterId) {
    ingestRelationshipPlanIntoLifeState(String(input.characterId), plan);
    maybeRefreshContinuity({
      characterId: String(input.characterId),
      userId: input.userId,
    });
  }
  return plan;
}

/**
 * Session end / idle — consolidate memory; never blocks UI.
 * @param {{
 *   characterId: string,
 *   sessionId: string,
 *   messages?: object[],
 *   ingest?: boolean,
 * }} input
 */
export function onCompanionSessionEnd(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const sessionId = String(input.sessionId || "").trim();
  if (!characterId || !sessionId) {
    return { ok: false, reason: "missing_session_context" };
  }

  const buf = getBuffer(characterId, sessionId);
  const messages = Array.isArray(input.messages) && input.messages.length
    ? input.messages
    : buf.messages.slice();

  const result = consolidateSessionMemory({
    characterId,
    sessionId,
    messages,
    ingest: input.ingest,
  });

  sessionBuffers.delete(bufferKey(characterId, sessionId));
  return result;
}

export function __resetCompanionSessionHooksForTests() {
  sessionBuffers.clear();
}

/**
 * Remove buffered turn text that no longer exists in Conversation V2.
 * Buffers are not keyed by message id, so matching is by exact content.
 */
export function forgetCompanionChatSource({ characterId, sessionId, texts = [] } = {}) {
  const cid = String(characterId || "").trim();
  const sid = String(sessionId || "").trim();
  const dropped = new Set(
    (Array.isArray(texts) ? texts : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  if (!cid || !sid || !dropped.size) return { ok: true, dropped: 0 };
  const buf = sessionBuffers.get(bufferKey(cid, sid));
  if (!buf) return { ok: true, dropped: 0 };
  const before = buf.messages.length;
  buf.messages = buf.messages.filter((row) => !dropped.has(String(row?.content || "").trim()));
  if (dropped.has(buf.lastUserText)) buf.lastUserText = "";
  if (dropped.has(buf.lastAssistantText)) buf.lastAssistantText = "";
  return { ok: true, dropped: before - buf.messages.length };
}
