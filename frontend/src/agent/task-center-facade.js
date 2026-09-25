/**
 * Task Center facade — single listing/approval surface for Agent + Assistant tasks (OC-task-center-unify).
 */

import { listTasks as listAgentTasks, getTask as getAgentTask } from "./task-store.js";
import { buildApprovalSheet } from "./approvals.js";
import {
  approveAndContinue,
  cancelTask as cancelAgentTask,
  pauseTask as pauseAgentTask,
  resumeTask as resumeAgentTask,
  rejectApproval,
} from "./executor.js";
import { formatAuditTimeline } from "./audit.js";
import {
  getAssistantTask,
  listAssistantTasks,
} from "../studio-assist/agent/task-store.js";

/** @typedef {"agent"|"assistant"} TaskSource */

const ASSIST_TO_STATE = Object.freeze({
  CREATED: "proposed",
  PREPARING: "running",
  RUNNING: "running",
  WAITING_FOR_APPROVAL: "awaiting_approval",
  COMMITTING: "running",
  VERIFYING: "running",
  SUCCEEDED: "completed",
  FAILED: "failed",
  CANCELED: "cancelled",
  PAUSED: "paused",
  EXTERNAL_BACKEND_REQUIRED: "failed",
});

function inferCapabilityId(task) {
  const kind = task?.candidate?.kind;
  if (kind === "worldbook-merge") return "worldbook-merge";
  if (kind === "theme") return "theme-draft";
  if ((task?.requiredCapabilities || []).some((c) => String(c).includes("scenario"))) {
    return "scenario-audit";
  }
  return "assistant-agent";
}

function buildAssistantExactEffect(task) {
  const summary = String(task?.stepSummary || "").trim();
  if (summary) return summary;
  const diffFields = (task?.diff?.fields || []).filter((f) => f.changed);
  if (diffFields.length) {
    return `将写入 ${diffFields.length} 处变更（${diffFields.map((f) => f.field).slice(0, 4).join("、")}）`;
  }
  if (task?.candidate?.name) {
    return `将导入候选「${task.candidate.name}」为新内容（不覆盖现有数据）`;
  }
  return task?.instruction || "确认后才会写入本地数据";
}

/**
 * @param {import("../studio-assist/agent/task-store.js").AssistantTask} task
 */
export function projectAssistantTask(task) {
  const state = ASSIST_TO_STATE[task.status] || "proposed";
  const approvalId = `assist-appr-${task.id}`;
  /** @type {object[]} */
  const approvals = task.status === "WAITING_FOR_APPROVAL"
    ? [{
      id: approvalId,
      taskId: task.id,
      stepId: "assist-commit",
      risk: "R2",
      title: `确认：${task.title}`,
      exactEffect: buildAssistantExactEffect(task),
      dataUsed: (task.authorizedResources || []).map((r) => `${r.type}:${r.resourceId}`),
      affects: ["本地数据（确认后写入）"],
      decision: "pending",
      createdAt: task.updatedAt,
      decidedAt: null,
    }]
    : [];

  /** @type {object|null} */
  let outcome = null;
  if (state === "completed") {
    outcome = { message: task.stepSummary || "任务已完成" };
  } else if (state === "failed") {
    outcome = { message: task.failureMessage || task.stepSummary || "任务失败" };
  } else if (state === "cancelled") {
    outcome = { message: task.stepSummary || "已取消" };
  }

  return {
    id: task.id,
    source: "assistant",
    schemaVersion: 1,
    state,
    intent: {
      id: task.id,
      capabilityId: inferCapabilityId(task),
      characterId: String(
        task.characterId || task.checkpoint?.initiatingCompanionId || "",
      ).trim(),
      title: task.title,
      summary: task.stepSummary || task.instruction || "",
    },
    approvals,
    outcome,
    assistantStatus: task.status,
    assistantTask: task,
    updatedAt: task.updatedAt,
    createdAt: task.createdAt,
  };
}

/**
 * @param {object} task
 */
export function projectAgentTask(task) {
  return {
    ...task,
    source: "agent",
  };
}

/**
 * @param {{ state?: string|string[], characterId?: string, limit?: number }} [opts]
 */
export function listUnifiedTasks(opts = {}) {
  const cid = String(opts.characterId || "").trim();
  const limit = Number(opts.limit) || 80;

  const agentRows = listAgentTasks({
    characterId: cid || undefined,
    limit,
  }).map(projectAgentTask);

  let assistRows = listAssistantTasks().map(projectAssistantTask);
  if (cid) {
    assistRows = assistRows.filter((t) => {
      const taskCid = String(t.intent?.characterId || "").trim();
      const scopeCid = String(t.assistantTask?.checkpoint?.initiatingCompanionId || "").trim();
      return taskCid === cid || scopeCid === cid;
    });
  }

  let rows = [...agentRows, ...assistRows];
  if (opts.state) {
    const states = Array.isArray(opts.state) ? opts.state : [opts.state];
    rows = rows.filter((t) => states.includes(t.state));
  }
  rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return rows.slice(0, limit);
}

/**
 * @param {string} taskId
 */
export function getUnifiedTask(taskId) {
  const id = String(taskId || "").trim();
  if (!id) return null;
  const agent = getAgentTask(id);
  if (agent) return projectAgentTask(agent);
  const assist = getAssistantTask(id);
  if (assist) return projectAssistantTask(assist);
  return null;
}

/**
 * @param {string} [characterId]
 */
export function getPendingUnifiedApprovals(characterId = "") {
  const cid = String(characterId || "").trim();
  const out = [];
  for (const task of listUnifiedTasks({ characterId: cid || undefined, limit: 200 })) {
    for (const approval of task.approvals || []) {
      if (approval.decision !== "pending") continue;
      out.push({
        taskId: task.id,
        source: task.source,
        taskTitle: task.intent?.title || "",
        approval,
        sheet: buildApprovalSheet(approval),
      });
    }
  }
  return out;
}

function scopeFromTask(task, opts = {}) {
  const assist = task?.assistantTask || {};
  return {
    userId: assist.checkpoint?.userId || opts.userId || "local",
    initiatingCompanionId: String(
      assist.checkpoint?.initiatingCompanionId
        || task.intent?.characterId
        || opts.companionId
        || "",
    ).trim(),
    companionId: String(
      assist.checkpoint?.initiatingCompanionId
        || task.intent?.characterId
        || opts.companionId
        || "",
    ).trim(),
    relationshipId: assist.checkpoint?.relationshipId || opts.relationshipId || "",
    chatSessionId: opts.chatSessionId || "",
    saveChatMessage: opts.saveChatMessage,
  };
}

async function approveAssistantUnified(task, opts = {}) {
  const live = getAssistantTask(task.id) || task.assistantTask;
  if (!live) return { ok: false, reason: "not_found" };
  const approveOpts = {
    ...scopeFromTask(task, opts),
    saveChatMessage: opts.saveChatMessage,
    commitFn: opts.commitFn,
  };
  if (live.candidate?.kind === "worldbook-merge") {
    const { approveWorldbookMergeTask } = await import("../task-runtime/lazy-runners.js");
    return approveWorldbookMergeTask(task.id, {
      ...approveOpts,
      commitFn: opts.commitWorldbookFn,
    });
  }
  if (live.candidate?.kind === "theme") {
    const { approveThemeDraftTask } = await import("../studio-assist/agent/lazy-agent.js");
    return approveThemeDraftTask(task.id, {
      ...approveOpts,
      commitFn: opts.commitThemeFn,
    });
  }
  const { approveAssistantTask } = await import("../studio-assist/agent/lazy-agent.js");
  return approveAssistantTask(task.id, approveOpts);
}

async function rejectAssistantUnified(task, opts = {}) {
  const live = getAssistantTask(task.id) || task.assistantTask;
  if (!live) return { ok: false, reason: "not_found" };
  if (live.candidate?.kind === "worldbook-merge") {
    const { rejectWorldbookMergeTask } = await import("../task-runtime/lazy-runners.js");
    return rejectWorldbookMergeTask(task.id);
  }
  const { rejectAssistantTask } = await import("../studio-assist/agent/lazy-agent.js");
  return rejectAssistantTask(task.id, { keepCandidate: opts.keepCandidate !== false });
}

/**
 * @param {string} taskId
 * @param {string} approvalId
 * @param {object} [opts]
 */
export async function approveUnifiedTask(taskId, approvalId, opts = {}) {
  const task = getUnifiedTask(taskId);
  if (!task) return { ok: false, reason: "not_found" };
  if (task.source === "assistant") {
    const result = await approveAssistantUnified(task, opts);
    emitTaskUpdated(taskId, "approved");
    return result;
  }
  const result = await approveAndContinue(taskId, approvalId, opts);
  emitTaskUpdated(taskId, "approved");
  return result;
}

/**
 * @param {string} taskId
 * @param {string} approvalId
 * @param {object} [opts]
 */
export async function rejectUnifiedTask(taskId, approvalId, opts = {}) {
  const task = getUnifiedTask(taskId);
  if (!task) return { ok: false, reason: "not_found" };
  if (task.source === "assistant") {
    const result = await rejectAssistantUnified(task, opts);
    emitTaskUpdated(taskId, "rejected");
    return result;
  }
  const result = rejectApproval(taskId, approvalId);
  emitTaskUpdated(taskId, "rejected");
  return result;
}

/**
 * @param {string} taskId
 */
export async function pauseUnifiedTask(taskId) {
  const task = getUnifiedTask(taskId);
  if (!task) return { ok: false, reason: "not_found" };
  if (task.source === "assistant") {
    const { pauseAssistantTask } = await import("../studio-assist/agent/lazy-agent.js");
    const result = pauseAssistantTask(taskId);
    emitTaskUpdated(taskId, "paused");
    return result;
  }
  const result = pauseAgentTask(taskId);
  emitTaskUpdated(taskId, "paused");
  return result;
}

/**
 * @param {string} taskId
 */
export async function resumeUnifiedTask(taskId) {
  const task = getUnifiedTask(taskId);
  if (!task) return { ok: false, reason: "not_found" };
  if (task.source === "assistant") {
    const { resumeAssistantTask } = await import("../studio-assist/agent/lazy-agent.js");
    const result = await resumeAssistantTask(taskId);
    emitTaskUpdated(taskId, "resumed");
    return result;
  }
  const result = await resumeAgentTask(taskId);
  emitTaskUpdated(taskId, "resumed");
  return result;
}

/**
 * @param {string} taskId
 * @param {object} [opts]
 */
export async function cancelUnifiedTask(taskId, opts = {}) {
  const task = getUnifiedTask(taskId);
  if (!task) return { ok: false, reason: "not_found" };
  if (task.source === "assistant") {
    const result = await rejectAssistantUnified(task, opts);
    emitTaskUpdated(taskId, "cancelled");
    return result;
  }
  const result = cancelAgentTask(taskId);
  emitTaskUpdated(taskId, "cancelled");
  return result;
}

/**
 * Audit lines for unified detail pane.
 * @param {object} task
 */
export function formatUnifiedAuditTimeline(task) {
  if (!task) return [];
  if (task.source === "agent") {
    return formatAuditTimeline(task.id).slice(-8);
  }
  const assist = task.assistantTask || {};
  const lines = [];
  if (assist.createdAt) {
    lines.push({ at: assist.createdAt, summary: "任务已创建", decision: null });
  }
  if (assist.stepSummary) {
    lines.push({ at: assist.updatedAt || assist.createdAt, summary: assist.stepSummary, decision: null });
  }
  if (assist.status === "SUCCEEDED") {
    lines.push({ at: assist.updatedAt, summary: "已完成", decision: "approved" });
  } else if (assist.status === "CANCELED") {
    lines.push({ at: assist.updatedAt, summary: "已拒绝/取消", decision: "rejected" });
  } else if (assist.status === "FAILED") {
    lines.push({ at: assist.updatedAt, summary: assist.failureMessage || "失败", decision: null });
  }
  return lines.slice(-8);
}

function emitTaskUpdated(taskId, action) {
  try {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("yueqi.assist.task-updated", {
      detail: { taskId, action },
    }));
    window.dispatchEvent(new CustomEvent("yueqi.task-center.refresh", {
      detail: { taskId, action },
    }));
  } catch {
    /* non-browser */
  }
}

export { buildApprovalSheet };
