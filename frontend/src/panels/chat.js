import {
  getChatFocus,
  getLastGroupSpeakerId,
  resolveGroupSpeakerMeta,
  setLastGroupSpeakerId,
} from "../characters/session-context.js";
import { pickGroupSpeaker } from "../characters/group-chat.js";
import { touchConversation } from "../characters/sessions.js";
import { bindComposerChrome } from "../chat/composer-chrome.js";
import { bindTokenComposeSheets } from "../chat/token-compose-ui.js";
import { bindGiftComposeSheet } from "../chat/gift-compose-ui.js";
import { buildAttachmentContext, composeUserText, injectAttachmentMessage } from "../chat/attachments.js";
import { createAttachmentMessageMetadata } from "../chat/attachment-message.js";
import { notifyChatFeedback } from "../chat/feedback.js";
import { stickerPromptText } from "../assets-hub/stickers.js";
import { parseTokenMessage } from "../chat/token-message.js";
import { captureShareLocation, parseLocationMessage } from "../chat/share-location.js";
import { buildPopGameStart, listPopGames } from "../games/pop-games.js";
import {
  beginChatGameRound,
  endChatGameSession,
  getActiveChatGameSession,
  startChatGameSession,
} from "../games/chat-game-session.js";
import { startPopDuoGame, endPopDuoGame, handlePopDuoUserInput, getPopActiveDuo, getSharedDuoBridge, refreshPopDuoObservation } from "../games/adapters/pop-duo.js";
import { shouldWriteLongTermMemory } from "../games/adapters/memory-policy.js";
import { createGameEventMetadata } from "../chat/game-message.js";
import { escapeHtml } from "../lib/utils.js";
import { buildModelMessages } from "../prompt/assemble.js";
import { callModel, peekChatModelReady } from "../model/client.js";
import { getMessagesBySession, saveChatMessage } from "../storage/db.js";
import { isFeatureEnabled } from "../features/flags.js";
import { requestableOpenAiTools } from "../tools/openai-tools.js";
import { buildCapabilityRuntimeSnapshot } from "../capabilities/runtime-snapshot.js";
import {
  claimsCompletionWithoutReceipt,
  formatReceiptMessage,
  runCompanionToolLoop,
  toolResultMessages,
} from "../tools/companion-tool-loop.js";
import { createCompanionChatExecutors } from "../tools/companion-executors.js";
import { notifyUserActivity } from "../proactive/scheduler.js";
import { wakeCompanionLife } from "../companion/life-wake.js";
import { isWithinDnd } from "../integrations/context.js";
import { readLibrary } from "../phone-shell/phone-data.js";
import { LIFE_TICK_LIMITS } from "../proactive/config.js";
import {
  canSpeak,
  speakMessageText,
  speakSegmentedText,
  stopSpeech,
} from "../voice/tts.js";
import { cancelRecording, isRecording, startRecording } from "../voice/record.js";
import { beginDictation, cancelDictation } from "../voice/stt.js";
import { isLiveCallActive } from "../call/live-state.js";
import { getVoiceSettings } from "../settings/voice-preferences.js";
import { t } from "../i18n/index.js";
import { refreshIcons } from "../lib/icons.js";
import {
  buildRuntimeInstruction,
  parseRuntimeTurn,
  stripRuntimeMetadataPreview,
} from "../runtime/protocol.js";
import { applyInboundRegex, applyOutboundRegex } from "../regex/pipeline.js";
import { sanitizeImChatText } from "../chat/im-sanitize.js";
import { listRegexRules } from "../regex/store.js";
import {
  appendAssistantCandidate,
  appendChatTurnBestEffort,
  getOrCreateActiveSession,
  regenerate,
  regenerateChatBestEffort,
  sendUser,
  writeCompanionTurn,
} from "../conversation/index.js";
import { getActiveCharacterId, listCharactersSync } from "../characters/store.js";
import {
  extractAndApplyMemoryOperations,
  isExplicitMemoryDirective,
} from "../context/extraction.js";
import { refreshBranchSummary } from "../context/branch-summary.js";
import { onCompanionChatTurn } from "../companion/session-hooks.js";
import { routeUserInput } from "../agent-orchestrator/index.js";
import { emitRelationshipEventsFromTurn } from "../timeline/from-conversation.js";
import { understandTurnDispatch, formatUnderstandingLine } from "../turn-understanding/index.js";
import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { bindActionProposalCards } from "../ui/action-proposal-card.js";
import {
  freezeTurnExecutionScope,
  createPendingTurnBuckets,
  resolveReplyExecutionScope,
  snapshotProviderConfig,
} from "../conversation/turn-scope.js";
import {
  buildTurnExecutionSnapshot,
  getHeldTurnSnapshot,
  holdTurnSnapshot,
} from "../conversation/turn-execution-snapshot.js";
import { dispatchPopToolTask } from "./pop-task-dispatch.js";
import { requestCompanionSelfie } from "../companion/selfie.js";
import { detectDiaryIntent } from "../companion/diary-action.js";
import { requestCompanionListen } from "../companion/listen-action.js";
import { requestCompanionCapability } from "../companion/capability-action.js";
import { turnResultFromDirectAction } from "../companion/turn-result.js";
import { finalizeModelRequest } from "../prompt/finalize.js";
import { formatTurnActionContext } from "../capabilities/registry.js";
import { createTurnActivityView } from "../chat/turn-activity.js";
import { emitChatTurnProgress } from "../chat/turn-progress-event.js";
import { parseInnerStateEnvelope, stripInnerStatePreview, sanitizeInnerState } from "../chat/inner-state.js";
import { resolveMessageBodyParagraph, setMessageBodyText } from "../chat/message-body.js";
import {
  COMPANION_PROMPT_VERSION,
  PROMPT_AUTHORITY_ORDER,
} from "../prompt/companion-contract-v2.js";
import {
  failTurnTrace,
  finishTurnTrace,
  startTurnTrace,
  updateTurnTrace,
} from "../observability/turn-trace.js";
import { buildLanguageContext } from "../i18n/language-context.js";
import { classifyRecall } from "../memory/palace/recall.js";
import { isDirectCompanionAction } from "../companion/actions.js";

/** Test harness only — set localStorage `yueqi.e2e.allowFakeSelfie=1` before boot. */
function e2eAllowFakeSelfieEnabled() {
  try {
    return typeof localStorage !== "undefined"
      && localStorage.getItem("yueqi.e2e.allowFakeSelfie") === "1";
  } catch {
    return false;
  }
}

function normalizeSharedLocation(location) {
  if (!location || typeof location !== "object") return null;
  const lat = Number(location.lat ?? location.latitude);
  const lon = Number(location.lon ?? location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return {
    title: String(location.title || "用户分享的位置").trim(),
    subtitle: String(location.subtitle || `${lat.toFixed(4)}, ${lon.toFixed(4)}`).trim(),
    lat,
    lon,
    coordinateText: `${lat},${lon}`,
  };
}

function findSharedLocationInMessages(messages = [], currentLocation = null) {
  const direct = normalizeSharedLocation(currentLocation);
  if (direct) return direct;
  for (let index = (Array.isArray(messages) ? messages.length : 0) - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const parsed = parseLocationMessage(String(message.content || ""), {});
    const location = normalizeSharedLocation(parsed);
    if (location) return location;
  }
  return null;
}

function hasWeatherIntentInMessages(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-10)
    .some((message) => /天气|气温|下雨|预报|weather|forecast/i.test(String(message?.content || "")));
}

function resolveSessionId(deps) {
  if (typeof deps.getSessionId === "function") return deps.getSessionId();
  return deps.sessionId || "";
}

function resolveCharacterId(deps) {
  const focusedId = String(getChatFocus()?.characterId || "").trim();
  if (focusedId) return focusedId;
  try {
    if (typeof deps.getCharacterId === "function") {
      const id = String(deps.getCharacterId() || "").trim();
      if (id) return id;
    }
  } catch {
    /* optional */
  }
  return String(getActiveCharacterId() || "").trim();
}

/** Capture immutable turn scope from current focus (call at send / reply start only). */
function captureLiveTurnScope(deps, { purpose = "chat", appId = "pop", providerConfig = null } = {}) {
  const focus = getChatFocus();
  const characterId = resolveCharacterId(deps);
  const sessionId = resolveSessionId(deps) || focus?.sessionId || "";
  const conversationKind = focus?.kind === "group" ? "group" : "dm";
  const participantIds = focus?.kind === "group" ? (focus.memberIds || []) : [];
  let conversationSessionId = "";
  let branchId = "";
  if (characterId) {
    try {
      const v2 = getOrCreateActiveSession({ characterId });
      conversationSessionId = String(v2?.id || "").trim();
      branchId = String(v2?.activeBranchId || "").trim();
    } catch {
      /* optional V2 */
    }
  }
  const groupSpeakerId = conversationKind === "group"
    ? String(getLastGroupSpeakerId() || characterId || "").trim()
    : "";
  const groupSpeakerMeta = resolveGroupSpeakerMeta({ conversationKind, speakerId: groupSpeakerId });
  const rawConfig = providerConfig
    ?? (typeof deps.collectProviderConfig === "function" ? deps.collectProviderConfig() : null);
  return freezeTurnExecutionScope({
    characterId,
    sessionId,
    conversationSessionId,
    branchId,
    conversationKind,
    participantIds,
    purpose,
    appId,
    userId: "local",
    groupSpeakerId,
    groupSpeakerMeta,
    providerSnapshot: rawConfig ? snapshotProviderConfig(rawConfig) : null,
  });
}

function groupSpeakerMetaFromScope(scope) {
  if (scope?.groupSpeakerMeta) return scope.groupSpeakerMeta;
  return resolveGroupSpeakerMeta({
    conversationKind: scope?.conversationKind,
    speakerId: scope?.groupSpeakerId || scope?.characterId,
  });
}

function runtimeTargetMatchesScope(deps, scope) {
  const frozen = String(scope?.characterId || "").trim();
  if (!frozen) return false;
  const live = resolveCharacterId(deps);
  return !live || frozen === live;
}

function recordScopedCompanionMessage(deps, scope, payload) {
  if (!runtimeTargetMatchesScope(deps, scope)) return;
  deps.getCompanionRuntime?.()?.recordMessage(payload);
}

function mergeProviderConfig(scope, collectProviderConfig) {
  const live = typeof collectProviderConfig === "function" ? collectProviderConfig() : {};
  const snap = scope?.providerSnapshot;
  if (!snap) return live;
  return { ...live, kind: snap.kind || live.kind, model: snap.model || live.model, baseUrl: snap.baseUrl || live.baseUrl };
}

/** Authoritative companion write (V2 first, IDB projection). Requires frozen executionScope. */
async function writePopTurn(role, text, meta = {}, deps) {
  try {
    const scope = meta.executionScope || null;
    if (!scope?.characterId && !scope?.companionId) {
      return { ok: false, reason: "missing_executionScope" };
    }
    const chatSessionId = String(scope.sessionId || "").trim();
    const conversationKind = scope.conversationKind === "group" ? "group" : "dm";
    const participantIds = Array.isArray(scope.participantIds) ? scope.participantIds : [];
    const companionId = String(scope.companionId || scope.characterId || "").trim();
    if (!companionId) {
      return { ok: false, reason: "missing_companionId" };
    }
    const { executionScope: _drop, messageId: _mid, id: _legacyId, ...restMeta } = meta;
    return await writeCompanionTurn({
      role,
      text,
      userId: scope.userId || "local",
      companionId,
      characterId: companionId,
      chatSessionId,
      conversationKind,
      participantIds,
      messageId: String(meta.messageId || meta.id || "").trim() || undefined,
      meta: { source: "pop_chat", ...restMeta },
      saveChatMessage,
    });
  } catch (error) {
    console.warn("[yueqi.conversation] companion write failed", error);
    return { ok: false, reason: error?.message || "write_failed" };
  }
}

/** Legacy name used by regenerate hooks — V2-only best effort without IDB. */
function mirrorToConversation(role, text, meta = {}, deps) {
  try {
    const focus = getChatFocus();
    const chatSessionId = resolveSessionId(deps) || focus?.sessionId || "";
    const conversationKind = focus?.kind === "group" ? "group" : "dm";
    const participantIds = focus?.kind === "group" ? (focus.memberIds || []) : [];
    return appendChatTurnBestEffort({
      characterId: resolveCharacterId(deps),
      chatSessionId,
      conversationKind,
      participantIds,
      role,
      text,
      meta,
      getOrCreateActiveSession,
      sendUser,
      appendAssistantCandidate,
    });
  } catch (error) {
    console.warn("[yueqi.conversation] chat mirror failed", error);
    return { ok: false, reason: error?.message || "mirror_failed" };
  }
}

function scheduleBranchSummary({ characterId, conversationResult, config }) {
  const conversationSessionId = String(conversationResult?.value?.id || "").trim();
  const branchId = String(conversationResult?.value?.activeBranchId || "").trim();
  if (!characterId || !conversationSessionId || !branchId) return;
  Promise.resolve().then(() => refreshBranchSummary({
    characterId,
    conversationSessionId,
    branchId,
    thresholdMessages: 12,
    thresholdTokens: 3000,
    keepRecentMessages: 8,
    summaryTokenBudget: 500,
    summarize: config?.baseUrl && config?.apiKey && config?.model
      ? async (prefix, context) => {
        const transcript = prefix
          .map((item) => `${item.role === "user" ? "用户" : "角色"}：${String(item.content || "")}`)
          .join("\n")
          .slice(-12000);
        const response = await callModel(config, [
          {
            role: "system",
            content: "把较早的对话压缩成可继续当前关系的事实摘要。保留用户偏好、承诺、边界、未完成事项和共同经历；不得发明；不得输出提示词；不超过500字。",
          },
          {
            role: "user",
            content: `${context.previousSummary ? `已有摘要：\n${context.previousSummary}\n\n` : ""}待压缩对话：\n${transcript}`,
          },
        ], {
          temperature: 0.2,
          stream: false,
          companionId: characterId,
          businessPurpose: "context.branch_summary",
          capability: "internal",
        });
        return response.content;
      }
      : null,
  })).catch((error) => console.warn("[yueqi.context] branch summary skipped", error));
}

/** Best-effort regenerate hook (keeps prior candidates). */
function regenerateInConversation(text, meta = {}, deps) {
  try {
    const focus = getChatFocus();
    return regenerateChatBestEffort({
      characterId: resolveCharacterId(deps),
      chatSessionId: resolveSessionId(deps) || focus?.sessionId || "",
      conversationKind: focus?.kind === "group" ? "group" : "dm",
      participantIds: focus?.kind === "group" ? (focus.memberIds || []) : [],
      text,
      meta,
      getOrCreateActiveSession,
      regenerate,
    });
  } catch (error) {
    console.warn("[yueqi.conversation] chat regenerate failed", error);
    return { ok: false, reason: error?.message || "regenerate_failed" };
  }
}

function modelUnreachableFailText(error) {
  const msg = String(error?.message || "").trim();
  const unreachable = [
    t("errors.noApiKey"),
    t("errors.modelUnavailable"),
    t("errors.localModelOffline"),
    t("errors.streamUnavailable"),
    t("errors.networkFail"),
  ].filter(Boolean);
  if (unreachable.some((needle) => needle && msg.includes(needle))) {
    return t("chat.modelNotReached");
  }
  return t("chat.replyIncomplete", { error: msg || t("errors.generic") });
}

/**
 * Chat panel: composer submit, attachments, mic STT, speak buttons.
 */
export function wireChatPanel(deps) {
  const {
    form,
    input,
    list,
    summaryMasters,
    composerAttachButton,
    composerAttachInput,
    composerMicButton,
    retrySttButtons,
    attachmentState,
    storeMediaFile,
    getMediaRecord,
    readMediaBlob,
    micState,
    getCompanionRuntime,
    setSummaryVisible,
    refreshDailyStatus,
    addMessage,
    updateMessageDeliveryState,
    fileDrawerAndRender,
    compilePrompt,
    beginSummaryGeneration,
    writeSummaryPanel,
    attachSpeakButtonToMessage,
    refreshMessageSpeakButtons,
    collectProviderConfig,
    scheduleCapabilityRefresh,
    renderProviderStatus,
    triggerAutoSync,
    ensureMicrophonePermission,
    finishComposerRecording,
    transcribePendingRecording,
    pendingSttBlobRef,
    getRuntimeCatalog,
    applyRuntimeTurn,
  } = deps;

  let chrome = null;
  const defaultComposerPlaceholder = input?.placeholder || t("chat.placeholder");
  let replyBusy = false;
  const pendingBuckets = createPendingTurnBuckets();
  /** @type {Set<string>} userMessageIds that already produced an assistant turn */
  const completedUserTurnIds = new Set();
  let replyChainScheduled = false;
  const understandingByMessageId = new Map();
  const traceByMessageId = new Map();
  const failedSendPayloads = new Map();
  let pendingLocationMeta = null;
  let pendingReply = null;
  /** @type {{ refresh?: () => void, destroy?: () => void } | null} */
  let actionProposalUi = null;

  function paintPendingReply() {
    if (!form) return;
    const host = form.closest("[data-composer-stack]") || form.parentElement;
    if (!host) return;
    let banner = host.querySelector("[data-composer-reply]");
    if (!pendingReply) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "composer-reply-preview";
      banner.dataset.composerReply = "";
      const copy = document.createElement("span");
      copy.dataset.composerReplyCopy = "";
      const close = document.createElement("button");
      close.type = "button";
      close.dataset.composerReplyClose = "";
      close.setAttribute("aria-label", t("appShell.chat.cancelReply"));
      close.innerHTML = '<i data-lucide="x"></i>';
      close.addEventListener("click", () => {
        pendingReply = null;
        paintPendingReply();
      });
      banner.append(copy, close);
      host.insertBefore(banner, form);
    }
    banner.querySelector("[data-composer-reply-copy]").textContent =
      t("appShell.chat.replyPreview", {
        who: t(pendingReply.role === "user" ? "phone.pop.defaultYou" : "appShell.chat.them"),
        text: pendingReply.text,
      });
    refreshIcons();
  }

  window.addEventListener("yueqi:chat-quote", (event) => {
    const detail = event.detail || {};
    const messageId = String(detail.messageId || "").trim();
    const text = String(detail.text || "").trim();
    if (!messageId || !text) return;
    pendingReply = {
      messageId,
      role: detail.role === "user" ? "user" : "assistant",
      text: text.slice(0, 180),
    };
    paintPendingReply();
    input?.focus();
  });

  async function writeGameEvent(run, type, {
    executionScope,
    summary = "",
    result = "",
  } = {}) {
    if (!run || !executionScope) return { ok: false, reason: "missing_game_scope" };
    const metadata = createGameEventMetadata(run, type, { summary, result });
    if (!metadata) return { ok: false, reason: "invalid_game_event" };
    const round = Number(metadata.gameEvent?.round) || 0;
    const content = type === "start"
      ? `已开始「${run.title}」`
      : type === "round"
        ? `第 ${round} 回合`
        : type === "result"
          ? (result || summary || `第 ${round} 回合完成`)
          : (result || `本局结束 · 共 ${round} 回合`);
    const messageId = `game-${run.runId}-${type}-${round}`;
    const written = await writePopTurn("system", content, {
      executionScope,
      legacySessionId: executionScope.sessionId,
      ...metadata,
      messageId,
    }, deps);
    if (!written?.ok) return written || { ok: false, reason: "game_event_write_failed" };
    await addMessage(content, "system", {
      persist: false,
      id: written.message?.id || messageId,
      createdAt: written.message?.createdAt || written.turn?.createdAt,
      metadata,
      skipVoice: true,
      runtime: false,
    });
    return { ...written, metadata };
  }

  async function writeDirectAssistantResult(role, text, meta, progress = null) {
    const written = await writePopTurn(role, text, meta, deps);
    if (written?.ok) return written;
    const reason = String(written?.reason || "chat_record_write_failed");
    const messageId = String(meta?.messageId || "").trim();
    const target = messageId && typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? document.querySelector(`.message[data-message-id="${CSS.escape(messageId)}"]`)
      : null;
    if (target) {
      setMessageBodyText(target, "动作结果没有写入聊天记录，请重试。" );
      target.classList.add("is-failed");
    }
    progress?.setPhase("persist", "failed", "动作已经返回，但结果没有写入聊天记录。请重试。" );
    progress?.fail();
    notifyChatFeedback("动作结果没有写入聊天记录，请重试。", {
      tone: "danger",
      source: reason,
    });
    return written || { ok: false, reason };
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.sendLock === "1") return;
    const contextPurpose = form.dataset.contextPurpose === "deskpet" ? "deskpet" : "chat";
    const contextAppId = String(form.dataset.contextAppId || (contextPurpose === "deskpet" ? "deskpet" : "pop"));
    delete form.dataset.contextPurpose;
    delete form.dataset.contextAppId;
    let turnScope = captureLiveTurnScope(deps, {
      purpose: contextPurpose,
      appId: contextAppId,
      providerConfig: typeof collectProviderConfig === "function" ? collectProviderConfig() : null,
    });
    if (!turnScope) {
      console.error("[yueqi.conversation] refuse send — missing TurnExecutionScope");
      const orphanId = String(form.dataset.pendingMessageId || "").trim();
      if (orphanId) {
        delete form.dataset.pendingMessageId;
        window.dispatchEvent(new CustomEvent("yueqi:chat-send-result", {
          detail: { messageId: orphanId, ok: false },
        }));
      }
      return;
    }
    const stashed = String(input?.dataset?.pendingSendText || "").trim();
    const rawInput = stashed || input.value.trim();
    if (!rawInput && !attachmentState.pending) return;
    const replyTo = pendingReply;
    pendingReply = null;
    paintPendingReply();
    form.dataset.sendLock = "1";
    // Phone optimistic bubble id (phone-pending-*) must survive into IDB projection.
    const externalMessageId = String(form.dataset.pendingMessageId || "").trim();
    delete form.dataset.pendingMessageId;
    const pendingGameInviteRunId = String(form.dataset.pendingGameInvite || "").trim();
    delete form.dataset.pendingGameInvite;
    const notifyExternalSendResult = (ok) => {
      if (!externalMessageId) return;
      window.dispatchEvent(new CustomEvent("yueqi:chat-send-result", {
        detail: { messageId: externalMessageId, ok: Boolean(ok) },
      }));
    };
    let directProgressArticle = null;
    let directProgressActivity = null;
    try {
      const rawLoc = String(form.dataset.pendingLocation || "").trim();
      delete form.dataset.pendingLocation;
      if (rawLoc) {
        const parsedLoc = JSON.parse(rawLoc);
        if (parsedLoc && typeof parsedLoc === "object") {
          pendingLocationMeta = {
            kind: "location",
            mediaType: "location",
            location: parsedLoc,
          };
        }
      }
    } catch {
      delete form.dataset.pendingLocation;
    }
    if (input) {
      input.value = "";
      delete input.dataset.pendingSendText;
    }
    chrome?.syncSendState?.();
    stopSpeech();
    let inboundText = rawInput;
    try {
      const inboundRules = listRegexRules("inbound");
      const inboundResult = applyInboundRegex(rawInput, inboundRules);
      inboundText = inboundResult.text;
    } catch (error) {
      console.warn("[yueqi.regex] inbound", error);
      inboundText = rawInput;
    }
    const text = inboundText.trim() || rawInput;
    let attachmentContext = attachmentState.pending;
    attachmentState.pending = null;
    chrome?.syncSendState?.();
    const isSticker = Boolean(attachmentContext?.sticker && attachmentContext?.dataUrl);
    let attachmentMediaRecord = null;
    if (attachmentContext && !isSticker) {
      try {
        let attachmentFile = attachmentContext.file || null;
        if (!attachmentFile && attachmentContext.dataUrl) {
          const blob = await fetch(attachmentContext.dataUrl).then((response) => response.blob());
          attachmentFile = new File([blob], attachmentContext.name || "attachment", {
            type: attachmentContext.mime || blob.type || "application/octet-stream",
          });
          attachmentContext = {
            ...attachmentContext,
            file: attachmentFile,
            size: attachmentContext.size || blob.size,
            mime: attachmentContext.mime || blob.type,
          };
        }
        if (attachmentContext.mediaId) {
          attachmentMediaRecord = {
            id: attachmentContext.mediaId,
            size: attachmentContext.size || 0,
          };
        } else if (!attachmentFile || typeof storeMediaFile !== "function") {
          throw new Error("attachment_storage_unavailable");
        } else {
          attachmentMediaRecord = await storeMediaFile(attachmentFile, "chat-attachment");
          attachmentContext = {
            ...attachmentContext,
            mediaId: attachmentMediaRecord?.id || "",
          };
      }
      } catch (error) {
        // An image is already available as a data URL for this turn. Native
        // media persistence is best effort and must not swallow a valid
        // multimodal message when an OEM filesystem write fails.
        if (attachmentContext.type === "image" && attachmentContext.dataUrl) {
          console.warn("[yueqi.chat] image media persistence failed; sending inline", error);
          attachmentMediaRecord = null;
        } else {
          attachmentState.pending = attachmentContext;
          if (input) input.value = rawInput;
          chrome?.syncSendState?.();
          notifyChatFeedback(
            String(error?.message || "").includes("too_large")
              ? t("appShell.chat.attachmentTooLarge")
              : t("appShell.chat.attachmentSaveFailed"),
            { tone: "danger", source: "chat_attachment" },
          );
          notifyExternalSendResult(false);
          delete form.dataset.sendLock;
          return;
        }
      }
    }
    const fullText = isSticker
      ? (text || stickerPromptText({ description: attachmentContext.name }))
      : composeUserText(text, attachmentContext);
    const stickerMeta = isSticker
      ? {
        kind: "sticker",
        mediaType: "sticker",
        stickerUrl: attachmentContext.dataUrl,
        stickerId: attachmentContext.stickerId || "",
      }
      : {};
    const tokenParsed = !isSticker ? parseTokenMessage(fullText) : { ok: false };
    const tokenMeta = tokenParsed.ok
      ? {
        kind: tokenParsed.mediaType,
        mediaType: tokenParsed.mediaType,
        token: { ...tokenParsed.token, direction: "out", status: "pending" },
      }
      : {};
    const locationParsed = !isSticker && !tokenParsed.ok
      ? parseLocationMessage(fullText, pendingLocationMeta || {})
      : { ok: false };
    const locationMeta = locationParsed.ok
      ? {
        kind: "location",
        mediaType: "location",
        location: {
          title: locationParsed.title,
          subtitle: locationParsed.subtitle,
          lat: locationParsed.lat,
          lon: locationParsed.lon,
        },
      }
      : {};
    pendingLocationMeta = null;
    const attachmentMeta = attachmentContext && !isSticker
      ? createAttachmentMessageMetadata(attachmentContext, attachmentMediaRecord)
      : {};
    const messageMeta = {
      ...stickerMeta,
      ...tokenMeta,
      ...locationMeta,
      ...attachmentMeta,
      ...(replyTo ? { replyTo } : {}),
    };
    const uiMessageMeta = attachmentMeta.attachment
      ? {
        ...messageMeta,
        attachment: {
          ...attachmentMeta.attachment,
          previewUrl: attachmentContext.type === "image" ? attachmentContext.dataUrl || "" : "",
        },
      }
      : messageMeta;
    try {
      const turnHistory = await getMessagesBySession(turnScope.sessionId, 40);
      if (turnScope.conversationKind === "group") {
        const speakerId = pickGroupSpeaker(fullText, turnScope.participantIds, turnHistory);
        setLastGroupSpeakerId(speakerId);
        turnScope = freezeTurnExecutionScope({
          ...turnScope,
          characterId: speakerId,
          companionId: speakerId,
          relationshipId: "",
          groupSpeakerId: speakerId,
          groupSpeakerMeta: resolveGroupSpeakerMeta({
            conversationKind: "group",
            speakerId,
          }),
          turnExecutionId: turnScope.turnExecutionId,
        });
      } else {
        setLastGroupSpeakerId("");
      }
      const language = buildLanguageContext();
      const sendCapabilityRuntime = {
        networkOnline: typeof navigator === "undefined" ? true : navigator.onLine !== false,
        featureFlags: { webRetrievalV1: isFeatureEnabled("webRetrievalV1") },
        foreground: true,
      };
      const sendCapabilityRuntimeSnapshot = buildCapabilityRuntimeSnapshot(sendCapabilityRuntime, {
        snapshotId: turnScope?.turnExecutionId ? `cap-${turnScope.turnExecutionId}` : undefined,
      });
      const snapshotResult = buildTurnExecutionSnapshot({
        turnExecutionId: turnScope?.turnExecutionId,
        userId: turnScope?.userId || "local",
        focus: {
          kind: turnScope?.conversationKind,
          characterId: turnScope?.characterId,
          sessionId: turnScope?.sessionId,
          memberIds: turnScope?.participantIds,
        },
        speakerCharacterId: turnScope?.characterId,
        currentInput: {
          text: fullText,
          attachmentRefs: [attachmentMediaRecord?.id || attachmentContext?.mediaId || ""].filter(Boolean),
        },
        characters: listCharactersSync(),
        conversationRevision: 1,
        locale: language.appLocale,
        conversationLanguage: language.conversationLanguage,
        promptSettings: {
          contractVersion: COMPANION_PROMPT_VERSION,
          authorityOrder: PROMPT_AUTHORITY_ORDER,
        },
        budgetProfile: {},
        providerCapabilities: turnScope?.providerSnapshot || {},
        runtimeCapabilities: {
          catalogAvailable: Boolean(getRuntimeCatalog?.()),
          capabilityRuntimeSnapshot: sendCapabilityRuntimeSnapshot,
        },
        temporalSnapshot: createTemporalSnapshotV1({ locale: language.appLocale }),
        historyBoundaryIds: turnHistory
          .map((message) => String(message?.id || "").trim())
          .filter(Boolean),
        preset: { id: "default", revision: 1 },
      });
      if (!snapshotResult.ok) {
        throw Object.assign(new Error("turn_snapshot_reference_mismatch"), {
          snapshotErrors: snapshotResult.errors,
        });
      }
      holdTurnSnapshot(snapshotResult.snapshot);
    } catch (error) {
      attachmentState.pending = attachmentContext;
      if (input) input.value = rawInput;
      chrome?.syncSendState?.();
      notifyChatFeedback("当前角色或会话已变化，请确认后重试。", {
        tone: "danger",
        source: "turn_snapshot",
      });
      console.error("[yueqi.conversation] refuse send — invalid TurnExecutionSnapshot", error);
      notifyExternalSendResult(false);
      delete form.dataset.sendLock;
      return;
    }
    notifyUserActivity();
    try {
      const { noteUserMessageLanguage } = await import("../i18n/language-prefs.js");
      noteUserMessageLanguage(fullText);
    } catch {
      /* optional */
    }
    try {
      wakeCompanionLife("user_message", {
        getActiveCharacterId: () => turnScope.characterId || getActiveCharacterId(),
        isFeatureEnabled,
        isWithinDnd,
        collectLibraryState: () => readLibrary(),
      }, { limits: LIFE_TICK_LIMITS });
    } catch {
      /* non-blocking */
    }
    recordScopedCompanionMessage(deps, turnScope, { role: "user", text: fullText, source: "chat" });
    const fromVoice = micState.pendingVoiceSubmit;
    micState.pendingVoiceSubmit = false;
    let userUiMsgId = "";
    try {
      if (!fromVoice) {
        userUiMsgId = externalMessageId
          || `ui-msg-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
        // Phone already painted this id — skip desktop twin when ids match.
        const alreadyPainted = externalMessageId
          && Boolean(document.querySelector(`.message[data-message-id="${CSS.escape(userUiMsgId)}"]`));
        if (!alreadyPainted) {
          await addMessage(fullText, "user", {
            persist: false,
            id: userUiMsgId,
            deliveryState: "sending",
            conversationSessionId: turnScope.conversationSessionId,
            // Caption before compose — retry must not double-prefix attachment wrappers.
            retryText: text,
            metadata: {
              ...uiMessageMeta,
              conversationSessionId: turnScope.conversationSessionId,
            },
            stickerUrl: stickerMeta.stickerUrl || "",
          });
        }
      }
      window.dispatchEvent(new CustomEvent("yueqi:interaction-feedback", {
        detail: { haptic: "medium-light", companion: true, source: sendBtn || form },
      }));
      void refreshDailyStatus(true).catch(() => {});
      // P0: do not write Pop chat copies into unscoped MemPalace.
      const routeIntent = String(form.dataset.routeIntent || "").trim();
      delete form.dataset.routeIntent;
      const route = routeUserInput({ text: fullText, intent: routeIntent });
      const turnTrace = startTurnTrace({
        input: {
          text: fullText,
          hasAttachment: Boolean(attachmentContext),
          fromVoice: Boolean(fromVoice),
        },
        scope: turnScope,
        route,
      });
      const turnTraceId = turnTrace.id;
      const isSelfieRoute = isDirectCompanionAction(route) && route.action === "selfie";
      const isDiaryRoute = isDirectCompanionAction(route) && route.action === "diary";
      const isListenRoute = isDirectCompanionAction(route) && route.action === "listen";
      const isCapabilityRoute = isDirectCompanionAction(route) && route.action === "capability";
      const isToolTaskRoute = route.route === "unified_task" || route.route === "agent_session";
      let taskDispatch = null;
      let selfieDispatch = null;
      let diaryDispatch = null;
      let listenDispatch = null;
      let capabilityDispatch = null;
      const hasDirectAction = isSelfieRoute || isDiaryRoute || isListenRoute || isCapabilityRoute || isToolTaskRoute;
      const directProgressId = hasDirectAction
        ? `ui-progress-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`
        : "";
      const directProgressLabel = isSelfieRoute
        ? "自拍"
        : isDiaryRoute
          ? "日记"
          : isListenRoute
            ? "一起听"
            : isToolTaskRoute
              ? "助手任务"
              : "这项操作";
      if (hasDirectAction) {
        const progressRole = isCapabilityRoute ? "system" : "ai";
        directProgressArticle = await addMessage(`正在准备${directProgressLabel}…`, progressRole, {
          persist: false,
          id: directProgressId,
          skipVoice: true,
          runtime: false,
        });
        directProgressArticle?.classList.add("is-tool-progress");
        directProgressActivity = createTurnActivityView(directProgressArticle, {
          sessionId: turnScope.sessionId,
          characterId: turnScope.characterId || turnScope.companionId,
          messageId: directProgressId,
          mood: "专注",
        });
        directProgressActivity?.setState({
          copy: `我先确认${directProgressLabel}需要的配置和权限，再开始执行。`,
        });
        directProgressActivity?.setPhase(
          "prepare",
          "active",
          `正在准备${directProgressLabel}，会把缺少的配置或权限直接告诉你。`,
        );
      }
      const writtenUser = await writePopTurn("user", fullText, {
        executionScope: turnScope,
        legacySessionId: turnScope.sessionId,
        // Keep structured cards attached to the authoritative turn.
        ...messageMeta,
        deliveryState: "delivered",
        // messageId last so sticker/token meta cannot overwrite the stable UI id.
        messageId: userUiMsgId || undefined,
      }, deps);
      if (!writtenUser?.ok) {
        console.error("[yueqi.conversation] authoritative user write failed — refusing IDB-only success", writtenUser?.reason);
        if (userUiMsgId) {
          failedSendPayloads.set(userUiMsgId, {
            originalText: text,
            attachmentContext,
            location: locationMeta.location || null,
            replyTo,
          });
        }
        updateMessageDeliveryState?.(userUiMsgId, "failed");
        directProgressActivity?.fail();
        directProgressArticle?.remove();
        failTurnTrace(turnTraceId, new Error(writtenUser?.reason || "authoritative_user_write_failed"));
        notifyExternalSendResult(false);
        return;
      }
      const userArticle = userUiMsgId
        ? document.querySelector(`.message[data-message-id="${CSS.escape(userUiMsgId)}"]`)
        : null;
      if (userArticle && writtenUser.conversationSessionId) {
        userArticle.dataset.conversationSessionId = writtenUser.conversationSessionId;
      }
      if (userUiMsgId) failedSendPayloads.delete(userUiMsgId);
      updateMessageDeliveryState?.(userUiMsgId, "delivered");
      notifyExternalSendResult(true);
      if (isSelfieRoute) {
        directProgressActivity?.setPhase("execute", "active", "正在调用生图服务并准备角色图片…");
        selfieDispatch = await requestCompanionSelfie({
          companionId: turnScope.characterId || turnScope.companionId,
          characterProfile: deps.collectCharacterProfile?.(turnScope.characterId || turnScope.companionId) || {},
          allowFakeSelfie: deps.allowFakeSelfie === true || e2eAllowFakeSelfieEnabled(),
          storeMediaFile: deps.storeMediaFile,
          getMediaRecord,
          readMediaBlob,
        });
      }
      if (isToolTaskRoute) {
        directProgressActivity?.setPhase("execute", "active", "正在创建助手任务并检查执行状态…");
        taskDispatch = await dispatchPopToolTask({
          turnScope,
          userText: fullText,
          route,
          deps: {
            collectProviderConfig,
            saveChatMessage,
            allowFakeStream: deps.allowFakeStream === true,
          },
        });
      }
      const activeGame = getActiveChatGameSession(turnScope.sessionId);
      if (activeGame && activeGame.runId !== pendingGameInviteRunId) {
        const duoActive = getPopActiveDuo(turnScope.sessionId);
        if (duoActive?.platformSessionId) {
          try {
            handlePopDuoUserInput(turnScope.sessionId, { rawText: fullText });
          } catch (error) {
            console.warn("[yueqi.games] duo user action failed", error);
          }
        }
        const round = beginChatGameRound(turnScope.sessionId);
        if (round) {
          await writeGameEvent(round, "round", { executionScope: turnScope });
        }
      }
      await touchConversation(turnScope.sessionId).catch(() => {});

      const shadowTurnId = String(
        writtenUser.message?.id
        || writtenUser.turn?.id
        || `pop-user-${turnScope.sessionId || "chat"}-${Date.now().toString(36)}`,
      );
      traceByMessageId.set(shadowTurnId, turnTraceId);
      // A direct "remember/forget" instruction is authoritative user evidence.
      // Apply it before the reply is assembled so this same turn and every shell
      // observe one consistent memory state. The post-reply extractor remains as
      // the generic inference path and is idempotent on this evidence id.
      if (isExplicitMemoryDirective(fullText)) {
        const activeGameForMemory = getActiveChatGameSession(turnScope.sessionId);
        if (shouldWriteLongTermMemory(activeGameForMemory ? "game_only" : "normal")) {
          await extractAndApplyMemoryOperations({
            characterId: turnScope.characterId || turnScope.companionId,
            userId: turnScope.userId || "local",
            relationshipId: turnScope.relationshipId || "",
            userText: fullText,
            assistantText: "",
            userEvidenceRef: shadowTurnId,
            realityNamespace: "reality",
          });
        }
      }
      // Turn understanding is now part of the governed turn.  It may execute R0
      // reads immediately; R2/R3 remain pending approval.
      const understandingPromise = isFeatureEnabled("turnUnderstandingV1")
        ? Promise.resolve(
          understandTurnDispatch({
            text: fullText,
            turnId: shadowTurnId,
            snapshot: createTemporalSnapshotV1({ locale: "zh-CN" }),
            scope: {
              userId: turnScope.userId || "local",
              companionId: turnScope.characterId || turnScope.companionId,
              relationshipId: turnScope.relationshipId,
              conversationId: turnScope.sessionId || turnScope.conversationId,
            },
          }),
        )
          .then((result) => {
            updateTurnTrace(turnTraceId, {
              understanding: result.understanding || null,
              capabilities: result.dispatch || result.shadow || null,
            }, "turn_understood");
            try {
              console.debug(formatUnderstandingLine(result.understanding), result.summary);
            } catch {
              /* ignore inspector log failures */
            }
            try {
              actionProposalUi?.refresh?.();
            } catch {
              /* card refresh non-fatal */
            }
            return result;
          })
          .catch((error) => {
            updateTurnTrace(turnTraceId, {
              understandingError: String(error?.message || error || "understanding_failed"),
            }, "turn_understanding_failed");
            console.warn("[yueqi.turnUnderstanding] dispatch failed", error);
            return null;
          })
        : Promise.resolve(null);
      understandingByMessageId.set(shadowTurnId, understandingPromise);

      // Diary commands are narrow agent operations. Execute only after the
      // authoritative user turn exists, and let ToolRun own the receipt.
      if (isDiaryRoute) {
        const companionId = turnScope.characterId || turnScope.companionId || "";
        const operationKey = "companion.diary.create";
        const writingIndicator = directProgressArticle || await addMessage("正在回想今天，写进日记本里…", "system", {
          persist: false,
          id: directProgressId || undefined,
          metadata: {
            kind: "activity",
            mediaType: "activity",
            activityType: "diary_writing",
          },
        });
        writingIndicator?.classList.add("is-diary-writing");
        const diaryActivity = directProgressActivity || createTurnActivityView(writingIndicator, {
          mood: "专注",
          asleep: false,
          sessionId: turnScope.sessionId,
          characterId: companionId,
          messageId: directProgressId,
        });
        refreshIcons(writingIndicator);
        diaryActivity?.setState({
          copy: "我在回看今天真实发生的内容，只把有依据的片段写进日记。",
        });
        diaryActivity?.setPhase("context", "active", "正在整理今天的对话与生活记录。");
        diaryActivity?.recordTool(operationKey, "planned");
        let diaryLoop;
        try {
          diaryLoop = await runCompanionToolLoop({
            toolCalls: [{
              id: `diary-${turnScope.turnExecutionId || Date.now().toString(36)}`,
              function: {
                name: "companion_diary__create",
                arguments: JSON.stringify({ companionId, overwrite: false }),
              },
            }],
            runtime: {
              foreground: true,
              networkOnline: typeof navigator === "undefined" ? true : navigator.onLine !== false,
            },
            provider: { supportsTools: true, supportsStreamTools: true },
            explicitOperations: [operationKey],
            onProgress: (event) => diaryActivity?.recordTool(
              event.operation || operationKey,
              event.phase,
              event.phase === "executing"
                ? "正在写入日记内容…"
                : event.phase === "succeeded"
                  ? "日记工具已经返回真实结果。"
                  : event.phase === "awaiting_approval"
                    ? "日记操作等待确认。"
                  : event.phase === "failed"
                    ? "日记工具没有成功，我会如实说明。"
                    : "日记操作已排队。",
            ),
            executors: createCompanionChatExecutors({
              companionId,
              characterProfile: deps.collectCharacterProfile?.(companionId) || {},
              sessionId: turnScope.sessionId || turnScope.conversationId || "",
              currentDailyStatus: null,
              collectProviderConfig,
            }),
          });
        } finally {
          const diarySucceeded = diaryLoop?.receipts?.some((item) => item.status === "succeeded");
          if (diarySucceeded) {
            diaryActivity?.setPhase("result", "done", "日记工具已返回成功回执。");
            diaryActivity?.setHeadline("日记已经写好，内容已收到成功回执。");
            diaryActivity?.finish("日记已经写好。");
          } else {
            diaryActivity?.fail("日记没有收到成功回执，请检查后重试。");
            diaryActivity?.setHeadline("日记没有成功写入。");
          }
          // The durable diary artifact is the final record; the temporary
          // writing row should not remain as a duplicate system message.
          writingIndicator?.remove();
        }
        const receipt = diaryLoop?.receipts?.[0] || null;
        diaryDispatch = receipt?.status === "succeeded"
          ? {
            ok: true,
            ...(receipt.data || {}),
            message: receipt.summary || receipt.data?.summary || "日记已写入档案。",
            speech: receipt.summary || receipt.data?.summary || "日记已写入档案。",
          }
          : {
            ok: false,
            reason: receipt?.error || receipt?.status || "diary_not_created",
            message: formatReceiptMessage(receipt),
          };
        updateTurnTrace(turnTraceId, {
          toolLoop: {
            operation: operationKey,
            receipts: diaryLoop.receipts || [],
          },
        }, "direct_action_receipt");
      }

      if (isListenRoute) {
        directProgressActivity?.setPhase("execute", "active", "正在准备曲目并启动一起听…");
        listenDispatch = await requestCompanionListen({
          userText: fullText,
          companionId: turnScope.characterId || turnScope.companionId,
        });
      }
      if (isCapabilityRoute) {
        directProgressActivity?.setPhase(
          route.capability?.kind === "permission" ? "permission" : "execute",
          "active",
          route.capability?.kind === "permission"
            ? "正在检查这项操作需要的权限…"
            : "正在执行这项操作并核对结果…",
        );
        capabilityDispatch = await requestCompanionCapability(route.capability || { id: route.capabilityId }, {
          userText: fullText,
          companionId: turnScope.characterId || turnScope.companionId,
          collectProviderConfig,
          storeMediaFile: deps.storeMediaFile,
        });
      }

      if (selfieDispatch) {
        // turnResultFromDirectAction maps failures to the durable selfie-failed
        // state so the user can distinguish a real error from a pending image.
        if (selfieDispatch.ok) {
          directProgressActivity?.setPhase("result", "done", "图片已经生成，正在把结果放进聊天。");
          directProgressActivity?.finish();
        } else {
          directProgressActivity?.setPhase("result", "failed", selfieDispatch.message || "图片没有生成成功。" );
          directProgressActivity?.fail();
        }
        directProgressArticle?.remove();
        const turnResult = turnResultFromDirectAction("companion.selfie", selfieDispatch, route);
        const aiUiId = directProgressId || `ui-msg-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
        const selfieMessageMetadata = selfieDispatch.ok && selfieDispatch.mediaId
          ? {
            ...turnResult.metadata,
            kind: "attachment",
            mediaType: "attachment",
            attachment: {
              type: "image",
              name: `${deps.collectCharacterProfile?.(turnScope.characterId || turnScope.companionId)?.name || "角色"}自拍`,
              mediaId: selfieDispatch.mediaId,
              size: 0,
              mime: "image/png",
            },
            turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          }
          : {
            ...turnResult.metadata,
            turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          };
        await addMessage(turnResult.speech, "ai", {
          persist: false,
          id: aiUiId,
          skipVoice: true,
          runtime: turnResult.ok,
          metadata: selfieMessageMetadata,
        });
        const writtenAssistant = await writeDirectAssistantResult("assistant", turnResult.speech, {
          executionScope: turnScope,
          legacySessionId: turnScope.sessionId,
          ...selfieMessageMetadata,
          turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          messageId: aiUiId,
        }, directProgressActivity);
        if (!writtenAssistant?.ok) {
          failTurnTrace(turnTraceId, new Error(writtenAssistant?.reason || "assistant_write_failed"));
        }
        finishTurnTrace(turnTraceId, {
          turnResult,
          directAction: { capabilityId: "companion.selfie", route, result: selfieDispatch },
          response: { text: turnResult.speech },
        });
        input.focus();
        return;
      }
      if (diaryDispatch) {
        const turnResult = turnResultFromDirectAction("companion.diary", diaryDispatch, route);
        // One durable activity card via Conversation projection — do not also
        // inject addMessage into flush (that raced with diary-saved and doubled).
        try {
          const { flushPopDeliveries } = await import("../artifacts/index.js");
          await flushPopDeliveries({
            companionId: turnScope.characterId || turnScope.companionId,
          });
        } catch (error) {
          console.warn("[yueqi.diary] pop flush after chat diary failed", error);
        }
        const aiUiId = directProgressId || `ui-msg-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
        await addMessage(turnResult.speech, "ai", {
          persist: false,
          id: aiUiId,
          skipVoice: true,
          runtime: turnResult.ok,
          metadata: {
            ...turnResult.metadata,
            turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          },
        });
        const writtenAssistant = await writeDirectAssistantResult("assistant", turnResult.speech, {
          executionScope: turnScope,
          legacySessionId: turnScope.sessionId,
          ...turnResult.metadata,
          turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          messageId: aiUiId,
        }, directProgressActivity);
        if (!writtenAssistant?.ok) {
          failTurnTrace(turnTraceId, new Error(writtenAssistant?.reason || "assistant_write_failed"));
        }
        finishTurnTrace(turnTraceId, {
          turnResult,
          directAction: { capabilityId: "companion.diary", route, result: diaryDispatch },
          response: { text: turnResult.speech },
        });
        input.focus();
        return;
      }
      if (listenDispatch) {
        if (listenDispatch.ok) {
          directProgressActivity?.setPhase("result", "done", "曲目已经准备好，正在打开播放器。");
          directProgressActivity?.finish();
        } else {
          directProgressActivity?.setPhase("result", "failed", listenDispatch.message || "一起听没有成功启动。" );
          directProgressActivity?.fail();
        }
        directProgressArticle?.remove();
        const turnResult = turnResultFromDirectAction("companion.listen", listenDispatch, route);
        const aiUiId = directProgressId || `ui-msg-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
        await addMessage(turnResult.speech, "ai", {
          persist: false,
          id: aiUiId,
          skipVoice: true,
          runtime: turnResult.ok,
          metadata: {
            ...turnResult.metadata,
            turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          },
        });
        const writtenAssistant = await writeDirectAssistantResult("assistant", turnResult.speech, {
          executionScope: turnScope,
          legacySessionId: turnScope.sessionId,
          ...turnResult.metadata,
          turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          messageId: aiUiId,
        }, directProgressActivity);
        if (!writtenAssistant?.ok) {
          failTurnTrace(turnTraceId, new Error(writtenAssistant?.reason || "assistant_write_failed"));
        }
        finishTurnTrace(turnTraceId, {
          turnResult,
          directAction: { capabilityId: "companion.listen", route, result: listenDispatch },
          response: { text: turnResult.speech },
        });
        input.focus();
        return;
      }
      if (capabilityDispatch) {
        if (capabilityDispatch.ok !== false) {
          directProgressActivity?.setPhase("result", "done", "操作结果已经返回，正在更新界面。" );
          directProgressActivity?.finish();
        } else {
          directProgressActivity?.setPhase("result", "failed", capabilityDispatch.message || "操作没有成功。" );
          directProgressActivity?.fail();
        }
        directProgressArticle?.remove();
        const speech = String(capabilityDispatch.speech || capabilityDispatch.message || "").trim()
          || "好。";
        const meta = {
          ...(capabilityDispatch.metadata || {}),
          kind: capabilityDispatch.metadata?.kind || "capability-action",
          mediaType: capabilityDispatch.metadata?.mediaType || "activity",
          source: "companion_capability",
          turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
        };
        const aiUiId = directProgressId || `ui-msg-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
        await addMessage(speech, "system", {
          persist: false,
          id: aiUiId,
          skipVoice: true,
          runtime: false,
          metadata: {
            ...meta,
            turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          },
        });
        const writtenAction = await writeDirectAssistantResult(
          "system",
          speech,
          {
            executionScope: turnScope,
            legacySessionId: turnScope.sessionId,
            ...meta,
            turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
            messageId: aiUiId,
          },
          directProgressActivity,
        );
        if (!writtenAction?.ok) {
          failTurnTrace(turnTraceId, new Error(writtenAction?.reason || "action_write_failed"));
        }
        finishTurnTrace(turnTraceId, {
          turnResult: {
            kind: "companion_turn_result",
            capabilityId: route.capabilityId || "capability",
            ok: capabilityDispatch.ok !== false,
            speech,
            metadata: meta,
          },
          directAction: { capabilityId: route.capabilityId, route, result: capabilityDispatch },
          response: { text: speech },
        });
        input.focus();
        return;
      }
      if (taskDispatch?.handled) {
        if (taskDispatch.ok !== false) {
          directProgressActivity?.setPhase("result", "done", "助手任务已经创建，状态会在任务卡里持续更新。" );
          directProgressActivity?.finish();
        } else {
          directProgressActivity?.setPhase("result", "failed", taskDispatch.speech || "助手任务没有创建成功。" );
          directProgressActivity?.fail();
        }
        directProgressArticle?.remove();
        const aiUiId = directProgressId || `ui-msg-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
        await addMessage(taskDispatch.speech, "ai", {
          persist: false,
          id: aiUiId,
          skipVoice: true,
          runtime: false,
          metadata: {
            ...taskDispatch.metadata,
            turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          },
        });
        const writtenTask = await writeDirectAssistantResult("assistant", taskDispatch.speech, {
          executionScope: turnScope,
          legacySessionId: turnScope.sessionId,
          ...taskDispatch.metadata,
          turnActivity: directProgressActivity?.getSnapshot?.() || undefined,
          messageId: aiUiId,
        }, directProgressActivity);
        if (!writtenTask?.ok) {
          failTurnTrace(turnTraceId, new Error(writtenTask?.reason || "task_write_failed"));
        }
        if (taskDispatch.toast) {
          try {
            notifyChatFeedback(taskDispatch.toast, { source: "pop_task_dispatch" });
          } catch {
            console.info("[yueqi.orchestrator] pop task dispatch", taskDispatch);
          }
        }
        finishTurnTrace(turnTraceId, {
          directAction: { capabilityId: "assistant.task", route, result: taskDispatch },
          response: { text: taskDispatch.speech },
        });
        input.focus();
        return;
      }
      pendingBuckets.buffer(turnScope, {
        userText: fullText,
        userMessageId: writtenUser?.message?.id || writtenUser?.turn?.id || "",
        attachment: attachmentContext,
        location: locationMeta.location || null,
        turnExecutionId: turnScope.turnExecutionId,
      });
      input.focus();
      // companion_chat 发送后自动走同一条回复链（不另开 assemble/callModel）。
      // selfie/diary/tool 已在上方短路并 return；到这里只剩普通陪聊。
      void requestCharacterReply().catch((error) => {
        console.warn("[yueqi.conversation] auto character reply failed", error);
      });
    } catch (error) {
      const failureText = `这项操作没有完成：${String(error?.message || "未知错误").slice(0, 120)}`;
      directProgressActivity?.setPhase("failed", "failed", failureText);
      directProgressActivity?.fail(failureText);
      if (directProgressArticle?.isConnected) {
        setMessageBodyText(directProgressArticle, failureText);
        directProgressArticle.classList.remove("is-tool-progress", "is-reply-progress");
        directProgressArticle.classList.add("is-failed");
      }
      console.warn("[yueqi.conversation] submit failed", error);
      notifyExternalSendResult(false);
    } finally {
      delete form.dataset.sendLock;
    }
  });

  list?.addEventListener("click", (event) => {
    const retry = event.target.closest("[data-message-retry]");
    if (!retry || !form || !input) return;
    const article = retry.closest(".message.user[data-message-id]");
    const messageId = String(article?.dataset.messageId || "").trim();
    const text = String(article?.dataset.retryText || "");
    if (!messageId || form.dataset.sendLock === "1") return;

    const failedPayload = failedSendPayloads.get(messageId);
    if (failedPayload?.attachmentContext) {
      attachmentState.pending = failedPayload.attachmentContext;
    } else {
      const stickerUrl = String(article.dataset.retryStickerUrl || "").trim();
      if (stickerUrl) {
        attachmentState.pending = {
          sticker: true,
          dataUrl: stickerUrl,
          name: article.querySelector(".message-sticker img")?.alt || "表情",
        };
      }
    }
    const retryText = failedPayload?.originalText != null
      ? String(failedPayload.originalText)
      : text;
    if (!String(retryText).trim() && !attachmentState.pending) return;
    pendingReply = failedPayload?.replyTo || null;
    paintPendingReply();
    if (failedPayload?.location) {
      form.dataset.pendingLocation = JSON.stringify(failedPayload.location);
    } else {
      const location = String(article.dataset.retryLocation || "").trim();
      if (location) form.dataset.pendingLocation = location;
    }

    form.dataset.pendingMessageId = messageId;
    input.value = retryText;
    updateMessageDeliveryState?.(messageId, "sending");
    chrome?.syncSendState?.();
    form.requestSubmit();
  });

  async function requestCharacterReply() {
    if (replyBusy) {
      window.dispatchEvent(new CustomEvent("yueqi.character.replied", {
        detail: { content: "", skipped: true },
      }));
      return;
    }
    replyBusy = true;
    chrome?.setSpeakBusy?.(true);
    chrome?.closeSheets?.();
    stopSpeech();

    // Freeze identity for this entire reply — never re-read live focus mid-flight.
    const liveScope = captureLiveTurnScope(deps, {
      purpose: "chat",
      appId: "pop",
      providerConfig: typeof collectProviderConfig === "function" ? collectProviderConfig() : null,
    });
    const { executionScope, taken } = resolveReplyExecutionScope(pendingBuckets, liveScope);
    if (!executionScope) {
      replyBusy = false;
      chrome?.setSpeakBusy?.(false);
      console.error("[yueqi.conversation] refuse reply — missing TurnExecutionScope");
      window.dispatchEvent(new CustomEvent("yueqi.character.replied", {
        detail: { content: "", skipped: true, reason: "missing_scope" },
      }));
      return;
    }

    const freshUserTurns = taken.pendingUserTurns;
    const userText = taken.userText || "";
    const attachmentContext = taken.attachment;
    const bufferedUserMessageId = taken.userMessageId
      || executionScope.userMessageId
      || "";
    const turnExecutionId = taken.turnExecutionId
      || executionScope.turnExecutionId
      || "";
    if (bufferedUserMessageId && completedUserTurnIds.has(bufferedUserMessageId)) {
      replyBusy = false;
      chrome?.setSpeakBusy?.(false);
      window.dispatchEvent(new CustomEvent("yueqi.character.replied", {
        detail: { content: "", skipped: true, reason: "idempotent_skip", turnExecutionId },
      }));
      schedulePendingReplyChain();
      return;
    }
    const activeTrace = bufferedUserMessageId
      ? traceByMessageId.get(bufferedUserMessageId)
      : "";
    const turnTraceId = activeTrace || startTurnTrace({
      origin: "companion_continue",
      input: { text: userText, turnIntent: freshUserTurns > 0 ? "user_message" : "continue" },
      scope: { ...executionScope, turnExecutionId },
    }).id;
    updateTurnTrace(turnTraceId, {
      turnExecutionId,
      scope: executionScope,
    }, "reply_scope_frozen");
    let repliedContent = "";

    const status = await refreshDailyStatus(true);
    // 有新用户消息才用原文作种子；再次点「角色回复」走续聊，避免把同一条转账又丢给模型
    const isFreshTurn = freshUserTurns > 0 && Boolean(userText);
    const promptSeed = isFreshTurn ? userText : "请根据刚才的对话继续回复，不要重复自己刚说过的话。";
    const turnIntent = isFreshTurn ? "user_message" : "continue";
    const turnSnapshot = getHeldTurnSnapshot(turnExecutionId);
    const liveCapabilityRuntime = {
      networkOnline: typeof navigator === "undefined" ? true : navigator.onLine !== false,
      featureFlags: { webRetrievalV1: isFeatureEnabled("webRetrievalV1") },
      foreground: true,
    };
    const capabilityRuntimeSnapshot = turnSnapshot?.runtimeCapabilities?.capabilityRuntimeSnapshot
      || buildCapabilityRuntimeSnapshot(liveCapabilityRuntime, {
        snapshotId: turnExecutionId ? `cap-${turnExecutionId}` : undefined,
      });
    const capabilityRuntime = {
      networkOnline: capabilityRuntimeSnapshot.runtime?.networkOnline === true,
      featureFlags: capabilityRuntimeSnapshot.runtime?.featureFlags || {},
      foreground: capabilityRuntimeSnapshot.runtime?.foreground === true,
    };
    if (isFreshTurn && !turnSnapshot) {
      replyBusy = false;
      chrome?.setSpeakBusy?.(false);
      notifyChatFeedback("本轮角色快照已失效，请重新发送。", {
        tone: "danger",
        source: "turn_snapshot",
      });
      window.dispatchEvent(new CustomEvent("yueqi.character.replied", {
        detail: { content: "", skipped: true, reason: "missing_turn_snapshot", turnExecutionId },
      }));
      return;
    }
    const summaryToken = beginSummaryGeneration();
    const assistantUiId = `ui-msg-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const pending = await addMessage(t("chat.thinking"), "ai", {
      persist: false,
      id: assistantUiId,
      skipVoice: true,
      runtime: false,
    });
    pending.classList.add("is-reply-progress");
    const turnActivity = createTurnActivityView(pending, {
      mood: status?.mood,
      asleep: status?.asleep,
      sessionId: executionScope.sessionId,
      characterId: executionScope.characterId,
      messageId: assistantUiId,
    });
    refreshIcons(pending);
    turnActivity?.setState({
      memoryCount: null,
    });
    setMessageBodyText(pending, t("chat.thinking"));
    let streamedVisible = "";
    let envelopeMonologue = "";
    const thinkingToShow = () => envelopeMonologue;
    const publishTurnProgress = (patch = {}) => {
      const activitySnapshot = turnActivity?.getSnapshot?.() || {};
      emitChatTurnProgress({
        sessionId: String(executionScope.sessionId || ""),
        characterId: String(executionScope.characterId || ""),
        messageId: assistantUiId,
        stage: activitySnapshot.stage || "",
        statusCopy: activitySnapshot.statusCopy || activitySnapshot.stateCopy || "",
        operation: activitySnapshot.operation || "",
        innerState: thinkingToShow(),
        visibleText: streamedVisible,
        ...patch,
      });
    };
    try {
      const modelReady = await peekChatModelReady(
        mergeProviderConfig(executionScope, collectProviderConfig),
      );
      if (!modelReady.ok) {
        throw new Error(modelReady.message || t("errors.noApiKey"));
      }
      turnActivity?.setPhase("context", "active", "正在整理当前状态与相关记忆。");
      const compiled = typeof compilePrompt === "function"
        ? await compilePrompt(isFreshTurn ? userText : "", {
          turnIntent,
          purpose: executionScope.purpose,
          appId: executionScope.appId,
          characterId: executionScope.characterId,
          sessionId: executionScope.sessionId,
          conversationKind: executionScope.conversationKind,
          participantIds: executionScope.participantIds,
          executionScope,
          turnSnapshot,
          capabilityRuntimeSnapshot,
        })
        : await compilePrompt(isFreshTurn ? userText : promptSeed);
      if (compiled && typeof compiled === "object") compiled.turnIntent = turnIntent;
      const recalledMemoryCount = Number(
        compiled?.memories?.length
        || compiled?.contextEnvelope?.trace?.retrievalCoordinator?.memoryCount
        || 0,
      );
      turnActivity?.setState({ memoryCount: recalledMemoryCount });
      turnActivity?.setPhase(
        "context",
        "done",
        compiled?.memories?.length
          ? `找到${compiled.memories.length}条相关记忆，继续核对来源。`
          : "没有找到可用的相关记忆，不补写不存在的经历。",
      );
      if (isFeatureEnabled("summary")) {
        writeSummaryPanel(status, compiled, null, summaryToken);
      }
      const config = mergeProviderConfig(executionScope, collectProviderConfig);
      scheduleCapabilityRefresh(0);
      turnActivity?.setPhase("understanding", "active", "正在确认这句话是否包含需要处理的意图。");
      const understandingResult = bufferedUserMessageId
        ? await Promise.race([
          understandingByMessageId.get(bufferedUserMessageId) || Promise.resolve(null),
          new Promise((resolve) => window.setTimeout(() => resolve(null), 12000)),
        ])
        : null;
      turnActivity?.setPhase(
        "understanding",
        "done",
        understandingResult ? "已经完成基础理解，继续处理当前回合。" : "已完成基础理解，当前回合继续由主模型处理。",
      );
      const messages = injectAttachmentMessage(
        await buildModelMessages(compiled, isFreshTurn ? promptSeed : "", executionScope.sessionId),
        isFreshTurn ? attachmentContext : null,
      );
      const sharedLocation = findSharedLocationInMessages(messages, taken.location);
      const weatherFollowUp = Boolean(sharedLocation && hasWeatherIntentInMessages(messages));
      if (weatherFollowUp) {
        const userIndex = messages.findLastIndex?.((item) => item.role === "user") ?? -1;
        messages.splice(userIndex >= 0 ? userIndex : messages.length, 0, {
          role: "system",
          content: `【用户已主动分享位置】${sharedLocation.coordinateText}。这是本轮可直接使用的位置证据；天气查询应使用该坐标，不要再次调用设备定位或要求定位权限。`,
          blockId: "runtime_context",
          provenance: "runtime.shared_location",
        });
      }
      const actionContext = formatTurnActionContext(understandingResult, buildLanguageContext());
      if (actionContext) {
        const userIndex = messages.findLastIndex?.((item) => item.role === "user") ?? -1;
        messages.splice(userIndex >= 0 ? userIndex : messages.length, 0, {
          role: "system",
          content: actionContext,
          blockId: "runtime_context",
          provenance: "runtime.action_context",
        });
      }
      const runtimeCatalog = getRuntimeCatalog?.() || {};
      const runtimeInstruction = buildRuntimeInstruction(runtimeCatalog);
      const finalUserIndex = messages.findLastIndex?.((item) => item.role === "user") ?? -1;
      messages.splice(finalUserIndex >= 0 ? finalUserIndex : messages.length, 0, {
        role: "system",
        content: runtimeInstruction,
        blockId: "runtime_protocol",
        provenance: "runtime.protocol",
      });
      const profile = compiled?.contextEnvelope?.request?.profile || {};
      const finalized = finalizeModelRequest(messages, {
        totalContextTokens: profile.totalInputTokens || 8000,
        outputReserveTokens: profile.outputReserveTokens || 1800,
        snapshotHash: turnSnapshot?.snapshotHash || "",
        providerMode: config.kind || "chat",
      });
      const recallInfo = classifyRecall(isFreshTurn ? promptSeed : "");
      updateTurnTrace(turnTraceId, {
        prompt: {
          contractVersion: compiled?.contractVersion || COMPANION_PROMPT_VERSION,
          authorityOrder: compiled?.authorityOrder || PROMPT_AUTHORITY_ORDER,
          turnIntent,
          recall: recallInfo,
          recallDepth: recallInfo.depth,
          recallReason: recallInfo.reason,
          whyRecall: recallInfo.whyRecall || recallInfo.reason,
          turnExecutionId,
          snapshotHash: turnSnapshot?.snapshotHash || "",
          characterId: executionScope.characterId || executionScope.companionId || "",
          characterName: compiled?.character?.name || "",
          runtimeCapabilities: compiled?.runtimeCapabilities || "",
          canonicalOrder: compiled?.canonical?.order || [],
          blocks: compiled?.inspector?.blocks || [],
          messages: finalized.messages,
          budget: finalized.ledger,
          preparedModelRequest: finalized.prepared,
        },
        retrieval: compiled?.contextEnvelope?.trace || null,
        model: {
          kind: config.kind,
          baseUrl: config.baseUrl,
          model: config.model,
          maxOutputTokens: finalized.maxOutputTokens,
        },
      }, "model_request_ready");
      const compiledOperationIds = compiled?.featureKnowledge
        ?.flatMap((row) => row.operationIds || [])
        || [];
      const operationIds = [...new Set([
        ...compiledOperationIds,
        ...(weatherFollowUp ? ["web.weather.lookup"] : []),
      ])].filter((operationId) => !(weatherFollowUp && operationId === "location.current.get_current"));
      const chatTools = requestableOpenAiTools({
        capabilityRuntimeSnapshot,
        operationIds,
      });
      let result = null;
      let modelMessages = finalized.messages;
      let lastReceiptFeedback = "";
      const toolReceipts = [];
      for (let toolRound = 0; toolRound < 3; toolRound += 1) {
        turnActivity?.setPhase(
          "reasoning",
          "active",
          toolRound === 0
            ? "正在把问题、角色状态和事实边界放在一起判断。"
            : "工具结果已经回来，我正在重新整理这一轮回答。",
        );
        result = await callModel(config, modelMessages, {
          stream: true,
          tools: chatTools,
          toolChoice: chatTools.length ? "auto" : undefined,
          maxOutputTokens: finalized.maxOutputTokens,
          turnExecutionId,
          snapshotHash: turnSnapshot?.snapshotHash || "",
          companionId: executionScope.characterId || executionScope.companionId || "",
          businessPurpose: "chat.companion_reply",
          capability: "chat",
          onReasoning: () => {
            if (!deps.isSummaryGenerationCurrent(summaryToken)) return;
            // Provider reasoning_content is private model reasoning, not a
            // character-facing thought. Keep the UI white-box at the stage
            // level without copying or persisting the raw stream.
            turnActivity?.setPhase(
              "reasoning",
              "active",
              "正在梳理回应方向（只显示阶段，不展示模型私有推理）。",
            );
            publishTurnProgress({
              phase: "thinking",
              stage: "reasoning",
              statusCopy: "正在梳理回应方向（只显示阶段，不展示模型私有推理）。",
              innerState: "",
            });
          },
          onDelta: (content) => {
            if (!deps.isSummaryGenerationCurrent(summaryToken)) return;
            turnActivity?.setPhase("compose", "active", "正在整理回答并逐字送达。");
            pending.classList.remove("is-reply-progress");
            pending.classList.remove("is-tool-progress");
            const partial = parseInnerStateEnvelope(content);
            if (partial.found) {
              envelopeMonologue = sanitizeInnerState(partial.innerState);
              turnActivity?.setInnerState(thinkingToShow(), { complete: partial.complete });
              if (!partial.complete) {
                // Psychology still streaming — hold the spoken bubble empty.
                setMessageBodyText(pending, "");
                publishTurnProgress({ phase: "thinking", innerState: thinkingToShow() });
                return;
              }
              turnActivity?.markPsychologyComplete?.();
              // Same cleaners as final commit so the bubble does not jump at end.
              const visible = sanitizeImChatText(
                stripRuntimeMetadataPreview(partial.text),
                { streaming: true },
              );
              streamedVisible = visible || "…";
              setMessageBodyText(pending, streamedVisible);
              publishTurnProgress({ phase: "stream", visibleText: streamedVisible });
              return;
            }
            // No envelope yet: wait briefly for tags; if the model skipped them,
            // fall through to body once enough plain text has arrived.
            const plain = sanitizeImChatText(
              stripRuntimeMetadataPreview(stripInnerStatePreview(content)),
              { streaming: true },
            ).trim();
            if (plain.length < 8) {
              setMessageBodyText(pending, "");
              publishTurnProgress({ phase: "thinking" });
              return;
            }
            turnActivity?.markPsychologyComplete?.();
            streamedVisible = plain;
            setMessageBodyText(pending, streamedVisible);
            publishTurnProgress({ phase: "stream", visibleText: streamedVisible });
          },
        });
        if (!deps.isSummaryGenerationCurrent(summaryToken)) return;
        if (!Array.isArray(result.toolCalls) || !result.toolCalls.length) {
          turnActivity?.setPhase("tool", "skipped", "这一轮不需要调用工具。");
          turnActivity?.setPhase("result", "skipped", "没有外部工具结果需要等待。");
          turnActivity?.setPhase("compose", "active", "正在把回答整理成自然的消息。");
          break;
        }

        const progress = (event = {}) => {
          const op = String(event.operation || "").toLowerCase();
          const label = op.includes("weather") || op.includes("天气")
            ? "天气"
            : op.includes("location") || op.includes("定位")
              ? "位置"
              : op.includes("diary") || op.includes("日记")
                ? "日记"
                : "这件事";
          const text = event.phase === "executing"
            ? `正在处理${label}，稍等一下…`
            : event.phase === "succeeded"
              ? `${label}结果已经拿到了，我整理一下…`
              : event.phase === "awaiting_approval"
                ? `${label}需要你的确认，完成后我才会继续。`
              : event.phase === "failed"
                ? `${label}没有成功，我会把真实结果告诉你…`
                : `我先处理一下${label}…`;
          setMessageBodyText(pending, text);
          turnActivity?.recordTool(
            event.operation || "tool",
            event.phase,
            event.phase === "executing"
              ? `正在执行${label}…`
              : event.phase === "succeeded"
                ? `${label}结果已取得，正在核对。`
                : event.phase === "awaiting_approval"
                  ? `${label}等待你的确认。`
                : event.phase === "failed"
                  ? `${label}没有成功，我会如实说明。`
                  : `准备${label}。`,
          );
          pending.classList.add("is-tool-progress");
          pending.classList.remove("is-reply-progress");
          pending.dataset.toolPhase = String(event.phase || "planned");
        };
        const toolCompanionId = executionScope.characterId || executionScope.companionId || "";
        const loop = await runCompanionToolLoop({
          toolCalls: result.toolCalls,
          runtime: capabilityRuntime,
          provider: { supportsTools: true, supportsStreamTools: true },
          explicitOperations: detectDiaryIntent(promptSeed)
            ? ["companion.diary.create"]
            : [],
          executors: createCompanionChatExecutors({
            companionId: toolCompanionId,
            characterProfile: deps.collectCharacterProfile?.(toolCompanionId) || {},
            sessionId: executionScope.sessionId || executionScope.conversationId || "",
            currentDailyStatus: status,
            sharedLocation,
            collectProviderConfig,
            addMessage: (text, role, options = {}) => addMessage(text, role, {
              ...options,
              characterId: toolCompanionId,
              companionId: toolCompanionId,
              chatSessionId: executionScope.sessionId || executionScope.conversationId || "",
            }),
          }),
          onProgress: progress,
        });
        const receiptFeedback = loop.feedback
          || loop.receipts?.map(formatReceiptMessage).join("\n")
          || loop.messages?.[0]?.content
          || "";
        lastReceiptFeedback = receiptFeedback;
        toolReceipts.push(...(loop.receipts || []));
        if (receiptFeedback) progress({
          phase: loop.receipts?.some((item) => item.status === "succeeded") ? "succeeded" : "failed",
          operation: loop.receipts?.[0]?.operation || "tool",
        });
        turnActivity?.setPhase(
          "result",
          loop.receipts?.some((item) => item.status === "succeeded") ? "done" : "failed",
          loop.receipts?.some((item) => item.status === "succeeded")
            ? "工具结果已经收到，接下来只使用回执中的事实。"
            : "工具没有返回成功结果，回答中会明确说明失败。",
        );
        modelMessages = [
          ...modelMessages,
          ...toolResultMessages(
            result.toolCalls,
            loop.receipts,
            stripRuntimeMetadataPreview(stripInnerStatePreview(result.content)),
          ),
        ];
        // The next model call is the user's single, continuous turn. It sees
        // receipts, can explain failures, and can finish naturally without a
        // second user click.
      }
      if (!result) throw new Error("model_no_result");
      if (Array.isArray(result.toolCalls) && result.toolCalls.length) {
        result.content = lastReceiptFeedback || "工具执行轮次已到上限，没有生成最终答复。";
      }
      const innerStateTurn = parseInnerStateEnvelope(result.content);
      if (innerStateTurn.found && innerStateTurn.innerState) {
        turnActivity?.setInnerState(innerStateTurn.innerState, { complete: true });
        turnActivity?.markPsychologyComplete?.();
      }
      // Keep the bar if we already streamed psychology; only clear when never found.
      if (!innerStateTurn.found && !turnActivity?.getSnapshot?.()?.innerState) {
        turnActivity?.clear?.();
      }
      result.content = innerStateTurn.found ? innerStateTurn.text : result.content;
      if (toolReceipts.length && claimsCompletionWithoutReceipt(result.content, toolReceipts)) {
        result.content = lastReceiptFeedback || "这次操作没有成功回执，我不能说它已经完成。";
      }
      turnActivity?.setPhase("compose", "active", "正在把回应整理成自然的话。");
      pending.classList.remove("is-tool-progress");
      pending.classList.remove("is-reply-progress");
      delete pending.dataset.toolPhase;

      const runtimeTurn = parseRuntimeTurn(result.content, runtimeCatalog);
      result.content = runtimeTurn.value?.text || stripRuntimeMetadataPreview(result.content);
      try {
        const outboundRules = listRegexRules("outbound");
        const outboundResult = applyOutboundRegex(result.content, outboundRules);
        result.content = outboundResult.text;
      } catch (error) {
        console.warn("[yueqi.regex] outbound", error);
      }
      result.content = sanitizeImChatText(result.content) || "嗯。";
      if (runtimeTargetMatchesScope(deps, executionScope)) {
        await applyRuntimeTurn?.(runtimeTurn.value, runtimeTurn);
      }

      streamedVisible = result.content;
      setMessageBodyText(pending, streamedVisible);
      turnActivity?.finish("回答已经整理好。");
      publishTurnProgress({ phase: "done", visibleText: streamedVisible });
      attachSpeakButtonToMessage(pending);
      refreshIcons(pending);
      writeSummaryPanel(status, compiled, {
        segmentIndex: 0,
        segmentTotal: 1,
        segmentText: result.content,
      }, summaryToken);

      const writtenAssistant = await writePopTurn("assistant", result.content, {
        executionScope,
        legacySessionId: executionScope.sessionId,
        messageId: assistantUiId,
        turnActivity: turnActivity?.getSnapshot?.() || undefined,
        ...(groupSpeakerMetaFromScope(executionScope) || {}),
      }, deps);
      if (!writtenAssistant?.ok) {
        turnActivity?.fail("回复已经生成，但没有成功写入会话记录。");
        console.error("[yueqi.conversation] authoritative assistant write failed — refusing IDB-only success", writtenAssistant?.reason);
        return;
      }
      const savedAssistantMessage = writtenAssistant.message || {
        id: writtenAssistant.turn?.id,
      };
      const activeGame = getActiveChatGameSession(executionScope.sessionId);
      const duoActive = getPopActiveDuo(executionScope.sessionId);
      if (duoActive?.platformSessionId) {
        try {
          const bridge = getSharedDuoBridge();
          const legal = bridge.legal(duoActive.platformSessionId, "character") || [];
          if (legal.length) {
            bridge.characterTurn(duoActive.platformSessionId, result.content);
          }
          refreshPopDuoObservation(executionScope.sessionId);
        } catch (error) {
          console.warn("[yueqi.games] duo character turn failed", error);
        }
      }
      if (activeGame?.round > 0) {
        await writeGameEvent(activeGame, "result", {
          executionScope,
          result: `第 ${activeGame.round} 回合完成`,
        });
      }

      try {
        const charId = executionScope.characterId;
        const activeGameForMemory = getActiveChatGameSession(executionScope.sessionId);
        if (
          charId
          && String(result.content || "").trim().length >= 8
          && shouldWriteLongTermMemory(activeGameForMemory ? "game_only" : "normal")
        ) {
          Promise.resolve(extractAndApplyMemoryOperations({
            characterId: charId,
            userText: userText || promptSeed,
            assistantText: result.content,
            userEvidenceRef: bufferedUserMessageId || `pop-${executionScope.sessionId || "chat"}-${Date.now().toString(36)}`,
            assistantEvidenceRef: savedAssistantMessage?.id || writtenAssistant.turn?.id || "",
            config,
          })).catch((error) => console.warn("[yueqi.context] evidence extraction failed", error));
          // W3/W8: turnUnderstandingV1 on → from-conversation is proposal-only (no append).
          // Flag off → legacy thin writer via same proposal producer. Skip call when on
          // to avoid dual-work; TurnUnderstanding already ran after user write.
          if (!isFeatureEnabled("turnUnderstandingV1")) {
            Promise.resolve(emitRelationshipEventsFromTurn({
              companionId: charId,
              userId: executionScope.userId || "local",
              userText: userText || promptSeed,
              assistantText: result.content,
              sourceTurnId: writtenAssistant.turn?.id || "",
            })).catch((error) => console.warn("[yueqi.timeline] emit from turn failed", error));
          }
        }
      } catch (error) {
        console.warn("[yueqi.context] post-chat ingest skipped", error);
      }

      scheduleBranchSummary({
        characterId: executionScope.characterId,
        conversationResult: writtenAssistant,
        config,
      });
      await touchConversation(executionScope.sessionId).catch(() => {});
      // P0: do not write assistant chat copies into unscoped MemPalace.
      recordScopedCompanionMessage(deps, executionScope, {
        role: "ai",
        text: result.content,
        source: "chat",
        actionId: runtimeTurn.value?.actions?.find((item) => item.at === "start")?.id || "",
        emotion: runtimeTurn.value?.emotion || "neutral",
        expression: runtimeTurn.value?.expression || "",
      });
      try {
        if (executionScope.characterId && executionScope.sessionId && isFreshTurn) {
          Promise.resolve(onCompanionChatTurn({
            characterId: executionScope.characterId,
            sessionId: executionScope.sessionId,
            userText,
            assistantText: result.content,
          })).catch((error) => console.warn("[yueqi.companion] chat turn hook failed", error));
        }
      } catch (error) {
        console.warn("[yueqi.companion] chat turn hook skipped", error);
      }
      if (isFeatureEnabled("voice") && canSpeak()) {
        const inCall = isLiveCallActive();
        if (inCall || getVoiceSettings().autoSpeak) {
          speakSegmentedText(result.content, { force: inCall }).catch(() => {});
        }
      }
      repliedContent = result.content;
      if (bufferedUserMessageId) completedUserTurnIds.add(bufferedUserMessageId);
      finishTurnTrace(turnTraceId, {
        turnExecutionId,
        response: {
          text: result.content,
          latencyMs: result.latencyMs,
          runtime: runtimeTurn.value || null,
          runtimeErrors: runtimeTurn.errors || [],
        },
      });
      if (bufferedUserMessageId) {
        understandingByMessageId.delete(bufferedUserMessageId);
        traceByMessageId.delete(bufferedUserMessageId);
      }
      pendingBuckets.clear(executionScope);
      renderProviderStatus({ status: "ok", latencyMs: result.latencyMs });
      scheduleCapabilityRefresh();
      triggerAutoSync();
    } catch (error) {
      failTurnTrace(turnTraceId, error);
      turnActivity?.fail("这一步没有完成，错误会按真实结果处理。");
      pending.classList.remove("is-tool-progress", "is-reply-progress");
      delete pending.dataset.toolPhase;
      if (deps.isSummaryGenerationCurrent(summaryToken) && pending.isConnected) {
        const failText = modelUnreachableFailText(error);
        streamedVisible = failText;
        setMessageBodyText(pending, failText);
        publishTurnProgress({ phase: "fail", visibleText: failText });
      } else {
        publishTurnProgress({ phase: "fail" });
      }
      renderProviderStatus({ status: "error", error: error.message });
      scheduleCapabilityRefresh();
    } finally {
      replyBusy = false;
      chrome?.setSpeakBusy?.(false);
      input.disabled = false;
      chrome?.syncSendState?.();
      window.dispatchEvent(new CustomEvent("yueqi.character.replied", {
        detail: { content: repliedContent },
      }));
      schedulePendingReplyChain();
    }
  }

  /** If more user turns were buffered while busy, drain them without requiring Continue. */
  function schedulePendingReplyChain() {
    if (replyChainScheduled || replyBusy || pendingBuckets.size() <= 0) return;
    replyChainScheduled = true;
    queueMicrotask(() => {
      replyChainScheduled = false;
      if (replyBusy || pendingBuckets.size() <= 0) return;
      void requestCharacterReply().catch((error) => {
        console.warn("[yueqi.conversation] chained character reply failed", error);
      });
    });
  }

  summaryMasters.forEach((checkbox) => {
    checkbox.addEventListener("change", () => setSummaryVisible(checkbox.checked));
  });

  const holdBtn = form?.querySelector("[data-composer-hold]");
  const sendBtn = form?.querySelector("[data-composer-send]")
    || document.querySelector("[data-composer-send]");
  const speakBtn = form?.querySelector("[data-composer-speak]")
    || document.querySelector("[data-composer-speak]");
  const plusSheet = document.querySelector("[data-composer-plus-sheet]");
  const stickerSheet = document.querySelector("[data-composer-sticker-sheet]");

  const tokenCompose = bindTokenComposeSheets(document, {
    onToast: (msg) => notifyChatFeedback(msg, { source: "token_compose" }),
    onSend: (text) => {
      if (!input || !form || !text) return;
      input.value = text;
      chrome?.syncSendState?.();
      form.requestSubmit();
    },
  });

  const giftCompose = bindGiftComposeSheet(document, {
    onToast: (msg) => notifyChatFeedback(msg, { source: "gift_compose" }),
    getCharacterId: () => resolveCharacterId(deps) || getActiveCharacterId?.() || "",
    openShopBag: () => {
      window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: "phone" } }));
      window.dispatchEvent(new CustomEvent("yueqi:phone-open-app", { detail: { appId: "shop" } }));
    },
    onSent: () => {
      window.dispatchEvent(new CustomEvent("yueqi:gift-sent"));
    },
  });

  const gameSheet = document.querySelector("[data-composer-game-sheet]");
  const gameList = document.querySelector("[data-composer-game-list]");

  function closeGameSheet() {
    if (gameSheet) gameSheet.hidden = true;
  }

  function renderDesktopGameList() {
    if (!gameList) return;
    gameList.innerHTML = listPopGames().map((game) => `
      <button type="button" class="composer-game-card tone-${escapeHtml(game.tone)}" data-composer-start-game="${escapeHtml(game.id)}">
        <strong>${escapeHtml(game.title)}</strong>
        <span>${escapeHtml(game.blurb)}</span>
      </button>
    `).join("");
  }

  function openGameSheet() {
    renderDesktopGameList();
    if (gameSheet) gameSheet.hidden = false;
    refreshIcons();
  }

  async function startDesktopPopGame(gameId) {
    const built = buildPopGameStart(gameId);
    if (!built.ok) {
      notifyChatFeedback(built.error || "未知玩法", { tone: "warning", source: "game_start" });
      return;
    }
    closeGameSheet();
    const executionScope = captureLiveTurnScope(deps, {
      purpose: "chat",
      appId: "pop",
      providerConfig: typeof collectProviderConfig === "function" ? collectProviderConfig() : null,
    });
    if (!executionScope?.sessionId) {
      notifyChatFeedback("当前会话还没准备好", { tone: "warning", source: "game_start" });
      return;
    }
    const existingRun = getActiveChatGameSession(executionScope.sessionId);
    if (existingRun) {
      const ended = endPopDuoGame(executionScope.sessionId, `开始新游戏前结束 · 共 ${existingRun.round} 回合`)
        || endChatGameSession(executionScope.sessionId, {
          result: `开始新游戏前结束 · 共 ${existingRun.round} 回合`,
        });
      if (ended) await writeGameEvent(ended, "end", { executionScope, result: ended.result });
    }
    const launched = startPopDuoGame({
      conversationId: executionScope.sessionId,
      gameId: built.game.id,
      title: built.game.title,
    });
    if (!launched.ok) {
      notifyChatFeedback(launched.error || "游戏没有成功开始", { tone: "danger", source: "game_start" });
      return;
    }
    const run = launched.run || startChatGameSession({
      sessionId: executionScope.sessionId,
      gameId: built.game.id,
      title: built.game.title,
    });
    const started = await writeGameEvent(run, "start", {
      executionScope,
      summary: built.game.blurb,
    });
    if (!started?.ok) {
      endPopDuoGame(executionScope.sessionId, "开始失败");
      notifyChatFeedback("游戏没有成功开始，请重试", { tone: "danger", source: "game_start" });
      return;
    }
    if (!input || !form) return;
    form.dataset.pendingGameInvite = run.runId;
    input.value = built.game.invite;
    chrome?.syncSendState?.();
    form.requestSubmit();
  }

  gameSheet?.addEventListener("click", (event) => {
    if (event.target.closest("[data-composer-game-close]")) {
      closeGameSheet();
      return;
    }
    const startBtn = event.target.closest("[data-composer-start-game]");
    if (startBtn?.dataset.composerStartGame) {
      startDesktopPopGame(startBtn.dataset.composerStartGame);
    }
  });

  document.addEventListener("yueqi:chat-game-start", (event) => {
    const gameId = String(event.detail?.gameId || "").trim();
    if (gameId) startDesktopPopGame(gameId);
  });

  document.addEventListener("yueqi:chat-game-end", async (event) => {
    const executionScope = captureLiveTurnScope(deps, {
      purpose: "chat",
      appId: "pop",
      providerConfig: typeof collectProviderConfig === "function" ? collectProviderConfig() : null,
    });
    const active = getActiveChatGameSession(executionScope?.sessionId || "");
    const requestedRunId = String(event.detail?.runId || "").trim();
    if (!executionScope || !active || (requestedRunId && requestedRunId !== active.runId)) return;
    const ended = endPopDuoGame(executionScope.sessionId, `完成 ${active.round} 回合`)
      || endChatGameSession(executionScope.sessionId, {
        result: `完成 ${active.round} 回合`,
      });
    if (ended) await writeGameEvent(ended, "end", { executionScope, result: ended.result });
  });

  chrome = bindComposerChrome({
    plusBtn: composerAttachButton,
    micBtn: composerMicButton,
    holdBtn,
    sendBtn,
    speakBtn,
    textInput: input,
    plusSheet,
    stickerSheet,
    fileInput: composerAttachInput,
    form,
    ns: "composer",
    onPickSticker: (sticker) => {
      if (!sticker?.url || !form || !input) return;
      input.value = stickerPromptText(sticker);
      attachmentState.pending = {
        type: "image",
        name: sticker.description || "表情",
        dataUrl: sticker.url,
        mime: "image/*",
        sticker: true,
        stickerId: sticker.id,
      };
      chrome?.syncSendState?.();
      form.requestSubmit();
    },
    onPlusAction: (kind) => {
      if (kind === "game") openGameSheet();
      else if (kind === "transfer") tokenCompose.open("transfer");
      else if (kind === "gift") giftCompose.open();
      else if (kind === "location") {
        if (!input || !form) return;
        if (form.dataset.locating === "1") return;
        form.dataset.locating = "1";
        const prevPlaceholder = input.placeholder;
        input.placeholder = t("appShell.chat.locating");
        input.disabled = true;
        captureShareLocation()
          .then((loc) => {
            input.disabled = false;
            input.placeholder = prevPlaceholder;
            if (!loc.ok) notifyChatFeedback(loc.error || t("appShell.chat.locationPlaceholder"), {
              tone: "warning",
              source: "location",
            });
            pendingLocationMeta = loc.metadata;
            input.value = loc.text;
            chrome?.syncSendState?.();
            form.requestSubmit();
          })
          .catch((error) => {
            input.disabled = false;
            input.placeholder = prevPlaceholder;
            notifyChatFeedback(String(error?.message || t("appShell.chat.locationFailed")), {
              tone: "danger",
              source: "location",
            });
          })
          .finally(() => {
            delete form.dataset.locating;
          });
      }
    },
    onCharacterSpeak: () => {
      requestCharacterReply().catch(() => {});
    },
    onToast: (msg) => notifyChatFeedback(msg, { source: "composer" }),
    hasPendingAttachment: () => Boolean(attachmentState.pending),
    getPendingAttachment: () => attachmentState.pending,
    onClearAttachment: () => {
      attachmentState.pending = null;
      if (composerAttachInput) composerAttachInput.value = "";
      if (input) input.placeholder = defaultComposerPlaceholder;
    },
  });

  window.addEventListener("yueqi.character.speak", () => {
    requestCharacterReply().catch(() => {});
  });

  // Attach is opened via + sheet → 图片; keep file change handler.
  composerAttachInput?.addEventListener("change", async () => {
    const file = composerAttachInput.files?.[0];
    if (!file) return;
    try {
      attachmentState.pending = await buildAttachmentContext(file);
      chrome?.closeSheets?.();
      chrome?.syncSendState?.();
    } catch (error) {
      const code = String(error?.code || error?.message || "");
      const message = code.includes("too_large")
        ? t("appShell.chat.attachmentLimits")
        : t("appShell.chat.attachmentTypes");
      notifyChatFeedback(message, { tone: "warning", source: "chat_attachment_picker" });
    } finally {
      composerAttachInput.value = "";
    }
  });

  const recordTarget = holdBtn;

  recordTarget?.addEventListener("pointerdown", async (event) => {
    event.preventDefault();
    if (!chrome?.isAudioMode?.()) return;
    if (micState.active || isRecording()) return;
    const ok = await ensureMicrophonePermission();
    if (!ok) return;
    try {
      await startRecording();
      // On the device route nothing is uploaded, so dictation has to listen live.
      beginDictation();
      micState.active = true;
      holdBtn?.classList.add("is-recording");
      composerMicButton?.classList.add("is-recording");
    } catch (error) {
      notifyChatFeedback(error.message || t("alerts.micFail"), {
        tone: "danger",
        source: "microphone",
      });
    }
  });

  const endRecord = () => {
    holdBtn?.classList.remove("is-recording");
    finishComposerRecording().catch(() => {});
  };

  recordTarget?.addEventListener("pointerup", endRecord);
  recordTarget?.addEventListener("pointerleave", () => {
    if (micState.active) endRecord();
  });
  recordTarget?.addEventListener("pointercancel", () => {
    if (micState.active) {
      cancelRecording();
      cancelDictation();
      micState.active = false;
      holdBtn?.classList.remove("is-recording");
      composerMicButton?.classList.remove("is-recording");
    }
  });

  list?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-speak-message]");
    if (!button) return;
    const article = button.closest(".message");
    const text = resolveMessageBodyParagraph(article)?.textContent?.trim();
    if (!text) return;
    try {
      await speakMessageText(text, button);
      refreshIcons();
    } catch (error) {
      notifyChatFeedback(error.message || t("alerts.ttsFail"), {
        tone: "danger",
        source: "tts",
      });
      refreshMessageSpeakButtons();
      refreshIcons();
    }
  });

  retrySttButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      if (!pendingSttBlobRef.current) return;
      button.disabled = true;
      try {
        const submit = Boolean(button.closest(".composer") || button.closest(".composer-stack"));
        await transcribePendingRecording(pendingSttBlobRef.current, { submit });
      } catch (error) {
        notifyChatFeedback(error.message || t("alerts.sttFail"), {
          tone: "danger",
          source: "stt",
        });
      } finally {
        button.disabled = false;
      }
    });
  });

  // Conversation V2 hook for future regenerate UI — keeps prior candidates.
  if (deps && typeof deps === "object") {
    deps.regenerateConversation = (text, meta = {}) =>
      regenerateInConversation(text, meta, deps);
  }

  // C2: ActionProposal cards — persist via proposal-repository; rehydrate on load.
  try {
    let host = list?.querySelector?.("[data-action-proposal-host='app']");
    if (!host && list) {
      host = document.createElement("div");
      host.className = "action-proposal-host";
      host.dataset.actionProposalHost = "app";
      list.append(host);
    }
    if (host) {
      actionProposalUi = bindActionProposalCards({
        host,
        variant: "app",
        getCompanionId: () => resolveCharacterId(deps),
      });
    }
  } catch (error) {
    console.warn("[yueqi.actionProposal] app bind failed", error);
  }

  return {
    requestCharacterReply,
    actionProposalUi,
    refreshActionProposals: () => actionProposalUi?.refresh?.(),
  };
}
