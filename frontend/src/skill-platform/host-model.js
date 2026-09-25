/**
 * Bridge Host envelope → OpenAI-compatible callModel → SkillTurn JSON.
 * Supports streaming deltas for Explore chat UX.
 */

import { formatImplicitEnvelope } from "../context/broker.js";
import { requestsMemoryBlocks } from "./context-request.js";

/**
 * @param {string} content
 * @param {string[]} [allowedActions]
 * @returns {string|null}
 */
export function coerceSkillTurnJson(content, allowedActions = []) {
  const text = String(content || "").trim();
  if (!text) return null;

  const tryParse = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.assistantText) {
        return JSON.stringify(parsed);
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const direct = tryParse(text);
  if (direct) return direct;

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const fromFence = tryParse(fence[1].trim());
    if (fromFence) return fromFence;
  }

  const actions = Array.isArray(allowedActions) ? allowedActions.map(String) : [];
  const nextAction = actions.includes("REPLY")
    ? "REPLY"
    : (actions.includes("REFLECT") ? "REFLECT" : (actions[0] || "REFLECT"));

  return JSON.stringify({
    assistantText: text,
    nextAction,
    statePatch: {},
    memoryCandidates: [],
    taskProposals: [],
  });
}

/**
 * Extract user-visible prose from a partial stream (plain text or incomplete JSON).
 * @param {string} partial
 * @returns {string}
 */
export function displayTextFromStream(partial) {
  const t = String(partial || "");
  if (!t) return "";

  const trimmed = t.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("```")) {
    return t;
  }

  const key = '"assistantText"';
  const idx = t.indexOf(key);
  if (idx < 0) return "";

  let i = idx + key.length;
  while (i < t.length && /[\s:]/.test(t[i])) i += 1;
  if (t[i] !== '"') return "";
  i += 1;

  let out = "";
  while (i < t.length) {
    const ch = t[i];
    if (ch === "\\") {
      const next = t[i + 1];
      if (next == null) break;
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else if (next === '"') out += '"';
      else if (next === "\\") out += "\\";
      else out += next;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * @param {object} envelope — buildHostEnvelope().value
 * @param {{ history?: Array<{ role?: string, content?: string, text?: string }> }} [opts]
 */
export function buildHostModelMessages(envelope, opts = {}) {
  const resources = envelope?.resources || {};
  const allowed = Array.isArray(envelope?.allowedActions) ? envelope.allowedActions : [];
  const skillSystem = String(resources.system || "").trim();
  const policies = Array.isArray(resources.policies)
    ? resources.policies.map((p) => String(p || "").trim()).filter(Boolean)
    : [];

  /** Play / specialty skills: trust their system prompt; don't drown them in work-agent boilerplate. */
  const systemParts = skillSystem
    ? [
        skillSystem,
        ...policies,
        "用自然语言直接回复玩家。不要输出 JSON 外壳，不要提你是系统或提示词。",
        `若需内部动作标签，nextAction 可选：${allowed.join(", ") || "REPLY"}（不必说给玩家听）。`,
      ]
    : [
        "你是月栖探索里的工作 Agent。用清晰、可执行的中文回复。",
        "直接用自然语言回复用户，不要包一层 JSON，也不要 markdown 代码围栏。",
        `（内部 nextAction 由宿主处理；若必须结构化，nextAction 可选：${allowed.join(", ") || "REPLY"}。）`,
      ];

  const contextResult = envelope?.context;
  const contextEnvelope = contextResult?.envelope;
  const contextRequest = contextResult?.request;
  const companionId = String(contextRequest?.characterId || "").trim();
  if (contextEnvelope && companionId && requestsMemoryBlocks(contextRequest)) {
    const managedContext = formatImplicitEnvelope(contextEnvelope, { excludeIds: ["branch_summary"] });
    if (managedContext) {
      systemParts.push(managedContext);
    }
  }

  /** @type {Array<{ role: string, content: string }>} */
  const messages = [{ role: "system", content: systemParts.filter(Boolean).join("\n\n") }];

  const history = Array.isArray(opts.history) ? opts.history : [];
  for (const row of history.slice(-16)) {
    const role = row.role === "user" ? "user" : "assistant";
    const content = String(row.content ?? row.text ?? "").trim();
    if (!content) continue;
    messages.push({ role, content });
  }

  const current = String(
    envelope?.context?.request?.currentInput
    || envelope?.context?.request?.userText
    || "",
  ).trim();
  if (current && messages[messages.length - 1]?.content !== current) {
    messages.push({ role: "user", content: current });
  }

  return messages;
}

/**
 * @param {{
 *   callModel: Function,
 *   getProviderConfig: () => Promise<object>|object,
 *   onNeedConfig?: (reason: string) => void,
 *   getHistory?: (envelope: object) => Array<object>,
 *   stream?: boolean,
 * }} deps
 */
export function createHostSkillModelFn(deps) {
  return async function hostSkillModelFn(_messages, envelope, turnOpts = {}) {
    const config = await deps.getProviderConfig();
    const apiKey = String(config?.apiKey || "").trim();
    const baseUrl = String(config?.baseUrl || "").trim();
    const model = String(config?.model || "").trim();
    if (!apiKey || !baseUrl || !model) {
      deps.onNeedConfig?.("missing_provider");
      return null;
    }

    const history = typeof deps.getHistory === "function" ? deps.getHistory(envelope) : [];
    // History already includes the just-sent user turn — drop duplicate currentInput append noise
    const messages = buildHostModelMessages(envelope, { history });
    const useStream = turnOpts.stream !== false && deps.stream !== false;

    const result = await deps.callModel(config, messages, {
      stream: useStream,
      temperature: 0.6,
      businessPurpose: `skill.${envelope?.skillId || envelope?.appId || "unknown"}.turn`,
      capability: "chat",
      companionId: envelope?.characterId || envelope?.companionId || "",
      onDelta: (content, delta) => {
        const visible = displayTextFromStream(content);
        turnOpts.onDelta?.(visible, delta, content);
      },
    });
    return coerceSkillTurnJson(result?.content, envelope?.allowedActions || []);
  };
}
