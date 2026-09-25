/**
 * Planner → policy → executor → receipt → final render.
 * Only this module should produce capability side effects for companion chat.
 */

import { getCapabilityOperation, resolveOperationAvailability } from "../capabilities/operation-registry-v2.js";
import { parseOperationToolName } from "./openai-tools.js";
import { putToolRun, toolRunFromModelCall, transitionPersistedToolRun } from "./tool-run-repository.js";
import { normalizeToolCalls, negotiateToolProvider, toolsForNegotiation } from "../model/tool-provider-adapter.js";

export const COMPANION_TOOL_EXECUTOR = "companion-tool-loop";

function parseArgs(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function formatReceiptMessage(receipt) {
  if (!receipt) return "动作没有结果。";
  if (receipt.status === "awaiting_approval") {
    return `需要你确认后才会执行：${receipt.exactEffect || receipt.operation}`;
  }
  if (receipt.status === "failed") {
    return `没有完成：${receipt.summary || receipt.error || "执行失败"}`;
  }
  if (receipt.status === "unknown") {
    return "结果不确定，我不会假装已经做完。";
  }
  if (receipt.status !== "succeeded") {
    return `目前状态是 ${receipt.status}，还不能说已经完成。`;
  }
  return receipt.summary || "已经完成，并留下了执行回执。";
}

export function finalRenderMessages(receipts, personaHint = "") {
  const lines = (receipts || []).map(formatReceiptMessage);
  const prefix = personaHint ? `${personaHint}\n` : "";
  return [
    {
      role: "system",
      provenance: "tool",
      content: `${prefix}【工具回执】\n${lines.join("\n")}\n没有回执不得声称完成。`,
    },
  ];
}

export async function defaultExecuteOperation(capabilityId, operation, parameters, executors = {}) {
  const key = `${capabilityId}.${operation}`;
  if (typeof executors[key] === "function") return executors[key](parameters);
  if (capabilityId === "web.weather" && operation === "lookup") {
    const { fetchWeather } = await import("../status/weather.js");
    const shared = parameters.location && typeof parameters.location === "object"
      ? parameters.location
      : parameters;
    const lat = Number(shared.lat ?? shared.latitude);
    const lon = Number(shared.lon ?? shared.longitude);
    const coordinates = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat},${lon}` : "";
    const requested = typeof parameters.location === "string"
      ? parameters.location
      : (parameters.city || parameters.query || "");
    const weather = await fetchWeather(coordinates || requested || "用户当前位置", "locate");
    if (weather?.available === false || weather?.condition === "unknown") {
      return {
        ok: false,
        reason: weather?.reason || "weather_unavailable",
        summary: weather?.reason === "location_required"
          ? "天气查询需要城市名或坐标；当前没有可用的位置证据，也不会自动读取设备定位。"
          : "没有获得可靠的天气结果；天气服务没有返回结果。",
        weather,
      };
    }
    return { ok: true, summary: weather?.label || weather?.condition || "weather", weather };
  }
  throw new Error(`no_executor:${key}`);
}

/** Convert a provider tool turn plus trusted receipts into the messages needed
 * for the next model turn. Receipts are the only facts the model may rely on. */
export function toolResultMessages(toolCalls = [], receipts = [], assistantContent = "") {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const normalized = calls.map((call, index) => {
    const fn = call?.function && typeof call.function === "object" ? call.function : call;
    const id = String(call?.id || `tool-${Date.now().toString(36)}-${index}`).trim();
    const args = fn?.arguments && typeof fn.arguments === "string"
      ? fn.arguments
      : JSON.stringify(fn?.arguments || call?.arguments || {});
    return {
      id,
      type: "function",
      function: { name: String(fn?.name || call?.name || "").trim(), arguments: args },
    };
  }).filter((call) => call.function.name);
  return [
    {
      role: "assistant",
      content: String(assistantContent || "") || null,
      tool_calls: normalized,
    },
    ...normalized.map((call, index) => ({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(receipts[index] || {
        status: "failed",
        error: "missing_receipt",
        exactEffect: call.function.name,
      }),
    })),
  ];
}

export async function runCompanionToolLoop({
  toolCalls = [],
  runtime = {},
  provider = {},
  executors = {},
  explicitOperations = [],
  putRun = putToolRun,
  transitionRun = transitionPersistedToolRun,
  onProgress,
} = {}) {
  const negotiation = negotiateToolProvider(provider);
  if (!negotiation.supportsTools) {
    return {
      ok: true,
      negotiation,
      receipts: [],
      tools: toolsForNegotiation([], negotiation),
      messages: [{
        role: "system",
        provenance: "tool",
        content: "当前模型通道不支持 tool calling，已降级为只读说明，不会假装调用了工具。",
      }],
    };
  }
  const receipts = [];
  for (const raw of normalizeToolCalls(toolCalls)) {
    onProgress?.({ phase: "planned", operation: raw.name, parameters: raw.arguments || {} });
    if (!raw.ok) {
      receipts.push({ status: "failed", error: raw.reason, exactEffect: "invalid tool call" });
      continue;
    }
    const parsed = parseOperationToolName(raw.name);
    const desc = getCapabilityOperation(parsed.capabilityId, parsed.operation);
    if (!desc) {
      receipts.push({ status: "failed", error: "unknown_operation", capabilityId: parsed.capabilityId, operation: parsed.operation });
      continue;
    }
    const availability = resolveOperationAvailability(desc, runtime);
    const parameters = raw.arguments || parseArgs(raw.arguments);
    const operationKey = `${desc.capabilityId}.${desc.operation}`;
    const explicitCommand = Array.isArray(explicitOperations)
      && explicitOperations.includes(operationKey)
      && desc.approval === "explicit-command";
    const planned = toolRunFromModelCall({
      capabilityId: desc.capabilityId,
      operation: desc.operation,
      parameters,
      risk: desc.risk,
      exactEffect: `${desc.capabilityId}.${desc.operation}`,
      idempotencyKey: raw.id || `${desc.capabilityId}:${desc.operation}:${JSON.stringify(parameters)}`,
      requiresApproval: explicitCommand ? false : undefined,
    });
    const stored = await putRun(planned);
    if (!stored.ok) {
      const receipt = { status: "failed", error: stored.error?.code || "persist_failed", exactEffect: planned.exactEffect };
      receipts.push(receipt);
      onProgress?.({ phase: "failed", operation: operationKey, receipt });
      continue;
    }
    if (!availability.executable || planned.requiresApproval) {
      const receipt = {
        status: "awaiting_approval",
        toolRunId: planned.toolRunId,
        capabilityId: desc.capabilityId,
        operation: desc.operation,
        exactEffect: planned.exactEffect,
        risk: desc.risk,
        reasonCodes: availability.reasonCodes || [],
      };
      receipts.push(receipt);
      onProgress?.({ phase: "awaiting_approval", operation: operationKey, receipt });
      continue;
    }
    try {
      onProgress?.({ phase: "executing", operation: operationKey, parameters });
      const startStatus = planned.status === "approved" ? "approved" : "planned";
      const started = await transitionRun(planned.toolRunId, "executing", {}, {
        list: async () => [{ ...stored.record, status: startStatus }],
      });
      if (started?.ok === false) {
        throw new Error(started.error?.code || "tool_run_start_failed");
      }
      const executed = await defaultExecuteOperation(desc.capabilityId, desc.operation, parameters, executors);
      const receipt = {
        status: executed?.ok === false ? "failed" : "succeeded",
        summary: executed?.summary || "",
        error: executed?.ok === false ? (executed?.reason || executed?.message || "execution_failed") : "",
        data: executed,
      };
      const finished = await transitionRun(planned.toolRunId, receipt.status === "succeeded" ? "succeeded" : "failed", {
        receipt,
      }, { list: async () => [{ ...stored.record, status: "executing" }] });
      if (finished?.ok === false) {
        throw new Error(finished.error?.code || "tool_run_finish_failed");
      }
      receipts.push({
        ...receipt,
        toolRunId: planned.toolRunId,
        capabilityId: desc.capabilityId,
        operation: desc.operation,
        exactEffect: planned.exactEffect,
      });
      onProgress?.({ phase: receipt.status === "succeeded" ? "succeeded" : "failed", operation: operationKey, receipt });
    } catch (error) {
      const errorMessage = String(error?.message || error);
      await transitionRun(planned.toolRunId, "failed", {
        error: { code: "EXECUTION_FAILED", message: errorMessage.slice(0, 500) },
        receipt: { status: "failed", error: errorMessage.slice(0, 500) },
      }, { list: async () => [{ ...stored.record, status: "executing" }] }).catch(() => {});
      receipts.push({
        status: "failed",
        error: errorMessage,
        toolRunId: planned.toolRunId,
        exactEffect: planned.exactEffect,
      });
      onProgress?.({ phase: "failed", operation: operationKey, receipt: { status: "failed", error: errorMessage } });
    }
  }
  return {
    ok: true,
    negotiation,
    receipts,
    messages: finalRenderMessages(receipts),
    feedback: receipts.map(formatReceiptMessage).join("\n"),
  };
}

export function claimsCompletionWithoutReceipt(text, receipts) {
  if (!/已经|完成|订好|查到了|写好|保存好|记下了|创建好|发出去了/.test(String(text || ""))) return false;
  return !(receipts || []).some((item) => item.status === "succeeded");
}
