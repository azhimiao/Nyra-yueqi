/** In-memory conversation and approval state for 栖机助手. */

import { emitAppEvent } from "../world/app-events.js";
import { runAssistTurn } from "./engine.js";
import { executeAssistTool } from "./tools.js";
import { assistGreeting, assistT, normalizeAssistLocale } from "./i18n.js";
import {
  dispatchAssistRouteAction,
  executeAssistRoute,
  tryAssistRoute,
} from "../agents/assist-routes.js";
import { routeAssistantIntent } from "./agent/intent-router.js";
import { getAssistantTask } from "./agent/task-store.js";
import {
  runCharacterFixAgentTask,
  approveAssistantTask,
  rejectAssistantTask,
  pauseAssistantTask,
  resumeAssistantTask,
  CHARACTER_FIX_FIXTURE,
  runThemeDraftAgentTask,
  approveThemeDraftTask,
  runScenarioAuditAgentTask,
} from "./agent/lazy-agent.js";
import {
  runWorldbookMergeTask,
  approveWorldbookMergeTask,
  rejectWorldbookMergeTask,
} from "../task-runtime/lazy-runners.js";
import { getExternalRequiredMessage } from "../onboarding/errors.js";

const WORLDBOOK_MERGE_FIXTURE_A = [
  { id: "assist-a1", title: "月光港", content: "港口夜色", triggers: ["月光"] },
  { id: "assist-a2", title: "重复项", content: "A版", triggers: ["重复"] },
];
const WORLDBOOK_MERGE_FIXTURE_B = [
  { id: "assist-b1", title: "潮汐街", content: "街巷", triggers: ["潮汐"] },
  { id: "assist-b2", title: "重复项", content: "B版应去重", triggers: ["重复"] },
];

function cloneCard(card) {
  return {
    ...card,
    pendingAction: card.pendingAction
      ? { name: card.pendingAction.name, args: { ...(card.pendingAction.args || {}) } }
      : null,
    diff: card.diff ? structuredClone(card.diff) : card.diff,
    candidate: card.candidate ? structuredClone(card.candidate) : card.candidate,
  };
}

function buildAgentTaskCard(task, extras = {}) {
  return {
    id: extras.cardId || `agent-task-${task.id}`,
    type: "agent-task",
    name: task.title,
    taskId: task.id,
    status: mapTaskStatusToCard(task.status),
    taskStatus: task.status,
    stepSummary: task.stepSummary || "",
    summary: task.stepSummary || task.title,
    authorizedResources: task.authorizedResources || [],
    candidate: task.candidate,
    diff: task.diff,
    artifactIds: task.artifactIds || [],
    needConfirm: task.status === "WAITING_FOR_APPROVAL",
    pendingAction:
      task.status === "WAITING_FOR_APPROVAL"
        ? { name: "assistant.agent.approve", args: { taskId: task.id } }
        : null,
    risk: "write",
    ok: task.status === "SUCCEEDED",
    failureMessage: task.failureMessage,
    ...extras,
  };
}

function scopeRunOpts(deps = {}) {
  const scope = deps.executionScope || deps.getExecutionScope?.() || {};
  const companionId = String(
    scope.companionId || scope.characterId || deps.initiatingCompanionId || "",
  ).trim();
  return {
    userId: scope.userId || deps.userId || "local",
    initiatingCompanionId: companionId,
    companionId,
    characterId: companionId,
    relationshipId: scope.relationshipId || deps.relationshipId || "",
    chatSessionId: scope.sessionId || deps.chatSessionId || "",
  };
}

async function resolveProviderConfig(deps = {}) {
  const value = deps.collectProviderConfig?.() || {};
  return (await Promise.resolve(value)) || {};
}

async function providerRunOpts(deps = {}) {
  return {
    providerConfig: await resolveProviderConfig(deps),
    allowFakeStream: deps.allowFakeStream === true,
    streamFn: deps.agentStreamFn,
  };
}

function mapTaskStatusToCard(status) {
  switch (status) {
    case "WAITING_FOR_APPROVAL":
      return "pending";
    case "SUCCEEDED":
      return "completed";
    case "FAILED":
    case "EXTERNAL_BACKEND_REQUIRED":
      return "failed";
    case "CANCELED":
      return "cancelled";
    case "PAUSED":
      return "paused";
    default:
      return "running";
  }
}

export function createAssistChatStore(deps = {}) {
  let messages = [];
  let context = String(deps.context || "assist") || "assist";
  let locale = normalizeAssistLocale(deps.locale);
  let busy = false;
  /** @type {AbortController|null} */
  let activeAgentAbort = null;
  /** @type {string|null} */
  let activeAgentTaskId = null;

  function reset(nextContext = context, nextLocale = locale) {
    context = String(nextContext || "assist") || "assist";
    locale = normalizeAssistLocale(nextLocale);
    messages = [{
      id: `assist-hello-${Date.now()}`,
      role: "assistant",
      content: assistGreeting(context, locale),
    }];
    return list();
  }

  function list() {
    return messages.map((message) => ({
      ...message,
      cards: message.cards?.map(cloneCard),
    }));
  }

  async function handleDirectAction(decision) {
    if (decision.actionId === "character.export_hint") {
      const result = await executeAssistTool("character.read", {}, { context, locale });
      return {
        ok: Boolean(result.ok),
        speech: result.ok
          ? `当前角色可读导出数据已准备（只读）。${result.summary || ""}`
          : result.summary || "无法导出角色",
        cards: [],
      };
    }
    const result = await executeAssistTool(
      decision.actionId,
      decision.actionArgs || {},
      { context, locale },
    );
    if (result.needConfirm) {
      return {
        ok: true,
        speech: "已识别为直接操作，请确认后执行。",
        cards: [
          {
            id: `assist-da-${Date.now()}`,
            type: "tool",
            name: decision.actionId,
            summary: result.summary,
            risk: result.risk || "write",
            needConfirm: true,
            pendingAction: result.pendingAction,
            status: "pending",
          },
        ],
      };
    }
    return {
      ok: Boolean(result.ok),
      speech: result.summary || assistT(result.ok ? "processed" : "turnFailed", {}, locale),
      cards: [],
    };
  }

  async function handleLocalAgent(decision, userText, opts = {}) {
    activeAgentAbort = new AbortController();
    const onEvent = (ev) => {
      if (ev.type === "tool_started" || ev.type === "tool_finished" || ev.type === "step_updated" || ev.type === "task_failed") {
        opts.onProgress?.(ev);
      }
    };
    const runOpts = {
      ...scopeRunOpts(deps),
      ...(await providerRunOpts(deps)),
      instruction: userText,
      signal: activeAgentAbort.signal,
      onEvent,
      saveChatMessage: deps.saveChatMessage,
    };

    let result;
    if (decision.intent === "worldbook_merge") {
      result = await runWorldbookMergeTask({
        ...runOpts,
        bookA: deps.getWorldbookA?.() || WORLDBOOK_MERGE_FIXTURE_A,
        bookB: deps.getWorldbookB?.() || WORLDBOOK_MERGE_FIXTURE_B,
        sourceIds: deps.getWorldbookSourceIds?.() || [],
      });
    } else if (decision.intent === "theme_draft") {
      result = await runThemeDraftAgentTask({
        ...runOpts,
        title: "主题设计候选",
        targetThemeId: deps.getThemeDraftTargetId?.() || "mist",
        currentThemeId: deps.getCurrentThemeId?.() || "yueqi",
      });
    } else if (decision.intent === "scenario_audit") {
      result = await runScenarioAuditAgentTask({
        ...runOpts,
        scenarioPayload: deps.getScenarioAuditPayload?.(),
      });
    } else {
      result = await runCharacterFixAgentTask({
        ...runOpts,
        characterPayload: deps.getAgentCharacterPayload?.() || CHARACTER_FIX_FIXTURE,
        characterResourceId: deps.getAgentCharacterResourceId?.() || "fixture:character",
        title: decision.intent === "character_inspect_fix" ? "角色卡检查与修复" : "本地助手任务",
        testScenario: deps.agentTestScenario || "happy",
      });
    }
    activeAgentTaskId = result.task?.id || null;
    activeAgentAbort = null;

    if (result.canceled) {
      return {
        ok: false,
        speech: "已取消本地 Agent 任务。生产数据未变更。",
        cards: result.task ? [buildAgentTaskCard(result.task)] : [],
      };
    }

    if (!result.ok && !result.awaitingApproval) {
      const code = result.task?.failureCode || "FAILED";
      return {
        ok: false,
        speech: result.task?.failureMessage || "本地 Agent 任务失败",
        cards: result.task ? [buildAgentTaskCard(result.task)] : [],
        code,
      };
    }

    const task = result.task;
    const card = buildAgentTaskCard(task);
    const defaultSpeech =
      decision.intent === "worldbook_merge"
        ? "已生成世界书合并候选，请确认后创建新条目（原世界书不变）。"
        : decision.intent === "theme_draft"
          ? "已生成主题候选，请确认后应用。"
          : decision.intent === "scenario_audit"
            ? task?.stepSummary || "情景剧包检查完成。"
            : "已完成角色卡检查：发现 personality 缺失，已生成修复候选。请确认是否导入为新角色（不覆盖原角色）。";
    return {
      ok: true,
      speech: result.speech || defaultSpeech,
      cards: [card],
      agentTaskId: task?.id,
    };
  }

  async function send(text, opts = {}) {
    const value = String(text || "").trim();
    if (!value) return { ok: false, error: "empty" };
    if (busy) return { ok: false, error: "busy" };
    busy = true;
    const userMessage = {
      id: `assist-u-${Date.now()}`,
      role: "user",
      content: value,
    };
    messages.push(userMessage);
    try {
      //  intent router (before model / before P6 skill routes for execution-mode decisions)
      const decision = routeAssistantIntent(value, {
        authorizedResources: opts.authorizedResources,
      });

      if (decision.mode === "external-required") {
        const externalCopy = getExternalRequiredMessage();
        const assistantMessage = {
          id: `assist-a-${Date.now()}`,
          role: "assistant",
          content: externalCopy,
          cards: [
            {
              id: `assist-ext-${Date.now()}`,
              type: "agent-task",
              name: "外部能力",
              status: "failed",
              taskStatus: "EXTERNAL_BACKEND_REQUIRED",
              summary: getExternalRequiredMessage().split("\n")[0],
              ok: false,
            },
          ],
          executionMode: decision.mode,
        };
        messages.push(assistantMessage);
        return { ok: false, message: assistantMessage, code: "EXTERNAL_BACKEND_REQUIRED", decision };
      }

      if (decision.mode === "direct-action") {
        const turn = await handleDirectAction(decision);
        const assistantMessage = {
          id: `assist-a-${Date.now()}`,
          role: "assistant",
          content: turn.speech,
          cards: turn.cards || [],
          executionMode: decision.mode,
        };
        messages.push(assistantMessage);
        return { ok: turn.ok !== false, message: assistantMessage, cards: assistantMessage.cards, decision };
      }

      if (decision.mode === "local-agent") {
        const turn = await handleLocalAgent(decision, value, opts);
        const assistantMessage = {
          id: `assist-a-${Date.now()}`,
          role: "assistant",
          content: turn.speech,
          cards: turn.cards || [],
          executionMode: decision.mode,
        };
        messages.push(assistantMessage);
        return {
          ok: turn.ok !== false,
          message: assistantMessage,
          cards: assistantMessage.cards,
          decision,
          agentTaskId: turn.agentTaskId,
        };
      }

      // conversation — existing P6 routes then model
      const routeTurn = tryAssistRoute(value, { locale });
      if (routeTurn) {
        const assistantMessage = {
          id: `assist-a-${Date.now()}`,
          role: "assistant",
          content: routeTurn.speech || assistT("processed", {}, locale),
          cards: routeTurn.cards || [],
          chips: routeTurn.chips || [],
          executionMode: "conversation",
        };
        messages.push(assistantMessage);
        if (routeTurn.routeAction) dispatchAssistRouteAction(routeTurn.routeAction);
        return {
          ok: routeTurn.ok !== false,
          message: assistantMessage,
          cards: assistantMessage.cards,
          routed: true,
          decision,
        };
      }

      const history = messages
        .filter((message) => message.id !== userMessage.id)
        .filter((message) => message.role === "user" || message.role === "assistant")
        .slice(-14)
        .map((message) => ({ role: message.role, content: message.content }));
      const turn = await runAssistTurn({
        config: await resolveProviderConfig(deps),
        history,
        userText: value,
        context,
        locale,
        onTool: opts.onTool,
      });
      const assistantMessage = {
        id: `assist-a-${Date.now()}`,
        role: "assistant",
        content: turn.speech || assistT(turn.ok ? "processed" : "turnFailed", {}, locale),
        cards: turn.cards || [],
        executionMode: "conversation",
      };
      messages.push(assistantMessage);
      return { ok: turn.ok !== false, message: assistantMessage, cards: assistantMessage.cards, decision };
    } catch (error) {
      const assistantMessage = {
        id: `assist-a-${Date.now()}`,
        role: "assistant",
        content: assistT("operationFailed", {
          error: String(error?.message || error || assistT("unknownError", {}, locale)),
        }, locale),
      };
      messages.push(assistantMessage);
      return { ok: false, message: assistantMessage, error };
    } finally {
      busy = false;
    }
  }

  function locateCard(id) {
    for (const message of messages) {
      const card = message.cards?.find((item) => item.id === id);
      if (card) return { message, card };
    }
    return null;
  }

  async function confirm(cardId) {
    if (busy) return { ok: false, error: "busy" };
    const found = locateCard(String(cardId || ""));
    if (!found?.card?.needConfirm || !found.card.pendingAction) {
      return { ok: false, error: "not_pending" };
    }
    busy = true;
    try {
      const { name, args } = found.card.pendingAction;
      let result;
      if (name === "assistant.agent.approve") {
        const taskId = args?.taskId || found.card.taskId;
        const task = getAssistantTask(taskId);
        const approveOpts = {
          ...scopeRunOpts(deps),
          saveChatMessage: deps.saveChatMessage,
        };
        if (task?.candidate?.kind === "worldbook-merge") {
          result = await approveWorldbookMergeTask(taskId, {
            ...approveOpts,
            commitFn: deps.commitWorldbookFn,
          });
        } else if (task?.candidate?.kind === "theme") {
          result = await approveThemeDraftTask(taskId, {
            ...approveOpts,
            commitFn: deps.commitThemeFn,
          });
        } else {
          result = await approveAssistantTask(taskId, approveOpts);
        }
        found.card.needConfirm = false;
        found.card.pendingAction = null;
        found.card.ok = Boolean(result.ok);
        found.card.status = result.ok ? "completed" : "failed";
        found.card.taskStatus = result.task?.status;
        found.card.summary = result.speech || result.task?.stepSummary || (result.ok ? "已导入" : "导入失败");
        found.card.stepSummary = found.card.summary;
        if (result.ok) {
          emitAppEvent("assist.task.completed", {
            appId: "assist",
            taskId: task?.id || taskId,
            intent: task?.candidate?.kind || task?.intent || "local-agent",
            summary: found.card.summary,
          });
        }
        const message = {
          id: `assist-confirm-${Date.now()}`,
          role: "assistant",
          content: result.ok
            ? (result.speech || found.card.summary || "已批准并完成提交。")
            : (result.result?.message || result.task?.failureMessage || "批准后提交失败"),
        };
        messages.push(message);
        return { ok: Boolean(result.ok), result, message };
      }
      if (name === "agent.attach_skill") {
        const turn = executeAssistRoute(
          { matched: true, route: "attach_skill", payload: { skillId: args?.skillId } },
          { locale, confirmed: true },
        );
        result = { ok: turn.ok, summary: turn.speech };
        if (turn.routeAction) dispatchAssistRouteAction(turn.routeAction);
      } else {
        result = await executeAssistTool(name, args || {}, { confirmed: true, context, locale });
      }
      found.card.needConfirm = false;
      found.card.pendingAction = null;
      found.card.ok = Boolean(result.ok);
      found.card.summary = result.summary || assistT(result.ok ? "done" : "failed", {}, locale);
      found.card.status = result.ok ? "completed" : "failed";
      const message = {
        id: `assist-confirm-${Date.now()}`,
        role: "assistant",
        content: assistT(result.ok ? "executed" : "executeFailed", { summary: result.summary }, locale),
      };
      messages.push(message);
      return { ok: Boolean(result.ok), result, message };
    } finally {
      busy = false;
    }
  }

  async function cancel(cardId) {
    const found = locateCard(String(cardId || ""));
    if (!found?.card?.needConfirm) return { ok: false, error: "not_pending" };
    if (found.card.type === "agent-task" && found.card.taskId) {
      const task = getAssistantTask(found.card.taskId);
      if (task?.candidate?.kind === "worldbook-merge") {
        await rejectWorldbookMergeTask(found.card.taskId);
      } else {
        rejectAssistantTask(found.card.taskId, { keepCandidate: true });
      }
      found.card.needConfirm = false;
      found.card.pendingAction = null;
      found.card.ok = false;
      found.card.status = "cancelled";
      found.card.taskStatus = "CANCELED";
      found.card.summary = "已拒绝导入；生产数据未变更";
      messages.push({
        id: `assist-cancel-${Date.now()}`,
        role: "assistant",
        content: "已取消。Workspace 候选保留；生产数据未写入。",
      });
      return { ok: true };
    }
    found.card.needConfirm = false;
    found.card.pendingAction = null;
    found.card.ok = false;
    found.card.status = "cancelled";
    found.card.summary = assistT("cancelSummary", {}, locale);
    return { ok: true };
  }

  function cancelActiveAgent() {
    activeAgentAbort?.abort();
    if (activeAgentTaskId) {
      const t = getAssistantTask(activeAgentTaskId);
      if (t && !["SUCCEEDED", "CANCELED", "FAILED"].includes(t.status)) {
        pauseAssistantTask(activeAgentTaskId);
      }
    }
  }

  function onAppBackground() {
    if (activeAgentTaskId) pauseAssistantTask(activeAgentTaskId);
    cancelActiveAgent();
  }

  async function onAppForeground() {
    if (!activeAgentTaskId) return { ok: true };
    const resumed = await resumeAssistantTask(activeAgentTaskId);
    if (resumed.awaitingApproval && resumed.task) {
      messages.push({
        id: `assist-resume-${Date.now()}`,
        role: "assistant",
        content: "应用已恢复。本地 Agent 任务仍在等待你确认导入。",
        cards: [buildAgentTaskCard(resumed.task)],
      });
    }
    return resumed;
  }

  function setContext(next) {
    context = String(next || "assist") || "assist";
  }

  function setLocale(next) {
    locale = normalizeAssistLocale(next);
  }

  reset(context);

  return {
    reset,
    list,
    send,
    confirm,
    cancel,
    cancelActiveAgent,
    onAppBackground,
    onAppForeground,
    setContext,
    setLocale,
    getContext: () => context,
    getLocale: () => locale,
    isBusy: () => busy,
    getActiveAgentTaskId: () => activeAgentTaskId,
  };
}
