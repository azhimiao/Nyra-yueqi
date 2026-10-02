/**
 * Agent audit timeline — every step input / capability / result / user decision.
 */

import { newId, nowIso, validateExecutionEvent } from "./schema.js";
import { getTask, saveTask } from "./task-store.js";

/**
 * @param {string} taskId
 * @param {{
 *   type: string,
 *   summary?: string,
 *   stepId?: string|null,
 *   capabilityId?: string|null,
 *   inputSummary?: string,
 *   resultSummary?: string,
 *   userDecision?: string|null,
 *   meta?: Record<string, unknown>,
 * }} payload
 */
export function appendAuditEvent(taskId, payload) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  const event = {
    id: newId("evt"),
    taskId: String(taskId),
    stepId: payload.stepId || null,
    type: String(payload.type || "info"),
    summary: String(payload.summary || payload.type || ""),
    capabilityId: payload.capabilityId || null,
    inputSummary: String(payload.inputSummary || ""),
    resultSummary: String(payload.resultSummary || ""),
    userDecision: payload.userDecision ?? null,
    at: nowIso(),
    meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
  };
  const checked = validateExecutionEvent(event);
  if (!checked.ok) return checked;
  task.events = [...(task.events || []), event];
  saveTask(task);
  return { ok: true, value: event };
}

/**
 * @param {string} taskId
 */
export function listAuditEvents(taskId) {
  const task = getTask(taskId);
  return task?.events ? task.events.slice() : [];
}

/**
 * Replay R2 (and R3) steps from audit — reconstruct what needed approval.
 * @param {string} taskId
 * @returns {{ ok: boolean, steps: object[], reason?: string }}
 */
export function replayRiskSteps(taskId, minRisk = "R2") {
  const task = getTask(taskId);
  if (!task) return { ok: false, steps: [], reason: "task_not_found" };
  const events = listAuditEvents(taskId);
  const riskOrder = { R0: 0, R1: 1, R2: 2, R3: 3 };
  const min = riskOrder[minRisk] ?? 2;

  const byStep = new Map();
  for (const step of task.steps || []) {
    const risk = step?.checkpoint?.risk || task.plan?.nodes?.find((n) => n.id === step.nodeId)?.risk;
    if ((riskOrder[risk] ?? 0) < min) continue;
    byStep.set(step.id, {
      stepId: step.id,
      nodeId: step.nodeId,
      capabilityId: step.capabilityId,
      risk,
      status: step.status,
      inputSummary: "",
      resultSummary: "",
      userDecision: null,
      events: [],
    });
  }

  for (const ev of events) {
    if (!ev.stepId || !byStep.has(ev.stepId)) continue;
    const row = byStep.get(ev.stepId);
    row.events.push(ev);
    if (ev.inputSummary) row.inputSummary = ev.inputSummary;
    if (ev.resultSummary) row.resultSummary = ev.resultSummary;
    if (ev.userDecision) row.userDecision = ev.userDecision;
    if (ev.meta?.risk) row.risk = ev.meta.risk;
  }

  // Also pull approval decisions
  for (const ap of task.approvals || []) {
    if (!ap.stepId || !byStep.has(ap.stepId)) continue;
    const row = byStep.get(ap.stepId);
    row.userDecision = ap.decision;
    row.exactEffect = ap.exactEffect;
    row.approvalId = ap.id;
  }

  return { ok: true, steps: [...byStep.values()] };
}

/**
 * Human-readable audit trail for task center.
 * @param {string} taskId
 */
export function formatAuditTimeline(taskId) {
  return listAuditEvents(taskId).map((ev) => ({
    at: ev.at,
    type: ev.type,
    summary: ev.summary,
    decision: ev.userDecision,
    capabilityId: ev.capabilityId,
  }));
}
