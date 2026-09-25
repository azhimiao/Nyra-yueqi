/**
 * UnifiedTask V1 — single task record for Agent / Skill / Assist / OpenClaw.
 */

export const TASK_STATES = Object.freeze([
  "draft",
  "proposed",
  "awaiting_approval",
  "approved",
  "running",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
  "superseded",
]);

export const UNIFIED_TASK_SCHEMA_VERSION = 1;

/**
 * @param {object} raw
 */
export function validateUnifiedTaskV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== UNIFIED_TASK_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["taskId", "userId", "title", "state", "idempotencyKey", "createdAt"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (!TASK_STATES.includes(raw.state)) errors.push("state");
  if (!Array.isArray(raw.steps)) errors.push("steps");
  if (!Array.isArray(raw.auditRefs)) errors.push("auditRefs");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createUnifiedTaskV1(input = {}) {
  const now = new Date().toISOString();
  return {
    schemaVersion: UNIFIED_TASK_SCHEMA_VERSION,
    taskId: String(input.taskId || ""),
    userId: String(input.userId || ""),
    companionId: String(input.companionId || ""),
    agentId: String(input.agentId || ""),
    skillId: String(input.skillId || ""),
    packageVersion: String(input.packageVersion || ""),
    experienceId: String(input.experienceId || ""),
    title: String(input.title || "").trim(),
    kind: String(input.kind || "generic"),
    state: TASK_STATES.includes(input.state) ? input.state : "draft",
    executor: String(input.executor || "local"), // local | openclaw | assist
    steps: Array.isArray(input.steps) ? input.steps : [],
    approvalId: String(input.approvalId || ""),
    grantId: String(input.grantId || ""),
    correlationId: String(input.correlationId || ""),
    idempotencyKey: String(input.idempotencyKey || ""),
    auditRefs: Array.isArray(input.auditRefs) ? input.auditRefs : [],
    resultSummary: String(input.resultSummary || ""),
    errorCode: String(input.errorCode || ""),
    createdAt: String(input.createdAt || now),
    updatedAt: String(input.updatedAt || now),
  };
}
