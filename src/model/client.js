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
import { assertCompletion, assertNotAborted, consumeModelStream, modelStreamError, withAbort, withModelDeadline } from "./stream-protocol.js";
import { isolatePrivateReasoning } from "./private-reasoning.js";

export const PROVIDER_PRESETS = {
  "OpenAI Compatible": "https://api.openai.com/v1",
  "火山方舟": "https://ark.cn-beijing.volces.com/api/v3",
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
    // Nyra Hosted keeps provider credentials and the
    // concrete model name on the server. Return a complete capability-shaped
    // config so feature modules do not mistake "no client key" for "disabled".
    // The server ignores these placeholders in managed billing mode.
    return {
      kind: "Nyra Hosted",
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

function visibleProviderContent(raw, streaming = false) {
  const result = isolatePrivateReasoning(raw, { streaming });
  if (!streaming && !result.complete) throw modelStreamError("MODEL_PRIVATE_ENVELOPE_INCOMPLETE", "模型回复未完整生成，请重试。");
  return result.text;
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

  if (options.stream && !isNativePlatform()) {
    return requestStream(url, { ...body, stream: true }, {
      "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}`,
    }, config, options, true);
  }
  if (options.stream) options.onTransport?.({ streaming: false, cancellableTransport: false, kind: "native-buffered" });

  const startedAt = performance.now();
  let status = 0;
  let payload = {};

  if (isNativePlatform()) {
    const response = await withAbort(CapacitorHttp.request({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      data: body,
      connectTimeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      readTimeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    }), options.signal);
    status = Number(response.status) || 0;
    try {
      payload = typeof response.data === "string"
        ? (response.data ? JSON.parse(response.data) : {})
        : (response.data && typeof response.data === "object" ? response.data : {});
    } catch {
      payload = { message: String(response.data || "") };
    }
  } else {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    status = response.status;
    const text = await withAbort(response.text(), options.signal);
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
  const content = visibleProviderContent(message.content || "");
  const reasoningLength = String(
    message.reasoning_content
    || message.reasoning
    || "",
  ).length;
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
  assertNotAborted(options.signal);
  assertCompletion({ finishReason: payload.choices?.[0]?.finish_reason || "", toolCalls }, { allowMissing: true });
  if (!content.trim() && !toolCalls.length) {
    throw new Error(t("errors.emptyModelResponse"));
  }
  if (reasoningLength) {
    options.onReasoning?.({ length: reasoningLength, phase: "reasoning" });
  }
  if (content && options.onDelta) options.onDelta(content, content);

  return {
    ok: true,
    content,
    toolCalls,
    reasoningLength,
    finishReason: payload.choices?.[0]?.finish_reason || "stop",
    transport: isNativePlatform() ? "native-buffered" : "json",
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
    const result = await withModelDeadline(async signal => {
      const requestOptions = { ...options, signal, _deadline: true, _modelExecutionId: modelExecutionId };
      return isLocalOfflineSession()
        ? requestDirectProvider(resolved, messages, requestOptions)
        : options.stream
          ? callModelStream(resolved, messages, requestOptions)
          : requestModel(resolved, messages, requestOptions);
    }, options);
    finishModelExecutionTrace(modelExecutionId, result);
    return { ...result, modelExecutionId };
  } catch (error) {
    failModelExecutionTrace(modelExecutionId, error);
    throw error;
  }
}

async function requestModel(config, messages, options = {}, attempt = 0) {
  try {
    const result = await fetchJson(modelServiceUrl("/model/chat"), {
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
      signal: options.signal,
    });
    assertNotAborted(options.signal);
    assertCompletion({ finishReason: result.finishReason || "", toolCalls: result.toolCalls || [] }, { allowMissing: true });
    const content = visibleProviderContent(result.content || "");
    if (!content.trim() && !result.toolCalls?.length) throw modelStreamError("MODEL_EMPTY_REPLY", t("errors.emptyModelResponse"));
    return { ...result, content };
  } catch (error) {
    assertNotAborted(options.signal);
    const msg = String(error?.message || error || "");
    const offline = /failed to fetch|networkerror|load failed|econnrefused|abort/i.test(msg)
      || error?.name === "TypeError"
      || error?.name === "AbortError"
      || error?.name === "TimeoutError";
    if (offline && attempt === 0 && !String(error?.status || "")) {
      throw new Error(t("errors.localModelOffline"));
    }
    if (error?.status === 401) {
      globalThis.dispatchEvent?.(new CustomEvent("yueqi:auth-required"));
      throw new Error(t("errors.loginRequired") || "请先登录。");
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
      await withAbort(new Promise((resolve) => globalThis.setTimeout(resolve, 1200)), options.signal);
      return requestModel(config, messages, options, attempt + 1);
    }
    throw error;
  }
}

export async function callModelStream(config, messages, options = {}) {
  if (!options._deadline) {
    return withModelDeadline(signal => callModelStream(config, messages, { ...options, signal, _deadline: true }), options);
  }
  return requestStream(modelServiceUrl("/model/chat"), {
    billingSource: billingSource(), kind: config.kind, baseUrl: config.baseUrl,
    apiKey: config.apiKey, model: config.model, messages,
    temperature: options.temperature ?? 0.72,
    maxTokens: Number(options.maxOutputTokens) || undefined,
    tools: Array.isArray(options.tools) ? options.tools : undefined,
    toolChoice: options.toolChoice,
    ...requestMetadata(options, options._modelExecutionId), stream: true,
  }, await modelRequestHeaders({ "Content-Type": "application/json" }), config, options);
}

async function requestStream(url, body, headers, config, options = {}, direct = false) {
  assertNotAborted(options.signal);
  const startedAt = performance.now();
  options.onTransport?.({ streaming: true, cancellableTransport: true, kind: direct ? "direct-sse" : "gateway-sse" });
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: options.signal });
  if (!response.ok) {
    const raw = await withAbort(response.text(), options.signal);
    let payload;
    try { payload = JSON.parse(raw); } catch { payload = {}; }
    if (response.status === 429 && !options._retried) {
      await withAbort(new Promise(resolve => setTimeout(resolve, 1200)), options.signal);
      return requestStream(url, body, headers, config, { ...options, _retried: true }, direct);
    }
    if (!direct && response.status === 401) globalThis.dispatchEvent?.(new CustomEvent("yueqi:auth-required"));
    if (!direct && response.status === 402 && payload.error === "credits_exhausted") {
      globalThis.dispatchEvent?.(new CustomEvent("yueqi:credits-exhausted", { detail: { available: payload.available ?? 0, required: payload.required ?? 1 } }));
    }
    const error = new Error(providerErrorMessage(payload, response.status));
    error.status = response.status; error.payload = payload; throw error;
  }
  let previousVisible = "";
  const state = await consumeModelStream(response, {
    signal: options.signal,
    onReasoning: options.onReasoning,
    onDelta: content => {
      const visible = visibleProviderContent(content, true);
      if (visible !== previousVisible) {
        const delta = visible.startsWith(previousVisible) ? visible.slice(previousVisible.length) : visible;
        previousVisible = visible;
        options.onDelta?.(visible, delta);
      }
    },
  });
  const content = visibleProviderContent(state.content);
  if (!content.trim() && !state.toolCalls.length) throw new Error(t("errors.emptyModelResponse"));
  assertNotAborted(options.signal);
  return {
    ok: true, content, toolCalls: state.toolCalls, finishReason: state.finishReason || "stop",
    model: state.execution.model || state.model || config.model,
    usage: state.execution.usage || state.usage || null,
    billing: state.execution.billing || (direct ? { source: "byok", chargedCredits: 0 } : null),
    estimatedCost: state.execution.estimatedCost ?? null,
    billingUnits: Number(state.execution.billing?.chargedCredits) || 0,
    latencyMs: Number(state.execution.latencyMs) || Math.round(performance.now() - startedAt),
    reasoningLength: state.reasoningLength,
    transport: direct ? "direct-sse" : "gateway-sse",
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
