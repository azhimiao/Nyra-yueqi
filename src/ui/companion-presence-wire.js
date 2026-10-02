import { createVoiceBubble } from "../chat/voice-bubble.js";
import {
  appendCallTurn,
  buildCallRecordMessage,
  buildCallSessionMemory,
  createCallSession,
} from "../call/call-session.js";
import { writeCompanionTurn } from "../conversation/companion-write.js";
import {
  askAboutFrame,
  captureVideoFrame,
  startAutoCapture,
  startVideoCall,
  stopAutoCapture,
  stopVideoCall,
} from "../call/video-call.js";
import { t } from "../i18n/index.js";
import { wireThemeControls } from "./theme.js";
import { clearLiveCall, setLiveCall } from "../call/live-state.js";
import { refreshHostedSpeechStatus } from "../voice/speech-routing.js";
import { canSpeak, playSpeech, speakMessageText, speakSegmentedText, stopSpeech, synthesizeSpeech } from "../voice/tts.js";
import { refreshIcons } from "../lib/icons.js";

export function isCoListenEnabled() {
  return document.querySelector("[data-co-listen]")?.checked !== false;
}

/** Wire 月栖陪伴向能力：主题、语音条、一起听/看、视频通话 */
export function wireCompanionPresence(deps) {
  const {
    list,
    setPanel,
    input,
    form,
    collectProviderConfig,
    collectProfileState,
    addMessage,
    fileDrawerAndRender,
    saveChatMessage,
    getActiveCharacterId,
    sessionId,
    getSessionId,
    refreshIcons: refresh = refreshIcons,
  } = deps;

  const resolveSessionId = () => {
    if (typeof getSessionId === "function") return getSessionId();
    if (typeof sessionId === "function") return sessionId();
    return sessionId;
  };

  wireThemeControls(document);

  // Co-read (一起看) selection / opinion sheet is wired in book-reader.js

  list?.addEventListener("click", async (event) => {
    const bar = event.target.closest("[data-voice-bar]");
    if (!bar) return;
    const article = bar.closest(".voice-message");
    const text = article?.dataset.voiceText || article?.querySelector(".voice-transcript")?.textContent || "";
    if (!text) return;
    try {
      if (bar.classList.contains("is-playing")) {
        stopSpeech();
        bar.classList.remove("is-playing");
        return;
      }
      list.querySelectorAll(".voice-bar.is-playing").forEach((node) => node.classList.remove("is-playing"));
      bar.classList.add("is-playing");
      await speakMessageText(text, bar);
    } catch (error) {
      bar.classList.remove("is-playing");
      window.alert(error.message || t("alerts.voiceBarFail"));
    } finally {
      bar.classList.remove("is-playing");
      refresh();
    }
  });

  const modal = document.querySelector("#videoCallModal");
  const video = document.querySelector("[data-video-call-preview]");
  const canvas = document.querySelector("[data-video-call-canvas]");
  const log = document.querySelector("[data-video-call-log]");
  const modalTitle = document.querySelector("[data-call-modal-title]");
  const voiceStage = document.querySelector("[data-voice-call-stage]");
  const voiceStatus = document.querySelector("[data-voice-call-status]");
  const voiceDuration = document.querySelector("[data-voice-call-duration]");
  const startButton = document.querySelector("[data-video-call-start]");
  const startLabel = document.querySelector("[data-call-start-label]");
  const captureButton = document.querySelector("[data-video-call-capture]");
  const autoButton = document.querySelector("[data-video-call-auto]");
  const voiceReplyButton = document.querySelector("[data-voice-call-reply]");
  const openVideoButtons = document.querySelectorAll("[data-open-video-call]");
  const openVoiceButtons = document.querySelectorAll("[data-open-voice-call]");
  const videoPlaceholder = document.querySelector("[data-video-call-placeholder]");
  const callStage = document.querySelector("[data-call-stage]");
  let autoOn = false;
  let callSession = null;
  let callMode = "video";
  let callTimer = null;
  let callStartedAt = 0;

  function setLog(text) {
    if (log) log.textContent = text;
  }

  function setVideoPreviewLive(live) {
    const on = Boolean(live) && callMode === "video";
    callStage?.classList.toggle("is-live", on);
    if (video) video.hidden = !on;
    if (videoPlaceholder) {
      videoPlaceholder.hidden = on || callMode !== "video";
      videoPlaceholder.setAttribute("aria-hidden", on || callMode !== "video" ? "true" : "false");
    }
    if (captureButton) captureButton.disabled = callMode === "video" && !on;
    if (autoButton) autoButton.disabled = callMode === "video" && !on;
  }

  function stopCallTimer() {
    if (callTimer) window.clearInterval(callTimer);
    callTimer = null;
    callStartedAt = 0;
    if (voiceDuration) voiceDuration.textContent = "00:00";
  }

  function startCallTimer() {
    stopCallTimer();
    callStartedAt = Date.now();
    callTimer = window.setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000));
      const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const seconds = String(elapsed % 60).padStart(2, "0");
      if (voiceDuration) voiceDuration.textContent = `${minutes}:${seconds}`;
    }, 1000);
  }

  function openModal(mode = "video") {
    if (!modal) return;
    callMode = mode === "voice" ? "voice" : "video";
    modal.dataset.callMode = callMode;
    modal.classList.remove("is-connected");
    if (modalTitle) modalTitle.textContent = t(callMode === "voice" ? "chat.voiceCallTitle" : "chat.videoCallTitle");
    const currentStartIcon = document.querySelector("[data-call-start-icon]");
    if (currentStartIcon) {
      currentStartIcon.setAttribute("data-lucide", callMode === "voice" ? "phone" : "video");
      currentStartIcon.replaceChildren();
    }
    if (startLabel) startLabel.textContent = t("chat.callStart");
    if (voiceStage) voiceStage.hidden = callMode !== "voice";
    if (captureButton) captureButton.hidden = callMode === "voice";
    if (autoButton) autoButton.hidden = callMode === "voice";
    setVideoPreviewLive(false);
    if (voiceReplyButton) voiceReplyButton.hidden = callMode !== "voice";
    if (voiceReplyButton) voiceReplyButton.disabled = callMode === "voice";
    if (voiceStatus) voiceStatus.textContent = t("chat.callWaiting");
    setLog(t("chat.callNotStarted"));
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("is-open");
    refresh();
  }

  async function finalizeCallSession() {
    if (!callSession) return;
    const finished = {
      ...callSession,
      turns: Array.isArray(callSession.turns) ? callSession.turns.slice() : [],
      endedAt: new Date().toISOString(),
    };
    callSession = null;
    const record = buildCallRecordMessage(finished, { locale: document.documentElement.lang || "zh-CN" });
    if (record) {
      try {
        const messageId = `call-record-${finished.id}`;
        const written = await writeCompanionTurn({
          role: "system",
          text: record.text,
          companionId: record.companionId,
          characterId: record.companionId,
          userId: "local",
          chatSessionId: resolveSessionId(),
          messageId,
          meta: record.metadata,
          saveChatMessage,
        });
        if (written.ok) {
          await addMessage?.(record.text, "system", {
            persist: false,
            id: written.message?.id || messageId,
            createdAt: written.message?.createdAt || written.turn?.createdAt,
            metadata: record.metadata,
            skipVoice: true,
          });
        } else {
          console.warn("[yueqi.call] call record write failed", written.reason);
        }
      } catch (error) {
        console.warn("[yueqi.call] call record write failed", error);
      }
    }

    if (!finished.turns.length || !fileDrawerAndRender) return;
    const memory = buildCallSessionMemory(finished);
    if (!memory) return;
    try {
      // Index helper; palaceProjectionOnlyV1 blocks direct authority writes when ON.
      await fileDrawerAndRender(memory);
      const savedKey = callMode === "voice" ? "chat.voiceCallSaved" : "chat.videoCallSaved";
      console.info("[yueqi.call]", t(savedKey));
    } catch {
      // ignore memory write failures
    }
  }

  async function closeModal() {
    autoOn = false;
    stopAutoCapture();
    stopVideoCall();
    stopSpeech();
    clearLiveCall();
    stopCallTimer();
    // Hide immediately so × / backdrop never feel stuck behind async cleanup.
    if (modal) {
      modal.setAttribute("aria-hidden", "true");
      modal.classList.remove("is-open");
      modal.classList.remove("is-connected");
    }
    setVideoPreviewLive(false);
    setLog(t("chat.callNotStarted"));
    await finalizeCallSession();
  }

  openVideoButtons.forEach((button) => button.addEventListener("click", () => {
    openModal("video");
  }));

  openVoiceButtons.forEach((button) => button.addEventListener("click", () => {
    openModal("voice");
  }));

  window.addEventListener("yueqi.character.replied", (event) => {
    if (callMode !== "voice" || !modal?.classList.contains("is-open")) return;
    const content = String(event.detail?.content || "").trim();
    if (!content) return;
    appendCallTurn(callSession, { role: "assistant", content });
    if (voiceStatus) voiceStatus.textContent = t("chat.callConnected");
    setLog(`TA: ${content}`);
    voiceReplyButton?.removeAttribute("disabled");
  });

  document.querySelectorAll("[data-video-call-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void closeModal();
    });
  });

  startButton?.addEventListener("click", async () => {
    try {
      await refreshHostedSpeechStatus().catch(() => {});
      const profile = collectProfileState?.() || {};
      const characterName = profile.fields?.[0] || t("character.fallbackName");
      const companionId = getActiveCharacterId?.() || "";
      callSession = createCallSession({ characterName, companionId, characterId: companionId, kind: callMode });
      if (callMode === "video") {
        await startVideoCall({ video, canvas });
        setVideoPreviewLive(true);
        setLog("通话中：截帧后会流式回复；挂断后写入记忆。");
      } else {
        startCallTimer();
        modal?.classList.add("is-connected");
        if (voiceStatus) voiceStatus.textContent = t("chat.callConnected");
        voiceReplyButton?.removeAttribute("disabled");
        setLog(t("chat.callConnected"));
      }
      setLiveCall(callMode);
      refresh();
    } catch (error) {
      callSession = null;
      setLog(error.message || t("alerts.cameraFail"));
      window.alert(error.message || t("alerts.cameraFail"));
    }
  });

  document.querySelector("[data-video-call-stop]")?.addEventListener("click", () => {
    closeModal();
  });

  voiceReplyButton?.addEventListener("click", () => {
    if (callMode !== "voice") return;
    if (!callSession) startButton?.click();
    voiceReplyButton.setAttribute("disabled", "");
    if (voiceStatus) voiceStatus.textContent = t("chat.callReplying");
    setLog(t("chat.callReplying"));
    window.dispatchEvent(new CustomEvent("yueqi.character.speak"));
  });

  async function captureAndAsk() {
    const profile = collectProfileState?.() || {};
    const characterName = profile.fields?.[0] || callSession?.characterName || t("character.fallbackName");
    const companionId = getActiveCharacterId?.() || callSession?.companionId || "";
    if (!callSession) {
      callSession = createCallSession({ characterName, companionId, characterId: companionId });
    }
    const dataUrl = captureVideoFrame();
    setLog("截帧发送中…");
    appendCallTurn(callSession, { role: "user", content: "（发送了一帧画面）" });

    const pending = await addMessage?.("…", "ai", {
      persist: false,
      skipVoice: true,
      metadata: { kind: "video_frame" },
    });
    const paragraph = pending?.querySelector("p");

    const reply = await askAboutFrame({
      dataUrl,
      collectProviderConfig,
      characterName,
      stream: true,
      onDelta: (content) => {
        const shown = content ? `[视频截帧] ${content}` : "…";
        if (paragraph) paragraph.textContent = shown;
        setLog(`TA：${content}`);
      },
    });

    const shown = reply ? `[视频截帧] ${reply}` : "（无回复）";
    if (paragraph) paragraph.textContent = shown;
    setLog(`TA：${reply || "（无回复）"}`);
    appendCallTurn(callSession, { role: "assistant", content: reply });

    if (saveChatMessage && resolveSessionId() && reply) {
      await saveChatMessage({
        sessionId: resolveSessionId(),
        role: "assistant",
        content: shown,
        metadata: { kind: "video_frame" },
      });
    }

    if (reply && canSpeak()) {
      speakSegmentedText(reply, { force: true }).catch(() => {});
    }
    refresh();

    return reply;
  }

  document.querySelector("[data-video-call-capture]")?.addEventListener("click", async () => {
    try {
      await captureAndAsk();
    } catch (error) {
      setLog(error.message || t("alerts.captureFail"));
      window.alert(error.message || t("alerts.captureFail"));
    }
  });

  document.querySelector("[data-video-call-auto]")?.addEventListener("click", () => {
    if (autoOn) {
      autoOn = false;
      stopAutoCapture();
      setLog("已关闭自动截帧。");
      return;
    }
    autoOn = true;
    setLog("自动截帧：每 8 秒一次（流式回复）。");
    startAutoCapture(8000, async () => {
      try {
        await captureAndAsk();
      } catch (error) {
        setLog(error.message || "自动截帧失败");
      }
    });
  });
}

export async function appendVoiceMessage(list, {
  text,
  role = "ai",
  durationMs = 0,
  saveChatMessage,
  sessionId,
  persist = true,
}) {
  const article = createVoiceBubble({
    text,
    role,
    durationMs,
    speakable: role === "ai" ? canSpeak() : true,
  });
  list?.append(article);
  if (list) list.scrollTop = list.scrollHeight;
  refreshIcons();
  if (persist && saveChatMessage) {
    await saveChatMessage({
      sessionId,
      role: role === "user" ? "user" : "assistant",
      content: text,
      metadata: { kind: "voice", durationMs },
    });
  }
  return article;
}

export async function synthesizeAiVoiceBar(list, text, {
  durationHintMs = 0,
  saveChatMessage,
  sessionId,
  autoPlay = true,
} = {}) {
  if (!canSpeak() || !text) return null;
  const durationMs = durationHintMs || Math.min(20000, Math.max(2000, text.length * 80));
  const article = await appendVoiceMessage(list, {
    text,
    role: "ai",
    durationMs,
    saveChatMessage,
    sessionId,
    persist: Boolean(saveChatMessage && sessionId),
  });
  if (!autoPlay) return article;
  try {
    const blob = await synthesizeSpeech(text);
    const bar = article.querySelector("[data-voice-bar]");
    bar?.classList.add("is-playing");
    await playSpeech(blob, bar);
    bar?.classList.remove("is-playing");
  } catch {
    // keep bar for manual replay
  }
  return article;
}
