/**
 * Relationship planner (important events only).
 * Deterministic heuristics + optional model hook stub. Never runs per-token.
 */

import {
  applyAcceptedRelationPatch,
  getRelationshipState,
  saveRelationshipState,
} from "../experience/relationship.js";
import { isFeatureEnabled } from "../features/flags.js";

export const IMPORTANT_EVENT_TYPES = Object.freeze([
  "conflict",
  "promise",
  "offline_return",
  "anniversary",
  "strong_emotion",
]);

const EVENT_PATTERNS = Object.freeze({
  conflict: /吵架|生气|误会|对不起|原谅|冷战|分手|别这样|你错了|我不理|哄我|和好/,
  promise: /答应|约定|promise|一定会|记住要|下次|保证|说好|别忘了/,
  offline_return: /好久不见|回来了|终于上线|刚回来|失踪|失联|很久没聊/,
  anniversary: /纪念日|周年|birthday|生日|在一起.{0,6}天|相识.{0,6}天|第.{0,4}年/,
  strong_emotion: /爱你|喜欢|想你|难过|开心|激动|哭|感动|心动|心疼|好想|太棒了|崩溃/,
});

/**
 * @param {{
 *   userText?: string,
 *   assistantText?: string,
 *   eventType?: string,
 *   meta?: object,
 *   nowIso?: string,
 * }} input
 * @returns {{ type: string|null, confidence: number, signals: string[] }}
 */
export function detectImportantEvent(input = {}) {
  const explicit = String(input.eventType || input.meta?.companionEventType || "").trim();
  if (explicit && IMPORTANT_EVENT_TYPES.includes(explicit)) {
    return { type: explicit, confidence: 1, signals: ["explicit"] };
  }
  if (input.meta?.offlineReturn === true) {
    return { type: "offline_return", confidence: 0.95, signals: ["meta.offlineReturn"] };
  }
  if (input.meta?.anniversary === true) {
    return { type: "anniversary", confidence: 0.95, signals: ["meta.anniversary"] };
  }

  const blob = `${String(input.userText || "")}\n${String(input.assistantText || "")}`;
  const signals = [];
  let best = null;
  let bestScore = 0;
  for (const type of IMPORTANT_EVENT_TYPES) {
    const re = EVENT_PATTERNS[type];
    if (!re?.test(blob)) continue;
    const score = type === "strong_emotion" ? 0.55 : 0.72;
    signals.push(type);
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return { type: best, confidence: bestScore, signals };
}

/**
 * Numeric intimacy/trust/tension deltas are allowed only in scenario / simulation paths.
 * Ordinary companion chat must never produce or apply them (W1 止血).
 * @param {object} [input]
 * @returns {boolean}
 */
export function allowsNumericRelationshipDeltas(input = {}) {
  if (input.allowNumericRelationship === true) return true;
  if (input.meta?.allowNumericRelationship === true) return true;
  if (input.meta?.scenarioFinale === true) return true;
  const ns = String(input.realityNamespace || input.meta?.realityNamespace || "").trim();
  return ns === "shared_fiction" || ns === "simulation";
}

function buildRelationshipDelta(eventType) {
  switch (eventType) {
    case "conflict":
      return { intimacyDelta: -0.15, trustDelta: -0.2, tensionDelta: 0.35, kind: "conflict" };
    case "promise":
      return { intimacyDelta: 0.1, trustDelta: 0.25, tensionDelta: -0.1, kind: "promise", flags: ["active_promise"] };
    case "offline_return":
      return { intimacyDelta: 0.15, trustDelta: 0.05, tensionDelta: -0.05, kind: "offline_return" };
    case "anniversary":
      return { intimacyDelta: 0.25, trustDelta: 0.1, tensionDelta: -0.1, kind: "anniversary", flags: ["anniversary_noted"] };
    case "strong_emotion":
      return { intimacyDelta: 0.12, trustDelta: 0.08, tensionDelta: 0, kind: "strong_emotion" };
    default:
      return null;
  }
}

function buildGoals(eventType, userText = "") {
  const snippet = String(userText || "").trim().slice(0, 48);
  const base = snippet ? `跟进：${snippet}` : "";
  switch (eventType) {
    case "conflict":
      return ["缓和语气", "确认对方真实诉求", base].filter(Boolean);
    case "promise":
      return ["记录承诺细节", "在合适时机主动提起", base].filter(Boolean);
    case "offline_return":
      return ["自然问候回归", "避免追问失联原因", base].filter(Boolean);
    case "anniversary":
      return ["准备轻量庆祝或回忆", "避免过度仪式感", base].filter(Boolean);
    case "strong_emotion":
      return ["匹配情绪强度", "给予具体回应而非空泛安慰", base].filter(Boolean);
    default:
      return [];
  }
}

function buildProactiveCandidates(eventType) {
  switch (eventType) {
    case "conflict":
      return [{ id: "check_in_after_conflict", tone: "gentle", delayHours: 4 }];
    case "promise":
      return [{ id: "promise_reminder", tone: "warm", delayHours: 24 }];
    case "offline_return":
      return [{ id: "welcome_back", tone: "casual", delayHours: 1 }];
    case "anniversary":
      return [{ id: "anniversary_moment", tone: "celebratory", delayHours: 12 }];
    case "strong_emotion":
      return [{ id: "emotion_follow_up", tone: "caring", delayHours: 6 }];
    default:
      return [];
  }
}

function buildDiaryHint(eventType, userText = "") {
  const t = String(userText || "").trim().slice(0, 80);
  switch (eventType) {
    case "conflict":
      return t ? `关系小摩擦：${t}` : "关系出现摩擦，值得记入日记";
    case "promise":
      return t ? `新的约定：${t}` : "出现新的约定";
    case "offline_return":
      return "久别重逢的一次聊天";
    case "anniversary":
      return "纪念日相关的对话";
    case "strong_emotion":
      return t ? `情绪高点：${t}` : "强烈的情绪表达";
    default:
      return "";
  }
}

function buildFeedHint(eventType) {
  switch (eventType) {
    case "anniversary":
      return "可发一条纪念向朋友圈（非必须）";
    case "strong_emotion":
      return "可分享一句心情动态";
    case "offline_return":
      return "可发回归问候动态";
    default:
      return "";
  }
}

/**
 * @param {{
 *   characterId: string,
 *   sessionId?: string,
 *   userText?: string,
 *   assistantText?: string,
 *   eventType?: string,
 *   meta?: object,
 *   apply?: boolean,
 *   allowNumericRelationship?: boolean,
 *   realityNamespace?: string,
 *   projectionKey?: string,
 *   nowIso?: string,
 * }} input
 */
export function planRelationship(input = {}) {
  const characterId = String(input.characterId || "").trim();
  if (!characterId) {
    return { ok: false, reason: "missing_character", skipped: true };
  }

  const detected = detectImportantEvent(input);
  if (!detected.type) {
    return { ok: true, skipped: true, reason: "no_important_event", detected };
  }

  const allowNumeric = allowsNumericRelationshipDeltas(input);
  const relationshipDelta = allowNumeric ? buildRelationshipDelta(detected.type) : null;
  const goals = buildGoals(detected.type, input.userText);
  const proactiveCandidates = buildProactiveCandidates(detected.type);
  const diaryHint = buildDiaryHint(detected.type, input.userText);
  const feedHint = buildFeedHint(detected.type);
  const nowIso = input.nowIso || new Date().toISOString();

  // W8: when Continuity is on, ordinary path must not READ intimacy for UX.
  // Scenario/shared_fiction still loads and may apply numeric deltas.
  const continuityOn = isFeatureEnabled("relationshipContinuityV1");
  let relationshipState = null;
  let applied = false;
  if (allowNumeric) {
    relationshipState = getRelationshipState(characterId);
    if (input.apply !== false && relationshipDelta) {
      const projectionKey = String(
        input.projectionKey || `cp9:${detected.type}:${input.sessionId || "session"}:${nowIso.slice(0, 10)}`,
      ).trim();
      const patchResult = applyAcceptedRelationPatch(relationshipState, relationshipDelta, {
        characterId,
        sessionId: input.sessionId,
        projectionKey,
        summary: diaryHint || detected.type,
        at: nowIso,
      });
      if (patchResult.applied) {
        relationshipState = patchResult.state;
        saveRelationshipState(characterId, relationshipState);
        applied = true;
      }
    }
  } else if (!continuityOn) {
    // Legacy read-only mirror when Continuity flag is off (pre-cutover).
    relationshipState = getRelationshipState(characterId);
  }

  return {
    ok: true,
    skipped: false,
    eventType: detected.type,
    confidence: detected.confidence,
    signals: detected.signals,
    relationshipDelta,
    allowNumericRelationship: allowNumeric,
    goals,
    proactiveCandidates,
    diaryHint,
    feedHint,
    applied,
    relationshipState,
    legacyScenarioMetrics: allowNumeric ? relationshipState : undefined,
    plannedAt: nowIso,
  };
}

/**
 * Optional model hook stub — defaults to deterministic planner.
 * @param {object} input
 * @param {{ modelFn?: (prompt: string) => Promise<object|null> }} [opts]
 */
export async function planRelationshipWithModel(input = {}, opts = {}) {
  if (typeof opts.modelFn === "function") {
    try {
      const prompt = [
        "Companion relationship planner stub.",
        `event=${input.eventType || "auto"}`,
        `user=${String(input.userText || "").slice(0, 200)}`,
      ].join("\n");
      const modelPlan = await opts.modelFn(prompt);
      if (modelPlan && typeof modelPlan === "object") {
        return { ...planRelationship(input), modelAugment: modelPlan, source: "model+heuristic" };
      }
    } catch {
      /* fall through */
    }
  }
  return { ...planRelationship(input), source: "heuristic" };
}
