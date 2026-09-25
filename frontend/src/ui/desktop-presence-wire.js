import {
  isElectronDesktop,
  getDesktopHostInfo,
  updateDesktopPetState,
  setDesktopPetMuted,
  setDesktopOpenAtLogin,
  showDesktopPet,
  onDesktopPetAction,
  onDesktopSensingChanged,
} from "../platform/desktop-host.js";
import {
  isAndroidOverlaySupported,
  isOverlayRunning,
  startOverlay,
  stopOverlay,
  requestBatteryExemption,
  waitForOverlayRunning,
  onOverlayEvent,
} from "../platform/companion-overlay.js";
import { capabilityPermissionBroker } from "../platform/native-capabilities.js";
import { getAvatarState, getAvatarActionPlayer } from "../avatar/character-page.js";
import { getCurrentLook } from "../avatar/looks-model.js";
import {
  applySensing,
  loadPetSensingFromHost,
  normalizePetSensing,
  savePetSensing,
  stopAll as stopPetSensing,
  toggleScreenWatch,
  wirePetSensing,
} from "../desktop/pet-sensing.js";
import {
  COMPANION_LIFE_EVENT,
  buildCatalogPetOverlayState,
} from "../companion/pet-presence-bridge.js";
import { t } from "../i18n/index.js";
import {
  readBrowserPetEnabled,
  writeBrowserPetEnabled,
} from "./pet-visibility-pref.js";
import {
  isAppShellVisible,
  shouldHideInAppFloat,
} from "./pet-presence-visibility.js";
import { saveAutonomyPrefs } from "../companion/autonomy-prefs.js";
import {
  resolveDeskPetPowerOn,
  shouldRestoreOverlay,
} from "./pet-power-control.js";

const DESKTOP_PRESENCE_REASON_KEY = "yueqi.desktopPresence.lastStartReason";
const PENDING_ENABLE_KEY = "yueqi.desktopPresence.pendingEnable";

function readPendingEnable() {
  try {
    return localStorage.getItem(PENDING_ENABLE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePendingEnable(enabled) {
  try {
    if (enabled) localStorage.setItem(PENDING_ENABLE_KEY, "1");
    else localStorage.removeItem(PENDING_ENABLE_KEY);
  } catch {
    /* ignore quota */
  }
}

function writeDesktopPresenceReason(reason) {
  try {
    if (reason) localStorage.setItem(DESKTOP_PRESENCE_REASON_KEY, String(reason));
    else localStorage.removeItem(DESKTOP_PRESENCE_REASON_KEY);
  } catch {
    /* presence state is best effort */
  }
}

function syncDeskPetVisiblePref(enabled) {
  try {
    saveAutonomyPrefs({ deskPetVisible: Boolean(enabled) });
  } catch {
    /* autonomy storage optional during early boot */
  }
}

export async function getDesktopPresenceState() {
  const enabled = readBrowserPetEnabled();
  if (!isAndroidOverlaySupported()) {
    return {
      enabled,
      overlayPermission: "not_applicable",
      serviceRunning: false,
      visible: enabled,
      lastStartReason: localStorage.getItem(DESKTOP_PRESENCE_REASON_KEY) || "",
    };
  }
  const capability = await capabilityPermissionBroker.getCapabilityStatus("desktop.overlay");
  const serviceRunning = capability.granted ? await isOverlayRunning() : false;
  return {
    enabled,
    overlayPermission: capability.osStatus || capability.status,
    serviceRunning,
    visible: enabled && serviceRunning,
    lastStartReason: localStorage.getItem(DESKTOP_PRESENCE_REASON_KEY) || "",
  };
}

function ensureAppShellInteractive() {
  const root = document.documentElement;
  if (!root.classList.contains("app-boot-ready")
    && !root.classList.contains("immediate-phone-ready")) {
    root.classList.add("app-boot-ready");
  }
}

function setInAppFloatHidden(hidden) {
  const float = document.querySelector("[data-companion-float]");
  if (!float) return;
  float.classList.toggle("is-system-overlay-hidden", Boolean(hidden));
  if (hidden) {
    float.classList.remove("is-open");
    float.setAttribute("aria-expanded", "false");
    const panel = float.querySelector("[data-companion-float-panel]");
    if (panel) panel.hidden = true;
  }
}

export function isInAppFloatPreferredOn() {
  return readBrowserPetEnabled();
}

export function setInAppFloatPreferredOn(enabled) {
  const on = Boolean(enabled);
  writeBrowserPetEnabled(on);
  // Android visuals go through syncInAppFloatToOverlay: keep the in-app orb
  // while Yueqi is on screen; only hide it when the system overlay is the
  // live pet outside the app.
  if (isAndroidOverlaySupported()) return on;
  setInAppFloatHidden(!on);
  return on;
}

function syncInAppFloatToOverlay(overlayRunning, wantOn) {
  const float = document.querySelector("[data-companion-float]");
  const hide = shouldHideInAppFloat({
    wantOn,
    overlayRunning,
    appVisible: isAppShellVisible(),
  });
  if (overlayRunning && hide) {
    if (float) float.dataset.systemOverlay = "1";
  } else if (float) {
    delete float.dataset.systemOverlay;
  }
  setInAppFloatHidden(hide);
}

/**
 * Wire Windows Electron desktop pet + companion sensing controls.
 */
export function wireDesktopPresence(deps = {}) {
  const {
    root = document,
    companionRuntime,
    getActiveCharacterId,
    refreshIcons,
    onSubmitTurn,
  } = deps;

  const PET_POWER_SELECTOR = "[data-desktop-pet-power], [data-chat-pet-toggle]";
  const panel = root.querySelector("[data-desktop-presence]");
  // Chat header and companion-hub power must share this handler even if the
  // companion hero has not painted yet.
  if (!panel && !root.querySelector(PET_POWER_SELECTOR)) {
    return { refresh: async () => {}, togglePet: async () => {} };
  }

  const statusEl = panel?.querySelector("[data-desktop-status]") || root.querySelector("[data-desktop-status]");
  const showBtns = () => Array.from(root.querySelectorAll("[data-desktop-show-pet]"));
  const hideBtns = () => Array.from(root.querySelectorAll("[data-desktop-hide-pet]"));
  const powerBtns = () => Array.from(root.querySelectorAll(PET_POWER_SELECTOR));
  const powerLabels = () => Array.from(root.querySelectorAll("[data-desktop-pet-power-label]"));
  const loginToggle = root.querySelector("[data-desktop-open-at-login]");
  const loginRow = root.querySelector("[data-desktop-open-at-login-row]") || loginToggle?.closest("label");
  const loginHint = root.querySelector("[data-desktop-open-at-login-hint]");
  const screenToggle = root.querySelector("[data-sensing-screen]");
  const screenInterval = root.querySelector("[data-sensing-screen-interval]");
  const voiceToggle = root.querySelector("[data-sensing-voice]");
  const systemAudioToggle = root.querySelector("[data-sensing-system-audio]");
  const sensingHint = root.querySelector("[data-sensing-hint]");

  const sensingApi = wirePetSensing({
    onSubmitTurn: onSubmitTurn || (async () => false),
  });

  let latestSensing = normalizePetSensing();
  let petOn = false;
  let petBusy = false;
  let petEventBusy = false;
  let petGeneration = 0;
  let closingPet = false;

  function isPowerOn() {
    return resolveDeskPetPowerOn(petOn, readBrowserPetEnabled());
  }

  function beginCloseGeneration() {
    petGeneration += 1;
    closingPet = true;
    return petGeneration;
  }

  function isStale(generation) {
    return generation !== petGeneration;
  }

  function raceTimeout(promise, ms, fallback) {
    let timer = 0;
    return Promise.race([
      Promise.resolve(promise).finally(() => window.clearTimeout(timer)),
      new Promise((resolve) => {
        timer = window.setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  }

  function setLoginToggleAvailable(available) {
    if (!loginToggle) return;
    loginToggle.disabled = !available;
    loginRow?.classList.toggle("is-unavailable", !available);
    if (loginHint) loginHint.hidden = available;
  }

  function paintPowerUi(visible, { enabled = true } = {}) {
    petOn = Boolean(visible);
    const available = Boolean(enabled);
    const on = available && petOn;

    powerBtns().forEach((btn) => {
      btn.disabled = false;
      btn.classList.toggle("is-on", on);
      btn.classList.remove("is-unavailable");
      btn.setAttribute("aria-pressed", String(on));
      btn.title = petOn ? t("chat.petOnTitle") : t("chat.petOffTitle");
    });

    powerLabels().forEach((label) => {
      label.textContent = petOn ? t("chat.petOnLabel") : t("chat.petOffLabel");
    });

    root.querySelectorAll("[data-pet-float]").forEach((btn) => {
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", String(on));
    });

    showBtns().forEach((btn) => {
      btn.disabled = !available;
      btn.classList.toggle("is-active", available && !petOn);
    });
    hideBtns().forEach((btn) => {
      btn.disabled = !available;
      btn.classList.toggle("is-active", available && petOn);
    });
  }

  async function buildPetState(extra = {}) {
    return buildCatalogPetOverlayState({
      companionRuntime,
      getActiveCharacterId,
      getAvatarState,
      getCurrentLook,
      getActionPlayer: getAvatarActionPlayer,
      fallbackName: t("character.fallbackName"),
    }, extra);
  }

  async function pushState(extra = {}) {
    if (!isElectronDesktop()) return;
    const state = await buildPetState(extra);
    await updateDesktopPetState(state);
  }

  async function handlePetAction(actionIdRaw) {
    const actionId = String(actionIdRaw || "").trim();
    if (!actionId) return;
    const player = getAvatarActionPlayer();
    if (!player) return;
    if (actionId === "idle_default") await player.idle?.();
    else await player.playAction?.(actionId);
    await pushState();
  }

  function setStatus(text, kind = "idle") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
  }

  function paintSensingUi(sensing) {
    latestSensing = normalizePetSensing(sensing);
    if (screenToggle) screenToggle.checked = latestSensing.screenWatch.enabled;
    if (screenInterval) {
      screenInterval.value = String(latestSensing.screenWatch.intervalSec);
      screenInterval.disabled = !latestSensing.screenWatch.enabled;
    }
    if (voiceToggle) voiceToggle.checked = latestSensing.voiceChat.enabled;
    if (systemAudioToggle) systemAudioToggle.checked = latestSensing.systemAudio.enabled;
    if (sensingHint) {
      sensingHint.textContent = latestSensing.screenWatch.enabled
        ? t("pages.companionChrome.petSensingHintOn", { interval: latestSensing.screenWatch.intervalSec })
        : t("pages.companionChrome.petSensingHintOff");
    }
  }

  async function syncSensingLoops(petVisible) {
    await applySensing(latestSensing, { petVisible: Boolean(petVisible) });
  }

  async function persistSensingPatch(patch) {
    latestSensing = await savePetSensing(patch);
    paintSensingUi(latestSensing);
    const info = await getDesktopHostInfo();
    await syncSensingLoops(!info.muted);
  }

  async function refresh() {
    const inElectron = isElectronDesktop();
    if (panel) panel.dataset.electron = String(inElectron);

    if (!inElectron) {
      const nativeAndroid = isAndroidOverlaySupported();
      const browserOn = readBrowserPetEnabled();
      if (nativeAndroid) {
        const capability = await capabilityPermissionBroker.getCapabilityStatus("desktop.overlay");
        const granted = Boolean(capability.granted);
        if (!granted) {
          const wantOn = browserOn || readPendingEnable();
          syncInAppFloatToOverlay(false, wantOn);
          paintPowerUi(wantOn, { enabled: true });
          setStatus(
            readPendingEnable()
              ? t("appShell.desktop.overlayPermissionGuide")
              : t("appShell.desktop.overlayPermissionNeeded"),
            "hint",
          );
          refreshIcons?.();
          return;
        }
        if (readPendingEnable()) {
          writePendingEnable(false);
          setInAppFloatPreferredOn(true);
          syncDeskPetVisiblePref(true);
        }
        const wantOn = readBrowserPetEnabled();
        if (wantOn) {
          // Keep the in-app orb up until the system window is actually added.
          // Chat and pet-hub share this path — do not hide first and hope.
          syncInAppFloatToOverlay(false, true);
          let runningNow = await isOverlayRunning();
          if (shouldRestoreOverlay({
            wantOn: readBrowserPetEnabled(),
            running: runningNow,
            closing: closingPet,
          })) {
            try {
              const started = await raceTimeout(
                startOverlay(await buildPetState({ mode: "collapsed" })),
                5000,
                { running: false },
              );
              runningNow = Boolean(started?.running) || await waitForOverlayRunning(800);
            } catch (error) {
              console.warn("restore Android overlay failed", error);
              runningNow = await isOverlayRunning();
            }
            if (closingPet || !readBrowserPetEnabled()) {
              await raceTimeout(stopOverlay(), 4000, { running: false }).catch(() => {});
              runningNow = false;
            }
          }
          syncInAppFloatToOverlay(runningNow, true);
          paintPowerUi(true, { enabled: true });
          setStatus(
            runningNow
              ? t("appShell.desktop.overlayRunning")
              : t("appShell.desktop.overlayStarting"),
            runningNow ? "running" : "hint",
          );
          refreshIcons?.();
          return;
        }
        await stopOverlay().catch(() => {});
        syncInAppFloatToOverlay(false, false);
        paintPowerUi(false, { enabled: true });
        setStatus(t("pages.companionChrome.petFloatOff"), "hint");
        refreshIcons?.();
        return;
      }
      if (!document.querySelector("[data-companion-float]")?.dataset.systemOverlay) {
        setInAppFloatHidden(!browserOn);
      }
      paintPowerUi(browserOn, { enabled: true });
      setStatus(
        browserOn
          ? t("pages.companionChrome.petPreviewOn")
          : t("pages.companionChrome.petPreviewOff"),
        "hint",
      );
      if (loginToggle) {
        loginToggle.checked = false;
        setLoginToggleAvailable(false);
      }
      [screenToggle, screenInterval, voiceToggle, systemAudioToggle].forEach((node) => {
        if (node) node.disabled = true;
      });
      stopPetSensing();
      refreshIcons?.();
      return;
    }

    const info = await getDesktopHostInfo();
    latestSensing = normalizePetSensing(info.sensing || await loadPetSensingFromHost());
    paintSensingUi(latestSensing);

    if (loginToggle) {
      setLoginToggleAvailable(true);
      loginToggle.checked = Boolean(info.openAtLogin);
    }

    const visible = !Boolean(info.muted);
    paintPowerUi(visible, { enabled: true });
    setInAppFloatHidden(true);
    [screenToggle, voiceToggle, systemAudioToggle].forEach((node) => {
      if (node) node.disabled = false;
    });
    if (screenInterval) screenInterval.disabled = !latestSensing.screenWatch.enabled;

    if (!visible) {
      setStatus(t("pages.companionChrome.petStatusOff"), "hidden");
      stopPetSensing();
    } else {
      setStatus(t("pages.companionChrome.petStatusOn"), "running");
      await pushState();
      await syncSensingLoops(true);
    }
    refreshIcons?.();
  }

  async function openPet() {
    const generation = petGeneration;
    if (!isElectronDesktop()) {
      if (isAndroidOverlaySupported()) {
        if (isStale(generation)) return;
        setStatus(t("appShell.desktop.overlayStarting"), "hint");
        setInAppFloatPreferredOn(true);
        syncDeskPetVisiblePref(true);
        let granted = false;
        try {
          const status = await raceTimeout(
            capabilityPermissionBroker.getCapabilityStatus("desktop.overlay"),
            2500,
            null,
          );
          if (status === null) granted = null;
          else granted = Boolean(status?.granted);
        } catch {
          granted = false;
        }
        if (isStale(generation)) return;
        if (granted === false) {
          writePendingEnable(true);
          const permission = await raceTimeout(
            capabilityPermissionBroker.requestCapability("desktop.overlay", {
              userGesture: true,
            }),
            4000,
            null,
          );
          granted = Boolean(permission?.granted);
        }
        if (isStale(generation)) return;
        if (granted === false) {
          syncInAppFloatToOverlay(false, true);
          paintPowerUi(true, { enabled: true });
          setStatus(t("appShell.desktop.overlayPermissionGuide"), "hint");
          return;
        }
        writePendingEnable(false);
        writeDesktopPresenceReason("user_toggle");
        // Show the in-app orb immediately. Overlay start is for leaving the app;
        // do not wait on it, and do not hide the orb if the service only claims
        // to be running.
        syncInAppFloatToOverlay(false, true);
        paintPowerUi(true, { enabled: true });
        setStatus(t("appShell.desktop.overlayStarting"), "hint");
        const state = await buildPetState({ mode: "collapsed" });
        if (isStale(generation)) return;
        let runningNow = false;
        try {
          const started = await raceTimeout(startOverlay(state), 5000, { running: false });
          if (isStale(generation)) return;
          runningNow = Boolean(started?.running) || await waitForOverlayRunning(800);
          if (isStale(generation)) return;
          await requestBatteryExemption().catch(() => {});
        } catch (error) {
          if (isStale(generation)) return;
          syncInAppFloatToOverlay(false, true);
          paintPowerUi(true, { enabled: true });
          setStatus(error?.message || t("appShell.desktop.overlayPermissionNeeded"), "hint");
          return;
        }
        if (isStale(generation)) return;
        syncInAppFloatToOverlay(runningNow, true);
        paintPowerUi(true, { enabled: true });
        setStatus(
          runningNow
            ? t("appShell.desktop.overlayRunning")
            : t("appShell.desktop.overlayStarting"),
          runningNow ? "running" : "hint",
        );
        return;
      }
      setInAppFloatPreferredOn(true);
      syncDeskPetVisiblePref(true);
      writeDesktopPresenceReason("user_toggle");
      setInAppFloatHidden(false);
      paintPowerUi(true, { enabled: true });
      setStatus(t("pages.companionChrome.petBrowserPreviewOn"), "running");
      return;
    }
    await showDesktopPet();
    await setDesktopPetMuted(false);
    syncDeskPetVisiblePref(true);
    await pushState({ mode: "collapsed" });
    await refresh();
  }

  async function closePet() {
    beginCloseGeneration();
    if (!isElectronDesktop()) {
      writePendingEnable(false);
      setInAppFloatPreferredOn(false);
      syncDeskPetVisiblePref(false);
      writeDesktopPresenceReason("user_toggle_off");
      if (isAndroidOverlaySupported()) {
        await raceTimeout(stopOverlay(), 4000, { running: false }).catch(() => {});
      }
      closingPet = false;
      syncInAppFloatToOverlay(false, false);
      paintPowerUi(false, { enabled: true });
      setStatus(
        isAndroidOverlaySupported()
          ? t("pages.companionChrome.petFloatOff")
          : t("pages.companionChrome.petBrowserPreviewClosed"),
        "hidden",
      );
      stopPetSensing();
      return;
    }
    stopPetSensing();
    await setDesktopPetMuted(true);
    syncDeskPetVisiblePref(false);
    closingPet = false;
    await refresh();
  }

  async function togglePet() {
    // Off must win even while openPet is still asking for permission / attaching.
    if (isPowerOn()) {
      await closePet();
      return;
    }
    if (petBusy) return;
    petBusy = true;
    try {
      await openPet();
    } finally {
      petBusy = false;
      ensureAppShellInteractive();
    }
  }

  // Chat header, pet-library hero, and any later clones share one handler.
  root.addEventListener("click", (event) => {
    const power = event.target?.closest?.(PET_POWER_SELECTOR);
    if (power && root.contains(power)) {
      event.preventDefault();
      togglePet().catch((error) => console.warn("toggle pet failed", error));
      return;
    }
    const show = event.target?.closest?.("[data-desktop-show-pet]");
    if (show && root.contains(show)) {
      openPet().catch((error) => console.warn("open pet failed", error));
      return;
    }
    const hide = event.target?.closest?.("[data-desktop-hide-pet]");
    if (hide && root.contains(hide)) {
      closePet().catch((error) => console.warn("close pet failed", error));
    }
  });

  loginRow?.addEventListener("click", (event) => {
    if (isElectronDesktop()) return;
    event.preventDefault();
    setStatus(t("pages.companionChrome.petLoginAtStartupDesktopOnly"), "hint");
  });

  loginToggle?.addEventListener("change", async () => {
    if (!isElectronDesktop()) {
      loginToggle.checked = false;
      setLoginToggleAvailable(false);
      setStatus(t("pages.companionChrome.petLoginAtStartupDesktopOnly"), "hint");
      return;
    }
    await setDesktopOpenAtLogin(Boolean(loginToggle.checked));
    await refresh();
  });

  screenToggle?.addEventListener("change", async () => {
    await persistSensingPatch({
      screenWatch: {
        enabled: Boolean(screenToggle.checked),
        intervalSec: Number(screenInterval?.value) || latestSensing.screenWatch.intervalSec,
      },
    });
  });

  screenInterval?.addEventListener("change", async () => {
    await persistSensingPatch({
      screenWatch: {
        enabled: Boolean(screenToggle?.checked),
        intervalSec: Number(screenInterval.value) || 15,
      },
    });
  });

  voiceToggle?.addEventListener("change", async () => {
    await persistSensingPatch({
      voiceChat: { enabled: Boolean(voiceToggle.checked) },
    });
  });

  systemAudioToggle?.addEventListener("change", async () => {
    await persistSensingPatch({
      systemAudio: { enabled: Boolean(systemAudioToggle.checked) },
    });
  });

  document.addEventListener("yueqi:avatar-look", () => {
    pushState().catch(() => {});
  });

  document.addEventListener("yueqi:avatar-action", () => {
    pushState().catch(() => {});
  });

  document.addEventListener("yueqi:runtime", (event) => {
    const runtime = event.detail?.state;
    if (!runtime) return;
    pushState({
      name: runtime.characterName,
      unread: runtime.unreadCount || 0,
      bubbleText: runtime.lastMessageText || runtime.lastProactiveText || "",
      mode: runtime.lastProactiveText ? "bubble" : undefined,
    }).catch(() => {});
  });

  document.addEventListener(COMPANION_LIFE_EVENT, () => {
    pushState().catch(() => {});
  });

  onDesktopPetAction((payload) => {
    handlePetAction(payload?.actionId).catch((error) => console.warn("pet action failed", error));
  });

  onDesktopSensingChanged((sensing) => {
    paintSensingUi(sensing);
    getDesktopHostInfo()
      .then((info) => {
        if (isElectronDesktop()) {
          paintPowerUi(!info.muted, { enabled: true });
          setStatus(
            info.muted
              ? t("pages.companionChrome.petSensingChangedOff")
              : t("pages.companionChrome.petSensingChangedOn"),
            info.muted ? "hidden" : "running",
          );
        }
        return syncSensingLoops(!info.muted);
      })
      .catch(() => {});
  });

  async function toggleScreenWatchFromUi(forceEnabled) {
    if (!isElectronDesktop()) {
      setStatus(t("pages.companionChrome.petScreenWatchNeedDesktop"), "hint");
      return { enabled: false };
    }
    const info = await getDesktopHostInfo();
    // 桌宠关着时只开读屏逻辑，绝不偷偷把窗又打开
    const petVisible = !Boolean(info.muted);
    const next = await toggleScreenWatch(forceEnabled, {
      intervalSec: Number(screenInterval?.value) || latestSensing.screenWatch.intervalSec || 15,
      petVisible,
    });
    latestSensing = next;
    paintSensingUi(next);
    setStatus(
      next.screenWatch.enabled
        ? petVisible
          ? t("pages.companionChrome.petScreenWatchOn", { interval: next.screenWatch.intervalSec })
          : t("pages.companionChrome.petScreenWatchOnHidden", { interval: next.screenWatch.intervalSec })
        : t("pages.companionChrome.petScreenWatchOff"),
      petVisible ? "running" : "hidden",
    );
    return { enabled: next.screenWatch.enabled, intervalSec: next.screenWatch.intervalSec };
  }

  async function hideInAppFloatFromUi() {
    beginCloseGeneration();
    writePendingEnable(false);
    setInAppFloatPreferredOn(false);
    syncDeskPetVisiblePref(false);
    if (isAndroidOverlaySupported()) {
      await raceTimeout(stopOverlay(), 4000, { running: false }).catch(() => {});
    }
    closingPet = false;
    syncInAppFloatToOverlay(false, false);
    if (isElectronDesktop()) {
      // App 内「隐藏」与系统桌宠关闭同一语义，避免藏了浮层系统窗又冒出来
      stopPetSensing();
      await setDesktopPetMuted(true);
      paintPowerUi(false, { enabled: true });
      setStatus(t("pages.companionChrome.petHiddenDesktop"), "hidden");
      return;
    }
    paintPowerUi(false, { enabled: true });
    setStatus(t("pages.companionChrome.petHiddenFloat"), "hidden");
  }

  onOverlayEvent("overlayStopped", () => {
    const wantOn = readBrowserPetEnabled();
    syncInAppFloatToOverlay(false, wantOn);
    paintPowerUi(wantOn, { enabled: true });
    setStatus(
      wantOn
        ? t("appShell.desktop.overlayStarting")
        : t("pages.companionChrome.petFloatOff"),
      wantOn ? "hint" : "hidden",
    );
  });

  window.addEventListener("yueqi:desk-pet-set", (event) => {
    const on = Boolean(event.detail?.enabled);
    if (!on) {
      petEventBusy = true;
      Promise.resolve(closePet())
        .catch((error) => console.warn("disable desk pet failed", error))
        .finally(() => {
          petEventBusy = false;
          ensureAppShellInteractive();
        });
      return;
    }
    // saveAutonomyPrefs emits synchronously. openPet persist the resulting
    // state again, so ignore a nested enable until this one settles.
    if (petEventBusy || petBusy) return;
    petEventBusy = true;
    Promise.resolve(openPet())
      .catch((error) => console.warn("enable desk pet failed", error))
      .finally(() => {
        petEventBusy = false;
        ensureAppShellInteractive();
      });
  });
  window.addEventListener("focus", () => {
    refresh().catch(() => {});
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh().catch(() => {});
  });

  refresh().catch((error) => console.warn("desktop presence refresh failed", error));
  document.addEventListener("yueqi:locale-changed", () => {
    refresh().catch(() => {});
  });
  return {
    refresh,
    pushState,
    handlePetAction,
    sensingApi,
    togglePet,
    hideInAppFloat: hideInAppFloatFromUi,
    toggleScreenWatch: toggleScreenWatchFromUi,
    getScreenWatchState: () => ({
      enabled: Boolean(latestSensing.screenWatch?.enabled),
      intervalSec: latestSensing.screenWatch?.intervalSec || 15,
    }),
  };
}
