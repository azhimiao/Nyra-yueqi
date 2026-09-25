/**
 * Explore worldbook merge task — uses OpenClawMobileRuntimeAdapter (no self-built loop).
 */

import {
  OpenClawMobileRuntimeAdapter,
  createAssistantMessageEventStream,
  writeOpenClawResultToCompanionHistory,
} from "../integrations/openclaw-mobile/index.js";
import { freezeCompanionScope } from "../memory/companion-scope.js";
import { createQijiControlledTools } from "../studio-assist/agent/controlled-tools.js";
import {
  createAssistantTask,
  updateAssistantTask,
  getAssistantTask,
} from "../studio-assist/agent/task-store.js";
import { mapNyraEventToAssistant, sanitizeUserMessage } from "../studio-assist/agent/events.js";
import { buildCommitIdempotencyKey } from "../studio-assist/agent/commit-idempotency.js";
import {
  buildWorldbookMergeDiff,
  commitWorldbookMergeCandidateOnce,
  listWorldbookEntries,
  getWorldbookEntry,
} from "./worldbook-commit.js";
import { createGatewayStreamFn } from "../studio-assist/agent/byok-stream.js";
import { isManagedProductMode } from "../account/product-access.js";
import {
  finalizeHostedAgentRun,
  prepareHostedAgentRun,
} from "../billing/agent-run.js";

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

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function makeAssistant(content, stopReason = "toolUse") {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "explore-fake",
    model: "fake",
    usage: { ...EMPTY_USAGE },
    stopReason,
    timestamp: Date.now(),
  };
}

function createMergeFakeStreamFn(bookA, bookB) {
  return async function streamFn(_model, context, options) {
    const stream = createAssistantMessageEventStream();
    const signal = options?.signal;
    queueMicrotask(() => {
      if (signal?.aborted) {
        const msg = makeAssistant([{ type: "text", text: "aborted" }], "aborted");
        stream.push({ type: "start", partial: msg });
        stream.push({ type: "done", message: msg });
        stream.end();
        return;
      }
      const turn = (context.messages || []).filter((m) => m?.role === "assistant").length;
      let msg;
      if (turn === 0) {
        msg = makeAssistant([
          {
            type: "toolCall",
            id: "m1",
            name: "nyra.worldbook.create_merge_candidate",
            arguments: {
              path: "output/worldbook.merged.json",
              entries: [...bookA, ...bookB],
            },
          },
        ]);
      } else {
        msg = makeAssistant([{ type: "text", text: "merge candidate ready" }], "stop");
      }
      stream.push({ type: "start", partial: msg });
      stream.push({ type: "done", message: msg });
      stream.end();
    });
    return stream;
  };
}

/**
 * @param {object} opts
 * @param {object[]} opts.bookA
 * @param {object[]} opts.bookB
 * @param {string[]} [opts.sourceIds] — production ids to verify unchanged
 */
export async function runWorldbookMergeTask(opts = {}) {
  const bookA = Array.isArray(opts.bookA) ? opts.bookA : [];
  const bookB = Array.isArray(opts.bookB) ? opts.bookB : [];
  const sourceIds = Array.isArray(opts.sourceIds) ? opts.sourceIds : [];

  const frozenScope = freezeCompanionScope({
    userId: opts.userId || "local",
    companionId: opts.initiatingCompanionId || opts.companionId || opts.characterId || "",
    relationshipId: opts.relationshipId,
    initiatingCompanionId: opts.initiatingCompanionId || opts.companionId || opts.characterId || "",
  });

  let task = createAssistantTask({
    title: "世界书合并",
    instruction: opts.instruction || "分析重复条目并生成合并候选",
    characterId: frozenScope.initiatingCompanionId || frozenScope.companionId || opts.characterId,
    status: "PREPARING",
    authorizedResources: [
      { type: "worldbook", resourceId: "fixture:a", access: "propose-write" },
      { type: "worldbook", resourceId: "fixture:b", access: "propose-write" },
    ],
    requiredCapabilities: ["nyra.worldbook.create_merge_candidate"],
    workspaceId: `ws-wb-${Date.now().toString(36)}`,
    checkpoint: {
      step: "prepare",
      completedSideEffects: [],
      payload: { sourceIds },
      initiatingCompanionId: frozenScope.initiatingCompanionId || frozenScope.companionId,
      relationshipId: frozenScope.relationshipId,
      userId: frozenScope.userId,
      scopeFrozenAt: frozenScope.frozenAt,
    },
  });

  const adapter = new OpenClawMobileRuntimeAdapter();
  const runId = `explore-${task.id}`;
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  task = updateAssistantTask(task.id, { status: "RUNNING", stepSummary: "正在合并世界书副本" }) || task;
  opts.onEvent?.({ type: "task_started" });

  const events = [];
  let agentRunId = "";
  try {
    const authorized = new Set(["fixture:a", "fixture:b"]);
    let streamFn = opts.streamFn;
    if (!streamFn && opts.allowFakeStream === true) {
      streamFn = createMergeFakeStreamFn(bookA, bookB);
    } else if (!streamFn) {
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
        return { ok: false, task: getAssistantTask(task.id), events, code: "PROVIDER_REQUIRED" };
      }
      if (isManagedProductMode()) {
        const billingRun = await prepareHostedAgentRun({
          taskId: task.id,
          attemptId: runId,
          businessPurpose: "assistant.worldbook_merge",
          runnerKind: "worldbook_merge",
          title: "执行世界书合并 Agent",
        });
        agentRunId = billingRun?.agentRunId || "";
      }
      streamFn = createGatewayStreamFn({
        providerConfig: provider,
        userId: frozenScope.userId,
        companionId: frozenScope.initiatingCompanionId || frozenScope.companionId,
        businessPurpose: "assistant.worldbook_merge",
        agentRunId,
      });
      opts.model = opts.model || gatewayModelDescriptor(provider);
    }
    for await (const nyra of adapter.run({
      runId,
      instruction: task.instruction,
      workspaceId: task.workspaceId,
      maxSteps: opts.maxSteps ?? 6,
      signal: controller.signal,
      productMode: true,
      characterPayload: { name: "wb-placeholder", description: "n/a" },
      seedFiles: {
        "input/worldbook-a.json": JSON.stringify(bookA, null, 2),
        "input/worldbook-b.json": JSON.stringify(bookB, null, 2),
        "input/worldbook.json": JSON.stringify([...bookA, ...bookB], null, 2),
      },
      toolsFactory: (ws) => createQijiControlledTools(ws, { authorizedResourceIds: authorized }),
      streamFn,
      allowFakeStream: opts.allowFakeStream === true,
      model: opts.model,
    })) {
      const mapped = mapNyraEventToAssistant(nyra);
      if (mapped) {
        events.push(mapped);
        opts.onEvent?.(mapped);
      }
      if (mapped?.type === "task_failed") {
        task = updateAssistantTask(task.id, {
          status: "FAILED",
          failureCode: mapped.code,
          failureMessage: mapped.message,
        }) || task;
        return { ok: false, task: getAssistantTask(task.id), events };
      }
    }

    if (controller.signal.aborted) {
      updateAssistantTask(task.id, { status: "CANCELED", stepSummary: "已取消" });
      return { ok: false, canceled: true, task: getAssistantTask(task.id), events };
    }

    const workspace = adapter.workspaces.get(runId);
    let merged = [];
    if (workspace) {
      try {
        merged = JSON.parse(await workspace.readText("output/worldbook.merged.json"));
      } catch {
        merged = [];
      }
    }
    if (!Array.isArray(merged) || !merged.length) {
      // Deterministic fallback merge (still candidate-only)
      const seen = new Set();
      for (const e of [...bookA, ...bookB]) {
        const k = String(e?.title || e?.id || JSON.stringify(e));
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(e);
      }
    }

    const diff = buildWorldbookMergeDiff(bookA, bookB, merged);
    const idempotencyKey = await buildCommitIdempotencyKey(task, merged, "worldbook.merge.create");
    task = updateAssistantTask(task.id, {
      status: "WAITING_FOR_APPROVAL",
      stepSummary: `发现重复并生成合并候选（${merged.length} 条），等待确认导入为新条目`,
      candidate: { entries: merged, kind: "worldbook-merge" },
      diff,
      artifactIds: ["output/worldbook.merged.json"],
      checkpoint: {
        step: "awaiting_approval",
        completedSideEffects: [],
        initiatingCompanionId: task.checkpoint?.initiatingCompanionId || frozenScope.initiatingCompanionId || frozenScope.companionId,
        relationshipId: task.checkpoint?.relationshipId || frozenScope.relationshipId,
        userId: task.checkpoint?.userId || frozenScope.userId,
        payload: { sourceIds, idempotencyKey, originalsSnapshot: sourceIds },
      },
    }) || task;
    opts.onEvent?.({ type: "approval_required", approvalId: `approval-${task.id}` });

    if (opts.autoApprove) {
      return approveWorldbookMergeTask(task.id, { commitFn: opts.commitFn });
    }
    return {
      ok: true,
      awaitingApproval: true,
      task: getAssistantTask(task.id),
      events,
      speech: "已生成世界书合并候选，请确认后创建新条目（原世界书不变）。",
    };
  } catch (err) {
    const message = sanitizeUserMessage(String(err?.message || err));
    updateAssistantTask(task.id, {
      status: err?.code === "AGENT_BILLING_CANCELLED" ? "CANCELED" : "FAILED",
      failureCode: err?.code || "RUNTIME_ERROR",
      failureMessage: message,
    });
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

export async function approveWorldbookMergeTask(taskId, opts = {}) {
  let task = getAssistantTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if (task.status === "SUCCEEDED" && task.commitResultId) {
    return { ok: true, skipped: true, task };
  }
  const entries = task.candidate?.entries;
  if (!Array.isArray(entries)) return { ok: false, error: "no_candidate" };

  const sourceIds = task.checkpoint?.payload?.sourceIds || [];
  const before = {};
  for (const id of sourceIds) {
    before[id] = await getWorldbookEntry(id);
  }

  updateAssistantTask(taskId, { status: "COMMITTING", stepSummary: "正在创建新世界书条目" });
  const commitFn = opts.commitFn || commitWorldbookMergeCandidateOnce;
  const result = await commitFn(task, entries);
  if (!result.ok) {
    updateAssistantTask(taskId, {
      status: "FAILED",
      failureCode: result.code,
      failureMessage: result.message,
    });
    return { ok: false, task: getAssistantTask(taskId), result };
  }

  // Verify originals unchanged
  for (const id of sourceIds) {
    const after = await getWorldbookEntry(id);
    if (before[id] && after && JSON.stringify(before[id]) !== JSON.stringify(after)) {
      updateAssistantTask(taskId, {
        status: "FAILED",
        failureCode: "ORIGINAL_MUTATED",
        failureMessage: "原世界书被意外修改",
      });
      return { ok: false, task: getAssistantTask(taskId), code: "ORIGINAL_MUTATED" };
    }
  }

  const speech = result.entryHint || "世界书合并已完成";
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
    console.warn("[openclaw.writeback] worldbook writeback failed", error);
    updateAssistantTask(taskId, {
      status: "FAILED",
      failureCode: "WRITEBACK_FAILED",
      failureMessage: error?.message || "writeback_failed",
      stepSummary: "条目已创建，但写回共同历史失败",
    });
    return { ok: false, task: getAssistantTask(taskId), result, code: "WRITEBACK_FAILED" };
  }

  updateAssistantTask(taskId, {
    status: "SUCCEEDED",
    commitResultId: result.worldbookBatchId,
    stepSummary: result.entryHint,
    checkpoint: {
      step: "committed",
      completedSideEffects: ["worldbook.merge.create"],
      payload: {
        ...(task.checkpoint?.payload || {}),
        createdIds: result.createdIds,
      },
    },
  });

  return {
    ok: true,
    skipped: Boolean(result.skipped),
    task: getAssistantTask(taskId),
    result,
    speech,
  };
}

export function rejectWorldbookMergeTask(taskId) {
  const task = getAssistantTask(taskId);
  if (!task) return { ok: false };
  updateAssistantTask(taskId, {
    status: "CANCELED",
    stepSummary: "用户拒绝；原世界书未变更",
  });
  return { ok: true, productionUnchanged: true, task: getAssistantTask(taskId) };
}

export { listWorldbookEntries };
