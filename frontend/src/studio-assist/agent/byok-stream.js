/**
 * Mobile BYOK streamFn — OpenAI-compatible tool calling for OpenClaw Mobile Runtime.
 * Does not invent tool calls from free text. Does not log API keys.
 */

import { createAssistantMessageEventStream } from "../../integrations/openclaw-mobile/openclaw-mobile-entry.js";
import { modelServiceUrl } from "../../lib/utils.js";
import { localServiceHeaders } from "../../platform/local-service.js";
import { isManagedProductMode, readProductAccess } from "../../account/product-access.js";
import {
  startModelExecutionTrace,
  finishModelExecutionTrace,
  failModelExecutionTrace,
} from "../../observability/model-execution-trace.js";

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * Map provider errors to user-facing Nyra codes/messages (no secrets).
 * @param {unknown} err
 * @param {number} [status]
 */
export function mapByokError(err, status) {
  const raw = String(err?.message || err || "");
  const lower = raw.toLowerCase();
  if (!status && /missing.?api.?key|api key.*missing|未配置/.test(lower)) {
    return { code: "BYOK_API_KEY_MISSING", message: "模型 API Key 未配置，请在接口页填写后重试。" };
  }
  if (status === 401 || status === 403 || /invalid.?api.?key|unauthorized|authentication/i.test(raw)) {
    return { code: "BYOK_API_KEY_INVALID", message: "模型 API Key 无效或无权访问，请检查后重试。" };
  }
  if (status === 429 || /rate.?limit|quota|额度|insufficient/i.test(raw)) {
    return { code: "BYOK_QUOTA_EXCEEDED", message: "模型额度不足或触发限流，请稍后再试。" };
  }
  if (status === 404 || /InvalidEndpointOrModel|does not exist|model.?not.?found/i.test(raw)) {
    return { code: "BYOK_MODEL_NOT_FOUND", message: "模型或接入点不存在，或当前 Key 无权访问该模型。" };
  }
  if (/timeout|aborted|abort/i.test(raw) || err?.name === "AbortError" || err?.name === "TimeoutError") {
    return { code: "BYOK_TIMEOUT", message: "模型请求超时或已取消。" };
  }
  if (/failed to fetch|network|econnrefused|enotfound|load failed/i.test(raw)) {
    return { code: "BYOK_NETWORK", message: "网络中断，无法连接模型服务。" };
  }
  if (/\bdoes not support\b.*\btool|\btool calling\b.*\bunsupported\b|\bfunction calling\b.*\bnot support/i.test(raw)) {
    return { code: "BYOK_TOOLS_UNSUPPORTED", message: "当前模型不支持 Tool Calling，请更换支持函数调用的模型。" };
  }
  if (/invalid.?json|json.?parse|arguments/i.test(raw)) {
    return { code: "BYOK_TOOL_ARGS_INVALID", message: "模型返回的工具参数不是合法 JSON。" };
  }
  return { code: "BYOK_PROVIDER_ERROR", message: sanitizeByokMessage(raw) || "模型服务返回错误。" };
}

export function sanitizeByokMessage(message) {
  let text = String(message || "");
  text = text.replace(/sk-[a-zA-Z0-9_-]{8,}/gi, "[redacted]");
  text = text.replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]");
  text = text.replace(/[A-Za-z0-9_\-]{32,}/g, (m) => (m.length > 40 ? "[redacted]" : m));
  if (text.length > 240) text = `${text.slice(0, 237)}...`;
  return text;
}

/**
 * @param {string} baseUrl
 */
export function redactBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return "[invalid-base-url]";
  }
}

function openClawToolsToOpenAI(tools = []) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || t.label || t.name,
      parameters: t.parameters || { type: "object", properties: {} },
    },
  }));
}

async function gatewayHeaders() {
  const access = readProductAccess();
  const headers = await localServiceHeaders({ "Content-Type": "application/json" });
  if (access.token) headers.Authorization = `Bearer ${access.token}`;
  return headers;
}

/**
 * Convert OpenClaw loop messages → OpenAI chat messages.
 * @param {object[]} messages
 */
export function openClawMessagesToOpenAI(messages = []) {
  /** @type {object[]} */
  const out = [];
  for (const m of messages) {
    if (!m?.role) continue;
    if (m.role === "user") {
      const text = typeof m.content === "string"
        ? m.content
        : (m.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      out.push({ role: "user", content: text });
      continue;
    }
    if (m.role === "assistant") {
      const toolCalls = (m.content || []).filter((c) => c.type === "toolCall");
      const texts = (m.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      if (toolCalls.length) {
        out.push({
          role: "assistant",
          content: texts || null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === "string"
                ? tc.arguments
                : JSON.stringify(tc.arguments || {}),
            },
          })),
        });
      } else {
        out.push({ role: "assistant", content: texts || "" });
      }
      continue;
    }
    if (m.role === "toolResult") {
      const text = (m.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId || m.id || "tool",
        content: text,
      });
    }
  }
  return out;
}

function makeAssistant(content, stopReason = "toolUse", errorMessage, usage = EMPTY_USAGE, meta = {}) {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: meta.provider || "byok",
    model: meta.model || "byok",
    usage: { ...EMPTY_USAGE, ...usage },
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  };
}

/**
 * Parse OpenAI chat completion → OpenClaw assistant content parts.
 * Rejects free-text-only "should call tool" improvisation: if no tool_calls and tools were offered,
 * returns stop with text (loop may end) — caller must NOT invent tool calls.
 */
export function openAIResponseToAssistant(payload, meta = {}) {
  const choice = payload?.choices?.[0];
  const msg = choice?.message || {};
  const usageRaw = payload?.usage || {};
  const usage = {
    input: usageRaw.prompt_tokens || usageRaw.input || 0,
    output: usageRaw.completion_tokens || usageRaw.output || 0,
    cacheRead: 0,
    cacheWrite: 0,
  };

  /** @type {object[]} */
  const content = [];
  const toolCalls = msg.tool_calls || [];
  for (const tc of toolCalls) {
    let args = tc.function?.arguments ?? tc.arguments ?? {};
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch (e) {
        const mapped = mapByokError(e);
        return makeAssistant(
          [{ type: "text", text: mapped.message }],
          "error",
          mapped.code,
          usage,
          meta,
        );
      }
    }
    content.push({
      type: "toolCall",
      id: tc.id || `tc-${content.length}`,
      name: tc.function?.name || tc.name,
      arguments: args,
    });
  }
  if (msg.content) {
    content.push({ type: "text", text: String(msg.content) });
  }
  if (!content.length) {
    content.push({ type: "text", text: "" });
  }
  const stopReason = content.some((c) => c.type === "toolCall") ? "toolUse" : "stop";
  return makeAssistant(content, stopReason, undefined, usage, meta);
}

/**
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} [opts.systemPrompt]
 * @param {number} [opts.timeoutMs]
 * @param {(info: object) => void} [opts.onRequest]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export function createByokStreamFn(opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const stats = {
    requests: 0,
    toolCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastLatencyMs: 0,
    errors: [],
  };

  async function streamFn(_model, context, streamOptions) {
    const stream = createAssistantMessageEventStream();
    const signal = streamOptions?.signal;

    const pushDone = (msg) => {
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", message: msg });
      stream.end();
    };

    queueMicrotask(async () => {
      const started = Date.now();
      try {
        if (signal?.aborted) {
          pushDone(makeAssistant([{ type: "text", text: "aborted" }], "aborted", "CANCELLED"));
          return;
        }
        if (!opts.apiKey) {
          const mapped = mapByokError(new Error("API key missing"));
          stats.errors.push(mapped.code);
          pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
          return;
        }
        if (!opts.baseUrl || !opts.model) {
          pushDone(
            makeAssistant(
              [{ type: "text", text: "模型 Base URL 或模型名未配置。" }],
              "error",
              "BYOK_CONFIG_MISSING",
            ),
          );
          return;
        }

        let base = String(opts.baseUrl).replace(/\/$/, "");
        if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
        const url = `${base}/chat/completions`;

        const tools = openClawToolsToOpenAI(context.tools || []);
        const messages = [];
        if (opts.systemPrompt) {
          messages.push({ role: "system", content: opts.systemPrompt });
        }
        messages.push(...openClawMessagesToOpenAI(context.messages || []));

        const body = {
          model: opts.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          stream: false,
        };
        if (tools.length) {
          body.tools = tools;
          body.tool_choice = "auto";
        }

        stats.requests += 1;
        opts.onRequest?.({
          requestIndex: stats.requests,
          model: opts.model,
          baseUrl: redactBaseUrl(base),
          toolCount: tools.length,
          messageCount: messages.length,
        });

        const controller = new AbortController();
        const timeoutMs = opts.timeoutMs ?? 90000;
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        let response;
        try {
          response = await fetchImpl(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${opts.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        const text = await response.text();
        stats.lastLatencyMs = Date.now() - started;
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          const mapped = mapByokError(new Error("invalid json from provider"), response.status);
          stats.errors.push(mapped.code);
          pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
          return;
        }

        if (!response.ok) {
          const mapped = mapByokError(
            new Error(payload?.error?.message || payload?.message || text.slice(0, 200)),
            response.status,
          );
          stats.errors.push(mapped.code);
          pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
          return;
        }

        const assistant = openAIResponseToAssistant(payload, {
          provider: "openai-compatible",
          model: opts.model,
        });
        stats.totalInputTokens += assistant.usage?.input || 0;
        stats.totalOutputTokens += assistant.usage?.output || 0;
        stats.toolCalls += (assistant.content || []).filter((c) => c.type === "toolCall").length;

        // Free-text with no tool_calls while tools available: do NOT invent tools
        if (
          tools.length &&
          !(assistant.content || []).some((c) => c.type === "toolCall") &&
          opts.requireToolCalls
        ) {
          const mapped = {
            code: "BYOK_NO_TOOL_CALL",
            message: "模型返回了普通文本而不是工具调用。请改用支持 Tool Calling 的模型。",
          };
          stats.errors.push(mapped.code);
          pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
          return;
        }

        pushDone(assistant);
      } catch (err) {
        stats.lastLatencyMs = Date.now() - started;
        const mapped = mapByokError(err);
        stats.errors.push(mapped.code);
        pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
      }
    });

    return stream;
  }

  streamFn.stats = () => ({ ...stats, errors: [...stats.errors] });
  return streamFn;
}

/**
 * OpenClaw adapter backed by the same authenticated model gateway as chat.
 * BYOK keeps credentials server-side; BYOK forwards user credentials
 * credentials to the gateway. Tool calls remain provider-native and are never inferred
 * from free text.
 */
export function createGatewayStreamFn(opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const stats = {
    requests: 0,
    toolCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    lastLatencyMs: 0,
    errors: [],
  };

  async function streamFn(_model, context, streamOptions) {
    const stream = createAssistantMessageEventStream();
    const signal = streamOptions?.signal;
    const pushDone = (message) => {
      stream.push({ type: "start", partial: message });
      stream.push({ type: "done", message });
      stream.end();
    };

    queueMicrotask(async () => {
      const startedAt = Date.now();
      const access = readProductAccess();
      const provider = opts.providerConfig || {};
      const managed = isManagedProductMode();
      const tools = openClawToolsToOpenAI(context.tools || []);
      const messages = [];
      if (opts.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });
      messages.push(...openClawMessagesToOpenAI(context.messages || []));
      const modelExecutionId = startModelExecutionTrace({
        turnExecutionId: opts.turnExecutionId,
        userId: opts.userId || access.userId,
        companionId: opts.companionId || opts.characterId,
        businessPurpose: opts.businessPurpose || "assistant.tool_loop",
        capability: "tool_calling",
        providerMode: managed ? "managed" : "byok",
        provider: "model-gateway",
        model: managed ? "server-resolved" : provider.model,
        messages,
      });

      try {
        if (signal?.aborted) {
          const error = Object.assign(new Error("aborted"), { code: "CANCELLED" });
          failModelExecutionTrace(modelExecutionId, error);
          pushDone(makeAssistant([{ type: "text", text: "aborted" }], "aborted", "CANCELLED"));
          return;
        }
        if (!access.loggedIn) {
          const error = Object.assign(new Error("Please sign in before running the assistant."), { code: "LOGIN_REQUIRED" });
          failModelExecutionTrace(modelExecutionId, error);
          pushDone(makeAssistant([{ type: "text", text: error.message }], "error", error.code));
          return;
        }
        if (!managed && (!provider.apiKey || !provider.baseUrl || !provider.model)) {
          const mapped = mapByokError(new Error("API key missing"));
          stats.errors.push(mapped.code);
          failModelExecutionTrace(modelExecutionId, Object.assign(new Error(mapped.message), { code: mapped.code }));
          pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
          return;
        }

        const controller = new AbortController();
        const timer = globalThis.setTimeout(() => controller.abort(), opts.timeoutMs ?? 90000);
        if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
        stats.requests += 1;
        let response;
        try {
          response = await fetchImpl(modelServiceUrl("/model/chat"), {
            method: "POST",
            headers: await gatewayHeaders(),
            body: JSON.stringify({
              billingSource: managed ? "hosted" : "byok",
              kind: provider.kind,
              baseUrl: provider.baseUrl,
              apiKey: provider.apiKey,
              model: provider.model,
              messages,
              tools,
              toolChoice: tools.length ? "auto" : undefined,
              temperature: opts.temperature ?? 0.2,
              maxTokens: Number(opts.maxTokens) || 4096,
              stream: false,
              modelExecutionId,
              turnExecutionId: opts.turnExecutionId,
              agentRunId: opts.agentRunId || undefined,
              userId: opts.userId,
              companionId: opts.companionId || opts.characterId,
              businessPurpose: opts.businessPurpose || "assistant.tool_loop",
              capability: "tool_calling",
            }),
            signal: controller.signal,
          });
        } finally {
          globalThis.clearTimeout(timer);
        }

        const text = await response.text();
        stats.lastLatencyMs = Date.now() - startedAt;
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = null;
        }
        if (!response.ok || !payload) {
          const mapped = mapByokError(
            new Error(payload?.message || payload?.error || "invalid json from model gateway"),
            response.status,
          );
          stats.errors.push(mapped.code);
          failModelExecutionTrace(modelExecutionId, Object.assign(new Error(mapped.message), { code: mapped.code }));
          pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
          return;
        }

        const assistant = openAIResponseToAssistant({
          choices: [{ message: payload.message || { role: "assistant", content: payload.content || "" } }],
          usage: payload.usage,
          model: payload.model,
        }, {
          provider: "model-gateway",
          model: payload.model || provider.model || "server-resolved",
        });
        stats.totalInputTokens += assistant.usage?.input || 0;
        stats.totalOutputTokens += assistant.usage?.output || 0;
        stats.toolCalls += assistant.content.filter((part) => part.type === "toolCall").length;
        finishModelExecutionTrace(modelExecutionId, payload);

        if (tools.length && !assistant.content.some((part) => part.type === "toolCall") && opts.requireToolCalls) {
          const code = "GATEWAY_NO_TOOL_CALL";
          stats.errors.push(code);
          pushDone(makeAssistant([{ type: "text", text: "The model did not return a tool call." }], "error", code));
          return;
        }
        pushDone(assistant);
      } catch (error) {
        stats.lastLatencyMs = Date.now() - startedAt;
        const mapped = mapByokError(error);
        stats.errors.push(mapped.code);
        failModelExecutionTrace(modelExecutionId, Object.assign(new Error(mapped.message), { code: mapped.code }));
        pushDone(makeAssistant([{ type: "text", text: mapped.message }], "error", mapped.code));
      }
    });

    return stream;
  }

  streamFn.stats = () => ({ ...stats, errors: [...stats.errors] });
  return streamFn;
}
