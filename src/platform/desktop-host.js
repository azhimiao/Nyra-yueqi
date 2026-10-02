import { getPlatform, isNativePlatform } from "./runtime.js";

export function isElectronDesktop() {
  return Boolean(typeof window !== "undefined" && window.yueqiDesktop?.isDesktop);
}

export function isDesktopHostSupported() {
  return isElectronDesktop() || (typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent || "") && !isNativePlatform());
}

export async function getDesktopHostInfo() {
  if (!isElectronDesktop()) {
    return {
      platform: getPlatform(),
      muted: true,
      openAtLogin: false,
      petVisible: false,
      available: false,
    };
  }
  const info = await window.yueqiDesktop.getHostInfo();
  return { ...info, available: true };
}

export async function updateDesktopPetState(patch = {}) {
  if (!isElectronDesktop()) return { ok: false };
  return window.yueqiDesktop.updatePetState(patch);
}

export async function setDesktopPetMuted(muted) {
  if (!isElectronDesktop()) return { muted: true };
  return window.yueqiDesktop.setMuted(muted);
}

export async function setDesktopOpenAtLogin(enabled) {
  if (!isElectronDesktop()) return { openAtLogin: false };
  return window.yueqiDesktop.setOpenAtLogin(enabled);
}

export async function showDesktopPet() {
  if (!isElectronDesktop()) return { ok: false };
  return window.yueqiDesktop.showPet();
}

export async function setDesktopSensing(sensing) {
  if (!isElectronDesktop()) return { sensing: null };
  return window.yueqiDesktop.setSensing(sensing);
}

export async function captureDesktopScreen() {
  if (!isElectronDesktop()) return null;
  if (typeof window.yueqiDesktop.getCaptureGrant === "function") {
    const info = await window.yueqiDesktop.getCaptureGrant();
    if (info && info.granted === false) {
      throw new Error("SCREEN_CAPTURE_NO_GRANT");
    }
  }
  return window.yueqiDesktop.captureScreen();
}

export async function getDesktopCaptureSourceId() {
  if (!isElectronDesktop()) return "";
  const result = await window.yueqiDesktop.getCaptureSourceId?.();
  return String(result?.sourceId || "");
}

/** Open main phone / app window via DeskPetHostAdapter bridge. */
export async function openDesktopPhone() {
  if (!isElectronDesktop()) return { ok: false };
  if (typeof window.yueqiDesktop.openPhone === "function") {
    return window.yueqiDesktop.openPhone();
  }
  return { ok: false };
}

/** Project an Agent task onto the desk-pet bubble (projection only). */
export async function projectDesktopTask(task) {
  if (!isElectronDesktop()) return { ok: false };
  if (typeof window.yueqiDesktop.projectTask === "function") {
    return window.yueqiDesktop.projectTask(task);
  }
  return { ok: false };
}

export async function getDesktopCaptureGrant() {
  if (!isElectronDesktop()) return { granted: false, grant: null };
  return window.yueqiDesktop.getCaptureGrant?.() || { granted: false, grant: null };
}

export async function revokeDesktopCaptureGrant() {
  if (!isElectronDesktop()) return { granted: false };
  return window.yueqiDesktop.revokeCaptureGrant?.() || { granted: false };
}

export function onDesktopPetAction(callback) {
  if (!isElectronDesktop() || typeof callback !== "function") return () => {};
  return window.yueqiDesktop.onPetAction?.(callback) || (() => {});
}

export function onDesktopSensingChanged(callback) {
  if (!isElectronDesktop() || typeof callback !== "function") return () => {};
  return window.yueqiDesktop.onSensingChanged?.(callback) || (() => {});
}

/** CP-AV6 — push product projection to pet-v2 (no-op when unavailable). */
export async function sendDesktopPetV2(channel, payload) {
  if (!isElectronDesktop()) return { ok: false, reason: "not_desktop" };
  if (typeof window.yueqiDesktop.sendPetV2 !== "function") {
    return { ok: false, reason: "sendPetV2_unavailable" };
  }
  return window.yueqiDesktop.sendPetV2(channel, payload);
}

export function onDesktopPetV2DeepLink(callback) {
  if (!isElectronDesktop() || typeof callback !== "function") return () => {};
  return window.yueqiDesktop.onPetV2DeepLink?.(callback) || (() => {});
}

export function onDesktopPetV2OpenedReceipt(callback) {
  if (!isElectronDesktop() || typeof callback !== "function") return () => {};
  return window.yueqiDesktop.onPetV2OpenedReceipt?.(callback) || (() => {});
}
