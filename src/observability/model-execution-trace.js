const STORAGE_KEY = "yueqi.model.execution.trace.v1";
const MAX_ENTRIES = 240;

function safeStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readEntries() {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries) {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Observability must never break a model request.
  }
}

function emit(entry) {
  try {
    globalThis.dispatchEvent?.(new CustomEvent("yueqi:model-execution-trace", { detail: entry }));
  } catch {
    // CustomEvent is not available in every test runtime.
  }
}

function id(prefix = "model") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function cleanError(error) {
  const message = String(error?.message || error || "model execution failed")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/sk-[a-zA-Z0-9_-]{8,}/g, "[redacted]");
  return {
    code: String(error?.code || error?.status || "MODEL_EXECUTION_FAILED"),
    message: message.slice(0, 320),
  };
}

function messageShape(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  return {
    messageCount: list.length,
    systemCount: list.filter((item) => item?.role === "system").length,
    toolResultCount: list.filter((item) => item?.role === "tool").length,
    characterCount: list.reduce((sum, item) => {
      const value = typeof item?.content === "string" ? item.content : "";
      return sum + value.length;
    }, 0),
  };
}

function usageShape(usage = {}) {
  const inputTokens = Math.max(0, Number(
    usage?.inputTokens ?? usage?.input_tokens ?? usage?.prompt_tokens,
  ) || 0);
  const outputTokens = Math.max(0, Number(
    usage?.outputTokens ?? usage?.output_tokens ?? usage?.completion_tokens,
  ) || 0);
  return { inputTokens, outputTokens };
}

export function startModelExecutionTrace(input = {}) {
  const now = Date.now();
  const entry = {
    modelExecutionId: String(input.modelExecutionId || id()),
    turnExecutionId: String(input.turnExecutionId || ""),
    userId: String(input.userId || ""),
    companionId: String(input.companionId || input.characterId || ""),
    businessPurpose: String(input.businessPurpose || "model.unspecified"),
    capability: String(input.capability || "chat"),
    providerMode: String(input.providerMode || "unknown"),
    provider: String(input.provider || "gateway"),
    model: String(input.model || "server-resolved"),
    startedAt: new Date(now).toISOString(),
    finishedAt: null,
    latencyMs: null,
    usage: null,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: null,
    billing: null,
    billingUnits: 0,
    success: null,
    error: null,
    context: messageShape(input.messages),
    _startedAtMs: now,
  };
  const entries = readEntries();
  entries.push(entry);
  writeEntries(entries);
  emit(entry);
  return entry.modelExecutionId;
}

export function finishModelExecutionTrace(modelExecutionId, result = {}) {
  const entries = readEntries();
  const index = entries.findIndex((entry) => entry.modelExecutionId === modelExecutionId);
  if (index < 0) return null;
  const previous = entries[index];
  const now = Date.now();
  const usage = usageShape(result.usage);
  const entry = {
    ...previous,
    provider: String(result.provider || previous.provider || "gateway"),
    model: String(result.model || previous.model || "server-resolved"),
    finishedAt: new Date(now).toISOString(),
    latencyMs: Number(result.latencyMs) || Math.max(0, now - Number(previous._startedAtMs || now)),
    usage: result.usage || null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCost: result.estimatedCost ?? null,
    billing: result.billing || null,
    billingUnits: Math.max(0, Number(
      result.billingUnits ?? result.billing?.chargedCredits,
    ) || 0),
    success: true,
    error: null,
  };
  delete entry._startedAtMs;
  entries[index] = entry;
  writeEntries(entries);
  emit(entry);
  return entry;
}

export function failModelExecutionTrace(modelExecutionId, error, result = {}) {
  const entries = readEntries();
  const index = entries.findIndex((entry) => entry.modelExecutionId === modelExecutionId);
  if (index < 0) return null;
  const previous = entries[index];
  const now = Date.now();
  const usage = usageShape(result.usage);
  const entry = {
    ...previous,
    finishedAt: new Date(now).toISOString(),
    latencyMs: Number(result.latencyMs) || Math.max(0, now - Number(previous._startedAtMs || now)),
    usage: result.usage || null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCost: result.estimatedCost ?? null,
    billing: result.billing || null,
    billingUnits: Math.max(0, Number(
      result.billingUnits ?? result.billing?.chargedCredits,
    ) || 0),
    success: false,
    error: cleanError(error),
  };
  delete entry._startedAtMs;
  entries[index] = entry;
  writeEntries(entries);
  emit(entry);
  return entry;
}

export function listModelExecutionTraces(filters = {}) {
  return readEntries().filter((entry) => {
    if (filters.turnExecutionId && entry.turnExecutionId !== filters.turnExecutionId) return false;
    if (filters.businessPurpose && entry.businessPurpose !== filters.businessPurpose) return false;
    if (filters.capability && entry.capability !== filters.capability) return false;
    if (filters.success !== undefined && entry.success !== filters.success) return false;
    return true;
  });
}

export function clearModelExecutionTraces() {
  writeEntries([]);
}

export { STORAGE_KEY as MODEL_EXECUTION_TRACE_STORAGE_KEY };
