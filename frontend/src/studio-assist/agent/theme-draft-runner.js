/**
 * Theme draft local-agent task — reuses OpenClawMobileRuntimeAdapter (no self-built loop).
 */

import {
  OpenClawMobileRuntimeAdapter,
  createAssistantMessageEventStream,
  writeOpenClawResultToCompanionHistory,
} from "../../integrations/openclaw-mobile/index.js";
import { freezeCompanionScope } from "../../memory/companion-scope.js";
import { createQijiControlledTools } from "./controlled-tools.js";
import {
  createAssistantTask,
  updateAssistantTask,
  getAssistantTask,
} from "./task-store.js";
import { mapNyraEventToAssistant, sanitizeUserMessage } from "./events.js";
import { buildCommitIdempotencyKey } from "./commit-idempotency.js";
import { buildThemeDiff, commitThemeCandidateOnce } from "./theme-commit.js";
import { THEMES } from "../../ui/theme.js";
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

const EMPTY_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function makeAssistant(content, stopReason = "toolUse") {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "assist-fake",
    model: "fake",
    usage: { ...EMPTY_USAGE },
    stopReason,
    timestamp: Date.now(),
  };
}

function createThemeDraftFakeStreamFn(themeId = "mist") {
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
          { type: "toolCall", id: "t1", name: "nyra.theme.inspect", arguments: {} },
        ]);
      } else if (turn === 1) {
        msg = makeAssistant([
          {
            type: "toolCall",
            id: "t2",
            name: "nyra.theme.create_theme_candidate",
            arguments: {
              path: "output/theme.candidate.json",
              theme: { id: themeId, label: THEMES.find((t) => t.id === themeId)?.label || themeId, source: "draft" },
            },
          },
        ]);
      } else {
        msg = makeAssistant([{ type: "text", text: "theme candidate ready" }], "stop");
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
 */
export async function runThemeDraftAgentTask(opts = {}) {
  const currentThemeId = String(opts.currentThemeId || "yueqi");
  const targetThemeId = String(opts.targetThemeId || "mist");

  const frozenScope = freezeCompanionScope({
    userId: opts.userId || "local",
    companionId: opts.initiatingCompanionId || opts.companionId || opts.characterId || "",
    relationshipId: opts.relationshipId,
    initiatingCompanionId: opts.initiatingCompanionId || opts.companionId || opts.characterId || "",
  });

  let task = createAssistantTask({
    title: opts.title || "主题设计候选",
    instruction: opts.instruction || "根据描述生成主题候选",
    characterId: frozenScope.initiatingCompanionId || frozenScope.companionId || opts.characterId,
    status: "PREPARING",
    authorizedResources: [{ type: "theme", resourceId: "fixture:theme", access: "propose-write" }],
    requiredCapabilities: ["nyra.theme.inspect", "nyra.theme.create_theme_candidate"],
    workspaceId: `ws-theme-${Date.now().toString(36)}`,
    checkpoint: {
      step: "prepare",
      completedSideEffects: [],
      payload: { currentThemeId },
      initiatingCompanionId: frozenScope.initiatingCompanionId || frozenScope.companionId,
      relationshipId: frozenScope.relationshipId,
      userId: frozenScope.userId,
      scopeFrozenAt: frozenScope.frozenAt,
    },
  });

  const adapter = new OpenClawMobileRuntimeAdapter();
  const runId = `assist-theme-${task.id}`;
  const controller = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  task = updateAssistantTask(task.id, { status: "RUNNING", stepSummary: "正在生成主题候选" }) || task;
  opts.onEvent?.({ type: "task_started" });

  const events = [];
  let agentRunId = "";
  try {
    let streamFn = opts.streamFn;
    if (!streamFn && opts.allowFakeStream === true) {
      streamFn = createThemeDraftFakeStreamFn(targetThemeId);
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
          businessPurpose: "assistant.theme_draft",
          runnerKind: "theme_draft",
          title: "执行主题草稿 Agent",
        });
        agentRunId = billingRun?.agentRunId || "";
      }
      streamFn = createGatewayStreamFn({
        providerConfig: provider,
        userId: frozenScope.userId,
        companionId: frozenScope.initiatingCompanionId || frozenScope.companionId,
        businessPurpose: "assistant.theme_draft",
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
      characterPayload: { name: "theme-placeholder", description: "n/a" },
      seedFiles: {
        "input/settings.json": JSON.stringify({ theme: { id: currentThemeId } }, null, 2),
        "input/theme.json": JSON.stringify({ currentId: currentThemeId, palette: ["#efe8dc", "#8b4513"] }, null, 2),
      },
      toolsFactory: (ws) => createQijiControlledTools(ws),
      streamFn,
      allowFakeStream: opts.allowFakeStream === true,
      model: opts.model,
    })) {
      const mapped = mapNyraEventToAssistant(nyra);
      if (mapped) {
        events.push(mapped);
        opts.onEvent?.(mapped);
      }
    }

    if (controller.signal.aborted) {
      updateAssistantTask(task.id, { status: "CANCELED", stepSummary: "已取消" });
      return { ok: false, canceled: true, task: getAssistantTask(task.id), events };
    }

    const workspace = adapter.workspaces.get(runId);
    let candidate = null;
    if (workspace) {
      try {
        candidate = JSON.parse(await workspace.readText("output/theme.candidate.json"));
      } catch {
        candidate = null;
      }
    }
    if (candidate?.theme && typeof candidate.theme === "object") {
      candidate = candidate.theme;
    }
    if (!candidate?.id) {
      candidate = {
        id: targetThemeId,
        label: THEMES.find((t) => t.id === targetThemeId)?.label || targetThemeId,
        source: "draft",
      };
    }

    const valid = THEMES.some((t) => t.id === candidate?.id);
    if (!valid) {
      updateAssistantTask(task.id, {
        status: "FAILED",
        failureCode: "CANDIDATE_MISSING",
        failureMessage: "未生成有效主题候选",
      });
      return { ok: false, task: getAssistantTask(task.id), events };
    }

    const idempotencyKey = await buildCommitIdempotencyKey(task, candidate, "theme.apply");
    const diff = buildThemeDiff(currentThemeId, candidate);
    task = updateAssistantTask(task.id, {
      status: "WAITING_FOR_APPROVAL",
      stepSummary: `已生成主题候选「${candidate.label || candidate.id}」，等待确认应用`,
      candidate: { ...candidate, kind: "theme" },
      diff,
      artifactIds: ["output/theme.candidate.json"],
      checkpoint: {
        step: "awaiting_approval",
        completedSideEffects: [],
        initiatingCompanionId: task.checkpoint?.initiatingCompanionId || frozenScope.initiatingCompanionId || frozenScope.companionId,
        relationshipId: task.checkpoint?.relationshipId || frozenScope.relationshipId,
        userId: task.checkpoint?.userId || frozenScope.userId,
        payload: { idempotencyKey, currentThemeId },
      },
    }) || task;
    opts.onEvent?.({ type: "approval_required", approvalId: `approval-${task.id}` });

    if (opts.autoApprove) {
      return approveThemeDraftTask(task.id, { commitFn: opts.commitFn });
    }

    return {
      ok: true,
      awaitingApproval: true,
      task: getAssistantTask(task.id),
      events,
      speech: "已生成主题候选，请确认后应用（走 appearance.apply_theme）。",
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

export async function approveThemeDraftTask(taskId, opts = {}) {
  const task = getAssistantTask(taskId);
  if (!task) return { ok: false, error: "not_found" };
  if (task.status === "SUCCEEDED" && task.commitResultId) {
    return { ok: true, skipped: true, task };
  }
  const candidate = task.candidate?.kind === "theme" ? task.candidate : null;
  if (!candidate?.id) return { ok: false, error: "no_candidate" };

  updateAssistantTask(taskId, { status: "COMMITTING", stepSummary: "正在应用主题" });
  const commitFn = opts.commitFn || commitThemeCandidateOnce;
  const result = await commitFn(task, candidate);
  if (!result.ok) {
    updateAssistantTask(taskId, {
      status: "FAILED",
      failureCode: result.code,
      failureMessage: result.message,
    });
    return { ok: false, task: getAssistantTask(taskId), result };
  }

  const speech = result.entryHint || "主题已应用";
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
    console.warn("[openclaw.writeback] theme writeback failed", error);
    updateAssistantTask(taskId, {
      status: "FAILED",
      failureCode: "WRITEBACK_FAILED",
      failureMessage: error?.message || "writeback_failed",
      stepSummary: "主题已应用，但写回共同历史失败",
    });
    return { ok: false, task: getAssistantTask(taskId), result, code: "WRITEBACK_FAILED" };
  }

  updateAssistantTask(taskId, {
    status: "SUCCEEDED",
    commitResultId: result.themeId,
    stepSummary: result.entryHint,
    checkpoint: {
      step: "committed",
      completedSideEffects: ["theme.apply"],
      payload: { ...(task.checkpoint?.payload || {}), themeId: result.themeId },
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
