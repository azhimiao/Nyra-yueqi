/**
 * Approval sheet data — exact effect, data used, what will change.
 */

import { newId, nowIso, riskRequiresApproval, validateApprovalRequest } from "./schema.js";
import { getTask, saveTask, listTasks } from "./task-store.js";
import { appendAuditEvent } from "./audit.js";

/**
 * Build approval request from a plan node + predicted effect.
 * @param {{
 *   taskId: string,
 *   stepId: string,
 *   risk: string,
 *   title: string,
 *   exactEffect: string,
 *   dataUsed?: string[],
 *   affects?: string[],
 * }} input
 */
export function createApprovalRequest(input) {
  const task = getTask(input.taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  if (!riskRequiresApproval(input.risk)) {
    return { ok: false, reason: "approval_not_required" };
  }
  const existing = (task.approvals || []).find(
    (a) => a.stepId === input.stepId && a.decision === "pending",
  );
  if (existing) return { ok: true, value: existing, reused: true };

  const approval = {
    id: newId("apr"),
    taskId: String(input.taskId),
    stepId: String(input.stepId),
    risk: input.risk,
    title: String(input.title || "需要确认"),
    exactEffect: String(input.exactEffect || "").trim(),
    dataUsed: Array.isArray(input.dataUsed) ? input.dataUsed.map(String) : [],
    affects: Array.isArray(input.affects) ? input.affects.map(String) : [],
    decision: "pending",
    decidedAt: null,
    createdAt: nowIso(),
  };
  if (!approval.exactEffect) return { ok: false, reason: "missing_exactEffect" };
  const checked = validateApprovalRequest(approval);
  if (!checked.ok) return checked;

  task.approvals = [...(task.approvals || []), approval];
  task.state = "awaiting_approval";
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "approval_requested",
    stepId: approval.stepId,
    summary: approval.title,
    inputSummary: approval.exactEffect,
    meta: { risk: approval.risk, approvalId: approval.id },
  });
  return { ok: true, value: approval };
}

/**
 * @param {string} taskId
 * @param {string} approvalId
 * @param {"approved"|"rejected"} decision
 */
export function decideApproval(taskId, approvalId, decision) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  const approval = (task.approvals || []).find((a) => a.id === approvalId);
  if (!approval) return { ok: false, reason: "approval_not_found" };
  if (approval.decision !== "pending") {
    return { ok: false, reason: "already_decided", value: approval };
  }
  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, reason: "invalid_decision" };
  }
  approval.decision = decision;
  approval.decidedAt = nowIso();
  saveTask(task);
  appendAuditEvent(task.id, {
    type: decision === "approved" ? "approval_granted" : "approval_rejected",
    stepId: approval.stepId,
    summary: approval.title,
    userDecision: decision,
    resultSummary: approval.exactEffect,
    meta: { approvalId: approval.id, risk: approval.risk },
  });
  return { ok: true, value: approval };
}

/**
 * Sheet view-model for UI.
 * @param {object} approval
 */
export function buildApprovalSheet(approval) {
  if (!approval) return null;
  return {
    id: approval.id,
    title: approval.title,
    risk: approval.risk,
    exactEffect: approval.exactEffect,
    dataUsed: approval.dataUsed || [],
    affects: approval.affects || [],
    decision: approval.decision,
    bullets: [
      `将执行：${approval.exactEffect}`,
      ...(approval.dataUsed || []).map((d) => `使用数据：${d}`),
      ...(approval.affects || []).map((a) => `影响范围：${a}`),
    ],
  };
}

/**
 * @param {string} [taskId]
 */
export function getPendingApprovals(taskId = "") {
  const tasks = taskId
    ? [getTask(taskId)].filter(Boolean)
    : listTasks({ state: "awaiting_approval" });
  const out = [];
  for (const task of tasks) {
    for (const a of task.approvals || []) {
      if (a.decision === "pending") {
        out.push({
          taskId: task.id,
          taskTitle: task.intent?.title || "",
          approval: a,
          sheet: buildApprovalSheet(a),
        });
      }
    }
  }
  return out;
}

/** @deprecated use getPendingApprovals */
export function listPendingApprovals(taskId = "") {
  return getPendingApprovals(taskId);
}
