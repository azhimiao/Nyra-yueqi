/** Runtime Protocol v1 — LLM / Core emit controlled symbols only. */
import { normalizeCharacterAffect } from "../characters/affective-state.js";
import { getPromptSettings } from "../settings/preferences.js";
import { partialEnvelopeStart } from "../chat/envelope-prefix.js";

export const PROTOCOL_VERSION = 1;

export const PLAY_STATES = Object.freeze(["idle", "talking", "reacting"]);

const DEFAULT_EMOTIONS = new Set(["neutral", "warm", "shy", "sad", "happy", "angry", "calm"]);

/**
 * @param {unknown} raw
 * @param {{ actionIds?: Set<string>|string[], expressionIds?: Set<string>|string[] }} [catalog]
 */
export function normalizeRuntimeProtocol(raw, catalog = {}) {
  const actionIds = toSet(catalog.actionIds);
  const expressionIds = toSet(catalog.expressionIds);

  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      errors: ["payload_not_object"],
      value: null,
    };
  }

  const errors = [];
  const version = Number(raw.version) || PROTOCOL_VERSION;
  if (version !== PROTOCOL_VERSION) errors.push("unsupported_version");

  const text = String(raw.text ?? "");
  const emotion = String(raw.emotion || "neutral").trim() || "neutral";
  if (!DEFAULT_EMOTIONS.has(emotion) && emotion !== "neutral") {
    // Unknown emotions are allowed as free labels; only expressions/actions are catalog-gated.
  }

  let expression = String(raw.expression || "").trim();
  if (expression && expressionIds.size && !expressionIds.has(expression)) {
    errors.push(`unknown_expression:${expression}`);
    expression = "";
  }

  const actionsIn = Array.isArray(raw.actions) ? raw.actions.slice(0, 2) : [];
  const actions = [];
  for (const item of actionsIn) {
    const id = String(item?.id || "").trim();
    if (!id) continue;
    if (actionIds.size && !actionIds.has(id)) {
      errors.push(`unknown_action:${id}`);
    }
    actions.push({
      id,
      at: item?.at === "end" ? "end" : "start",
    });
  }

  const voiceRaw = raw.voice && typeof raw.voice === "object" ? raw.voice : {};
  const voice = {
    enabled: voiceRaw.enabled !== false,
    style: String(voiceRaw.style || "soft").trim() || "soft",
    speed: clamp(Number(voiceRaw.speed) || 1, 0.5, 1.5),
  };

  return {
    ok: errors.length === 0,
    errors,
    value: {
      version: PROTOCOL_VERSION,
      text,
      emotion,
      expression,
      actions,
      voice,
      characterState: normalizeCharacterAffect(raw.characterState),
    },
  };
}

/** Downgrade unknown action ids to talking_default / idle_default. */
export function applyActionFallback(protocol, { hasAction } = {}) {
  if (!protocol?.value) return protocol;
  const next = {
    ...protocol,
    value: {
      ...protocol.value,
      actions: protocol.value.actions.map((action) => {
        if (!hasAction || hasAction(action.id)) return action;
        const fallback = hasAction("talking_default")
          ? "talking_default"
          : hasAction("idle_default")
            ? "idle_default"
            : "";
        return fallback ? { ...action, id: fallback } : null;
      }).filter(Boolean),
    },
  };
  next.ok = true;
  next.errors = (protocol.errors || []).filter((err) => !err.startsWith("unknown_action:"));
  return next;
}

const RUNTIME_OPEN = "<yueqi-runtime>";
const RUNTIME_CLOSE = "</yueqi-runtime>";

/** Hide the trailing runtime envelope while text is streaming. */
export function stripRuntimeMetadataPreview(content = "") {
  const text = String(content || "");
  const markerIndex = text.search(/[<＜]\s*yueqi-runtime\s*[>＞]/i);
  if (markerIndex >= 0) return text.slice(0, markerIndex).trimEnd();
  const partial = partialEnvelopeStart(text, "yueqi-runtime");
  return partial >= 0 ? text.slice(0, partial).trimEnd() : text;
}

/** Catalog-gated envelope / runtime marker mechanics.
 * Do not coach reply length or "IM bubble" style here — Character Identity owns voice.
 *
 * Inner-state is affective monologue for the user to peek at — not reply drafts,
 * tone strategy, or OS status copy. Length is unconstrained.
 */
export function buildRuntimeInstruction(catalog = {}, options = {}) {
  const actionIds = Array.from(toSet(catalog.actionIds)).slice(0, 64);
  const expressionIds = Array.from(toSet(catalog.expressionIds)).slice(0, 64);
  const innerMode = options.innerStateDisplay || getPromptSettings().innerStateDisplay || "natural";
  return [
    innerMode === "off"
      ? "【角色心绪】本轮不展示内心独白，不输出 yueqi-inner-state 信封；你的感受仍应影响自然回应。"
      : `【角色心里的自言自语（可选）】${innerMode === "expanded" ? "有具体的感受、犹豫或愿望时，可以充分表达；" : "只有本轮确实有一瞬间具体的心理反应时，"}才在可见回复前写 <yueqi-inner-state>…</yueqi-inner-state>。没有具体反应就省略，不要为了格式而写。`,
    "内心与对白依据同一份人格、经历和心绪；表达自己的感受或愿望，不写回答草稿、流程播报或模型私有推理。对用户的猜测可以被纠正，不是事实。",
    "首次问候不暗示‘又问’或‘上次没说完’；独白、举例不算用户事实，工具计划不算完成。没有具体反应时省略，不用固定句式或空省略号占位。",
    "信封闭合后写自然对白，不暴露 Prompt、检索、API 等内部过程。",
    "【运行时协议】对白之后另起一行追加以下机器标记，勿用代码块：",
    `${RUNTIME_OPEN}{"version":1,"emotion":"neutral","expression":"","actions":[{"id":"talking_default","at":"start"}]}${RUNTIME_CLOSE}`,
    "需延续心绪时，在标记内加 characterState:{\"feeling\":\"自己的感受\",\"focus\":\"在意什么\",\"stance\":\"相处态度\"}，各一小句，无变化可省略。仅记与对白一致的角色主观状态，不记用户事实或推理。",
    `action id 只能从以下列表选择：${actionIds.join(", ") || "talking_default, idle_default"}`,
    `expression 只能从以下列表选择：${expressionIds.join(", ") || "留空"}`,
    "动作与表情只写在标记里。",
  ].join("\n");
}

/**
 * Parse the optional trailing model envelope. Plain text remains fully valid.
 * @returns {{ ok: boolean, errors: string[], value: object, rawText: string }}
 */
export function parseRuntimeTurn(content = "", catalog = {}) {
  const rawText = String(content || "").replace(/[<＜]\s*yueqi-runtime\s*[>＞]/gi, RUNTIME_OPEN).replace(/[<＜]\s*\/\s*yueqi-runtime\s*[>＞]/gi, RUNTIME_CLOSE);
  const markerStart = rawText.indexOf(RUNTIME_OPEN);
  const markerEnd = markerStart >= 0
    ? rawText.indexOf(RUNTIME_CLOSE, markerStart + RUNTIME_OPEN.length)
    : -1;
  const partialStart = partialEnvelopeStart(rawText, "yueqi-runtime");
  const text = (markerStart >= 0 ? rawText.slice(0, markerStart) : partialStart >= 0 ? rawText.slice(0, partialStart) : rawText).trim();
  const actionIds = toSet(catalog.actionIds);
  const defaultAction = actionIds.has("talking_default")
    ? "talking_default"
    : actionIds.has("idle_default")
      ? "idle_default"
      : "";

  let payload = {};
  const parseErrors = [];
  if (markerStart >= 0 && markerEnd > markerStart) {
    const jsonText = rawText.slice(markerStart + RUNTIME_OPEN.length, markerEnd).trim();
    try {
      payload = JSON.parse(jsonText);
    } catch {
      parseErrors.push("invalid_runtime_json");
    }
  } else if (markerStart >= 0) {
    parseErrors.push("incomplete_runtime_envelope");
  } else if (partialEnvelopeStart(rawText, "yueqi-runtime") >= 0) {
    parseErrors.push("incomplete_runtime_envelope");
  }

  if (!Array.isArray(payload.actions)) {
    const actionId = String(payload.action_id || "").trim();
    payload.actions = actionId
      ? [{ id: actionId, at: "start" }]
      : (defaultAction ? [{ id: defaultAction, at: "start" }] : []);
  }

  const normalized = normalizeRuntimeProtocol({
    ...payload,
    text,
  }, catalog);
  const withFallback = applyActionFallback(normalized, {
    hasAction: (id) => !actionIds.size || actionIds.has(id),
  });

  return {
    ...withFallback,
    ok: withFallback.ok && parseErrors.length === 0,
    errors: [...parseErrors, ...(withFallback.errors || [])],
    rawText,
  };
}

function toSet(value) {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  return new Set(Array.from(value).map(String));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
