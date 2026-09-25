/**
 * Agent executor — state machine with checkpoints, pause/cancel, idempotent keys.
 *
 * draft → proposed → awaiting_approval → running → paused → completed|failed|cancelled
 */

import {
  AGENT_SCHEMA_VERSION,
  buildTaskOutcome,
  newId,
  nowIso,
  riskRequiresApproval,
  validateTaskIntent,
  TERMINAL_STATES,
} from "./schema.js";
import {
  findTaskByIdempotentKey,
  getTask,
  saveTask,
} from "./task-store.js";
import { appendAuditEvent } from "./audit.js";
import { createApprovalRequest, decideApproval } from "./approvals.js";
import { ensureBuiltinCapabilities, getCapability } from "./capabilities/registry.js";
import { registerBuiltinCapabilities } from "./capabilities/index.js";

let builtinsReady = false;

function ensureCaps() {
  if (!builtinsReady) {
    registerBuiltinCapabilities();
    builtinsReady = true;
  }
}

/**
 * Create a draft task from intent fields (idempotent).
 * @param {{
 *   capabilityId: string,
 *   characterId: string,
 *   title?: string,
 *   summary?: string,
 *   input: Record<string, unknown>,
 *   idempotentKey: string,
 *   risk?: string,
 * }} fields
 */
export function createTaskDraft(fields) {
  ensureCaps();
  const cap = getCapability(fields.capabilityId);
  if (!cap) return { ok: false, reason: "unknown_capability" };

  const existing = findTaskByIdempotentKey(fields.idempotentKey, fields.characterId);
  if (existing) {
    return { ok: true, value: existing, reused: true };
  }

  const intentCheck = validateTaskIntent({
    id: newId("intent"),
    schemaVersion: AGENT_SCHEMA_VERSION,
    capabilityId: fields.capabilityId,
    characterId: fields.characterId,
    title: fields.title || cap.label,
    summary: fields.summary || cap.description,
    input: { ...fields.input, characterId: fields.characterId },
    risk: fields.risk || cap.risk,
    idempotentKey: fields.idempotentKey,
    createdAt: nowIso(),
  });
  if (!intentCheck.ok) return intentCheck;

  const inputCheck = cap.validateInput(intentCheck.value.input);
  if (!inputCheck.ok) return { ok: false, reason: inputCheck.reason || "invalid_input" };
  intentCheck.value.input = inputCheck.value;

  const task = {
    id: newId("task"),
    schemaVersion: AGENT_SCHEMA_VERSION,
    state: "draft",
    intent: intentCheck.value,
    plan: null,
    steps: [],
    approvals: [],
    events: [],
    outcome: null,
    checkpoint: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "created",
    summary: `草稿：${task.intent.title}`,
    capabilityId: task.intent.capabilityId,
    inputSummary: JSON.stringify(Object.keys(task.intent.input || {})),
  });
  return { ok: true, value: getTask(task.id) };
}

/**
 * Propose plan from capability.
 * @param {string} taskId
 */
export function proposeTask(taskId) {
  ensureCaps();
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  if (task.state !== "draft" && task.state !== "proposed") {
    return { ok: false, reason: "invalid_state", state: task.state };
  }
  const cap = getCapability(task.intent.capabilityId);
  if (!cap) return { ok: false, reason: "unknown_capability" };

  const planned = cap.plan(task.intent);
  const plan = {
    id: newId("plan"),
    intentId: task.intent.id,
    nodes: planned.nodes || [],
    edges: planned.edges || [],
  };
  task.plan = plan;
  task.steps = plan.nodes.map((node, index) => ({
    id: newId("step"),
    taskId: task.id,
    nodeId: node.id,
    capabilityId: node.capabilityId,
    status: "pending",
    attempt: 0,
    checkpoint: { risk: node.risk, index, label: node.label },
    input: task.intent.input,
    output: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  }));
  task.state = "proposed";
  task.checkpoint = { stepId: task.steps[0]?.id || null, cursor: 0, payload: {} };
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "proposed",
    summary: `计划 ${plan.nodes.length} 步`,
    capabilityId: task.intent.capabilityId,
    resultSummary: plan.nodes.map((n) => n.label).join(" → "),
  });
  return { ok: true, value: getTask(task.id) };
}

/**
 * Start / continue execution. Pauses at R2/R3 for approval.
 * @param {string} taskId
 * @param {{ approved?: boolean, ctx?: Record<string, unknown> }} [opts]
 */
export async function runTask(taskId, opts = {}) {
  ensureCaps();
  let task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };

  if (task.state === "draft") {
    const p = proposeTask(taskId);
    if (!p.ok) return p;
    task = getTask(taskId);
  }

  if (TERMINAL_STATES.includes(task.state)) {
    return { ok: false, reason: "already_terminal", state: task.state, value: task };
  }

  if (task.state === "paused") {
    // resume only via resumeTask
    return { ok: false, reason: "paused_use_resume" };
  }

  if (task.state === "awaiting_approval" && !opts.approved) {
    return { ok: false, reason: "awaiting_approval", value: task };
  }

  task.state = "running";
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "running",
    summary: "开始执行",
    capabilityId: task.intent.capabilityId,
  });

  const cap = getCapability(task.intent.capabilityId);
  if (!cap) {
    return failTask(taskId, "unknown_capability", null);
  }

  const startCursor = Number(task.checkpoint?.cursor) || 0;
  for (let i = startCursor; i < task.steps.length; i += 1) {
    task = getTask(taskId);
    if (!task || task.state === "cancelled") {
      return { ok: false, reason: "cancelled", value: task };
    }
    if (task.state === "paused") {
      return { ok: true, paused: true, value: task };
    }

    const step = task.steps[i];
    if (step.status === "completed") continue;

    const node = task.plan?.nodes?.find((n) => n.id === step.nodeId);
    const risk = node?.risk || task.intent.risk || cap.risk;

    if (riskRequiresApproval(risk)) {
      const pending = (task.approvals || []).find(
        (a) => a.stepId === step.id && a.decision === "pending",
      );
      const approved = (task.approvals || []).find(
        (a) => a.stepId === step.id && a.decision === "approved",
      );
      const rejected = (task.approvals || []).find(
        (a) => a.stepId === step.id && a.decision === "rejected",
      );

      if (rejected) {
        return failTask(taskId, "approval_rejected", step.id, {
          unfinished: node?.label || step.capabilityId,
          nextActions: ["可修改输入后重新发起", "或取消任务"],
        });
      }

      if (!approved) {
        if (!pending) {
          const preview = cap.previewEffect(task.intent.input, { taskId: task.id });
          createApprovalRequest({
            taskId: task.id,
            stepId: step.id,
            risk,
            title: `确认：${node?.label || cap.label}`,
            exactEffect: preview.exactEffect,
            dataUsed: preview.dataUsed,
            affects: preview.affects,
          });
        }
        task = getTask(taskId);
        task.state = "awaiting_approval";
        task.checkpoint = { stepId: step.id, cursor: i, payload: { risk } };
        step.status = "pending";
        saveTask(task);
        return { ok: true, awaitingApproval: true, value: getTask(taskId) };
      }
    }

    // Execute step
    step.status = "running";
    step.attempt += 1;
    step.startedAt = nowIso();
    task.checkpoint = { stepId: step.id, cursor: i, payload: { risk } };
    saveTask(task);

    const preview = cap.previewEffect(task.intent.input, { taskId: task.id });
    appendAuditEvent(task.id, {
      type: "step_start",
      stepId: step.id,
      capabilityId: step.capabilityId,
      summary: node?.label || step.capabilityId,
      inputSummary: preview.exactEffect,
      meta: { risk },
    });

    // Cooperative pause check mid-flight (tests call pauseTask)
    task = getTask(taskId);
    if (task?.state === "paused") {
      step.status = "paused";
      saveTask(task);
      return { ok: true, paused: true, value: task };
    }
    if (task?.state === "cancelled") {
      step.status = "cancelled";
      saveTask(task);
      return { ok: false, reason: "cancelled", value: task };
    }

    let result;
    try {
      const approvedFlag =
        !riskRequiresApproval(risk)
        || Boolean((getTask(taskId)?.approvals || []).find((a) => a.stepId === step.id && a.decision === "approved"));
      result = await Promise.resolve(
        cap.execute(task.intent.input, {
          ...(opts.ctx || {}),
          taskId: task.id,
          characterId: task.intent.characterId,
          approved: approvedFlag,
          stepId: step.id,
        }),
      );
    } catch (err) {
      result = { ok: false, reason: String(err?.message || err || "execute_error") };
    }

    task = getTask(taskId);
    const liveStep = task.steps[i];
    if (!result?.ok) {
      liveStep.status = "failed";
      liveStep.error = result?.reason || "failed";
      liveStep.finishedAt = nowIso();
      saveTask(task);
      appendAuditEvent(task.id, {
        type: "step_failed",
        stepId: liveStep.id,
        capabilityId: liveStep.capabilityId,
        summary: liveStep.error,
        resultSummary: liveStep.error,
        meta: { risk },
      });
      return failTask(taskId, liveStep.error, liveStep.id, {
        unfinished: node?.label || liveStep.capabilityId,
        nextActions: [
          "查看任务中心失败说明",
          result?.reason === "unauthorized_external_write"
            ? "未授权外部写入已被拦截"
            : "修正输入后重试或取消",
        ],
      });
    }

    liveStep.status = "completed";
    liveStep.output = result;
    liveStep.error = null;
    liveStep.finishedAt = nowIso();
    task.checkpoint = { stepId: liveStep.id, cursor: i + 1, payload: { lastArtifactId: result.artifactId } };
    saveTask(task);
    appendAuditEvent(task.id, {
      type: "step_completed",
      stepId: liveStep.id,
      capabilityId: liveStep.capabilityId,
      summary: result.summary || "完成",
      resultSummary: result.summary || JSON.stringify(result.artifactId || {}),
      meta: { risk, artifactId: result.artifactId },
    });
  }

  return completeTask(taskId);
}

/**
 * Approve pending request and continue.
 * @param {string} taskId
 * @param {string} approvalId
 * @param {Record<string, unknown>} [ctx]
 */
export async function approveAndContinue(taskId, approvalId, ctx = {}) {
  const decided = decideApproval(taskId, approvalId, "approved");
  if (!decided.ok) return decided;
  const task = getTask(taskId);
  if (task && task.state === "awaiting_approval") {
    task.state = "running";
    saveTask(task);
  }
  return runTask(taskId, { approved: true, ctx });
}

/**
 * Reject approval → fail with clear next actions.
 */
export function rejectApproval(taskId, approvalId) {
  const decided = decideApproval(taskId, approvalId, "rejected");
  if (!decided.ok) return decided;
  return failTask(taskId, "approval_rejected", decided.value?.stepId, {
    unfinished: "用户拒绝的写操作",
    nextActions: ["可修改后重新发起任务", "或忽略此次建议"],
  });
}

/**
 * Pause running task (≤2 clicks from UI).
 * @param {string} taskId
 */
export function pauseTask(taskId) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  if (TERMINAL_STATES.includes(task.state)) {
    return { ok: false, reason: "already_terminal" };
  }
  if (task.state !== "running" && task.state !== "awaiting_approval" && task.state !== "proposed") {
    // allow pause from running primarily; also from awaiting as soft hold
    if (task.state === "paused") return { ok: true, value: task };
  }
  task.state = "paused";
  for (const step of task.steps || []) {
    if (step.status === "running") step.status = "paused";
  }
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "paused",
    summary: "用户暂停",
    stepId: task.checkpoint?.stepId || null,
  });
  return { ok: true, value: getTask(task.id) };
}

/**
 * Resume from checkpoint.
 * @param {string} taskId
 * @param {Record<string, unknown>} [ctx]
 */
export async function resumeTask(taskId, ctx = {}) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  if (task.state !== "paused") return { ok: false, reason: "not_paused" };
  task.state = "running";
  for (const step of task.steps || []) {
    if (step.status === "paused") step.status = "pending";
  }
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "resumed",
    summary: "从检查点继续",
    stepId: task.checkpoint?.stepId || null,
  });
  return runTask(taskId, { approved: true, ctx });
}

/**
 * Cancel task.
 * @param {string} taskId
 */
export function cancelTask(taskId) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  if (TERMINAL_STATES.includes(task.state) && task.state !== "cancelled") {
    return { ok: false, reason: "already_terminal", state: task.state };
  }
  if (task.state === "cancelled") return { ok: true, value: task };

  task.state = "cancelled";
  for (const step of task.steps || []) {
    if (step.status === "pending" || step.status === "running" || step.status === "paused") {
      step.status = "cancelled";
      step.finishedAt = nowIso();
    }
  }
  const completed = (task.steps || []).filter((s) => s.status === "completed").map((s) => s.id);
  task.outcome = buildTaskOutcome({
    ok: false,
    status: "cancelled",
    completedStepIds: completed,
    unfinished: "用户取消，剩余步骤未执行",
    nextActions: ["可在任务中心查看已完成步骤", "需要时可重新发起同意图（新幂等键）"],
    artifactIds: collectArtifactIds(task),
    message: `已取消。完成到第 ${completed.length} 步；未完成部分已停止。`,
  });
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "cancelled",
    summary: task.outcome.message,
    stepId: task.checkpoint?.stepId || null,
  });
  return { ok: true, value: getTask(task.id) };
}

function collectArtifactIds(task) {
  const ids = [];
  for (const step of task.steps || []) {
    if (step.output?.artifactId) ids.push(String(step.output.artifactId));
  }
  return ids;
}

function completeTask(taskId) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  const completed = (task.steps || []).filter((s) => s.status === "completed").map((s) => s.id);
  task.state = "completed";
  task.outcome = buildTaskOutcome({
    ok: true,
    status: "completed",
    completedStepIds: completed,
    unfinished: "",
    nextActions: ["可在任务中心查看产物", "本地写操作可撤销"],
    artifactIds: collectArtifactIds(task),
    message: "任务已完成",
  });
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "completed",
    summary: task.outcome.message,
    resultSummary: `artifacts=${task.outcome.artifactIds.join(",")}`,
  });
  return { ok: true, value: getTask(task.id) };
}

function failTask(taskId, reason, failedStepId, extra = {}) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  const completed = (task.steps || []).filter((s) => s.status === "completed").map((s) => s.id);
  task.state = "failed";
  task.outcome = buildTaskOutcome({
    ok: false,
    status: "failed",
    completedStepIds: completed,
    failedStepId: failedStepId || null,
    unfinished: extra.unfinished || reason,
    nextActions: extra.nextActions || ["查看失败原因后重试或取消"],
    artifactIds: collectArtifactIds(task),
    message: `失败：完成到第 ${completed.length} 步。未完成：${extra.unfinished || reason}。下一步：${(extra.nextActions || ["重试或取消"]).join("；")}`,
  });
  saveTask(task);
  appendAuditEvent(task.id, {
    type: "failed",
    summary: task.outcome.message,
    stepId: failedStepId || null,
    resultSummary: reason,
  });
  return { ok: false, reason, value: getTask(task.id) };
}

/**
 * Simulate app refresh / process restart — reload from store and continue safely.
 * Idempotent: will not re-execute completed steps; will not double-create by key.
 * @param {string} taskId
 * @param {Record<string, unknown>} [ctx]
 */
export async function recoverTask(taskId, ctx = {}) {
  const task = getTask(taskId);
  if (!task) return { ok: false, reason: "task_not_found" };
  if (TERMINAL_STATES.includes(task.state)) return { ok: true, value: task, recovered: false };
  if (task.state === "awaiting_approval") return { ok: true, value: task, recovered: true };
  if (task.state === "paused") return { ok: true, value: task, recovered: true };
  if (task.state === "draft") return proposeTask(taskId);
  if (task.state === "proposed" || task.state === "running") {
    // Reset any "running" step back to pending for safe replay from checkpoint
    for (const step of task.steps || []) {
      if (step.status === "running") step.status = "pending";
    }
    task.state = "running";
    saveTask(task);
    appendAuditEvent(task.id, {
      type: "recovered",
      summary: "从检查点恢复",
      stepId: task.checkpoint?.stepId || null,
    });
    return runTask(taskId, { approved: true, ctx });
  }
  return { ok: true, value: task, recovered: false };
}

/**
 * One-shot helper: create + propose + run (stops at approval if needed).
 */
export async function submitTask(fields, ctx = {}) {
  const created = createTaskDraft(fields);
  if (!created.ok) return created;
  if (created.reused) {
    const t = created.value;
    if (TERMINAL_STATES.includes(t.state)) return { ok: true, value: t, reused: true };
    if (t.state === "awaiting_approval") return { ok: true, value: t, reused: true, awaitingApproval: true };
    if (t.state === "paused") return { ok: true, value: t, reused: true, paused: true };
    if (t.state === "running" || t.state === "proposed" || t.state === "draft") {
      return runTask(t.id, { ctx });
    }
    return { ok: true, value: t, reused: true };
  }
  const proposed = proposeTask(created.value.id);
  if (!proposed.ok) return proposed;
  return runTask(created.value.id, { ctx });
}

export { ensureBuiltinCapabilities };
