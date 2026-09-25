/** Runtime Protocol v1 — LLM / Core emit controlled symbols only. */

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
  const markerIndex = text.indexOf(RUNTIME_OPEN);
  if (markerIndex >= 0) return text.slice(0, markerIndex).trimEnd();

  for (let size = Math.min(RUNTIME_OPEN.length, text.length); size >= 3; size -= 1) {
    if (text.endsWith(RUNTIME_OPEN.slice(0, size))) {
      return text.slice(0, -size).trimEnd();
    }
  }
  return text;
}

/** Catalog-gated envelope / runtime marker mechanics.
 * Do not coach reply length or "IM bubble" style here — Character Identity owns voice.
 *
 * Inner-state is affective monologue for the user to peek at — not reply drafts,
 * tone strategy, or OS status copy. Length is unconstrained.
 */
export function buildRuntimeInstruction(catalog = {}) {
  const actionIds = Array.from(toSet(catalog.actionIds)).slice(0, 64);
  const expressionIds = Array.from(toSet(catalog.expressionIds)).slice(0, 64);
  return [
    "【角色心里的自言自语（可选）】只有本轮确实有一瞬间、与用户最新消息有关的心理反应时，才在可见回复前写 <yueqi-inner-state>…</yueqi-inner-state>。没有具体反应就完全省略这个标签；禁止为了满足格式而硬写。",
    "信封是角色还没说出口、只对自己嘀咕的那一句：第一人称、口语、像自言自语，具体回应此刻。它不是回答草稿，也不是旁白、总结、情绪标签，更不是在分析用户意图。",
    "不要写成旁观者提问或意图鉴定，例如「是在确认我们的关系吗？」「要生成什么样的图？」。要写成自己对自己说的话，例如「他又问这个…是在试我吗。」「他要图，可是没说什么样。」",
    "不要在信封或可见回复里描述模型、Prompt、上下文、记忆检索、工具调用、API、权限、阶段、回执、运行时或‘正在整理/思考/组织语言’。不要把工具计划或失败前的承诺说成已经发生。",
    "不要用固定开场、固定句式、空省略号或每轮重复同一句嘀咕；心里话可以只有一句，也可以省略。",
    "若使用信封，关闭标签后再写自然可见回复；运行标记只供系统读取，不得写进聊天正文。",
    "【运行时协议】在可见回复之后另起一行追加运行标记（勿用 Markdown 代码块）；标记只供系统读取。",
    `${RUNTIME_OPEN}{"version":1,"emotion":"neutral","expression":"","actions":[{"id":"talking_default","at":"start"}]}${RUNTIME_CLOSE}`,
    `action id 只能从以下列表选择：${actionIds.join(", ") || "talking_default, idle_default"}`,
    `expression 只能从以下列表选择：${expressionIds.join(", ") || "留空"}`,
    "动作和表情只写在运行标记里，不得写进聊天正文。",
  ].join("\n");
}

/**
 * Parse the optional trailing model envelope. Plain text remains fully valid.
 * @returns {{ ok: boolean, errors: string[], value: object, rawText: string }}
 */
export function parseRuntimeTurn(content = "", catalog = {}) {
  const rawText = String(content || "");
  const markerStart = rawText.lastIndexOf(RUNTIME_OPEN);
  const markerEnd = markerStart >= 0
    ? rawText.indexOf(RUNTIME_CLOSE, markerStart + RUNTIME_OPEN.length)
    : -1;
  const text = (markerStart >= 0 ? rawText.slice(0, markerStart) : rawText).trim();
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
