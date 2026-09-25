import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import { readBrowserPetEnabled } from "./pet-visibility-pref.js";
import { getPet, mountPet, readSelectedPetId } from "../avatar/pet-catalog.js";
import { XINGLI_ACTION_GROUPS, listPetActions } from "../avatar/xingli-action-map.js";
import { decideCompanionFloatPanelLayout } from "./companion-float-placement.js";

const POSITION_KEY = "yueqi.companionFloat.position";

function readPosition() {
  try {
    return JSON.parse(window.localStorage.getItem(POSITION_KEY) || "null");
  } catch {
    return null;
  }
}

function writePosition(position) {
  window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

function applyLookToOrb(face, img, boyHost, boy, state, { manualActionId = "", petKind = "sprite" } = {}) {
  const display = state.display || {};
  const base = Number(display.floatSize) || 64;
  const size = petKind === "bubble"
    ? clamp(base * 1.9, 104, 184)
    : clamp(base * 2.25, 112, 216);
  const orb = face.parentElement;
  const root = orb.closest("[data-companion-float]");
  orb.style.setProperty("--companion-orb-size", `${size}px`);
  root?.style.setProperty("--companion-float-width", `${size}px`);
  root?.style.setProperty(
    "--companion-float-height",
    petKind === "bubble" ? `${size}px` : `${Math.round(size * 1.38)}px`,
  );
  root?.setAttribute("data-pet-kind", petKind);

  // Catalog pet only — character wardrobe / test skeleton looks never cover the orb.
  boyHost.hidden = false;
  boy?.element?.toggleAttribute("hidden", false);
  img.hidden = true;
  face.hidden = true;
  img.removeAttribute("src");
  img.removeAttribute("alt");
  img.style.transform = "";
  if (!manualActionId) boy?.setRuntimeState?.(state, { source: "reply" });
}

/**
 * In-app companion float: character orb + voice / screen-watch only.
 */
export function mountCompanionFloat({
  runtime,
  onSubmitTurn,
  onToggleScreenWatch,
  getScreenWatchState,
  onOrbTap,
  onHide,
} = {}) {
  if (!runtime || document.querySelector("[data-companion-float]")) return null;

  const root = document.createElement("section");
  root.className = "companion-float";
  root.dataset.companionFloat = "true";
  root.setAttribute("aria-expanded", "false");
  if (!readBrowserPetEnabled() || window.yueqiDesktop?.isDesktop) {
    root.classList.add("is-system-overlay-hidden");
    root.setAttribute("aria-hidden", "true");
  }
  root.innerHTML = `
    <button type="button" class="companion-orb" data-companion-orb aria-label="${escapeHtml(t("companionFloat.openAria"))}">
      <span class="companion-orb-boy" data-float-boy></span>
      <img class="companion-orb-image" data-float-image hidden alt="" />
      <span class="companion-orb-face" data-float-initial>N</span>
      <span class="companion-orb-dot" data-float-unread hidden></span>
    </button>
    <div class="companion-float-panel" data-companion-float-panel hidden>
      <header>
        <div>
          <strong data-float-name>${escapeHtml(t("character.fallbackName"))}</strong>
          <span data-float-status>${escapeHtml(t("companionFloat.nearby"))}</span>
        </div>
        <div class="companion-float-header-actions">
          <button type="button" class="companion-float-hide" data-float-hide data-float-hide-label title="${escapeHtml(t("companionFloat.hideTitle"))}">${escapeHtml(t("companionFloat.hide"))}</button>
          <button type="button" class="icon-button" data-float-close aria-label="${escapeHtml(t("companionFloat.closeAria"))}" title="${escapeHtml(t("companionFloat.closeTitle"))}"><i data-lucide="x"></i><span class="icon-fallback">×</span></button>
        </div>
      </header>
      <p class="companion-float-lead" data-float-intent>${escapeHtml(t("companionFloat.lead"))}</p>
      <div class="companion-float-actions">
        <button type="button" class="companion-float-action" data-float-action="voice">
          <strong data-float-voice-label>${escapeHtml(t("companionFloat.voiceChat"))}</strong>
          <small data-float-voice-hint>${escapeHtml(t("companionFloat.voiceHint"))}</small>
        </button>
        <button type="button" class="companion-float-action" data-float-action="screen">
          <strong data-float-screen-label>${escapeHtml(t("companionFloat.screenWatch"))}</strong>
          <small data-float-screen-hint>${escapeHtml(t("companionFloat.screenHint"))}</small>
        </button>
      </div>
      <p class="companion-float-hint" data-float-hint aria-live="polite"></p>
    </div>
  `;
  document.body.append(root);

  const orb = root.querySelector("[data-companion-orb]");
  const panel = root.querySelector("[data-companion-float-panel]");
  const initial = root.querySelector("[data-float-initial]");
  const image = root.querySelector("[data-float-image]");
  const boyHost = root.querySelector("[data-float-boy]");
  const unread = root.querySelector("[data-float-unread]");
  const name = root.querySelector("[data-float-name]");
  const status = root.querySelector("[data-float-status]");
  const intent = root.querySelector("[data-float-intent]");
  const hint = root.querySelector("[data-float-hint]");
  const voiceBtn = root.querySelector('[data-float-action="voice"]');
  const voiceHint = root.querySelector("[data-float-voice-hint]");
  const screenBtn = root.querySelector('[data-float-action="screen"]');

  // Keep manual poses on the same in-app pet instead of sending the user to a
  // separate demo page.  Only actions explicitly safe for manual playback
  // appear here.
  const poseToggle = document.createElement("button");
  poseToggle.type = "button";
  poseToggle.className = "icon-button";
  poseToggle.dataset.floatPoseToggle = "true";
  poseToggle.setAttribute("aria-label", t("appShell.float.choosePose"));
  poseToggle.setAttribute("aria-expanded", "false");
  poseToggle.title = t("appShell.float.choosePose");
  poseToggle.textContent = "✦";
  root.querySelector(".companion-float-header-actions")?.prepend(poseToggle);

  const posePanel = document.createElement("section");
  posePanel.className = "companion-float-pose-panel";
  posePanel.dataset.floatPosePanel = "true";
  posePanel.hidden = true;
  posePanel.setAttribute("aria-label", t("appShell.float.poses"));
  const poseHead = document.createElement("div");
  poseHead.className = "companion-float-pose-head";
  const poseStatus = document.createElement("strong");
  poseStatus.dataset.floatPoseStatus = "true";
  const poseAuto = document.createElement("button");
  poseAuto.type = "button";
  poseAuto.dataset.floatPoseAuto = "true";
  poseAuto.textContent = t("appShell.float.autoFollow");
  poseHead.append(poseStatus, poseAuto);
  const poseList = document.createElement("div");
  poseList.className = "companion-float-pose-list";
  poseList.dataset.floatPoseList = "true";
  posePanel.append(poseHead, poseList);
  panel?.insertBefore(posePanel, intent);

  let selectedPetId = readSelectedPetId();
  let petKind = getPet(selectedPetId).kind;
  let boy = null;
  let manualActionId = "";
  let autoActionId = "";
  let latestRuntimeState = null;
  let autoBehaviorTimer = 0;
  let destroyed = false;

  function readPetActionOptions() {
    return {
      source: "manual",
      availableClipIds: boy?.getClips?.() || null,
      clipMetaById: boy?.getClipMeta?.() || null,
      excludePlaceholders: false,
    };
  }

  function listAvailableManualActions() {
    return listPetActions(readPetActionOptions());
  }

  function isRuntimeBusy(state = latestRuntimeState) {
    return Boolean(state?.asleep) || ["talking", "thinking", "listening", "capturing", "reacting"]
      .includes(String(state?.playState || "").toLowerCase());
  }

  function clearAutoBehavior() {
    if (autoBehaviorTimer) window.clearTimeout(autoBehaviorTimer);
    autoBehaviorTimer = 0;
  }

  function scheduleAutoBehavior() {
    clearAutoBehavior();
  }

  function restoreIdleAfterGesture(delayMs = 1600) {
    clearAutoBehavior();
    if (destroyed || petKind !== "sprite" || manualActionId) return;
    autoBehaviorTimer = window.setTimeout(() => {
      autoBehaviorTimer = 0;
      if (destroyed || manualActionId || isRuntimeBusy()) return;
      autoActionId = "";
      boy?.setRuntimeState?.(latestRuntimeState || { playState: "idle", actionId: "idle_default" }, {
        source: "reply",
        force: true,
      });
    }, Math.max(0, Number(delayMs) || 0));
  }

  function remountFloatPet(petId = readSelectedPetId()) {
    selectedPetId = petId;
    petKind = getPet(selectedPetId).kind;
    boy?.destroy?.();
    boyHost.replaceChildren();
    manualActionId = "";
    autoActionId = "";
    clearAutoBehavior();
    delete root.dataset.autoBehavior;
    boy = mountPet(selectedPetId, boyHost, {
      size: "100%",
      state: "idle",
      emotion: "warm",
      ariaLabel: t("appShell.float.animatedPet", { name: getPet(selectedPetId).label }),
      onReady: () => {
        if (destroyed || readSelectedPetId() !== selectedPetId) return;
        renderPoseList();
        paintPoseUi();
        if (petKind === "sprite" && !root.classList.contains("is-system-overlay-hidden")) {
          scheduleAutoBehavior(1600);
        }
        if (!panel.hidden) requestAnimationFrame(() => syncPanelPlacement());
      },
    }).controller;
    root.dataset.petKind = petKind;
    const posesAllowed = petKind === "sprite";
    poseToggle.hidden = !posesAllowed;
    posePanel.hidden = true;
    poseToggle.setAttribute("aria-expanded", "false");
    root.classList.remove("is-choosing-pose");
    renderPoseList();
    paintPoseUi();
    if (!posesAllowed) {
      clearAutoBehavior();
    }
    if (latestRuntimeState) {
      applyLookToOrb(initial, image, boyHost, boy, latestRuntimeState, {
        manualActionId: manualActionId || autoActionId,
        petKind,
      });
    }
  }

  remountFloatPet(selectedPetId);

  function paintPoseUi() {
    const selected = manualActionId
      ? listAvailableManualActions().find((item) => item.id === manualActionId)
      : null;
    poseStatus.textContent = selected
      ? t("appShell.float.manualPose", { pose: selected.label })
      : t("appShell.float.autoIdle");
    poseAuto.classList.toggle("is-active", !manualActionId);
    poseList.querySelectorAll("[data-float-pose]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.floatPose === manualActionId);
    });
  }

  function renderPoseList() {
    poseList.replaceChildren();
    if (petKind !== "sprite") return;
    const actions = listAvailableManualActions();
    Object.values(XINGLI_ACTION_GROUPS).forEach((group) => {
      const groupActions = actions.filter((item) => item.group === group.id);
      if (!groupActions.length) return;
      const groupNode = document.createElement("div");
      groupNode.className = "companion-float-pose-group";
      const title = document.createElement("span");
      title.textContent = group.label;
      const buttons = document.createElement("div");
      buttons.className = "companion-float-pose-buttons";
      groupActions.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.floatPose = item.id;
        button.textContent = item.label;
        buttons.append(button);
      });
      groupNode.append(title, buttons);
      poseList.append(groupNode);
    });
  }

  function selectManualPose(actionId) {
    const action = listAvailableManualActions().find((item) => item.id === actionId);
    if (!action) return;
    manualActionId = action.id;
    autoActionId = "";
    clearAutoBehavior();
    boy?.playAction?.(action.id, { source: "manual" });
    paintPoseUi();
  }

  function resumeAutomaticPose() {
    manualActionId = "";
    autoActionId = "";
    boy?.setRuntimeState?.(latestRuntimeState || { playState: "idle", actionId: "idle_default" }, { source: "reply", force: true });
    scheduleAutoBehavior(1200);
    paintPoseUi();
  }

  let recorder = null;
  let recordingStream = null;
  let recordingChunks = [];
  let recordingTimer = 0;

  function setHint(text = "") {
    if (hint) hint.textContent = text;
  }

  function paintVoiceUi(listening) {
    voiceBtn?.classList.toggle("is-active", Boolean(listening));
    if (voiceHint) voiceHint.textContent = t(listening ? "appShell.float.listening" : "appShell.float.tapToTalk");
  }

  function stopRecordingTracks() {
    if (recordingTimer) window.clearTimeout(recordingTimer);
    recordingTimer = 0;
    recordingStream?.getTracks?.().forEach((track) => track.stop());
    recordingStream = null;
  }

  async function toggleVoice() {
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setHint(t("appShell.float.recordingUnsupported"));
      return;
    }
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks = [];
      recorder = new MediaRecorder(recordingStream);
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size) recordingChunks.push(event.data);
      });
      recorder.addEventListener("stop", async () => {
        paintVoiceUi(false);
        const blob = new Blob(recordingChunks, { type: recorder.mimeType || "audio/webm" });
        stopRecordingTracks();
        try {
          setHint(t("appShell.float.thinking"));
          await onSubmitTurn?.({
            audioDataUrl: await blobToDataUrl(blob),
            source: "companion_float",
          });
          setHint("");
        } catch {
          setHint(t("appShell.float.recordingFailed"));
        }
      }, { once: true });
      recorder.start(250);
      paintVoiceUi(true);
      setHint(t("companionFloat.listening"));
      recordingTimer = window.setTimeout(() => {
        if (recorder?.state === "recording") recorder.stop();
      }, 15000);
    } catch (error) {
      stopRecordingTracks();
      paintVoiceUi(false);
      setHint(error?.name === "NotAllowedError" ? t("companionFloat.micDenied") : t("companionFloat.micUnavailable"));
    }
  }

  async function shareScreen() {
    // Doubao-style: toggle periodic screen-frame companion, not one-shot picker.
    screenBtn?.classList.add("is-busy");
    try {
      if (typeof onToggleScreenWatch === "function") {
        const result = await onToggleScreenWatch();
        const on = Boolean(result?.enabled);
        paintScreenUi(on);
        setHint(on
          ? t("companionFloat.screenOn", { sec: result.intervalSec || 15 })
          : t("companionFloat.screenOff"));
        return;
      }
      // Browser preview fallback: keep a shared stream and tick frames.
      await toggleBrowserScreenWatch();
    } catch (error) {
      setHint(error?.name === "NotAllowedError" ? t("companionFloat.screenDenied") : t("companionFloat.screenFailed"));
      paintScreenUi(false);
    } finally {
      screenBtn?.classList.remove("is-busy");
    }
  }

  let browserScreenTimer = 0;
  let browserScreenStream = null;

  function stopBrowserScreenWatch() {
    if (browserScreenTimer) {
      window.clearInterval(browserScreenTimer);
      browserScreenTimer = 0;
    }
    browserScreenStream?.getTracks?.().forEach((track) => track.stop());
    browserScreenStream = null;
    paintScreenUi(false);
  }

  async function captureFromStream(stream) {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const maxWidth = 1080;
    const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  async function toggleBrowserScreenWatch() {
    if (browserScreenTimer) {
      stopBrowserScreenWatch();
      setHint(t("companionFloat.screenOff"));
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setHint(t("companionFloat.screenUnsupported"));
      return;
    }
    browserScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    browserScreenStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      stopBrowserScreenWatch();
      setHint(t("companionFloat.screenOff"));
    });
    const tick = async () => {
      if (!browserScreenStream) return;
      try {
        const imageDataUrl = await captureFromStream(browserScreenStream);
        await onSubmitTurn?.({
          imageDataUrl,
          text: t("companionFloat.screenPrompt"),
          source: "companion_float_screen_watch",
        });
      } catch (error) {
        console.warn("browser screen watch tick failed", error);
      }
    };
    paintScreenUi(true);
    setHint(t("companionFloat.screenOnShort"));
    await tick();
    browserScreenTimer = window.setInterval(tick, 15000);
  }

  function paintScreenUi(on) {
    screenBtn?.classList.toggle("is-active", Boolean(on));
    const small = screenBtn?.querySelector("small");
    if (small) small.textContent = t(on ? "appShell.float.screenOn" : "appShell.float.screenOff");
  }

  function clearPanelPlacement() {
    panel.style.position = "";
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "";
    panel.style.bottom = "";
    panel.style.width = "";
    panel.style.maxHeight = "";
    panel.style.zIndex = "";
    panel.style.overflowY = "";
    panel.style.transform = "";
    root.classList.remove("opens-right", "opens-down", "opens-up");
  }

  function floatBoxSize() {
    const declared = Number.parseFloat(root.style.getPropertyValue("--companion-float-height"))
      || Number.parseFloat(window.getComputedStyle(root).getPropertyValue("--companion-float-height"))
      || 0;
    const width = Math.max(1, orb?.offsetWidth || root.offsetWidth || 64);
    const height = Math.max(1, declared || orb?.offsetHeight || 86);
    return { width, height };
  }

  function syncPanelPlacement() {
    if (!panel || panel.hidden) return;
    const pet = (orb || root).getBoundingClientRect();
    const margin = 12;
    const panelWidth = Math.min(300, Math.max(200, window.innerWidth - margin * 2));

    // Stay `position:absolute` on the float — viewport `top` teleports the card
    // when the pet is near the top of the screen.
    panel.style.position = "";
    panel.style.top = "";
    panel.style.bottom = "";
    panel.style.zIndex = "";
    panel.style.transform = "";
    panel.style.width = `${panelWidth}px`;
    panel.style.maxHeight = "none";
    panel.style.overflowY = "";

    const panelHeight = panel.scrollHeight || panel.offsetHeight || 140;
    const layout = decideCompanionFloatPanelLayout({
      petLeft: pet.left,
      petTop: pet.top,
      petRight: pet.right,
      petBottom: pet.bottom,
      panelWidth,
      panelHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });

    panel.style.left = `${Math.round(layout.localLeft)}px`;
    panel.style.right = "auto";
    panel.style.maxHeight = `${Math.round(layout.maxHeight)}px`;
    panel.style.overflowY = panelHeight > layout.maxHeight + 1 ? "auto" : "";

    root.classList.toggle("opens-down", layout.opensDown);
    root.classList.toggle("opens-up", !layout.opensDown);
    root.classList.toggle("opens-right", layout.opensRight);
  }

  function syncPanelDirection() {
    syncPanelPlacement();
  }

  function applyPosition(left, top, persist = false) {
    const { width, height } = floatBoxSize();
    const keepX = Math.max(40, Math.min(width, Math.round(width * 0.45)));
    const keepY = Math.max(40, Math.min(height, Math.round(height * 0.45)));
    // Soft bounds: hang off-screen freely, but keep a grip so the float isn't lost.
    const nextLeft = clamp(Number(left) || 0, keepX - width, window.innerWidth - keepX);
    const nextTop = clamp(Number(top) || 0, keepY - height, window.innerHeight - keepY);
    root.style.left = `${Math.round(nextLeft)}px`;
    root.style.top = `${Math.round(nextTop)}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.width = `${Math.round(width)}px`;
    root.style.height = `${Math.round(height)}px`;
    root.classList.add("is-positioned");
    if (!panel.hidden) syncPanelPlacement();
    if (persist) writePosition({ left: Math.round(nextLeft), top: Math.round(nextTop) });
  }

  function snapToNearestEdge(top, persist = false) {
    // Kept for API compatibility; free placement — no forced docking.
    const rect = root.getBoundingClientRect();
    applyPosition(rect.left, top ?? rect.top, persist);
  }

  const savedPosition = readPosition();
  if (savedPosition) applyPosition(savedPosition.left, savedPosition.top);

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    root.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (!open) {
      posePanel.hidden = true;
      poseToggle.setAttribute("aria-expanded", "false");
      root.classList.remove("is-choosing-pose");
      clearPanelPlacement();
    }
    if (open) {
      runtime.setPanel(runtime.getState().panel);
      setHint("");
      scheduleAutoBehavior(900);
      requestAnimationFrame(() => syncPanelPlacement());
    } else if (recorder?.state === "recording") {
      try { recorder.stop(); } catch { /* ignore */ }
    }
    refreshIcons();
  }

  function hideFloat() {
    setOpen(false);
    clearAutoBehavior();
    stopBrowserScreenWatch();
    paintScreenUi(false);
    root.classList.add("is-system-overlay-hidden");
    root.setAttribute("aria-hidden", "true");
    try {
      onHide?.();
    } catch (error) {
      console.warn("companion float hide callback failed", error);
    }
  }

  function showFloat() {
    root.classList.remove("is-system-overlay-hidden");
    root.removeAttribute("aria-hidden");
    scheduleAutoBehavior(900);
  }

  function render(state) {
    latestRuntimeState = state;
    // A real response or capture state wins over a pose selected earlier.
    // Otherwise the character could stay frozen on a manual frame while talking.
    if (isRuntimeBusy(state)) {
      manualActionId = "";
      autoActionId = "";
      clearAutoBehavior();
      paintPoseUi();
    }
    name.textContent = state.characterName || t("character.fallbackName");
    applyLookToOrb(initial, image, boyHost, boy, state, {
      manualActionId: manualActionId || autoActionId,
      petKind,
    });
    root.dataset.playState = state.playState || "idle";
    if (state.continuityFingerprint) {
      root.dataset.continuityFingerprint = String(state.continuityFingerprint);
    } else {
      delete root.dataset.continuityFingerprint;
    }
    status.textContent = state.presenceLabel || state.statusText || t("companionFloat.nearby");
    intent.textContent = state.lastProactiveText
      ? state.lastProactiveText
      : t("companionFloat.lead");
    unread.hidden = !state.unreadCount;
    unread.textContent = state.unreadCount > 9 ? "9+" : String(state.unreadCount || "");
    root.dataset.state = state.asleep ? "sleep" : "awake";
    if (typeof getScreenWatchState === "function") {
      try {
        paintScreenUi(Boolean(getScreenWatchState()?.enabled));
      } catch {
        /* ignore */
      }
    }
    if (petKind === "sprite" && !manualActionId && !isRuntimeBusy(state) && !state.asleep
      && state.companionMood !== "tired" && !root.classList.contains("is-system-overlay-hidden")) {
      scheduleAutoBehavior(2400);
    }
    window.requestAnimationFrame(() => {
      if (!root.classList.contains("is-positioned")) return;
      const rect = root.getBoundingClientRect();
      applyPosition(rect.left, rect.top, true);
    });
  }

  function onPetChanged(event) {
    if (destroyed) return;
    const nextId = event?.detail?.petId || readSelectedPetId();
    if (nextId === selectedPetId && boy) return;
    remountFloatPet(nextId);
  }

  function onCompanionChanged() {
    if (destroyed) return;
    remountFloatPet(readSelectedPetId());
  }

  function refreshLocaleChrome() {
    orb?.setAttribute("aria-label", t("companionFloat.openAria"));
    const hideBtn = root.querySelector("[data-float-hide-label]");
    if (hideBtn) {
      hideBtn.textContent = t("companionFloat.hide");
      hideBtn.title = t("companionFloat.hideTitle");
    }
    const closeBtn = root.querySelector("[data-float-close]");
    if (closeBtn) {
      closeBtn.setAttribute("aria-label", t("companionFloat.closeAria"));
      closeBtn.title = t("companionFloat.closeTitle");
    }
    const voiceLabel = root.querySelector("[data-float-voice-label]");
    const screenLabel = root.querySelector("[data-float-screen-label]");
    const screenHint = root.querySelector("[data-float-screen-hint]");
    if (voiceLabel) voiceLabel.textContent = t("companionFloat.voiceChat");
    if (voiceHint) voiceHint.textContent = t("companionFloat.voiceHint");
    if (screenLabel) screenLabel.textContent = t("companionFloat.screenWatch");
    if (screenHint) screenHint.textContent = t("companionFloat.screenHint");
    if (latestRuntimeState) render(latestRuntimeState);
    else {
      if (status) status.textContent = t("companionFloat.nearby");
      if (intent) intent.textContent = t("companionFloat.lead");
    }
  }

  runtime.subscribe(render);
  document.addEventListener("yueqi:pet-changed", onPetChanged);
  document.addEventListener("yueqi:companion-changed", onCompanionChanged);
  document.addEventListener("yueqi:locale-changed", refreshLocaleChrome);
  scheduleAutoBehavior(2600);

  let dragging = false;
  let moved = false;
  let offsetX = 0;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;
  let activePointerId = null;
  const DRAG_THRESHOLD_PX = 9;

  function releasePointer(id = activePointerId) {
    try {
      if (id != null && orb.hasPointerCapture?.(id)) {
        orb.releasePointerCapture(id);
      }
    } catch {
      /* Pointer capture is best effort on older WebViews. */
    }
  }

  function finishGesture() {
    releasePointer();
    dragging = false;
    activePointerId = null;
    root.classList.remove("is-dragging");
  }

  orb.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true;
    moved = false;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    const rect = root.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    delete root.dataset.docked;
    orb.setPointerCapture?.(event.pointerId);
  });

  orb.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== activePointerId) return;
    if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD_PX) {
      return;
    }
    if (!moved && !manualActionId && !isRuntimeBusy()) {
      autoActionId = "drag";
      boy?.playAction?.("drag", { source: "gesture" });
      root.classList.add("is-dragging");
    }
    moved = true;
    event.preventDefault();
    applyPosition(event.clientX - offsetX, event.clientY - offsetY);
  });

  orb.addEventListener("pointerup", (event) => {
    if (!dragging || event.pointerId !== activePointerId) return;
    if (dragging && moved) {
      const rect = root.getBoundingClientRect();
      applyPosition(rect.left, rect.top, true);
      restoreIdleAfterGesture(1800);
    }
    if (!moved) {
      if (!manualActionId && !isRuntimeBusy()) {
        autoActionId = "react_tap";
        boy?.playAction?.("react_tap", { source: "gesture" });
        restoreIdleAfterGesture(2200);
      }
      onOrbTap?.();
      setOpen(!root.classList.contains("is-open"));
    }
    finishGesture();
    window.setTimeout(() => {
      moved = false;
    }, 0);
  });

  orb.addEventListener("pointercancel", (event) => {
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    finishGesture();
    moved = false;
  });

  window.addEventListener("resize", () => {
    if (!root.classList.contains("is-positioned")) return;
    const rect = root.getBoundingClientRect();
    applyPosition(rect.left, rect.top, true);
  });

  root.querySelector("[data-float-close]")?.addEventListener("click", () => setOpen(false));
  root.querySelector("[data-float-hide]")?.addEventListener("click", () => hideFloat());
  poseToggle.addEventListener("click", () => {
    if (petKind !== "sprite") return;
    const nextOpen = posePanel.hidden;
    posePanel.hidden = !nextOpen;
    poseToggle.setAttribute("aria-expanded", String(nextOpen));
    root.classList.toggle("is-choosing-pose", nextOpen);
    if (!panel.hidden) requestAnimationFrame(() => syncPanelPlacement());
  });

  window.addEventListener("resize", () => {
    if (!panel.hidden) syncPanelPlacement();
  });

  root.addEventListener("click", (event) => {
    const poseId = event.target.closest("[data-float-pose]")?.dataset.floatPose;
    if (poseId) {
      selectManualPose(poseId);
      return;
    }
    if (event.target.closest("[data-float-pose-auto]")) {
      resumeAutomaticPose();
      return;
    }
    const action = event.target.closest("[data-float-action]")?.dataset.floatAction;
    if (!action) return;
    if (action === "voice") {
      toggleVoice().catch((error) => console.warn("float voice failed", error));
      return;
    }
    if (action === "screen") {
      shareScreen().catch((error) => console.warn("float screen failed", error));
    }
  });

  return {
    open: () => {
      showFloat();
      setOpen(true);
    },
    close: () => setOpen(false),
    hide: hideFloat,
    show: showFloat,
    destroy: () => {
      destroyed = true;
      clearAutoBehavior();
      stopRecordingTracks();
      stopBrowserScreenWatch();
      document.removeEventListener("yueqi:pet-changed", onPetChanged);
      document.removeEventListener("yueqi:companion-changed", onCompanionChanged);
      document.removeEventListener("yueqi:locale-changed", refreshLocaleChrome);
      boy?.destroy?.();
      root.remove();
    },
  };
}
