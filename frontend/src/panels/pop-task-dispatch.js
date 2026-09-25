/**
 * Pop tool-task dispatch — frozen TurnExecutionScope + Assistant task (OC-Pop-log-only).
 */

import { routeAssistantIntent } from "../studio-assist/agent/intent-router.js";
import { CHARACTER_FIX_FIXTURE } from "../studio-assist/agent/fixtures.js";
import { getCharacterSync } from "../characters/store.js";
import { popTaskMetadataFromAssistantTask } from "./pop-task-inline.js";

function scopeFromTurn(turnScope = {}) {
  const companionId = String(turnScope.companionId || turnScope.characterId || "").trim();
  return {
    userId: turnScope.userId || "local",
    initiatingCompanionId: companionId,
    companionId,
    characterId: companionId,
    relationshipId: turnScope.relationshipId || "",
    chatSessionId: turnScope.sessionId || "",
  };
}

function resolveCharacterPayload(turnScope) {
  const row = getCharacterSync(turnScope.characterId || turnScope.companionId);
  if (row?.profile) {
    return {
      name: row.name || row.profile?.name || "角色",
      description: row.profile?.description || "",
      personality: row.profile?.personality,
      fields: row.profile?.fields,
    };
  }
  return CHARACTER_FIX_FIXTURE;
}

function buildRunOpts(turnScope, userText, deps = {}) {
  return {
    ...scopeFromTurn(turnScope),
    instruction: userText,
    providerConfig: deps.collectProviderConfig?.() || {},
    allowFakeStream: deps.allowFakeStream === true,
    streamFn: deps.agentStreamFn,
    saveChatMessage: deps.saveChatMessage,
  };
}

function taskSpeech(result, fallback) {
  if (result?.speech) return result.speech;
  const task = result?.task;
  if (task?.failureCode === "PROVIDER_REQUIRED") {
    return task.failureMessage || "当前不可执行：请先配置可用的模型接口（BYOK）。";
  }
  if (task?.status === "WAITING_FOR_APPROVAL") {
    return task.stepSummary || "已生成候选，请在栖机助手确认后提交。";
  }
  if (task?.status === "RUNNING" || task?.status === "PREPARING") {
    return task.stepSummary || "助手任务已创建，正在处理。";
  }
  if (result?.awaitingApproval) return fallback;
  if (task?.failureMessage) return task.failureMessage;
  return fallback;
}

/**
 * @param {{
 *   turnScope: import("../conversation/turn-scope.js").TurnExecutionScope,
 *   userText: string,
 *   route?: object,
 *   deps?: object,
 * }} input
 */
export async function dispatchPopToolTask(input = {}) {
  const turnScope = input.turnScope;
  const userText = String(input.userText || "").trim();
  if (!turnScope?.characterId && !turnScope?.companionId) {
    return { handled: false, reason: "missing_scope" };
  }
  if (!userText) return { handled: false, reason: "empty" };

  const deps = input.deps || {};
  const runOpts = buildRunOpts(turnScope, userText, deps);
  const decision = routeAssistantIntent(userText);

  let result;
  if (decision.mode === "local-agent" && decision.intent === "worldbook_merge") {
    const { runWorldbookMergeTask } = await import("../task-runtime/lazy-runners.js");
    result = await runWorldbookMergeTask({
      ...runOpts,
      bookA: deps.getWorldbookA?.() || [],
      bookB: deps.getWorldbookB?.() || [],
      sourceIds: deps.getWorldbookSourceIds?.() || [],
    });
  } else if (decision.mode === "local-agent" && decision.intent === "theme_draft") {
    const { runThemeDraftAgentTask } = await import("../studio-assist/agent/lazy-agent.js");
    result = await runThemeDraftAgentTask({
      ...runOpts,
      title: "主题设计候选",
      targetThemeId: deps.getThemeDraftTargetId?.() || "mist",
      currentThemeId: deps.getCurrentThemeId?.() || "yueqi",
    });
  } else if (decision.mode === "local-agent" && decision.intent === "scenario_audit") {
    const { runScenarioAuditAgentTask } = await import("../studio-assist/agent/lazy-agent.js");
    result = await runScenarioAuditAgentTask({
      ...runOpts,
      scenarioPayload: deps.getScenarioAuditPayload?.(),
    });
  } else {
    const { runCharacterFixAgentTask } = await import("../studio-assist/agent/lazy-agent.js");
    result = await runCharacterFixAgentTask({
      ...runOpts,
      characterPayload: resolveCharacterPayload(turnScope),
      characterResourceId: `character:${turnScope.characterId || turnScope.companionId}`,
      title: decision.mode === "local-agent" ? "本地助手任务" : "助手任务",
      testScenario: deps.agentTestScenario || "happy",
    });
  }

  if (result?.skipped) {
    return {
      handled: true,
      ok: false,
      speech: "本地 Agent 已关闭，无法从 Pop 创建任务。",
      toast: "本地 Agent 已关闭",
      metadata: { kind: "agent-task", source: "pop_dispatch", skipped: true },
    };
  }

  const taskId = result?.task?.id || "";
  const speech = taskSpeech(
    result,
    taskId
      ? `已创建助手任务（${taskId}）。栖机助手负责执行与审批，普通聊天不会走 OpenClaw。`
      : "已识别为工具任务，但创建失败。",
  );

  try {
    window.dispatchEvent(new CustomEvent("yueqi.assist.task-created", {
      detail: {
        taskId,
        turnScope,
        intent: decision.intent,
        route: input.route?.route,
      },
    }));
  } catch {
    /* non-browser */
  }

  const metadata = {
    ...popTaskMetadataFromAssistantTask(result?.task),
    source: "pop_dispatch",
    failureCode: result?.task?.failureCode || result?.code,
  };

  return {
    handled: true,
    ok: Boolean(result?.ok || result?.awaitingApproval),
    taskId,
    task: result?.task,
    speech,
    toast: taskId ? `助手任务已创建：${result?.task?.title || taskId}` : speech,
    metadata,
  };
}
