import {
  isAndroidOverlaySupported,
  checkOverlayPermission,
  requestOverlayPermission,
  isOverlayRunning,
  updateOverlayState,
  openOemSettings,
  onOverlayEvent,
} from "../platform/companion-overlay.js";
import { getAvatarState, getAvatarActionPlayer } from "../avatar/character-page.js";
import { getCurrentLook } from "../avatar/looks-model.js";
import {
  COMPANION_LIFE_EVENT,
  buildCatalogPetOverlayState,
} from "../companion/pet-presence-bridge.js";
import { t } from "../i18n/index.js";

function tKeepAlive(key) {
  return t(`appShell.desktop.keepAlive.${key}`);
}

/**
 * Wire Android system-overlay controls in the companion character section.
 */
export function wireOverlayPresence(deps = {}) {
  const {
    root = document,
    companionRuntime,
    getActiveCharacterId,
    hideInAppFloat,
    showInAppFloat,
    refreshIcons,
    onQuickMessage,
  } = deps;

  const panels = () => Array.from(root.querySelectorAll("[data-overlay-presence]"));
  if (!panels().length) return { refresh: async () => {} };

  const nativeAndroid = isAndroidOverlaySupported();
  // `[data-desktop-status]` belongs to the in-app float toggle; keep system-overlay
  // copy in its own slot so the two status lines never overwrite each other.
  const statusEls = () => Array.from(root.querySelectorAll("[data-overlay-status]"));
  const startBtns = () => Array.from(root.querySelectorAll("[data-overlay-start]"));
  const stopBtns = () => Array.from(root.querySelectorAll("[data-overlay-stop]"));
  const permBtns = () => Array.from(root.querySelectorAll("[data-overlay-request-permission]"));
  const helpEls = () => Array.from(root.querySelectorAll("[data-overlay-help]"));
  let lastState = {};
  let running = false;
  let granted = false;

  function setStatus(text, kind = "idle") {
    statusEls().forEach((statusEl) => {
      statusEl.textContent = text;
      statusEl.dataset.kind = kind;
    });
  }

  async function buildOverlayState(extra = {}) {
    lastState = await buildCatalogPetOverlayState({
      companionRuntime,
      getActiveCharacterId,
      getAvatarState,
      getCurrentLook,
      getActionPlayer: getAvatarActionPlayer,
    }, {
      mode: extra.mode || lastState.mode || "collapsed",
      bubbleText: extra.bubbleText ?? lastState.bubbleText ?? "",
      ...extra,
    });
    return lastState;
  }

  async function refresh() {
    const supported = isAndroidOverlaySupported();
    panels().forEach((panel) => {
      const androidOnly = panel.hasAttribute("data-overlay-android-only");
      panel.dataset.supported = String(supported);
      panel.hidden = androidOnly && !supported;
    });

    if (!supported) {
      setStatus(tKeepAlive("unsupported"), "unsupported");
      startBtns().forEach((btn) => { btn.disabled = true; });
      stopBtns().forEach((btn) => { btn.disabled = true; });
      permBtns().forEach((btn) => { btn.disabled = true; });
      helpEls().forEach((helpEl) => { helpEl.hidden = true; });
      return;
    }

    // A flaky OEM host must not abort init and leave the pet controls half-wired.
    try {
      const perm = await checkOverlayPermission();
      granted = Boolean(perm?.granted);
      running = await isOverlayRunning();
    } catch (error) {
      granted = false;
      running = false;
      console.warn("overlay permission probe failed", error);
    }

    startBtns().forEach((btn) => { btn.disabled = running; });
    stopBtns().forEach((btn) => { btn.disabled = !running; });
    permBtns().forEach((btn) => { btn.hidden = granted; });
    helpEls().forEach((helpEl) => { helpEl.hidden = false; });

    if (!granted) {
      setStatus(tKeepAlive("denied"), "denied");
    } else if (running) {
      setStatus(tKeepAlive("running"), "running");
      const state = await buildOverlayState();
      await updateOverlayState(state).catch(() => {});
    } else {
      setStatus(tKeepAlive("ready"), "ready");
    }
    refreshIcons?.();
  }

  root.addEventListener("click", (event) => {
    const startBtn = event.target?.closest?.("[data-overlay-start]");
    if (startBtn && root.contains(startBtn)) {
      window.dispatchEvent(new CustomEvent("yueqi:desk-pet-set", { detail: { enabled: true } }));
      return;
    }
    const stopBtn = event.target?.closest?.("[data-overlay-stop]");
    if (stopBtn && root.contains(stopBtn)) {
      window.dispatchEvent(new CustomEvent("yueqi:desk-pet-set", { detail: { enabled: false } }));
      return;
    }
    const permBtn = event.target?.closest?.("[data-overlay-request-permission]");
    if (permBtn && root.contains(permBtn)) {
      requestOverlayPermission().then(() => {
        setStatus(tKeepAlive("permissionOpened"), "denied");
        window.setTimeout(() => refresh(), 800);
      }).catch(() => {});
      return;
    }
    const batteryBtn = event.target?.closest?.("[data-overlay-oem-battery]");
    if (batteryBtn && root.contains(batteryBtn)) {
      openOemSettings("battery");
      return;
    }
    const autostartBtn = event.target?.closest?.("[data-overlay-oem-autostart]");
    if (autostartBtn && root.contains(autostartBtn)) {
      openOemSettings("autostart");
      setStatus(tKeepAlive("autostartHint"), "denied");
      return;
    }
    const appBtn = event.target?.closest?.("[data-overlay-oem-app]");
    if (appBtn && root.contains(appBtn)) {
      openOemSettings("app");
    }
  });

  onOverlayEvent("overlayStopped", () => {
    running = false;
    // Overlay died or user stopped it. If they still want the pet, the
    // in-app orb covers both shells until the system window is back.
    showInAppFloat?.();
    refresh();
  });

  onOverlayEvent("quickMessage", (payload) => {
    const text = String(payload?.text || "").trim();
    const audioDataUrl = String(payload?.audioDataUrl || "");
    const imageDataUrl = String(payload?.imageDataUrl || "");
    if (text || audioDataUrl.startsWith("data:audio/") || imageDataUrl.startsWith("data:image/")) {
      onQuickMessage?.({ text, audioDataUrl, imageDataUrl, source: "android_overlay" });
    }
  });

  document.addEventListener("yueqi:avatar-look", () => {
    if (!running) return;
    buildOverlayState().then((state) => updateOverlayState(state)).catch(() => {});
  });

  document.addEventListener("yueqi:avatar-action", () => {
    if (!running) return;
    buildOverlayState().then((state) => updateOverlayState(state)).catch(() => {});
  });

  document.addEventListener("yueqi:runtime", (event) => {
    if (!running) return;
    const runtime = event.detail?.state;
    if (!runtime) return;
    buildOverlayState({
      name: runtime.characterName || lastState.name,
      unread: runtime.unreadCount || 0,
      playState: runtime.playState || "idle",
      actionId: runtime.actionId || "idle_default",
      emotion: runtime.emotion || "neutral",
      asleep: Boolean(runtime.asleep),
      bubbleText: runtime.lastMessageText || runtime.lastProactiveText || lastState.bubbleText || "",
      mode: (runtime.lastMessageText || runtime.lastProactiveText) && lastState.mode === "collapsed" ? "bubble" : lastState.mode,
    })
      .then((state) => updateOverlayState(state))
      .catch(() => {});
  });

  document.addEventListener(COMPANION_LIFE_EVENT, () => {
    if (!running) return;
    buildOverlayState()
      .then((state) => updateOverlayState(state))
      .catch(() => {});
  });

  window.addEventListener("focus", () => {
    if (nativeAndroid) refresh().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (nativeAndroid && document.visibilityState === "visible") refresh().catch(() => {});
  });

  refresh().catch((error) => console.warn("overlay presence refresh failed", error));
  return {
    refresh,
    isRunning: () => running,
    pushState: async (extra) => {
      if (!running) return;
      const state = await buildOverlayState(extra);
      await updateOverlayState(state);
    },
  };
}
