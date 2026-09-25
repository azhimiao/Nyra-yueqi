/**
 * Agent Runtime schemas (TaskIntent → TaskOutcome).
 * Deterministic local execution only; no payment / shop.
 */

export const AGENT_SCHEMA_VERSION = 1;

/** localStorage key for task bag */
export const AGENT_TASKS_KEY = "yueqi.agent.tasks.v1";

/** Task lifecycle (plan §P1) */
export const TASK_STATES = Object.freeze([
  "draft",
  "proposed",
  "awaiting_approval",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const TERMINAL_STATES = Object.freeze(["completed", "failed", "cancelled"]);

/** Risk: R0 read · R1 local low-write · R2 local write needing approval · R3 external write */
export const RISK_LEVELS = Object.freeze(["R0", "R1", "R2", "R3"]);

export const APPROVAL_DECISIONS = Object.freeze(["pending", "approved", "rejected", "expired"]);

export const CAPABILITY_IDS = Object.freeze([
  "note-from-chat",
  "calendar-draft",
  "page-summary",
  // P4 first-party skills
  "calendar-crud",
  "structured-notes",
  "local-research",
  "local-files",
  "message-drafts",
  "daily-briefing",
]);

/** P1 baseline trio (kept for regressions) */
export const P1_CAPABILITY_IDS = Object.freeze([
  "note-from-chat",
  "calendar-draft",
  "page-summary",
]);

/** P4 practical capability pack */
export const P4_CAPABILITY_IDS = Object.freeze([
  "calendar-crud",
  "structured-notes",
  "local-research",
  "local-files",
  "message-drafts",
  "daily-briefing",
]);

/**
 * @typedef {{
 *   id: string,
 *   schemaVersion: number,
 *   capabilityId: string,
 *   characterId: string,
 *   title: string,
 *   summary: string,
 *   input: Record<string, unknown>,
 *   risk: "R0"|"R1"|"R2"|"R3",
 *   idempotentKey: string,
 *   createdAt: string,
 * }} TaskIntent
 *
 * @typedef {{
 *   id: string,
 *   stepId: string,
 *   capabilityId: string,
 *   label: string,
 *   risk: "R0"|"R1"|"R2"|"R3",
 *   requiresApproval: boolean,
 *   inputSummary: string,
 *   effectSummary: string,
 * }} PlanNode
 *
 * @typedef {{
 *   id: string,
 *   intentId: string,
 *   nodes: PlanNode[],
 *   edges: { from: string, to: string }[],
 * }} PlanGraph
 *
 * @typedef {{
 *   id: string,
 *   taskId: string,
 *   nodeId: string,
 *   capabilityId: string,
 *   status: "pending"|"running"|"paused"|"completed"|"failed"|"skipped"|"cancelled",
 *   attempt: number,
 *   checkpoint: Record<string, unknown>|null,
 *   input: Record<string, unknown>,
 *   output: Record<string, unknown>|null,
 *   error: string|null,
 *   startedAt: string|null,
 *   finishedAt: string|null,
 * }} ExecutionStep
 *
 * @typedef {{
 *   id: string,
 *   taskId: string,
 *   stepId: string,
 *   risk: "R0"|"R1"|"R2"|"R3",
 *   title: string,
 *   exactEffect: string,
 *   dataUsed: string[],
 *   affects: string[],
 *   decision: "pending"|"approved"|"rejected"|"expired",
 *   decidedAt: string|null,
 *   createdAt: string,
 * }} ApprovalRequest
 *
 * @typedef {{
 *   id: string,
 *   taskId: string,
 *   stepId: string|null,
 *   type: string,
 *   summary: string,
 *   capabilityId: string|null,
 *   inputSummary: string,
 *   resultSummary: string,
 *   userDecision: string|null,
 *   at: string,
 *   meta: Record<string, unknown>,
 * }} ExecutionEvent
 *
 * @typedef {{
 *   ok: boolean,
 *   status: string,
 *   completedStepIds: string[],
 *   failedStepId: string|null,
 *   unfinished: string,
 *   nextActions: string[],
 *   artifactIds: string[],
 *   message: string,
 * }} TaskOutcome
 *
 * @typedef {{
 *   id: string,
 *   schemaVersion: number,
 *   state: string,
 *   intent: TaskIntent,
 *   plan: PlanGraph|null,
 *   steps: ExecutionStep[],
 *   approvals: ApprovalRequest[],
 *   events: ExecutionEvent[],
 *   outcome: TaskOutcome|null,
 *   checkpoint: { stepId: string|null, cursor: number, payload: Record<string, unknown> }|null,
 *   updatedAt: string,
 *   createdAt: string,
 * }} AgentTask
 */

export function nowIso(d = new Date()) {
  return d.toISOString();
}

let _seq = 0;
export function newId(prefix = "id") {
  _seq += 1;
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}_${_seq}_${r}`;
}

/** Reset id counter for deterministic tests */
export function __resetIdSeqForTests() {
  _seq = 0;
}

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: TaskIntent } | { ok: false, reason: string }}
 */
export function validateTaskIntent(value) {
  if (!value || typeof value !== "object") return { ok: false, reason: "missing_intent" };
  const v = /** @type {Record<string, unknown>} */ (value);
  if (!String(v.id || "").trim()) return { ok: false, reason: "missing_id" };
  if (!CAPABILITY_IDS.includes(/** @type {any} */ (v.capabilityId))) {
    return { ok: false, reason: "unknown_capability" };
  }
  if (!String(v.characterId || "").trim()) return { ok: false, reason: "missing_characterId" };
  if (!String(v.idempotentKey || "").trim()) return { ok: false, reason: "missing_idempotentKey" };
  if (!RISK_LEVELS.includes(/** @type {any} */ (v.risk))) return { ok: false, reason: "invalid_risk" };
  if (!v.input || typeof v.input !== "object") return { ok: false, reason: "missing_input" };
  return {
    ok: true,
    value: {
      id: String(v.id),
      schemaVersion: Number(v.schemaVersion) || AGENT_SCHEMA_VERSION,
      capabilityId: String(v.capabilityId),
      characterId: String(v.characterId),
      title: String(v.title || v.capabilityId),
      summary: String(v.summary || ""),
      input: /** @type {Record<string, unknown>} */ (v.input),
      risk: /** @type {any} */ (v.risk),
      idempotentKey: String(v.idempotentKey),
      createdAt: String(v.createdAt || nowIso()),
    },
  };
}

/**
 * @param {unknown} value
 */
export function validatePlanGraph(value) {
  if (!value || typeof value !== "object") return { ok: false, reason: "missing_plan" };
  const v = /** @type {Record<string, unknown>} */ (value);
  if (!String(v.id || "").trim()) return { ok: false, reason: "missing_plan_id" };
  if (!String(v.intentId || "").trim()) return { ok: false, reason: "missing_intentId" };
  if (!Array.isArray(v.nodes) || !v.nodes.length) return { ok: false, reason: "empty_nodes" };
  for (const node of v.nodes) {
    if (!node?.id || !node?.capabilityId) return { ok: false, reason: "invalid_node" };
    if (!RISK_LEVELS.includes(node.risk)) return { ok: false, reason: "invalid_node_risk" };
  }
  return { ok: true, value: v };
}

/**
 * @param {unknown} value
 */
export function validateApprovalRequest(value) {
  if (!value || typeof value !== "object") return { ok: false, reason: "missing_approval" };
  const v = /** @type {Record<string, unknown>} */ (value);
  if (!String(v.id || "").trim()) return { ok: false, reason: "missing_id" };
  if (!String(v.taskId || "").trim()) return { ok: false, reason: "missing_taskId" };
  if (!String(v.exactEffect || "").trim()) return { ok: false, reason: "missing_exactEffect" };
  if (!APPROVAL_DECISIONS.includes(/** @type {any} */ (v.decision || "pending"))) {
    return { ok: false, reason: "invalid_decision" };
  }
  return { ok: true, value: v };
}

/**
 * @param {unknown} value
 */
export function validateExecutionEvent(value) {
  if (!value || typeof value !== "object") return { ok: false, reason: "missing_event" };
  const v = /** @type {Record<string, unknown>} */ (value);
  if (!String(v.id || "").trim()) return { ok: false, reason: "missing_id" };
  if (!String(v.taskId || "").trim()) return { ok: false, reason: "missing_taskId" };
  if (!String(v.type || "").trim()) return { ok: false, reason: "missing_type" };
  if (!String(v.at || "").trim()) return { ok: false, reason: "missing_at" };
  return { ok: true, value: v };
}

/**
 * @param {Partial<TaskOutcome>} partial
 * @returns {TaskOutcome}
 */
export function buildTaskOutcome(partial = {}) {
  return {
    ok: Boolean(partial.ok),
    status: String(partial.status || "failed"),
    completedStepIds: Array.isArray(partial.completedStepIds) ? partial.completedStepIds.map(String) : [],
    failedStepId: partial.failedStepId ? String(partial.failedStepId) : null,
    unfinished: String(partial.unfinished || ""),
    nextActions: Array.isArray(partial.nextActions) ? partial.nextActions.map(String) : [],
    artifactIds: Array.isArray(partial.artifactIds) ? partial.artifactIds.map(String) : [],
    message: String(partial.message || ""),
  };
}

/**
 * Risk needs user approval before write side-effects.
 * @param {string} risk
 */
export function riskRequiresApproval(risk) {
  return risk === "R2" || risk === "R3";
}

/**
 * External write = R3 (network / real calendar API / email). Local drafts are not external.
 * @param {string} risk
 */
export function isExternalWriteRisk(risk) {
  return risk === "R3";
}
