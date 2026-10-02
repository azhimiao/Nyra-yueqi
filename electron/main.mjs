import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, desktopCapturer } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createElectronHostCore } from "./host-core.mjs";
import { createPetV2Window, getPetV2Window } from "./pet-v2/create-window.mjs";
import { wirePetV2Ipc, pushPetV2FromApp } from "./pet-v2/wire-ipc.mjs";
import { handlePetV2DeepLinkPayload, isPetV2LaunchEnabled } from "./pet-v2/product-ipc.mjs";
import { buildOpenedReceipt } from "../packages/avatar-runtime/src/product-adapter.mjs";

export { createPetV2Window } from "./pet-v2/create-window.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WWW = path.join(ROOT, "www");
const isDev = process.argv.includes("--dev");
const DEV_ORIGIN = "http://127.0.0.1:5173";

const PET_MODES = new Set(["collapsed", "bubble", "chat"]);
const PET_PLAY_STATES = new Set(["idle", "talking", "thinking", "listening", "reacting", "capturing"]);
const PET_STATE_KEYS = new Set([
  "mode",
  "name",
  "lookDataUrl",
  "actionDataUrl",
  "lookId",
  "bubbleText",
  "unread",
  "playState",
  "emotion",
  "actionId",
  "spritePack",
  "asleep",
  "display",
  "locked",
]);
const DISPLAY_KEYS = new Set(["scale", "offsetX", "offsetY", "flipX", "anchor", "floatSize"]);
const DISPLAY_ANCHORS = new Set(["center", "center-bottom", "top"]);
const IMAGE_DATA_URL_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/]+={0,2}$/i;
const AUDIO_DATA_URL_RE = /^data:audio\/(?:webm|ogg|wav|mpeg|mp4)(?:;codecs=[a-z0-9._-]+)?;base64,[a-z0-9+/]+={0,2}$/i;

const STORE_PATH = () => path.join(app.getPath("userData"), "desktop-host.json");

const DEFAULT_STORE = {
  petX: null,
  petY: null,
  muted: true,
  openAtLogin: false,
  mode: "collapsed",
  /** Explicit ScreenCaptureGate grant — never implied by install or launch. */
  screenCaptureGrant: null,
  sensing: {
    screenWatch: { enabled: false, intervalSec: 15 },
    voiceChat: { enabled: false },
    systemAudio: { enabled: false },
  },
  state: {
    mode: "collapsed",
    name: "角色",
    spritePack: "yueqi-female",
    lookDataUrl: "",
    bubbleText: "",
    unread: 0,
    playState: "idle",
    display: { floatSize: 64, scale: 1, flipX: false },
  },
};

const SCREEN_INTERVALS = new Set([10, 15, 30, 60, 120]);

function sanitizeSensing(raw) {
  if (!isPlainObject(raw)) return { ...DEFAULT_STORE.sensing };
  const interval = Number(raw?.screenWatch?.intervalSec);
  return {
    screenWatch: {
      enabled: Boolean(raw?.screenWatch?.enabled),
      intervalSec: SCREEN_INTERVALS.has(interval) ? interval : 15,
    },
    voiceChat: {
      enabled: Boolean(raw?.voiceChat?.enabled),
    },
    systemAudio: {
      enabled: Boolean(raw?.systemAudio?.enabled),
    },
  };
}

let store = { ...DEFAULT_STORE, state: { ...DEFAULT_STORE.state } };
let petWindow = null;
let appWindow = null;
let tray = null;
let quitting = false;
let captureInFlight = null;
/** @type {ReturnType<typeof createElectronHostCore>|null} */
let hostCore = null;
const petV2Enabled = isPetV2LaunchEnabled(process.argv, process.env);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function finiteNumber(value, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return clean.length <= maxLength ? clean : null;
}

function validDataUrl(value, pattern, maxLength) {
  return typeof value === "string"
    && value.length <= maxLength
    && (value === "" || pattern.test(value));
}

function sanitizeDisplay(raw) {
  if (!isPlainObject(raw) || Object.keys(raw).some((key) => !DISPLAY_KEYS.has(key))) return null;
  const next = {};
  if (Object.hasOwn(raw, "scale")) {
    const value = finiteNumber(raw.scale, 0.4, 2.5);
    if (value === null) return null;
    next.scale = value;
  }
  if (Object.hasOwn(raw, "offsetX")) {
    const value = finiteNumber(raw.offsetX, -200, 200);
    if (value === null) return null;
    next.offsetX = value;
  }
  if (Object.hasOwn(raw, "offsetY")) {
    const value = finiteNumber(raw.offsetY, -200, 200);
    if (value === null) return null;
    next.offsetY = value;
  }
  if (Object.hasOwn(raw, "floatSize")) {
    const value = finiteNumber(raw.floatSize, 40, 160);
    if (value === null) return null;
    next.floatSize = value;
  }
  if (Object.hasOwn(raw, "flipX")) {
    if (typeof raw.flipX !== "boolean") return null;
    next.flipX = raw.flipX;
  }
  if (Object.hasOwn(raw, "anchor")) {
    if (typeof raw.anchor !== "string" || !DISPLAY_ANCHORS.has(raw.anchor)) return null;
    next.anchor = raw.anchor;
  }
  return next;
}

function sanitizePetStatePatch(raw) {
  if (!isPlainObject(raw) || Object.keys(raw).some((key) => !PET_STATE_KEYS.has(key))) return null;
  const next = {};
  for (const key of ["name", "lookId", "actionId", "emotion"]) {
    if (!Object.hasOwn(raw, key)) continue;
    const maxLength = key === "name" ? 80 : 120;
    const value = cleanText(raw[key], maxLength);
    if (value === null) return null;
    next[key] = value;
  }
  if (Object.hasOwn(raw, "spritePack")) {
    if (!["bubble", "yueqi-female", "yueqi-male", "xingli"].includes(raw.spritePack)) return null;
    next.spritePack = raw.spritePack === "legacy" ? "bubble" : raw.spritePack;
  }
  if (Object.hasOwn(raw, "asleep")) {
    if (typeof raw.asleep !== "boolean") return null;
    next.asleep = raw.asleep;
  }
  if (Object.hasOwn(raw, "bubbleText")) {
    const value = cleanText(raw.bubbleText, 1200);
    if (value === null) return null;
    next.bubbleText = value;
  }
  for (const key of ["lookDataUrl", "actionDataUrl"]) {
    if (!Object.hasOwn(raw, key)) continue;
    // Legacy character wardrobe blobs must never reach the overlay renderer.
    next[key] = "";
  }
  if (Object.hasOwn(raw, "mode")) {
    if (typeof raw.mode !== "string" || !PET_MODES.has(raw.mode)) return null;
    next.mode = raw.mode;
  }
  if (Object.hasOwn(raw, "playState")) {
    if (typeof raw.playState !== "string" || !PET_PLAY_STATES.has(raw.playState)) return null;
    next.playState = raw.playState;
  }
  if (Object.hasOwn(raw, "unread")) {
    const value = finiteNumber(raw.unread, 0, 999);
    if (value === null || !Number.isInteger(value)) return null;
    next.unread = value;
  }
  if (Object.hasOwn(raw, "locked")) {
    if (typeof raw.locked !== "boolean") return null;
    next.locked = raw.locked;
  }
  if (Object.hasOwn(raw, "display")) {
    const display = sanitizeDisplay(raw.display);
    if (!display) return null;
    next.display = display;
  }
  return next;
}

function sanitizePetTurn(raw) {
  const allowed = new Set(["text", "imageDataUrl", "audioDataUrl"]);
  if (!isPlainObject(raw) || Object.keys(raw).some((key) => !allowed.has(key))) return null;
  const text = Object.hasOwn(raw, "text") ? cleanText(raw.text, 1200) : "";
  if (text === null) return null;
  const imageDataUrl = Object.hasOwn(raw, "imageDataUrl") ? raw.imageDataUrl : "";
  const audioDataUrl = Object.hasOwn(raw, "audioDataUrl") ? raw.audioDataUrl : "";
  if (!validDataUrl(imageDataUrl, IMAGE_DATA_URL_RE, 4_000_000)) return null;
  if (!validDataUrl(audioDataUrl, AUDIO_DATA_URL_RE, 6_000_000)) return null;
  if (imageDataUrl && audioDataUrl) return null;
  if (!text && !imageDataUrl && !audioDataUrl) return null;
  return {
    text,
    imageDataUrl,
    audioDataUrl,
    source: imageDataUrl ? "desktop_screen" : audioDataUrl ? "desktop_voice" : "desktop_pet",
    createdAt: new Date().toISOString(),
  };
}

function readStore() {
  try {
    const raw = fs.readFileSync(STORE_PATH(), "utf8");
    const parsed = JSON.parse(raw);
    const state = sanitizePetStatePatch(parsed?.state);
    store = {
      ...DEFAULT_STORE,
      petX: Number.isInteger(parsed?.petX) ? parsed.petX : null,
      petY: Number.isInteger(parsed?.petY) ? parsed.petY : null,
      muted: Boolean(parsed?.muted),
      openAtLogin: Boolean(parsed?.openAtLogin),
      onboarded: parsed?.onboarded === true,
      mode: PET_MODES.has(parsed?.mode) ? parsed.mode : DEFAULT_STORE.mode,
      screenCaptureGrant: parsed?.screenCaptureGrant && typeof parsed.screenCaptureGrant === "object"
        ? parsed.screenCaptureGrant
        : null,
      sensing: sanitizeSensing(parsed?.sensing),
      state: {
        ...DEFAULT_STORE.state,
        ...(state || {}),
        lookDataUrl: "",
        actionDataUrl: "",
        display: { ...DEFAULT_STORE.state.display, ...(state?.display || {}) },
      },
    };
  } catch {
    store = { ...DEFAULT_STORE, state: { ...DEFAULT_STORE.state } };
  }
}

function writeStore() {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH()), { recursive: true });
    fs.writeFileSync(STORE_PATH(), JSON.stringify(store, null, 2), "utf8");
  } catch {
    // ignore disk errors
  }
}

function applyPetStatePatch(rawPatch) {
  const patch = sanitizePetStatePatch(rawPatch);
  if (!patch) return { ok: false, reason: "INVALID_PET_STATE" };
  store.state = {
    ...store.state,
    ...patch,
    display: patch.display
      ? { ...(store.state.display || {}), ...patch.display }
      : store.state.display,
  };
  if (patch.mode) store.mode = patch.mode;
  writeStore();
  pushStateToPet();
  return { ok: true };
}

function deliverPetV2DeepLinkToApp(result) {
  const target = createAppWindow({ show: true });
  const deliver = () => {
    if (!target || target.isDestroyed()) return;
    target.webContents.send("desktop:pet-v2-deep-link", {
      ok: result.ok,
      route: result.route || null,
      deepLink: result.route?.deepLink || null,
      artifactId: result.route?.artifactId || null,
      receipt: result.receipt || null,
      reason: result.reason || null,
    });
    if (result.ok && result.receipt) {
      target.webContents.send("desktop:pet-v2-opened-receipt", result.receipt);
    }
  };
  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once("did-finish-load", deliver);
  } else {
    deliver();
  }
  return result;
}

function onPetV2DeepLink(payload) {
  const result = handlePetV2DeepLinkPayload(payload, { buildOpenedReceipt });
  return deliverPetV2DeepLinkToApp(result);
}

function initHostCore() {
  hostCore = createElectronHostCore({
    getStore: () => store,
    writeStore,
    pushStateToPet,
    createAppWindow,
    updatePetState: (patch) => applyPetStatePatch(patch),
    sendToPetV2: (channel, payload) => pushPetV2FromApp(channel, payload),
  });
  // Never auto-grant on launch; drop stale grant when screenWatch is off.
  if (!store.sensing?.screenWatch?.enabled) {
    hostCore.captureGate.revoke();
  }
}

function wwwUrl(page) {
  if (isDev) {
    return `${DEV_ORIGIN}/${page}`;
  }
  return path.join(WWW, page);
}

function rendererUrlMatches(rawUrl, page) {
  try {
    const url = new URL(rawUrl);
    if (url.search || url.hash) return false;
    if (isDev) {
      return url.origin === DEV_ORIGIN && decodeURIComponent(url.pathname) === `/${page}`;
    }
    if (url.protocol !== "file:") return false;
    return path.resolve(fileURLToPath(url)) === path.resolve(path.join(WWW, page));
  } catch {
    return false;
  }
}

function lockRendererToPage(win, page) {
  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, targetUrl) => {
    if (!rendererUrlMatches(targetUrl, page)) event.preventDefault();
  });
  contents.on("will-redirect", (event, targetUrl) => {
    if (!rendererUrlMatches(targetUrl, page)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

function trustedRendererEvent(event, role) {
  const target = role === "pet" ? petWindow : appWindow;
  const page = role === "pet" ? "overlay.html" : "index.html";
  if (!target || target.isDestroyed() || event.sender !== target.webContents) return false;
  if (!event.senderFrame || event.senderFrame !== target.webContents.mainFrame) return false;
  return rendererUrlMatches(event.senderFrame.url, page);
}

function requireTrustedRenderer(event, role) {
  if (!trustedRendererEvent(event, role)) throw new Error("UNTRUSTED_RENDERER");
}

function loadPage(win, page) {
  lockRendererToPage(win, page);
  if (isDev) {
    win.loadURL(wwwUrl(page));
  } else {
    win.loadFile(wwwUrl(page));
  }
}

/** Soft screen clamp: free drag unless the pet would leave the screen almost entirely. */
function softKeepVisible(size) {
  return Math.max(48, Math.min(Math.round(size), Math.round(size * 0.45)));
}

function clampToDisplay(x, y, width, height) {
  const display = screen.getDisplayNearestPoint({
    x: Number(x) + width / 2,
    y: Number(y) + height / 2,
  });
  return softClampToWorkArea(x, y, width, height, display.workArea);
}

function softClampToWorkArea(x, y, width, height, area) {
  const keepX = softKeepVisible(width);
  const keepY = softKeepVisible(height);
  const minX = area.x + keepX - width;
  const maxX = area.x + area.width - keepX;
  const minY = area.y + keepY - height;
  const maxY = area.y + area.height - keepY;
  return {
    x: Math.round(Math.min(Math.max(minX, Number(x) || 0), maxX)),
    y: Math.round(Math.min(Math.max(minY, Number(y) || 0), maxY)),
  };
}

/** @deprecated keep name for callers; now soft-clamps only (no edge docking). */
function clampToWorkArea(x, y, width, height, area) {
  return softClampToWorkArea(x, y, width, height, area);
}

function resizePetContent(width, height) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const w = Math.round(Math.min(area.width, Math.max(72, Math.min(420, width))));
  const h = Math.round(Math.min(area.height, Math.max(72, Math.min(520, height))));
  const distances = [
    ["left", Math.abs(bounds.x - area.x)],
    ["right", Math.abs(area.x + area.width - (bounds.x + bounds.width))],
    ["top", Math.abs(bounds.y - area.y)],
    ["bottom", Math.abs(area.y + area.height - (bounds.y + bounds.height))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  const anchor = distances[0][0];
  let x = anchor === "right" ? bounds.x + bounds.width - w : bounds.x;
  let y = anchor === "bottom" ? bounds.y + bounds.height - h : bounds.y;
  const next = softClampToWorkArea(x, y, w, h, area);
  petWindow.setBounds({ x: next.x, y: next.y, width: w, height: h }, false);
  store.petX = next.x;
  store.petY = next.y;
  writeStore();
}

function snapPetToEdge() {
  // Product intent: free placement. On release we only soft-clamp so the pet
  // cannot disappear entirely — no forced edge docking.
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getBounds();
  const clamped = clampToDisplay(bounds.x, bounds.y, bounds.width, bounds.height);
  if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
    petWindow.setPosition(clamped.x, clamped.y);
  }
  store.petX = clamped.x;
  store.petY = clamped.y;
  writeStore();
}

function createPetWindow() {
  const width = 178;
  const height = 250;
  const primary = screen.getPrimaryDisplay().workArea;
  const defaultX = primary.x + primary.width - width - 24;
  const defaultY = primary.y + Math.round(primary.height * 0.55);
  const initial = clampToDisplay(store.petX ?? defaultX, store.petY ?? defaultY, width, height);

  petWindow = new BrowserWindow({
    width,
    height,
    x: initial.x,
    y: initial.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-pet.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  store.petX = initial.x;
  store.petY = initial.y;

  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setContentProtection(true);
  loadPage(petWindow, "overlay.html");

  petWindow.once("ready-to-show", () => {
    if (!store.muted) showPetWindow();
    else hidePetWindow();
    pushStateToPet();
  });

  petWindow.on("moved", () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [px, py] = petWindow.getPosition();
    store.petX = px;
    store.petY = py;
    writeStore();
  });

  petWindow.on("closed", () => {
    petWindow = null;
  });
}

function createAppWindow({ show = true } = {}) {
  if (appWindow && !appWindow.isDestroyed()) {
    if (show) {
      appWindow.show();
      appWindow.focus();
    }
    return appWindow;
  }

  appWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: "月栖",
    webPreferences: {
      preload: path.join(__dirname, "preload-app.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadPage(appWindow, "index.html");
  appWindow.once("ready-to-show", () => {
    if (show) appWindow.show();
  });
  appWindow.on("closed", () => {
    appWindow = null;
  });
  return appWindow;
}

function dispatchPetAction(actionIdRaw = "") {
  const actionId = String(actionIdRaw || "").trim().slice(0, 64);
  if (!actionId || !/^[a-zA-Z0-9_-]+$/.test(actionId)) return false;
  const target = createAppWindow({ show: false });
  const deliver = () => {
    if (!target || target.isDestroyed()) return;
    target.webContents.send("desktop:pet-action", { actionId });
  };
  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once("did-finish-load", deliver);
  } else {
    deliver();
  }
  return true;
}

function dispatchPetTurn(payload = {}) {
  const turn = sanitizePetTurn(payload);
  if (!turn) return false;

  store.state = {
    ...store.state,
    mode: "bubble",
    playState: "thinking",
    bubbleText: turn.imageDataUrl
      ? "我看一下你现在的画面..."
      : turn.audioDataUrl
        ? "我听到了，等我一下..."
        : "让我想想怎么回你...",
  };
  writeStore();
  pushStateToPet();

  const target = createAppWindow({ show: false });
  const deliver = () => {
    if (!target || target.isDestroyed()) return;
    target.webContents.send("desktop:pet-turn", turn);
  };
  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once("did-finish-load", deliver);
  } else {
    deliver();
  }
  return true;
}

async function captureDisplayNearPet() {
  if (captureInFlight) return captureInFlight;
  captureInFlight = captureDisplayNearPetOnce();
  try {
    return await captureInFlight;
  } finally {
    captureInFlight = null;
  }
}

async function captureDisplayNearPetOnce() {
  const gate = hostCore?.assertCaptureAllowed?.();
  if (!gate?.ok) {
    throw new Error(gate?.reason === "surface_mismatch" ? "SCREEN_CAPTURE_SURFACE_MISMATCH" : "SCREEN_CAPTURE_NO_GRANT");
  }
  if (!petWindow || petWindow.isDestroyed()) throw new Error("PET_WINDOW_UNAVAILABLE");
  const bounds = petWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  // 截帧时临时藏窗：以 muted 为准，不用 isVisible()（Win 透明窗会误报）
  const shouldRestoreAfterCapture = !store.muted;
  try {
    if (shouldRestoreAfterCapture) {
      petWindow.hide();
      await new Promise((resolve) => setTimeout(resolve, 90));
    }
    const targetWidth = Math.min(1280, Math.max(960, display.size.width));
    const targetHeight = Math.round(targetWidth * display.size.height / display.size.width);
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: targetWidth, height: targetHeight },
      fetchWindowIcons: false,
    });
    const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error("SCREEN_CAPTURE_EMPTY");
    const image = source.thumbnail;
    const size = image.getSize();
    const resized = size.width > 1080 ? image.resize({ width: 1080, quality: "good" }) : image;
    const finalSize = resized.getSize();
    return {
      imageDataUrl: `data:image/jpeg;base64,${resized.toJPEG(72).toString("base64")}`,
      width: finalSize.width,
      height: finalSize.height,
      displayId: String(display.id),
    };
  } finally {
    if (shouldRestoreAfterCapture && !store.muted && petWindow && !petWindow.isDestroyed()) {
      showPetWindow();
    }
  }
}

function pushStateToPet() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const payload = {
    ...store.state,
    mode: store.state.mode || store.mode || "collapsed",
    muted: store.muted,
    windowX: store.petX,
    windowY: store.petY,
    sensing: sanitizeSensing(store.sensing),
  };
  petWindow.webContents.send("pet:state", payload);
}

function notifyAppSensingChanged() {
  if (!appWindow || appWindow.isDestroyed()) return;
  appWindow.webContents.send("desktop:sensing-changed", sanitizeSensing(store.sensing));
}

function trayIcon() {
  const iconPath = path.join(__dirname, "assets", "tray-icon.png");
  if (fs.existsSync(iconPath)) {
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) return image;
  }
  // Fallback: solid coral 16x16
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVQ4T2NkYGD4z0ABYBzVMKoBQ9UAopswqgFEA0Y1gFgNjGoAsRoY1QBiNTCqAcRqYFQDRtUAAF3aBBLwqQvWAAAAAElFTkSuQmCC",
    "base64"
  );
  return nativeImage.createFromBuffer(png);
}

function hidePetWindow() {
  if (!petWindow || petWindow.isDestroyed()) return;
  try {
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  } catch {
    /* ignore */
  }
  petWindow.hide();
}

function showPetWindow() {
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
  if (!petWindow || petWindow.isDestroyed()) return;
  try {
    petWindow.setIgnoreMouseEvents(false);
  } catch {
    /* ignore */
  }
  petWindow.showInactive();
}

function rebuildTray() {
  if (tray) tray.destroy();
  tray = new Tray(trayIcon());
  tray.setToolTip("月栖桌面陪伴");
  const menu = Menu.buildFromTemplate([
    {
      label: store.muted ? "显示桌宠" : "隐藏桌宠",
      click: () => {
        store.muted = !store.muted;
        writeStore();
        if (!petWindow || petWindow.isDestroyed()) createPetWindow();
        if (store.muted) hidePetWindow();
        else showPetWindow();
        rebuildTray();
        notifyAppSensingChanged();
      },
    },
    {
      label: "打开月栖",
      click: () => createAppWindow(),
    },
    {
      label: "开机启动",
      type: "checkbox",
      checked: Boolean(store.openAtLogin),
      click: (item) => {
        store.openAtLogin = item.checked;
        writeStore();
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true });
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => createAppWindow());
}

function onTrusted(channel, role, argumentCount, listener) {
  ipcMain.on(channel, (event, ...args) => {
    if (!trustedRendererEvent(event, role) || args.length !== argumentCount) return;
    listener(...args);
  });
}

function handleTrusted(channel, role, argumentCount, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    requireTrustedRenderer(event, role);
    if (args.length !== argumentCount) throw new Error("INVALID_ARGUMENT_COUNT");
    return listener(...args);
  });
}

function wireIpc() {
  handleTrusted("pet:get-state", "pet", 0, () => ({
    ...store.state,
    muted: store.muted,
    mode: store.state.mode || "collapsed",
  }));

  onTrusted("pet:set-mode", "pet", 1, (mode) => {
    if (typeof mode !== "string" || !PET_MODES.has(mode)) return;
    store.mode = mode;
    store.state = { ...store.state, mode };
    writeStore();
  });

  onTrusted("pet:drag-by", "pet", 2, (dx, dy) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const safeDx = finiteNumber(dx, -2000, 2000);
    const safeDy = finiteNumber(dy, -2000, 2000);
    if (safeDx === null || safeDy === null) return;
    const [x, y] = petWindow.getPosition();
    const next = clampToDisplay(x + safeDx, y + safeDy, petWindow.getBounds().width, petWindow.getBounds().height);
    petWindow.setPosition(next.x, next.y);
  });

  onTrusted("pet:snap", "pet", 0, () => snapPetToEdge());

  onTrusted("pet:resize-content", "pet", 2, (width, height) => {
    const safeWidth = finiteNumber(width, 72, 420);
    const safeHeight = finiteNumber(height, 72, 520);
    if (safeWidth === null || safeHeight === null) return;
    resizePetContent(safeWidth, safeHeight);
  });

  onTrusted("pet:set-click-through", "pet", 1, (enabled) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    if (typeof enabled !== "boolean") return;
    petWindow.setIgnoreMouseEvents(enabled, { forward: true });
  });

  onTrusted("pet:send-turn", "pet", 1, (payload) => dispatchPetTurn(payload));

  onTrusted("pet:request-action", "pet", 1, (actionId) => {
    dispatchPetAction(actionId);
  });

  handleTrusted("pet:capture-screen", "pet", 0, () => {
    // Pet UI invoke is an explicit user gesture — store a short session grant first.
    if (hostCore && !hostCore.captureGate.hasActiveGrant()) {
      hostCore.captureGate.grant({
        surface: "windows-electron",
        scope: "session",
        ttlMs: 2 * 60 * 1000,
      });
    }
    return captureDisplayNearPet();
  });

  onTrusted("pet:open-app", "pet", 0, () => createAppWindow({ show: true }));

  onTrusted("pet:hide", "pet", 0, () => {
    store.muted = true;
    writeStore();
    hidePetWindow();
    rebuildTray();
    notifyAppSensingChanged();
  });

  onTrusted("pet:close", "pet", 0, () => {
    store.muted = true;
    writeStore();
    hidePetWindow();
    rebuildTray();
    notifyAppSensingChanged();
  });

  handleTrusted("desktop:get-host-info", "app", 0, () => ({
    platform: process.platform,
    muted: store.muted,
    openAtLogin: store.openAtLogin,
    // muted is source of truth; isVisible() is flaky on transparent Windows windows
    petVisible: !store.muted && Boolean(petWindow && !petWindow.isDestroyed()),
    sensing: sanitizeSensing(store.sensing),
    screenCaptureGranted: Boolean(hostCore?.captureGate?.hasActiveGrant?.()),
    screenCaptureGrant: hostCore?.captureGate?.getGrant?.() || null,
  }));

  handleTrusted("desktop:set-sensing", "app", 1, (raw) => {
    store.sensing = sanitizeSensing(raw);
    hostCore?.syncGrantFromSensing?.(store.sensing);
    writeStore();
    pushStateToPet();
    notifyAppSensingChanged();
    return {
      sensing: store.sensing,
      screenCaptureGranted: Boolean(hostCore?.captureGate?.hasActiveGrant?.()),
    };
  });

  handleTrusted("desktop:capture-screen", "app", 0, () => captureDisplayNearPet());

  handleTrusted("desktop:open-phone", "app", 0, async () => {
    if (!hostCore) {
      createAppWindow({ show: true });
      return { ok: true, action: "open-phone" };
    }
    return hostCore.openPhone();
  });

  handleTrusted("desktop:project-task", "app", 1, async (task) => {
    if (!hostCore) throw new Error("HOST_CORE_UNAVAILABLE");
    if (!isPlainObject(task)) throw new Error("INVALID_TASK_PROJECTION");
    return hostCore.projectTaskToPet(task);
  });

  handleTrusted("desktop:get-capture-grant", "app", 0, () => ({
    granted: Boolean(hostCore?.captureGate?.hasActiveGrant?.()),
    grant: hostCore?.captureGate?.getGrant?.() || null,
  }));

  handleTrusted("desktop:revoke-capture-grant", "app", 0, () => {
    hostCore?.captureGate?.revoke?.();
    store.sensing = sanitizeSensing({
      ...store.sensing,
      screenWatch: { ...store.sensing.screenWatch, enabled: false },
    });
    writeStore();
    pushStateToPet();
    notifyAppSensingChanged();
    return { granted: false };
  });

  handleTrusted("desktop:get-capture-source-id", "app", 0, async () => {
    if (!petWindow || petWindow.isDestroyed()) {
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
      return { sourceId: sources[0]?.id || "" };
    }
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
    const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
    return { sourceId: source?.id || "" };
  });

  handleTrusted("pet:get-sensing", "pet", 0, () => sanitizeSensing(store.sensing));

  onTrusted("pet:set-sensing", "pet", 1, (raw) => {
    const current = sanitizeSensing(store.sensing);
    const patch = isPlainObject(raw) ? raw : {};
    store.sensing = sanitizeSensing({
      screenWatch: {
        enabled: Object.hasOwn(patch, "screenWatch")
          ? Boolean(patch.screenWatch?.enabled)
          : current.screenWatch.enabled,
        intervalSec: Number.isFinite(Number(patch.screenWatch?.intervalSec))
          ? Number(patch.screenWatch.intervalSec)
          : current.screenWatch.intervalSec,
      },
      voiceChat: {
        enabled: Object.hasOwn(patch, "voiceChat")
          ? Boolean(patch.voiceChat?.enabled)
          : current.voiceChat.enabled,
      },
      systemAudio: {
        enabled: Object.hasOwn(patch, "systemAudio")
          ? Boolean(patch.systemAudio?.enabled)
          : current.systemAudio.enabled,
      },
    });
    hostCore?.syncGrantFromSensing?.(store.sensing);
    writeStore();
    pushStateToPet();
    notifyAppSensingChanged();
  });

  handleTrusted("desktop:update-pet-state", "app", 1, (rawPatch) => {
    const result = applyPetStatePatch(rawPatch);
    if (!result.ok) throw new Error(result.reason || "INVALID_PET_STATE");
    // 仅推状态，不要每次更新都 show——否则用户隐藏后会被状态推送再次拉起
    return { ok: true };
  });

  handleTrusted("desktop:set-muted", "app", 1, (muted) => {
    if (typeof muted !== "boolean") throw new Error("INVALID_MUTED_VALUE");
    store.muted = muted;
    writeStore();
    if (store.muted) hidePetWindow();
    else {
      showPetWindow();
      pushStateToPet();
    }
    rebuildTray();
    notifyAppSensingChanged();
    return { muted: store.muted };
  });

  handleTrusted("desktop:set-open-at-login", "app", 1, (enabled) => {
    if (typeof enabled !== "boolean") throw new Error("INVALID_LOGIN_VALUE");
    store.openAtLogin = enabled;
    writeStore();
    app.setLoginItemSettings({ openAtLogin: store.openAtLogin, openAsHidden: true });
    return { openAtLogin: store.openAtLogin };
  });

  handleTrusted("desktop:show-pet", "app", 0, () => {
    store.muted = false;
    writeStore();
    showPetWindow();
    pushStateToPet();
    rebuildTray();
    notifyAppSensingChanged();
    return { ok: true };
  });

  // CP-AV6 — additive pet-v2 projection (does not touch v1 pet:state channels)
  handleTrusted("desktop:pet-v2-send", "app", 2, (channel, payload) => {
    if (!petV2Enabled && !getPetV2Window()) {
      return { ok: false, reason: "pet_v2_disabled" };
    }
    return pushPetV2FromApp(channel, payload);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    createAppWindow();
  });

  app.whenReady().then(() => {
    const firstRun = !fs.existsSync(STORE_PATH());
    readStore();
    if (firstRun) store.onboarded = false;
    app.setLoginItemSettings({ openAtLogin: Boolean(store.openAtLogin), openAsHidden: true });
    initHostCore();
    wireIpc();
    if (petV2Enabled) {
      wirePetV2Ipc({ onDeepLink: onPetV2DeepLink });
      createPetV2Window({ userDataPath: app.getPath("userData") });
    }
    createPetWindow();
    rebuildTray();
    if (firstRun || store.onboarded === false) {
      store.onboarded = true;
      writeStore();
      createAppWindow();
    }
  });

  app.on("window-all-closed", () => {
    // Keep tray process alive on Windows/Linux; explicit Quit exits via tray.
    if (process.platform === "darwin") return;
  });

  app.on("before-quit", () => {
    quitting = true;
    writeStore();
  });

  app.on("activate", () => {
    createAppWindow();
  });
}
