import { createIcons, icons } from "lucide";
import { mountSpriteCharacter } from "../avatar/sprite-character.js";
import { mountBubbleCharacter } from "../avatar/bubble-character.js";
import { DEFAULT_PET_ID, getPet } from "../avatar/pet-catalog.js";
import { createIdleCarousel } from "../avatar/idle-carousel.js";
import {
  XINGLI_ACTION_GROUPS,
  XINGLI_MANIFEST_URL,
  getXingliAction,
  listPetActions,
  resolveXingliClip,
} from "../avatar/xingli-action-map.js";
import { resolveOverlayAssetUrl } from "./overlay-assets.js";

const POSE_MODE_KEY = "yueqi.overlay.poseMode";
const SPRITE_MANIFESTS = Object.freeze({
  "yueqi-female": "/assets/characters/yueqi-female/manifest.json",
  "yueqi-male": "/assets/characters/yueqi-male/manifest.json",
  xingli: XINGLI_MANIFEST_URL,
});

function getAndroidBridge() {
  return typeof window !== "undefined" ? window.YueqiOverlayBridge : null;
}

function getElectronPet() {
  return typeof window !== "undefined" ? window.yueqiPet : null;
}

const state = {
  mode: "collapsed",
  name: "角色",
  spritePack: DEFAULT_PET_ID,
  lookDataUrl: "",
  actionDataUrl: "",
  bubbleText: "",
  unread: 0,
  playState: "idle",
  emotion: "warm",
  actionId: "idle_default",
  display: { floatSize: 64, scale: 1, flipX: false },
  locked: false,
  muted: false,
  movementPaused: false,
  sensing: {
    screenWatch: { enabled: false, intervalSec: 15 },
    voiceChat: { enabled: false },
    systemAudio: { enabled: false },
  },
};

const root = document.getElementById("root");
const characterHit = document.getElementById("characterHit");
const spriteMount = document.getElementById("spriteMount");
const badge = document.getElementById("badge");
const bubble = document.getElementById("bubble");
const chatName = document.getElementById("chatName");
const chatStatus = document.getElementById("chatStatus");
const chatThread = document.getElementById("chatThread");
const quickForm = document.getElementById("quickForm");
const quickInput = document.getElementById("quickInput");
const stickerPanel = document.getElementById("stickerPanel");
const btnMic = document.getElementById("btnMic");
const btnVoiceChat = document.getElementById("btnVoiceChat");
const btnShareScreen = document.getElementById("btnShareScreen");
const contextMenu = document.getElementById("petContextMenu");
const chat = document.getElementById("chat");
const btnPoses = document.getElementById("btnPoses");
const posePanel = document.getElementById("posePanel");
const poseNow = document.getElementById("poseNow");
const poseGroups = document.getElementById("poseGroups");
const captureButtons = Array.from(document.querySelectorAll("#btnCapture, #btnShareScreen, [data-companion='screen']"));
const voiceButtons = Array.from(document.querySelectorAll("#btnMic, #btnVoiceChat, [data-companion='voice']"));
let pendingNativeCapture = null;

let spriteFailed = false;
let mountedSpritePack = "";
let sprite = null;
let overlayCarousel = null;
let poseModeReady = false;
let lastAutoSignature = "";

/**
 * The bubble pet has no atlas clips. Expose the sprite-player shape so the pose
 * catalog stays empty and every clip call degrades instead of throwing.
 */
function mountBubblePack() {
  const controller = mountBubbleCharacter(spriteMount, {
    size: "100%",
    state: "idle",
    ariaLabel: "动态气泡桌宠",
  });
  return {
    element: controller.element,
    ready: Promise.resolve(),
    getClips: () => [],
    getClipMeta: () => ({}),
    getState: () => ({ ...controller.getState?.(), clipId: "" }),
    play: async (clipId) => controller.playAction?.(clipId === "idle_loop" ? "idle_default" : clipId),
    setRuntimeState: controller.setRuntimeState,
    destroy: controller.destroy,
  };
}

function mountBundledSprite(packId = DEFAULT_PET_ID) {
  const pet = getPet(packId);
  const normalized = pet.id;
  if (sprite && mountedSpritePack === normalized) return sprite;
  overlayCarousel?.destroy?.();
  overlayCarousel = null;
  sprite?.destroy?.();
  spriteMount.replaceChildren();
  spriteFailed = false;
  mountedSpritePack = normalized;

  if (pet.kind === "bubble") {
    sprite = mountBubblePack();
    if (btnPoses) btnPoses.hidden = true;
    // Deferred like the atlas player's onReady: module-scope state is not bound yet
    // on the very first mount.
    sprite.ready.then(() => {
      renderPoseCatalog();
      paintPoseUi();
    });
    return sprite;
  }
  if (btnPoses) btnPoses.hidden = false;

  sprite = mountSpriteCharacter(spriteMount, {
  manifestUrl: resolveOverlayAssetUrl(pet.manifestUrl || SPRITE_MANIFESTS[normalized]),
  size: "100%",
  initialClip: "idle_loop",
  crossfadeMs: 72,
  label: "动态桌宠",
  onReady: () => {
    renderPoseCatalog();
    paintPoseUi();
  },
  onClipChange: handleSpriteClipChange,
  onComplete: handleSpriteClipChange,
  onError: () => {
    spriteFailed = true;
    characterHit.classList.remove("has-sprite");
  },
  });
  sprite.ready.then(() => {
    const allowedIds = new Set(listPetActions({
      source: "manual",
      availableClipIds: sprite?.getClips?.() || null,
      clipMetaById: sprite?.getClipMeta?.() || null,
      excludePlaceholders: false,
    }).map((item) => item.id));
    if (manualClipId && !allowedIds.has(manualClipId) && manualClipId !== "idle_loop") {
      manualClipId = "idle_loop";
      if (poseMode === "manual") poseMode = "auto";
    }
    renderPoseCatalog();
    paintPoseUi();
  }).catch(() => {});
  if (poseModeReady) bindOverlayCarousel();
  return sprite;
}

mountBundledSprite(state.spritePack);

let dragging = false;
let moved = false;
let startX = 0;
let startY = 0;
let originX = 24;
let originY = 180;
let windowX = 24;
let windowY = 180;
let previousBubble = "";
let poseMode = readPoseMode();
let manualClipId = "idle_loop";
poseModeReady = true;
bindOverlayCarousel();
let recorder = null;
let recordingStream = null;
let recordingChunks = [];
let recordingTimer = 0;
let hostCapabilities = {
  text: true,
  audio: true,
  screenCapture: true,
  audioReason: "",
  screenCaptureReason: "",
};

function density() {
  try {
    if (getAndroidBridge()?.getDensity) return getAndroidBridge().getDensity();
  } catch {
    // Browser preview.
  }
  return window.devicePixelRatio || 1;
}

function isElectron() {
  return Boolean(getElectronPet());
}

function iconRefresh() {
  createIcons({ icons });
}

function readPoseMode() {
  try {
    return window.localStorage.getItem(POSE_MODE_KEY) === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

function writePoseMode() {
  try {
    window.localStorage.setItem(POSE_MODE_KEY, poseMode);
  } catch {
    // Some embedded hosts may disable persistent WebView storage.
  }
}

function renderPoseCatalog() {
  if (!poseGroups) return;
  poseGroups.replaceChildren();
  const actions = listPetActions({
    availableClipIds: sprite?.getClips?.() || null,
    clipMetaById: sprite?.getClipMeta?.() || null,
    excludePlaceholders: false,
  });
  for (const group of Object.values(XINGLI_ACTION_GROUPS)) {
    const groupActions = actions.filter((item) => item.group === group.id);
    if (!groupActions.length) continue;
    const section = document.createElement("section");
    section.className = "pet-pose-group";
    const title = document.createElement("span");
    title.textContent = group.label;
    const grid = document.createElement("div");
    grid.className = "pet-pose-grid";
    for (const action of groupActions) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.poseId = action.id;
      button.textContent = action.label;
      button.title = action.label;
      grid.append(button);
    }
    section.append(title, grid);
    poseGroups.append(section);
  }
}

function paintPoseUi() {
  const activeClip = sprite?.getState?.().clipId || manualClipId || "idle_loop";
  const active = getXingliAction(activeClip);
  if (poseNow) poseNow.textContent = `${poseMode === "auto" ? "自动" : "手动"} · ${active?.label || "待机"}`;
  document.querySelectorAll("[data-pose-mode]").forEach((button) => {
    const selected = button.dataset.poseMode === poseMode;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  poseGroups?.querySelectorAll("[data-pose-id]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.poseId === activeClip);
  });
}

function handleSpriteClipChange() {
  paintPoseUi();
  if (poseMode === "manual" && chatStatus) chatStatus.textContent = statusLabel();
}

function setPosePanel(open) {
  const visible = Boolean(open);
  if (posePanel) posePanel.hidden = !visible;
  chat?.classList.toggle("is-choosing-pose", visible);
  btnPoses?.classList.toggle("is-active", visible);
  btnPoses?.setAttribute("aria-expanded", String(visible));
  if (visible) paintPoseUi();
  requestResize();
}

function overlayCarouselEnabled() {
  if (!poseModeReady) return false;
  return poseMode !== "manual"
    && !spriteFailed
    && !state.asleep
    && String(state.playState || "idle") === "idle"
    && state.spritePack !== "bubble"
    && typeof sprite?.play === "function";
}

function bindOverlayCarousel() {
  overlayCarousel?.destroy?.();
  overlayCarousel = typeof sprite?.play === "function"
    ? createIdleCarousel(sprite, { enabled: overlayCarouselEnabled })
    : null;
  lastAutoSignature = "";
  if (overlayCarouselEnabled()) overlayCarousel?.start(480);
}

async function syncSpriteFromState({ force = false } = {}) {
  if (spriteFailed) return;
  if (poseMode === "manual" && !force) return;

  if (poseMode === "manual") {
    overlayCarousel?.stop();
    const manual = resolveXingliClip({ actionId: manualClipId, source: "manual" });
    await sprite.play(manual.clipId, {
      playback: manual.playback,
      returnClip: manual.returnClip || false,
      reason: "manual-restore",
      force: true,
    });
    return;
  }

  const signature = [state.playState, state.actionId, state.emotion, Boolean(state.asleep)].join("|");
  if (!force && signature === lastAutoSignature) return;
  lastAutoSignature = signature;
  overlayCarousel?.stop();
  const resolved = resolveXingliClip({
    playState: state.playState,
    actionId: state.actionId,
    emotion: state.emotion,
    asleep: state.asleep,
    source: "reply",
  });
  const persistent = ["thinking", "capturing", "listening"].includes(state.playState)
    && ["thinking", "listen"].includes(resolved.clipId);
  await sprite.play(resolved.clipId, {
    playback: persistent ? "loop" : resolved.playback,
    returnClip: persistent ? false : (resolved.returnClip || false),
    reason: "runtime",
    force,
  });
  if (overlayCarouselEnabled()) overlayCarousel?.start(720);
}

async function setPoseMode(nextMode) {
  poseMode = nextMode === "manual" ? "manual" : "auto";
  writePoseMode();
  paintPoseUi();
  if (poseMode === "auto") {
    lastAutoSignature = "";
    await syncSpriteFromState({ force: true });
  } else {
    overlayCarousel?.stop();
  }
}

async function playManualPose(actionId) {
  const allowed = listPetActions({
    source: "manual",
    availableClipIds: sprite?.getClips?.() || null,
    clipMetaById: sprite?.getClipMeta?.() || null,
    excludePlaceholders: false,
  });
  const action = allowed.find((item) => item.id === actionId) || null;
  if (!action || spriteFailed) return;
  manualClipId = action.id;
  poseMode = "manual";
  writePoseMode();
  paintPoseUi();
  overlayCarousel?.stop();
  const resolved = resolveXingliClip({ actionId: action.id, source: "manual" });
  await sprite.play(resolved.clipId, {
    playback: resolved.playback,
    returnClip: resolved.returnClip || false,
    reason: "manual",
    force: true,
  });
}

function requestPetAction(actionId) {
  playManualPose(actionId).then(render).catch(() => {});
  getElectronPet()?.requestAction?.(actionId);
  try {
    getAndroidBridge()?.requestAction?.(actionId);
  } catch {
    // Older Android hosts only support local overlay animation.
  }
}

async function playDragPose() {
  if (spriteFailed || state.spritePack === "bubble") return;
  await sprite.play("drag", {
    playback: "loop",
    returnClip: false,
    reason: "gesture",
    force: true,
  });
}

function restoreAfterDrag() {
  if (poseMode === "manual" && manualClipId === "drag") manualClipId = "idle_loop";
  if (poseMode === "auto") lastAutoSignature = "";
  syncSpriteFromState({ force: true }).catch(() => {});
}

function parseBridgeJson(raw, fallback = {}) {
  if (!raw) return fallback;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function syncHostCapabilities() {
  const android = getAndroidBridge();
  if (android?.getCapabilities) {
    try {
      hostCapabilities = { ...hostCapabilities, ...parseBridgeJson(android.getCapabilities()) };
    } catch {
      hostCapabilities = {
        ...hostCapabilities,
        audio: false,
        screenCapture: false,
        audioReason: "悬浮宿主没有返回录音能力。",
        screenCaptureReason: "悬浮宿主没有返回看屏能力。",
      };
    }
  } else if (!isElectron()) {
    hostCapabilities.audio = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
    hostCapabilities.screenCapture = Boolean(navigator.mediaDevices?.getDisplayMedia);
  }

  const captureTitle = hostCapabilities.screenCapture
    ? "截帧读屏（定时看屏幕陪聊）"
    : hostCapabilities.screenCaptureReason || "当前宿主暂不支持截帧读屏";
  captureButtons.forEach((button) => {
    button.disabled = !hostCapabilities.screenCapture;
    button.setAttribute("aria-disabled", String(!hostCapabilities.screenCapture));
    button.title = captureTitle;
  });
  const voiceTitle = hostCapabilities.audio
    ? "语音聊天"
    : hostCapabilities.audioReason || "当前宿主暂不支持录音";
  voiceButtons.forEach((button) => {
    button.disabled = !hostCapabilities.audio;
    button.setAttribute("aria-disabled", String(!hostCapabilities.audio));
    button.title = voiceTitle;
  });
  paintCompanionActions();
}

function appendThread(text, role = "ai") {
  const clean = String(text || "").trim();
  if (!clean) return;
  const node = document.createElement("div");
  node.className = `pet-message pet-message--${role === "user" ? "user" : "ai"}`;
  node.textContent = clean;
  chatThread.append(node);
  while (chatThread.children.length > 8) chatThread.firstElementChild?.remove();
  chatThread.scrollTop = chatThread.scrollHeight;
}

function resolveCharacterState(playState, actionId = "") {
  if (actionId === "sleep_pose") return "sleep";
  if (actionId === "greet") return "greet";
  if (actionId === "selfie") return "selfie";
  if (["talking", "thinking", "listening", "reacting"].includes(playState)) return playState;
  if (playState === "capturing") return "thinking";
  return "idle";
}

function applyCustomLook() {
  const pack = state.spritePack === "legacy" ? DEFAULT_PET_ID : state.spritePack;
  if (spriteFailed) {
    spriteFailed = false;
  }
  mountBundledSprite(pack);
  const useSprite = !spriteFailed;
  characterHit.classList.remove("has-custom");
  characterHit.classList.toggle("has-sprite", useSprite);
  return useSprite;
}

function updateIncomingBubble() {
  const text = String(state.bubbleText || "").trim();
  if (!text || text === previousBubble) return;
  previousBubble = text;
  if (!["thinking", "capturing", "listening"].includes(state.playState)) {
    appendThread(text, "ai");
  }
}

function statusLabel() {
  if (poseMode === "manual") {
    const active = getXingliAction(sprite?.getState?.().clipId || manualClipId);
    return `手动 · ${active?.label || "待机"}`;
  }
  if (state.actionId === "sleep_pose") return "在睡觉";
  if (state.actionId === "greet") return "在打招呼";
  if (state.actionId === "selfie") return "在自拍";
  if (state.movementPaused) return "已暂停移动";
  if (state.playState === "thinking") return "正在想";
  if (state.playState === "capturing") return "正在看";
  if (state.playState === "listening") return "正在听";
  if (state.playState === "talking") return "正在说话";
  if (state.presenceLabel) return state.presenceLabel;
  return "在你身边";
}

function setLocalPlayState(playState, actionId = "") {
  state.playState = playState;
  state.actionId = actionId || ({
    idle: "idle_default",
    talking: "talking_default",
    thinking: "thinking",
    capturing: "thinking",
    listening: "listen",
    reacting: "react_tap",
  }[playState] || "idle_default");
}

function render() {
  const mode = ["collapsed", "bubble", "chat"].includes(state.mode) ? state.mode : "collapsed";
  document.body.dataset.mode = mode;
  document.body.dataset.play = state.playState || "idle";
  document.body.dataset.action = state.actionId || "idle_default";
  document.body.dataset.host = isElectron() ? "electron" : getAndroidBridge() ? "android" : "web";

  const floatSize = Math.min(96, Math.max(48, Number(state.display?.floatSize) || 64));
  const petWidth = Math.round(floatSize * 2.4);
  root?.style.setProperty("--pet-width", `${petWidth}px`);
  root?.style.setProperty("--pet-height", `${Math.round(petWidth * 1.38)}px`);

  chatName.textContent = state.name || "角色";
  chatStatus.textContent = statusLabel();

  const bubbleText = String(state.bubbleText || "").trim();
  bubble.textContent = bubbleText || "我在，找我吗？";

  const unread = Number(state.unread) || 0;
  badge.classList.toggle("show", unread > 0);
  badge.textContent = unread > 9 ? "9+" : String(unread);

  const useSprite = applyCustomLook();
  if (useSprite) syncSpriteFromState().catch(() => {});
  updateIncomingBubble();
  if (getAndroidBridge()) setNativeInputMode(mode === "chat");
  requestResize();
  syncClickThrough();
  paintCompanionActions();
}

function applyState(next = {}) {
  const sensing = next.sensing;
  Object.assign(state, next);
  if (next.display) state.display = { ...state.display, ...next.display };
  if (sensing && typeof sensing === "object") {
    state.sensing = {
      screenWatch: {
        enabled: Boolean(sensing.screenWatch?.enabled),
        intervalSec: Number(sensing.screenWatch?.intervalSec) || 15,
      },
      voiceChat: { enabled: Boolean(sensing.voiceChat?.enabled) },
      systemAudio: { enabled: Boolean(sensing.systemAudio?.enabled) },
    };
  }
  render();
}

function paintCompanionActions() {
  const listening = recorder?.state === "recording" || state.playState === "listening";
  const screenOn = Boolean(state.sensing?.screenWatch?.enabled);
  btnVoiceChat?.classList.toggle("is-active", Boolean(listening));
  btnShareScreen?.classList.toggle("is-active", screenOn);
  if (btnVoiceChat) {
    const small = btnVoiceChat.querySelector("small");
    if (small) small.textContent = listening ? "正在听你说…" : "点一下开始说话";
  }
  if (btnShareScreen) {
    const small = btnShareScreen.querySelector("small");
    if (small) {
      small.textContent = getAndroidBridge()?.captureScreen
        ? "点一下看当前屏幕"
        : screenOn
          ? `读屏中 · 每 ${state.sensing.screenWatch.intervalSec || 15}s`
          : "定时看屏幕陪聊";
    }
  }
}

function toggleScreenWatchCompanion() {
  const current = Boolean(state.sensing?.screenWatch?.enabled);
  const next = !current;
  const intervalSec = Number(state.sensing?.screenWatch?.intervalSec) || 15;
  const android = getAndroidBridge();
  if (android?.captureScreen) {
    captureScreen({ quiet: false });
    return;
  }
  const patch = {
    screenWatch: { enabled: next, intervalSec },
    voiceChat: { ...state.sensing?.voiceChat },
    systemAudio: { ...state.sensing?.systemAudio },
  };
  state.sensing = patch;
  getElectronPet()?.setSensing?.(patch);
  paintCompanionActions();
  if (next) {
    state.bubbleText = `好，我会定时看屏幕陪你（约每 ${intervalSec} 秒）。`;
    setLocalPlayState("capturing");
    render();
    captureScreen({ quiet: true });
  } else {
    state.bubbleText = "已关掉截帧读屏。";
    setLocalPlayState("idle");
    render();
  }
}

function openCompanion(prefer = "voice") {
  setMode("chat");
  if (prefer === "screen") {
    window.setTimeout(() => toggleScreenWatchCompanion(), 60);
    return;
  }
  window.setTimeout(() => {
    if (recorder?.state !== "recording") toggleRecording();
  }, 80);
}

function requestResize() {
  window.requestAnimationFrame(() => {
    const rect = root?.getBoundingClientRect();
    if (!rect) return;
    const android = getAndroidBridge();
    if (android?.resize) {
      const d = density();
      android.resize(Math.ceil(rect.width * d) + 10, Math.ceil(rect.height * d) + 10);
      return;
    }
    getElectronPet()?.resizeContent?.(Math.ceil(rect.width), Math.ceil(rect.height));
  });
}

function setNativeInputMode(enabled) {
  try {
    getAndroidBridge()?.setInputMode?.(Boolean(enabled));
  } catch {
    // Browser preview.
  }
}

function setMode(mode) {
  state.mode = ["collapsed", "bubble", "chat"].includes(mode) ? mode : "collapsed";
  if (state.mode !== "chat") setPosePanel(false);
  try {
    getAndroidBridge()?.setMode?.(state.mode);
  } catch {
    // Browser preview.
  }
  getElectronPet()?.setMode?.(state.mode);
  setNativeInputMode(state.mode === "chat");
  stickerPanel?.classList.remove("is-open");
  if (state.mode !== "chat" && recorder?.state === "recording") {
    try { recorder.stop(); } catch { /* ignore */ }
  }
  render();
  paintCompanionActions();
}

function syncClickThrough() {
  const electron = getElectronPet();
  if (!electron?.setClickThrough) return;
  electron.setClickThrough(state.mode === "collapsed" && !dragging);
}

function parseIncoming(raw) {
  if (!raw) return;
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof data.windowX === "number") windowX = data.windowX;
    if (typeof data.windowY === "number") windowY = data.windowY;
    applyState(data);
  } catch {
    // Ignore malformed host payloads.
  }
}

function parseNativeWindowMetrics(raw) {
  const metrics = parseBridgeJson(raw);
  if (Number.isFinite(Number(metrics.x))) windowX = Number(metrics.x);
  if (Number.isFinite(Number(metrics.y))) windowY = Number(metrics.y);
}

function sendTurn(payload = {}) {
  const text = String(payload.text || "").trim();
  if (text) appendThread(text, "user");
  setLocalPlayState("thinking");
  state.bubbleText = payload.imageDataUrl
    ? "我看一下你现在的画面..."
    : payload.audioDataUrl
      ? "听到了，我想一下..."
      : "让我想想...";
  render();

  const electron = getElectronPet();
  if (electron?.sendTurn) {
    electron.sendTurn(payload);
    return true;
  }

  const android = getAndroidBridge();
  if (android?.sendTurn) {
    try {
      android.sendTurn(JSON.stringify({
        text,
        audioDataUrl: String(payload.audioDataUrl || ""),
        imageDataUrl: String(payload.imageDataUrl || ""),
      }));
      return true;
    } catch {
      // Fall through to app entry.
    }
  } else if (android?.sendText && text) {
    try {
      android.sendText(text);
      return true;
    } catch {
      // Fall through to app entry.
    }
  }

  setLocalPlayState("reacting");
  state.bubbleText = "打开 App 后，我就能继续回应你。";
  render();
  return false;
}

async function captureViaBrowser() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("SCREEN_CAPTURE_UNAVAILABLE");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const maxWidth = 1080;
    const scale = Math.min(1, maxWidth / Math.max(1, video.videoWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function captureViaAndroid() {
  const android = getAndroidBridge();
  if (!android?.captureScreen) return null;
  return new Promise((resolve, reject) => {
    pendingNativeCapture = { resolve, reject };
    let started = false;
    try {
      started = Boolean(android.captureScreen());
    } catch (error) {
      pendingNativeCapture = null;
      reject(error);
      return;
    }
    if (!started) {
      pendingNativeCapture = null;
      reject(new Error("CAPTURE_ALREADY_ACTIVE"));
    }
  });
}

async function captureScreen({ quiet = false } = {}) {
  syncHostCapabilities();
  if (!hostCapabilities.screenCapture) {
    setLocalPlayState("reacting");
    state.bubbleText = hostCapabilities.screenCaptureReason || "当前宿主暂时不能看屏幕。";
    render();
    return;
  }
  if (!quiet) {
    setLocalPlayState("capturing");
    state.bubbleText = "我看一下你的屏幕...";
    render();
  }
  try {
    const electron = getElectronPet();
    const result = electron?.captureScreen
      ? await electron.captureScreen()
      : getAndroidBridge()?.captureScreen
        ? await captureViaAndroid()
        : { imageDataUrl: await captureViaBrowser() };
    if (!result?.imageDataUrl) throw new Error("SCREEN_CAPTURE_EMPTY");
    sendTurn({
      text: quiet
        ? "【读屏陪伴】这是刚才截到的屏幕画面。用简短陪伴语气告诉我你注意到了什么，不要列清单。"
        : "看看我现在的屏幕，先说你最注意到的东西，再像平时一样跟我聊。",
      imageDataUrl: result.imageDataUrl,
    });
  } catch (error) {
    setLocalPlayState("reacting");
    state.bubbleText = error?.name === "NotAllowedError" ? "好，我不看了。" : "这次没看到，再点一次试试。";
    render();
  } finally {
    paintCompanionActions();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("VOICE_READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

function stopRecordingTracks() {
  if (recordingTimer) window.clearTimeout(recordingTimer);
  recordingTimer = 0;
  recordingStream?.getTracks?.().forEach((track) => track.stop());
  recordingStream = null;
}

async function toggleRecording() {
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  syncHostCapabilities();
  if (!hostCapabilities.audio || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    state.bubbleText = hostCapabilities.audioReason || "当前宿主不能录音，我先陪你打字。";
    setLocalPlayState("reacting");
    render();
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
      btnMic?.classList.remove("is-recording");
      paintCompanionActions();
      const blob = new Blob(recordingChunks, { type: recorder.mimeType || "audio/webm" });
      stopRecordingTracks();
      try {
        sendTurn({ audioDataUrl: await blobToDataUrl(blob) });
      } catch {
        setLocalPlayState("reacting");
        state.bubbleText = "这段语音没有录好。";
        render();
      }
    }, { once: true });
    recorder.start(250);
    btnMic?.classList.add("is-recording");
    setLocalPlayState("listening");
    state.bubbleText = "我在听，你说就行。";
    render();
    paintCompanionActions();
    recordingTimer = window.setTimeout(() => {
      if (recorder?.state === "recording") recorder.stop();
    }, 15000);
  } catch (error) {
    stopRecordingTracks();
    setLocalPlayState("reacting");
    state.bubbleText = error?.name === "NotAllowedError" ? "没有麦克风权限也没关系。" : "麦克风暂时不可用。";
    render();
  }
}

function snapToEdge() {
  if (isElectron()) {
    getElectronPet()?.snapToEdge?.();
    return;
  }
  const android = getAndroidBridge();
  if (android?.snapToEdge) {
    try {
      android.snapToEdge();
      return;
    } catch {
      // Fall through for older hosts.
    }
  }
  windowX = Math.max(0, windowX);
  windowY = Math.max(0, windowY);
  try {
    android?.moveTo?.(windowX, windowY);
  } catch {
    // Browser preview.
  }
}

window.__yueqiApplyOverlayState = (raw) => parseIncoming(raw);
window.__yueqiNativeWindowChanged = (raw) => parseNativeWindowMetrics(raw);
window.__yueqiNativeCaptureResult = (raw) => {
  const payload = parseBridgeJson(raw);
  const pending = pendingNativeCapture;
  pendingNativeCapture = null;
  if (!pending) return;
  if (payload?.ok && String(payload.imageDataUrl || "").startsWith("data:image/")) {
    pending.resolve({ imageDataUrl: payload.imageDataUrl });
    return;
  }
  pending.reject(Object.assign(new Error(payload?.code || "CAPTURE_FAILED"), {
    name: payload?.code === "CAPTURE_DENIED" ? "NotAllowedError" : "Error",
  }));
};
try {
  const android = getAndroidBridge();
  if (android?.getState) parseIncoming(android.getState());
  if (android?.getWindowMetrics) parseNativeWindowMetrics(android.getWindowMetrics());
} catch {
  // Browser preview.
}
getElectronPet()?.onState?.((payload) => parseIncoming(payload));
getElectronPet()?.getState?.().then((payload) => parseIncoming(payload)).catch(() => {});

characterHit.addEventListener("pointerdown", (event) => {
  if (state.locked) return;
  dragging = true;
  moved = false;
  const android = getAndroidBridge();
  startX = android?.beginDrag ? event.screenX : event.clientX;
  startY = android?.beginDrag ? event.screenY : event.clientY;
  originX = windowX;
  originY = windowY;
  try { android?.beginDrag?.(event.screenX, event.screenY); } catch { /* older host */ }
  characterHit.setPointerCapture?.(event.pointerId);
  getElectronPet()?.setClickThrough?.(false);
});

characterHit.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const android = getAndroidBridge();
  const nativeDrag = Boolean(android?.dragTo);
  const dx = (nativeDrag ? event.screenX : event.clientX) - startX;
  const dy = (nativeDrag ? event.screenY : event.clientY) - startY;
  if (!moved && Math.abs(dx) + Math.abs(dy) > 4) {
    moved = true;
    playDragPose().catch(() => {});
  }
  if (isElectron()) {
    getElectronPet()?.dragBy?.(dx, dy);
    startX = event.clientX;
    startY = event.clientY;
    return;
  }
  if (nativeDrag) {
    try { android.dragTo(event.screenX, event.screenY); } catch { /* older host */ }
    return;
  }
  const d = density();
  windowX = Math.max(0, Math.round(originX + dx * d));
  windowY = Math.max(0, Math.round(originY + dy * d));
  try {
    getAndroidBridge()?.moveTo?.(windowX, windowY);
  } catch {
    // Browser preview.
  }
});

characterHit.addEventListener("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  const wasMoved = moved;
  const android = getAndroidBridge();
  try { android?.endDrag?.(moved); } catch { /* older host */ }
  if (moved) {
    if (!android?.endDrag) snapToEdge();
  } else {
    // Tap opens companion: voice chat / screen share — not feature routing
    if (state.mode === "chat") setMode("collapsed");
    else openCompanion("voice");
  }
  if (wasMoved) restoreAfterDrag();
  window.setTimeout(() => { moved = false; }, 0);
});

characterHit.addEventListener("pointercancel", () => {
  try { getAndroidBridge()?.endDrag?.(false); } catch { /* older host */ }
  dragging = false;
  moved = false;
  restoreAfterDrag();
  syncClickThrough();
});

function closeContextMenu() {
  if (!contextMenu) return;
  contextMenu.classList.remove("is-open");
  contextMenu.hidden = true;
}

function openContextMenu(clientX, clientY) {
  if (!contextMenu) return;
  contextMenu.hidden = false;
  contextMenu.classList.add("is-open");
  const pad = 8;
  const width = contextMenu.offsetWidth || 168;
  const height = contextMenu.offsetHeight || 200;
  const x = Math.max(pad, Math.min(window.innerWidth - width - pad, clientX));
  const y = Math.max(pad, Math.min(window.innerHeight - height - pad, clientY));
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  getElectronPet()?.setClickThrough?.(false);
  requestResize();
}

characterHit.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (state.locked) return;
  openContextMenu(event.clientX, event.clientY);
});

contextMenu?.addEventListener("click", (event) => {
  const companionBtn = event.target.closest("[data-companion]");
  if (companionBtn) {
    closeContextMenu();
    openCompanion(companionBtn.dataset.companion === "screen" ? "screen" : "voice");
    return;
  }
  const actionButton = event.target.closest("[data-pet-action]");
  if (actionButton) {
    closeContextMenu();
    requestPetAction(actionButton.dataset.petAction);
    return;
  }
  const menuBtn = event.target.closest("[data-pet-menu]");
  if (!menuBtn) return;
  const kind = menuBtn.dataset.petMenu;
  closeContextMenu();
  if (kind === "poses") {
    setMode("chat");
    setPosePanel(true);
    return;
  }
  if (kind === "auto-pose") {
    setPoseMode("auto").then(render).catch(() => {});
    return;
  }
  if (kind === "open-app") {
    try { getAndroidBridge()?.openApp?.(); } catch { /* browser */ }
    getElectronPet()?.openApp?.();
    return;
  }
  if (kind === "hide") {
    getElectronPet()?.hidePet?.();
    try { getAndroidBridge()?.closeOverlay?.(); } catch { /* browser */ }
    return;
  }
  if (kind === "quit") {
    stopRecordingTracks();
    try { getAndroidBridge()?.closeOverlay?.(); } catch { /* browser */ }
    getElectronPet()?.closePet?.();
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!contextMenu?.classList.contains("is-open")) return;
  if (contextMenu.contains(event.target) || characterHit.contains(event.target)) return;
  closeContextMenu();
});

bubble.addEventListener("click", () => openCompanion("voice"));
btnPoses?.addEventListener("click", () => {
  setPosePanel(!chat?.classList.contains("is-choosing-pose"));
});
posePanel?.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-pose-mode]");
  if (modeButton) {
    setPoseMode(modeButton.dataset.poseMode).then(render).catch(() => {});
    return;
  }
  const poseButton = event.target.closest("[data-pose-id]");
  if (!poseButton) return;
  playManualPose(poseButton.dataset.poseId).then(render).catch(() => {});
});
document.getElementById("btnCollapse")?.addEventListener("click", () => setMode("collapsed"));
document.getElementById("btnOpenApp")?.addEventListener("click", () => {
  try { getAndroidBridge()?.openApp?.(); } catch { /* browser */ }
  getElectronPet()?.openApp?.();
});
document.getElementById("btnClose")?.addEventListener("click", () => {
  stopRecordingTracks();
  try { getAndroidBridge()?.closeOverlay?.(); } catch { /* browser */ }
  getElectronPet()?.closePet?.();
});
btnShareScreen?.addEventListener("click", () => {
  if (state.mode !== "chat") setMode("chat");
  toggleScreenWatchCompanion();
});
btnVoiceChat?.addEventListener("click", () => {
  if (state.mode !== "chat") setMode("chat");
  toggleRecording();
});
document.getElementById("btnCapture")?.addEventListener("click", () => toggleScreenWatchCompanion());
btnMic?.addEventListener("click", () => toggleRecording());
stickerPanel?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sticker-text]");
  if (!button) return;
  stickerPanel.classList.remove("is-open");
  sendTurn({ text: button.dataset.stickerText || "" });
});
quickForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = quickInput.value.trim();
  if (!text) return;
  quickInput.value = "";
  sendTurn({ text });
});

root?.addEventListener("pointerenter", () => getElectronPet()?.setClickThrough?.(false));
root?.addEventListener("pointerleave", () => {
  if (state.mode === "collapsed" && !dragging) getElectronPet()?.setClickThrough?.(true);
});
window.addEventListener("resize", requestResize);
window.addEventListener("beforeunload", () => {
  stopRecordingTracks();
  sprite?.destroy?.();
});

renderPoseCatalog();
iconRefresh();
syncHostCapabilities();
render();
paintPoseUi();
paintCompanionActions();
