/**
 * Qiji Assistant Local Agent runner — reuses OpenClawMobileRuntimeAdapter.
 * Does not reimplement Agent Loop.
 */

import {
  OpenClawMobileRuntimeAdapter,
  writeOpenClawResultToCompanionHistory,
} from "../../integrations/openclaw-mobile/index.js";
import { freezeCompanionScope } from "../../memory/companion-scope.js";
import { createQijiControlledTools, buildCharacterDiff } from "./controlled-tools.js";
import {
  createAssistantTask,
  updateAssistantTask,
  getAssistantTask,
} from "./task-store.js";
import {
  mapNyraEventToAssistant,
  toolStepSummary,
  eventToSpeech,
  sanitizeUserMessage,
} from "./events.js";
import { commitCharacterCandidateOnce } from "./character-commit.js";
import { CHARACTER_FIX_FIXTURE as DEFAULT_FIXTURE } from "./fixtures.js";
import { createGatewayStreamFn } from "./byok-stream.js";
import { isManagedProductMode } from "../../account/product-access.js";
import {
  finalizeHostedAgentRun,
  prepareHostedAgentRun,
} from "../../billing/agent-run.js";

function gatewayModelDescriptor(provider = {}) {
  const modelId = String(provider.model || "server-resolved").trim() || "server-resolved";
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "model-gateway",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.instruction
 * @param {object} [opts.characterPayload]
 * @param {string} [opts.characterResourceId]
 * @param {string} [opts.title]
 * @param {AbortSignal} [opts.signal]
 * @param {string} [opts.testScenario]
 * @param {(ev: import('./events.js').AssistantTaskEvent) => void} [opts.onEvent]
 * @param {boolean} [opts.autoApprove] — tests only
 */
export async function runCharacterFixAgentTask(opts = {}) {
  const instruction =
    opts.instruction ||
    "检查这个角色卡有什么问题并生成修复版本。只使用受控工具，不要写生产数据。";
  const characterPayload = opts.characterPayload || DEFAULT_FIXTURE;
  const resourceId = opts.characterResourceId || `fixture:${characterPayload.name || "char"}`;

  const frozenScope = freezeCompanionScope({
    userId: opts.userId || "local",
    companionId: opts.initiatingCompanionId || opts.companionId || opts.characterId || "",
    relationshipId: opts.relationshipId,
    initiatingCompanionId: opts.initiatingCompanionId || opts.companionId || opts.characterId || "",
  });

  let task = createAssistantTask({
    title: opts.title || "角色卡检查与修复",
    instruction,
    characterId: frozenScope.initiatingCompanionId || frozenScope.companionId || opts.characterId,
    status: "PREPARING",
    authorizedResources: [
      { type: "character", resourceId, access: "propose-write" },
    ],
    requiredCapabilities: [
      "nyra.character.inspect",
      "workspace.write_text",
      "nyra.character.create_candidate",
    ],
    workspaceId: `ws-${Date.now().toString(36)}`,
    checkpoint: {
      step: "prepare",
      completedSideEffects: [],
      initiatingCompanionId: frozenScope.initiatingCompanionId || frozenScope.companionId,
      relationshipId: frozenScope.relationshipId,
      userId: frozenScope.userId,
      scopeFrozenAt: frozenScope.frozenAt,
    },
  });

  const emit = (ev) => {
    opts.onEvent?.(ev);
  };
  emit({ type: "task_created" });

  const adapter = new OpenClawMobileRuntimeAdapter();
  const runId = `assist-${task.id}`;
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  task = updateAssistantTask(task.id, {
    status: "RUNNING",
    stepSummary: "正在准备 Workspace 副本",
  }) || task;
  emit({ type: "task_started" });

  /** @type {import('./events.js').AssistantTaskEvent[]} */
  const events = [];
  let lastArtifact = null;
  let agentRunId = "";

  try {
    const authorizedIds = new Set([resourceId]);
    /** @type {object} */
    const runRequest = {
      runId,
      instruction,
      workspaceId: task.workspaceId,
      maxSteps: opts.maxSteps ?? 8,
      signal: controller.signal,
      testScenario: opts.testScenario || "happy",
      characterPayload,
      productMode: true,
      authorizedResourceIds: authorizedIds,
      toolsFactory: (workspace) =>
        createQijiControlledTools(workspace, { authorizedResourceIds: authorizedIds }),
    };
    if (opts.streamFn) {
      runRequest.streamFn = opts.streamFn;
      runRequest.testScenario = opts.testScenario || "byok";
    } else if (opts.allowFakeStream === true) {
      runRequest.allowFakeStream = true;
    } else {
      const provider = opts.providerConfig || {};
      const apiKey = String(provider.apiKey || "").trim();
      const baseUrl = String(provider.baseUrl || "").trim();
      const modelId = String(provider.model || "").trim();
      if (!isManagedProductMode() && (!apiKey || !baseUrl || !modelId)) {
        task = updateAssistantTask(task.id, {
          status: "FAILED",
          failureCode: "PROVIDER_REQUIRED",
          failureMessage: "当前不可执行：请先配置可用的模型接口（BYOK），不会使用假流伪装成功。",
          stepSummary: "缺少模型配置",
        }) || task;
        emit({ type: "task_failed", code: "PROVIDER_REQUIRED", message: "missing provider" });
        return { ok: false, task: getAssistantTask(task.id), events, code: "PROVIDER_REQUIRED" };
      }
      if (!opts.streamFn && isManagedProductMode()) {
        const billingRun = await prepareHostedAgentRun({
          taskId: task.id,
          attemptId: runId,
          businessPurpose: "assistant.character_task",
          runnerKind: "character_fix",
          title: "执行角色修复 Agent",
        });
        agentRunId = billingRun?.agentRunId || "";
      }
      runRequest.streamFn = createGatewayStreamFn({
        providerConfig: provider,
        userId: frozenScope.userId,
        companionId: frozenScope.initiatingCompanionId || frozenScope.companionId,
        businessPurpose: "assistant.character_task",
        agentRunId,
      });
      runRequest.model = opts.model || gatewayModelDescriptor(provider);
      runRequest.testScenario = "gateway";
    }
    if (opts.model) runRequest.model = opts.model;

    for await (const nyra of adapter.run(runRequest)) {
      const mapped = mapNyraEventToAssistant(nyra);
      if (mapped) {
        events.push(mapped);
        emit(mapped);
        if (mapped.type === "tool_started") {
          task = updateAssistantTask(task.id, {
            stepSummary: toolStepSummary(mapped.toolName),
          }) || task;
        }
        if (mapped.type === "tool_finished" && mapped.toolName?.includes("write")) {
          emit({ type: "artifact_created", artifactId: "output/character.fixed.json" });
        }
        if (mapped.type === "task_failed") {
          task = updateAssistantTask(task.id, {
            status: "FAILED",
            failureCode: mapped.code,
            failureMessage: mapped.message,
            stepSummary: mapped.message,
          }) || task;
          return { ok: false, task: getAssistantTask(task.id), events };
        }
      }
      if (nyra.type === "run_completed") {
        lastArtifact = nyra.artifactIds?.[0] || "output/character.fixed.json";
      }
    }

    if (controller.signal.aborted) {
      task = updateAssistantTask(task.id, {
        status: "CANCELED",
        stepSummary: "已取消",
        checkpoint: {
          step: "canceled",
          completedSideEffects: task.checkpoint?.completedSideEffects || [],
        },
      }) || task;
      emit({ type: "task_failed", code: "CANCELLED", message: "用户取消" });
      return { ok: false, canceled: true, task: getAssistantTask(task.id), events };
    }

    const workspace = adapter.workspaces.get(runId);
    let candidate = null;
    let artifactRaw = null;
    if (workspace) {
      try {
        artifactRaw = await workspace.readText("output/character.fixed.json");
        candidate = JSON.parse(artifactRaw);
      } catch {
        candidate = null;
      }
    }

    if (!candidate?.personality) {
      const message = "Agent 未生成有效修复候选（可能模型未返回 Tool Call 或工具失败）";
      task = updateAssistantTask(task.id, {
        status: "FAILED",
        failureCode: "CANDIDATE_MISSING",
        failureMessage: message,
        stepSummary: message,
      }) || task;
      emit({ type: "task_failed", code: "CANDIDATE_MISSING", message });
      return { ok: false, task: getAssistantTask(task.id), events };
    }

  const approvalId = `approval-${task.id}`;
    const { buildCommitIdempotencyKey } = await import("./commit-idempotency.js");
    const idempotencyKey = await buildCommitIdempotencyKey(task, candidate, "character.create");
    const diff = buildCharacterDiff(characterPayload, candidate);
    task = updateAssistantTask(task.id, {
      status: "WAITING_FOR_APPROVAL",
      stepSummary: "发现 personality 字段缺失；已生成修复候选，等待确认导入",
      candidate,
      diff,
      artifactIds: lastArtifact ? [String(lastArtifact)] : ["output/character.fixed.json"],
      checkpoint: {
        step: "awaiting_approval",
        completedSideEffects: [],
        initiatingCompanionId: task.checkpoint?.initiatingCompanionId || frozenScope.initiatingCompanionId || frozenScope.companionId,
        relationshipId: task.checkpoint?.relationshipId || frozenScope.relationshipId,
        userId: task.checkpoint?.userId || frozenScope.userId,
        payload: { approvalId, idempotencyKey },
      },
    }) || task;
    emit({ type: "approval_required", approvalId });

    if (opts.autoApprove) {
      return approveAssistantTask(task.id, { signal: opts.signal, commitFn: opts.commitFn });
    }

    return {
      ok: true,
      awaitingApproval: true,
      task: getAssistantTask(task.id),
      events,
      speech: eventToSpeech({ type: "approval_required", approvalId }),
    };
  } catch (err) {
    const code = err?.code || "RUNTIME_ERROR";
    const message = sanitizeUserMessage(String(err?.message || err));
    task = updateAssistantTask(task.id, {
      status: code === "AGENT_BILLING_CANCELLED"
        ? "CANCELED"
        : code === "EXTERNAL_BACKEND_REQUIRED"
          ? "EXTERNAL_BACKEND_REQUIRED"
          : "FAILED",
      failureCode: code,
      failureMessage: message,
      stepSummary: message,
    }) || task;
    emit({ type: "task_failed", code, message });
    return { ok: false, task: getAssistantTask(task.id), events, error: err };
  } finally {
    if (agentRunId) {
      try {
        await finalizeHostedAgentRun(agentRunId);
      } catch {
        /* settlement recovery remains server-side */
      }
    }
  }
}

/**
 * User approved candidate → business Service only.
 * Concurrent / repeated approve is idempotent.
 * @param {string} taskId
 */
/** @type {Set<string>} */
const approving = new Set();

export async function approveAssistantTask(taskId, opts = {}) {
  let task = getAssistantTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if (task.status === "SUCCEEDED" && task.commitResultId) {
    return { ok: true, skipped: true, task };
  }
  if (task.status !== "WAITING_FOR_APPROVAL" && task.status !== "COMMITTING" && !task.candidate) {
    return { ok: false, error: "not_awaiting" };
  }

  if (approving.has(taskId)) {
    // Wait briefly for in-flight commit (double-click / duplicate resume)
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const latest = getAssistantTask(taskId);
      if (latest?.status === "SUCCEEDED" && latest.commitResultId) {
        return { ok: true, skipped: true, task: latest };
      }
      if (!approving.has(taskId)) break;
    }
  }

  approving.add(taskId);
  opts.onEvent?.({ type: "step_updated", summary: "production_commit_started" });
  try {
    task = updateAssistantTask(taskId, {
      status: "COMMITTING",
      stepSummary: "正在导入为新角色（不覆盖原角色）",
    }) || task;

    const commitFn = opts.commitFn || commitCharacterCandidateOnce;
    const result = await commitFn(task, task.candidate);
    if (!result.ok) {
      task = updateAssistantTask(taskId, {
        status: "FAILED",
        failureCode: result.code,
        failureMessage: result.message,
        stepSummary: result.message,
      }) || task;
      return { ok: false, task: getAssistantTask(taskId), result };
    }

    task = updateAssistantTask(taskId, {
      status: "VERIFYING",
      stepSummary: "正在重新读取并验证",
      commitResultId: result.characterId,
      checkpoint: {
        step: "committed",
        completedSideEffects: [
          ...(task.checkpoint?.completedSideEffects || []),
          "character.create",
        ],
        payload: {
          ...(task.checkpoint?.payload || {}),
          idempotencyKey: result.idempotencyKey || task.checkpoint?.payload?.idempotencyKey,
        },
      },
    }) || task;

    const speech = result.entryHint || "已创建新角色并完成验证";
    // P0: durable writeback (when scoped) must land before SUCCEEDED.
    try {
      const liveTask = getAssistantTask(taskId) || task;
      const initiatingCompanionId = String(
        liveTask?.checkpoint?.initiatingCompanionId
          || opts.initiatingCompanionId
          || opts.companionId
          || "",
      ).trim();
      if (initiatingCompanionId) {
        await writeOpenClawResultToCompanionHistory({
          initiatingCompanionId,
          companionId: initiatingCompanionId,
          userId: liveTask?.checkpoint?.userId || opts.userId || "local",
          relationshipId: liveTask?.checkpoint?.relationshipId || opts.relationshipId,
          chatSessionId: opts.chatSessionId || "",
          taskId,
          summary: speech,
          saveChatMessage: opts.saveChatMessage,
        });
      }
    } catch (error) {
      console.warn("[openclaw.writeback] companion history write failed", error);
      task = updateAssistantTask(taskId, {
        status: "FAILED",
        failureCode: "WRITEBACK_FAILED",
        failureMessage: error?.message || "writeback_failed",
        stepSummary: "角色已创建，但写回共同历史失败",
      }) || task;
      return { ok: false, task: getAssistantTask(taskId), result, code: "WRITEBACK_FAILED" };
    }

    task = updateAssistantTask(taskId, {
      status: "SUCCEEDED",
      stepSummary: result.entryHint || "角色已导入并验证",
    }) || task;

    opts.onEvent?.({ type: "task_completed", summary: "production_commit_completed" });

    return {
      ok: true,
      skipped: Boolean(result.skipped),
      task: getAssistantTask(taskId),
      result,
      speech,
    };
  } finally {
    approving.delete(taskId);
  }
}

/**
 * @param {string} taskId
 */
export function rejectAssistantTask(taskId, opts = {}) {
  const task = getAssistantTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  const keepCandidate = opts.keepCandidate !== false;
  updateAssistantTask(taskId, {
    status: "CANCELED",
    stepSummary: "用户拒绝导入；生产数据未变更",
    candidate: keepCandidate ? task.candidate : undefined,
    checkpoint: {
      step: "rejected",
      completedSideEffects: task.checkpoint?.completedSideEffects || [],
    },
  });
  return { ok: true, task: getAssistantTask(taskId), productionUnchanged: true };
}

/**
 * Pause on background — no assumption JS keeps running.
 * @param {string} taskId
 */
export function pauseAssistantTask(taskId) {
  const task = getAssistantTask(taskId);
  if (!task) return { ok: false };
  if (["SUCCEEDED", "FAILED", "CANCELED"].includes(task.status)) {
    return { ok: true, task, skipped: true };
  }
  updateAssistantTask(taskId, {
    status: "PAUSED",
    stepSummary: "应用进入后台，任务已暂停",
    checkpoint: {
      step: task.checkpoint?.step || "paused",
      completedSideEffects: task.checkpoint?.completedSideEffects || [],
      payload: { ...(task.checkpoint?.payload || {}), pausedAt: new Date().toISOString() },
    },
  });
  return { ok: true, task: getAssistantTask(taskId) };
}

/**
 * Resume from checkpoint — do not redo successful side effects.
 * @param {string} taskId
 */
export async function resumeAssistantTask(taskId) {
  const task = getAssistantTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if (task.status === "SUCCEEDED") return { ok: true, task, skipped: true };
  if (task.checkpoint?.completedSideEffects?.includes("character.create") && task.candidate) {
    return approveAssistantTask(taskId);
  }
  if (task.status === "PAUSED" && task.candidate) {
    updateAssistantTask(taskId, {
      status: "WAITING_FOR_APPROVAL",
      stepSummary: "任务已恢复，等待你确认是否导入",
    });
    return { ok: true, awaitingApproval: true, task: getAssistantTask(taskId) };
  }
  if (task.status === "PAUSED") {
    updateAssistantTask(taskId, {
      status: "FAILED",
      failureCode: "CHECKPOINT_INCOMPLETE",
      failureMessage: "检查点不完整，请重新发起任务",
    });
    return { ok: false, task: getAssistantTask(taskId) };
  }
  return { ok: false, error: "cannot_resume", task };
}

export { CHARACTER_FIX_FIXTURE } from "./fixtures.js";
