const STORAGE_KEY = "yueqi.turn.trace.v1";
const MAX_TRACES = 40;
let fallbackRows = [];

function uid() {
  return `turntrace-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 9)}`;
}

function load() {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem?.(STORAGE_KEY) || "[]");
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* fallback */
  }
  return [...fallbackRows];
}

function save(rows) {
  const next = rows.slice(0, MAX_TRACES).map(sanitizeTrace);
  fallbackRows = next;
  try {
    globalThis.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* local fallback remains available */
  }
  return next;
}

function emit(trace, stage = "updated") {
  try {
    globalThis.dispatchEvent?.(new CustomEvent("yueqi:turn-trace", { detail: { trace, stage } }));
  } catch {
    /* non-browser */
  }
}

export function startTurnTrace(input = {}) {
  const now = new Date().toISOString();
  const trace = sanitizeTrace({
    id: String(input.id || uid()),
    version: 1,
    origin: input.origin || "companion_chat",
    status: input.status || "running",
    createdAt: now,
    updatedAt: now,
    input: input.input || {},
    scope: input.scope || {},
    route: input.route || null,
    timeline: [{ stage: "turn_started", at: now, data: sanitizeValue(input.meta || {}) }],
  });
  save([trace, ...load().filter((row) => row.id !== trace.id)]);
  emit(trace, "started");
  return trace;
}

export function updateTurnTrace(id, patch = {}, stage = "updated") {
  const rows = load();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const now = new Date().toISOString();
  const current = rows[index];
  const next = sanitizeTrace(deepMerge(current, {
    ...patch,
    updatedAt: now,
    timeline: [
      ...(Array.isArray(current.timeline) ? current.timeline : []),
      { stage, at: now, data: sanitizeValue(patch.timelineData || {}) },
    ],
  }));
  delete next.timelineData;
  rows.splice(index, 1);
  save([next, ...rows]);
  emit(next, stage);
  return next;
}

export function finishTurnTrace(id, patch = {}) {
  return updateTurnTrace(id, { ...patch, status: patch.status || "completed", finishedAt: new Date().toISOString() }, "turn_finished");
}

export function failTurnTrace(id, error, patch = {}) {
  return updateTurnTrace(id, {
    ...patch,
    status: "failed",
    error: { name: error?.name || "Error", message: String(error?.message || error || "unknown_error") },
    finishedAt: new Date().toISOString(),
  }, "turn_failed");
}

export function listTurnTraces() {
  return load();
}

export function getTurnTrace(id) {
  return load().find((row) => row.id === id) || null;
}

export function clearTurnTraces() {
  fallbackRows = [];
  try { globalThis.localStorage?.removeItem?.(STORAGE_KEY); } catch { /* ignore */ }
  emit(null, "cleared");
}

export function exportTurnTraces() {
  return JSON.stringify({ schema: "yueqi.turn-traces.v1", exportedAt: new Date().toISOString(), traces: load() }, null, 2);
}

export { STORAGE_KEY as TURN_TRACE_STORAGE_KEY };

function deepMerge(left, right) {
  const out = { ...(left || {}) };
  for (const [key, value] of Object.entries(right || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = deepMerge(out[key] && typeof out[key] === "object" ? out[key] : {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeTrace(trace) {
  return sanitizeValue(trace, 0);
}

function sanitizeValue(value, depth = 0, key = "") {
  if (depth > 10) return "[depth-limited]";
  if (/^(apiKey|providerApiKey|authorization|password|secret|accessToken|refreshToken)$/i.test(key)) {
    return value ? "[redacted]" : "";
  }
  if (typeof value === "string") return value.length > 24000 ? `${value.slice(0, 24000)}\n[truncated]` : value;
  if (Array.isArray(value)) return value.slice(0, 180).map((item) => sanitizeValue(item, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = sanitizeValue(childValue, depth + 1, childKey);
    }
    return out;
  }
  return value;
}

