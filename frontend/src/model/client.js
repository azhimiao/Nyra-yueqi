import { CapacitorHttp } from "@capacitor/core";
import { modelServiceUrl, fetchJson, readLocalObject } from "../lib/utils.js";
import { localServiceHeaders } from "../platform/local-service.js";
import { t } from "../i18n/index.js";
import { LOCAL_KEYS } from "../constants.js";
import {
  isLocalOfflineSession,
  isManagedProductMode,
  readProductAccess,
} from "../account/product-access.js";
import { isNativePlatform } from "../platform/runtime.js";
import {
  startModelExecutionTrace,
  finishModelExecutionTrace,
  failModelExecutionTrace,
} from "../observability/model-execution-trace.js";

export const PROVIDER_PRESETS = {
  "OpenAI Compatible": "https://api.openai.com/v1",
  "自定义反代": "",
};

const DEFAULT_TIMEOUT_MS = 90000;

async function modelRequestHeaders(extra = {}) {
  const access = readProductAccess();
  const headers = await localServiceHeaders(extra);
  if (access.token) headers.Authorization = `Bearer ${access.token}`;
  return headers;
}

function billingSource() {
  return isManagedProductMode() ? "hosted" : "byok";
}

export function collectProviderConfig(nodes = {}) {
  if (isManagedProductMode()) {
    // BYOK keeps provider credentials and the
    // concrete model name on the server. Return a complete capability-shaped
    // config so feature modules do not mistake "no client key" for "disabled".
    // The server ignores these placeholders in managed billing mode.
    return {
      kind: "BYOK",
      baseUrl: "managed://server",
      apiKey: "managed-by-server",
      model: "managed-by-server",
    };
  }
  const { providerKind, providerBaseUrl, providerApiKey, providerModel } = nodes;
  const kind = providerKind?.value || "OpenAI Compatible";
  const presetBase = PROVIDER_PRESETS[kind];
  return {
    kind,
    baseUrl: providerBaseUrl?.value.trim() || presetBase || "",
    apiKey: providerApiKey?.value.trim() || "",
    model: providerModel?.value.trim() || "",
  };
}

export function applyProviderPreset(kind, nodes) {
  const baseUrl = PROVIDER_PRESETS[kind];
  if (baseUrl && nodes.providerBaseUrl && !nodes.providerBaseUrl.value) {
    nodes.providerBaseUrl.value = baseUrl;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function executionMetadata(config, messages, options = {}) {
  const access = readProductAccess();
  return {
    modelExecutionId: options.modelExecutionId,
    turnExecutionId: options.turnExecutionId,
    userId: options.userId || access.userId || "",
    companionId: options.companionId || options.characterId || "",
    businessPurpose: options.businessPurpose || "chat.reply",
    capability: options.capability || "chat",
    providerMode: billingSource(),
    provider: config?.kind || "gateway",
    model: isManagedProductMode() ? "server-resolved" : config?.model,
    messages,
  };
}

function requestMetadata(options = {}, modelExecutionId) {
  return {
    modelExecutionId,
    turnExecutionId: options.turnExecutionId || "",
    userId: options.userId || "",
    companionId: options.companionId || options.characterId || "",
    businessPurpose: options.businessPurpose || "chat.reply",
    capability: options.capability || "chat",
  };
}

async function resolveProviderConfig(config = {}) {
  if (isManagedProductMode()) return config;
  const saved = readLocalObject(LOCAL_KEYS.providerKey, {}) || {};
  const next = {
    ...saved,
    ...config,
    kind: config.kind || saved.kind || "OpenAI Compatible",
    baseUrl: String(config.baseUrl || saved.baseUrl || "").trim(),
    apiKey: String(config.apiKey || saved.apiKey || "").trim(),
    model: String(config.model || saved.model || "").trim(),
  };
  if (!next.apiKey) {
    try {
      const { getSecret } = await import("../platform/secure-store.js");
      next.apiKey = String((await getSecret("provider.apiKey")) || "").trim();
    } catch {
      /* keep empty */
    }
  }
  const presetBase = PROVIDER_PRESETS[next.kind];
  if (!next.baseUrl && presetBase) next.baseUrl = presetBase;
  return next;
}

function chatCompletionsUrl(baseUrl) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

function providerErrorMessage(payload, status) {
  const err = payload?.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    return String(err.message || err.code || "").trim() || `${status} request failed`;
  }
  return String(payload?.message || payload?.msg || `${status || ""} request failed`).trim();
}

async function requestDirectProvider(config, messages, options = {}) {
  const url = chatCompletionsUrl(config.baseUrl);
  const body = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.72,
    stream: false,
  };
  const maxTokens = Number(options.maxOutputTokens) || Number(options.maxTokens);
  if (maxTokens) body.max_tokens = maxTokens;
  if (Array.isArray(options.tools) && options.tools.length) {
    body.tools = options.tools;
    if (options.toolChoice != null) body.tool_choice = options.toolChoice;
  }

  const startedAt = performance.now();
  let status = 0;
  let payload = {};

  if (isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      data: body,
      connectTimeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      readTimeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    });
    status = Number(response.status) || 0;
    try {
      payload = typeof response.data === "string"
        ? (response.data ? JSON.parse(response.data) : {})
        : (response.data && typeof response.data === "object" ? response.data : {});
    } catch {
      payload = { message: String(response.data || "") };
    }
  } else {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    status = response.status;
    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }
  }

  if (status < 200 || status >= 300) {
    throw new Error(providerErrorMessage(payload, status));
  }

  const message = payload.choices?.[0]?.message || {};
  const content = String(message.content || "");
  const reasoning = String(
    message.reasoning_content
    || message.reasoning
    || "",
  );
  // OpenAI-compatible non-stream responses carry tool calls on the message
  // object. Preserve them for the same companion tool loop used by the
  // gateway/streaming path; dropping them made local BYOK silently skip work.
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
      .map((call, index) => ({
        id: String(call?.id || `tool-${Date.now().toString(36)}-${index}`),
        type: String(call?.type || "function"),
        function: {
          name: String(call?.function?.name || "").trim(),
          arguments: typeof call?.function?.arguments === "string"
            ? call.function.arguments
            : JSON.stringify(call?.function?.arguments || {}),
        },
      }))
      .filter((call) => call.function.name)
    : message.function_call?.name
      ? [{
        id: `tool-${Date.now().toString(36)}`,
        type: "function",
        function: {
          name: String(message.function_call.name).trim(),
          arguments: typeof message.function_call.arguments === "string"
            ? message.function_call.arguments
            : JSON.stringify(message.function_call.arguments || {}),
        },
      }]
      : [];
  if (!content.trim() && !reasoning.trim() && !toolCalls.length) {
    throw new Error(t("errors.emptyModelResponse"));
  }
  if (reasoning.trim()) {
    options.onReasoning?.({ text: reasoning, delta: reasoning, phase: "reasoning" });
  }
  if (content && options.onDelta) options.onDelta(content, content);

  return {
    ok: true,
    content,
    toolCalls,
    reasoning,
    model: payload.model || config.model,
    usage: payload.usage || null,
    billing: { source: "byok", chargedCredits: 0 },
    estimatedCost: null,
    billingUnits: 0,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}

/** Cheap preflight so chat can say「没接到模型」before compiling a prompt. */
export async function peekChatModelReady(config = {}) {
  const managed = billingSource() === "hosted";
  const resolved = await resolveProviderConfig(config);
  if (!readProductAccess().loggedIn && !isLocalOfflineSession()) {
    return { ok: false, reason: "login_required", message: t("errors.loginRequired") };
  }
  if (!managed && (!resolved.baseUrl || !resolved.apiKey || !resolved.model)) {
    return { ok: false, reason: "no_model", message: t("errors.noApiKey") };
  }
  return { ok: true };
}

export async function callModel(config, messages, options = {}) {
  const managed = billingSource() === "hosted";
  const resolved = await resolveProviderConfig(config);
  if (!readProductAccess().loggedIn && !isLocalOfflineSession()) {
    throw new Error(t("errors.loginRequired") || "请先登录。");
  }
  if (!managed && (!resolved.baseUrl || !resolved.apiKey || !resolved.model)) {
    throw new Error(t("errors.noApiKey"));
  }

  const modelExecutionId = startModelExecutionTrace(executionMetadata(resolved, messages, options));
  try {
    const result = isLocalOfflineSession()
      ? await requestDirectProvider(resolved, messages, { ...options, _modelExecutionId: modelExecutionId })
      : options.stream
        ? await callModelStream(resolved, messages, { ...options, _modelExecutionId: modelExecutionId })
        : await requestModel(resolved, messages, { ...options, _modelExecutionId: modelExecutionId });
    finishModelExecutionTrace(modelExecutionId, result);
    return { ...result, modelExecutionId };
  } catch (error) {
    failModelExecutionTrace(modelExecutionId, error);
    throw error;
  }
}

async function requestModel(config, messages, options = {}, attempt = 0) {
  try {
    return await fetchJson(modelServiceUrl("/model/chat"), {
      method: "POST",
      headers: await modelRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        billingSource: billingSource(),
        kind: config.kind,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.72,
        maxTokens: Number(options.maxOutputTokens) || undefined,
        tools: Array.isArray(options.tools) ? options.tools : undefined,
        toolChoice: options.toolChoice,
        ...requestMetadata(options, options._modelExecutionId),
        stream: false,
      }),
      signal: AbortSignal.timeout?.(options.timeoutMs || DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const msg = String(error?.message || error || "");
    const offline = /failed to fetch|networkerror|load failed|econnrefused|abort/i.test(msg)
      || error?.name === "TypeError"
      || error?.name === "AbortError"
      || error?.name === "TimeoutError";
    if (offline && attempt === 0 && !String(error?.status || "")) {
      throw new Error(t("errors.localModelOffline"));
    }
    if (error?.status === 401) {
      throw new Error(t("errors.byokFail"));
    }
    if (error?.status === 402 && error?.payload?.error === "credits_exhausted") {
      globalThis.dispatchEvent?.(new CustomEvent("yueqi:credits-exhausted", {
        detail: {
          available: error.payload.available ?? error.payload.access?.credits ?? 0,
          required: error.payload.required ?? 1,
        },
      }));
    }
    const retriable = error.status === 429 || error.status === 502;
    if (retriable && attempt < 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1200));
      return requestModel(config, messages, options, attempt + 1);
    }
    throw error;
  }
}

export async function callModelStream(config, messages, options = {}) {
  const startedAt = performance.now();
  const response = await fetchWithTimeout(
    modelServiceUrl("/model/chat"),
    {
      method: "POST",
      headers: await modelRequestHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        billingSource: billingSource(),
        kind: config.kind,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.72,
        maxTokens: Number(options.maxOutputTokens) || undefined,
        tools: Array.isArray(options.tools) ? options.tools : undefined,
        toolChoice: options.toolChoice,
        ...requestMetadata(options, options._modelExecutionId),
        stream: true,
      }),
    },
    options.timeoutMs || DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {

    if (response.status === 429 && !options._retried) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 1200));
      return callModelStream(config, messages, { ...options, _retried: true });
    }
    const text = await response.text();
    let payload = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
    if (response.status === 402 && payload.error === "credits_exhausted") {
      globalThis.dispatchEvent?.(new CustomEvent("yueqi:credits-exhausted", {
        detail: {
          available: payload.available ?? payload.access?.credits ?? 0,
          required: payload.required ?? 1,
        },
      }));
    }
    const error = new Error(payload.message || payload.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(t("errors.streamUnavailable"));
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  let execution = {};
  const toolCalls = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        if (payload.yueqi) {
          execution = { ...execution, ...payload.yueqi };
          continue;
        }
        const delta = payload.choices?.[0]?.delta?.content || "";
        const reasoningDelta = payload.choices?.[0]?.delta?.reasoning_content
          || payload.choices?.[0]?.delta?.reasoning
          || payload.choices?.[0]?.delta?.thinking
          || "";
        if (reasoningDelta) {
          reasoning += reasoningDelta;
          options.onReasoning?.({
            text: reasoning,
            delta: reasoningDelta,
            phase: "reasoning",
          });
        }
        if (delta) {
          content += delta;
          options.onDelta?.(content, delta);
        }
        const streamedCalls = payload.choices?.[0]?.delta?.tool_calls;
        if (Array.isArray(streamedCalls)) {
          for (const part of streamedCalls) {
            const index = Number(part?.index) || 0;
            const current = toolCalls[index] || {
              id: "",
              type: "function",
              function: { name: "", arguments: "" },
            };
            if (part.id) current.id = part.id;
            if (part.function?.name) current.function.name += part.function.name;
            if (part.function?.arguments) current.function.arguments += part.function.arguments;
            toolCalls[index] = current;
          }
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  const collectedToolCalls = toolCalls.filter(Boolean);
  if (!content && !collectedToolCalls.length) {
    throw new Error(t("errors.emptyModelResponse"));
  }

  return {
    ok: true,
    content,
    toolCalls: collectedToolCalls,
    model: execution.model || config.model,
    usage: execution.usage || null,
    billing: execution.billing || null,
    estimatedCost: execution.estimatedCost ?? null,
    billingUnits: Number(execution.billing?.chargedCredits) || 0,
    latencyMs: Number(execution.latencyMs) || Math.round(performance.now() - startedAt),
    reasoning,
  };
}

export async function checkServerHealth() {
  try {
    const payload = await fetchJson(modelServiceUrl("/health"));
    return payload.ok === true;
  } catch {
    return false;
  }
}

export async function fetchServerInfo() {
  try {
    return await fetchJson(modelServiceUrl("/health"));
  } catch {
    return { ok: false };
  }
}
