/** Local audit log for Yueqi assistant actions. Never stores secrets. */

export const ASSIST_AUDIT_KEY = "yueqi.assist.audit.v1";
const MAX_RECORDS = 200;

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : globalThis.localStorage;
  } catch {
    return null;
  }
}

function readAll() {
  try {
    const rows = JSON.parse(storage()?.getItem(ASSIST_AUDIT_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  try {
    storage()?.setItem(ASSIST_AUDIT_KEY, JSON.stringify(rows.slice(0, MAX_RECORDS)));
  } catch {
    /* storage is best effort */
  }
}

function scrub(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrub(item, depth + 1));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 400) : value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api.?key|secret|token|password|authorization/i.test(key)) out[key] = "[redacted]";
    else out[key] = scrub(item, depth + 1);
  }
  return out;
}

export function appendAssistAudit(partial = {}) {
  const record = {
    id: partial.id || `assist-audit-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    at: partial.at || new Date().toISOString(),
    tool: String(partial.tool || "unknown"),
    risk: String(partial.risk || "read"),
    status: String(partial.status || "completed"),
    summary: String(partial.summary || "").slice(0, 500),
    args: scrub(partial.args || {}),
    undo: partial.undo ? scrub(partial.undo) : null,
    undoneAt: partial.undoneAt || "",
  };
  writeAll([record, ...readAll().filter((item) => item.id !== record.id)]);
  return record;
}

export function listAssistAudit(limit = 30) {
  return readAll().slice(0, Math.max(1, Math.min(200, Number(limit) || 30))).map((item) => ({ ...item }));
}

export function getLatestUndoableAudit() {
  return readAll().find((item) => item.undo && !item.undoneAt && item.status === "completed") || null;
}

export function markAssistAuditUndone(id) {
  const rows = readAll();
  const index = rows.findIndex((item) => item.id === id);
  if (index < 0) return null;
  rows[index] = { ...rows[index], undoneAt: new Date().toISOString(), status: "undone" };
  writeAll(rows);
  return { ...rows[index] };
}

export function clearAssistAudit() {
  writeAll([]);
}
