import { Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import { t } from "../i18n/index.js";
import { isNativePlatform } from "./runtime.js";
import { openOemSettings } from "./companion-overlay.js";
import { CAPABILITY_STATUS } from "../capabilities/permission-broker.js";
import { capabilityPermissionBroker } from "./native-capabilities.js";

export const PERMISSION_META = {
  storage: {
    id: "storage",
    get label() { return t("mePanels.permissions.storage"); },
    get hint() { return t("mePanels.permissions.storageHint"); },
    get deniedHint() { return t("mePanels.permissions.storageDenied"); },
  },
  location: {
    id: "location",
    get label() { return t("mePanels.permissions.location"); },
    get hint() { return t("mePanels.permissions.locationHint"); },
    get deniedHint() { return t("mePanels.permissions.locationDenied"); },
  },
  notification: {
    id: "notification",
    get label() { return t("mePanels.permissions.notification"); },
    get hint() { return t("mePanels.permissions.notificationHint"); },
    get deniedHint() { return t("mePanels.permissions.notificationDenied"); },
  },
  microphone: {
    id: "microphone",
    get label() { return t("mePanels.permissions.microphone"); },
    get hint() { return t("mePanels.permissions.microphoneHint"); },
    get deniedHint() { return t("mePanels.permissions.microphoneDenied"); },
  },
  camera: {
    id: "camera",
    get label() { return t("mePanels.permissions.camera"); },
    get hint() { return t("mePanels.permissions.cameraHint"); },
    get deniedHint() { return t("mePanels.permissions.cameraDenied"); },
  },
  "location.current": {
    id: "location.current",
    get label() { return t("mePanels.permissions.location"); },
    get hint() { return t("mePanels.permissions.locationHint"); },
    get deniedHint() { return t("mePanels.permissions.locationDenied"); },
  },
  "notification.send": {
    id: "notification.send",
    get label() { return t("mePanels.permissions.notification"); },
    get hint() { return t("mePanels.permissions.notificationHint"); },
    get deniedHint() { return t("mePanels.permissions.notificationDenied"); },
  },
  "calendar.read": {
    id: "calendar.read",
    get label() { return "系统日历（只读）"; },
    get hint() { return "允许读取 Android 系统日历中的事件。"; },
    get deniedHint() { return "需要系统日历读取权限。"; },
  },
  "calendar.write": {
    id: "calendar.write",
    get label() { return "系统日历（写入）"; },
    get hint() { return "允许创建、修改和删除 Android 系统日历事件。"; },
    get deniedHint() { return "需要系统日历写入权限。"; },
  },
  "desktop.overlay": {
    id: "desktop.overlay",
    get label() { return "桌宠悬浮"; },
    get hint() { return "允许桌宠在其他应用上方持续显示。"; },
    get deniedHint() { return "需要在系统设置中允许显示在其他应用上层。"; },
  },
  "screen.capture": {
    id: "screen.capture",
    get label() { return "单次看屏"; },
    get hint() { return "每次看屏都由 Android 单独询问。"; },
    get deniedHint() { return "需要本次 MediaProjection 系统同意。"; },
  },
};

export const MCP_PERMISSION_MAP = {
  calendar: "calendar.read",
  location: "location.current",
  notification: "notification.send",
};

const LEGACY_CAPABILITY_MAP = Object.freeze({
  location: "location.current",
  notification: "notification.send",
  microphone: "microphone.capture",
  camera: "camera.capture",
  "calendar.read": "calendar.read",
  "calendar.write": "calendar.write",
  "location.current": "location.current",
  "location.background": "location.background",
  "notification.send": "notification.send",
  "desktop.overlay": "desktop.overlay",
  "screen.capture": "screen.capture",
});

function legacyPermissionState(state) {
  if (state?.granted || state?.status === CAPABILITY_STATUS.AVAILABLE) return "granted";
  if (state?.status === CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE) return "unsupported";
  if (
    state?.status === CAPABILITY_STATUS.OS_DENIED
    || state?.status === CAPABILITY_STATUS.OS_DENIED_PERMANENTLY
  ) return "denied";
  return "prompt";
}

export function permissionStatusLabel(status) {
  switch (status) {
    case "granted":
      return t("mePanels.granted");
    case "denied":
      return t("mePanels.denied");
    case "unsupported":
      return t("mePanels.unsupported");
    default:
      return t("mePanels.notGranted");
  }
}

export async function checkPermission(id) {
  if (id === "storage") {
    if (!isNativePlatform()) return "granted";
    try {
      const result = await Filesystem.checkPermissions();
      const state = result.publicStorage ?? "prompt";
      if (state === "granted") return "granted";
      if (state === "denied") return "denied";
      return "prompt";
    } catch {
      return "prompt";
    }
  }

  const capability = LEGACY_CAPABILITY_MAP[id];
  if (capability) {
    const state = await capabilityPermissionBroker.getCapabilityStatus(capability);
    return legacyPermissionState(state);
  }

  if (id === "location") {
    if (!("geolocation" in navigator)) return "unsupported";
    if (navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({ name: "geolocation" });
        return result.state;
      } catch {
        return "prompt";
      }
    }
    return "prompt";
  }

  if (id === "notification") {
    if (isNativePlatform()) {
      try {
        const result = await LocalNotifications.checkPermissions();
        if (result.display === "granted") return "granted";
        if (result.display === "denied") return "denied";
        return "prompt";
      } catch {
        return "prompt";
      }
    }
    if (!("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  if (id === "microphone" || id === "camera") {
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    // Permissions API is unreliable on Android WebView (often "denied" before any prompt).
    if (navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({ name: id });
        if (result.state === "granted") return "granted";
        if (result.state === "prompt") return "prompt";
        return isNativePlatform() ? "prompt" : "denied";
      } catch {
        return "prompt";
      }
    }
    return "prompt";
  }

  return "unsupported";
}

export async function requestPermission(id, handlers = {}) {
  const meta = PERMISSION_META[id];
  if (!meta) {
    return { ok: false, status: "unsupported", message: "未知权限类型。" };
  }

  try {
    if (id === "storage") {
      if (!isNativePlatform()) return { ok: true, status: "granted" };
      const result = await Filesystem.requestPermissions();
      const state = result.publicStorage ?? "denied";
      if (state !== "granted") {
        return { ok: false, status: state, message: meta.deniedHint, openSettings: state === "denied" };
      }
      return { ok: true, status: "granted" };
    }

    const capability = LEGACY_CAPABILITY_MAP[id];
    if (capability) {
      const state = await capabilityPermissionBroker.requestCapability(capability, {
        userGesture: true,
      });
      const status = legacyPermissionState(state);
      if (state.granted) {
        if (id === "location" && handlers.onLocationGranted) {
          const { getCurrentNativeLocation } = await import("./native-capabilities.js");
          const location = await getCurrentNativeLocation();
          await handlers.onLocationGranted(location);
        }
        return { ok: true, status: "granted", capability, state };
      }
      return {
        ok: false,
        status,
        capability,
        state,
        openSettings: Boolean(state.needsSettings),
        message: meta.deniedHint,
      };
    }

    if (id === "location") {
      if (!("geolocation" in navigator)) {
        return { ok: false, status: "unsupported", message: "当前环境不支持定位。" };
      }
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 600000,
        });
      });
      if (handlers.onLocationGranted) {
        await handlers.onLocationGranted(position.coords);
      }
      return { ok: true, status: "granted" };
    }

    if (id === "notification") {
      if (handlers.requestNotification) {
        await handlers.requestNotification();
      }
      return { ok: true, status: "granted" };
    }

    if (id === "microphone") {
      if (!navigator.mediaDevices?.getUserMedia) {
        return { ok: false, status: "unsupported", message: "当前环境不支持麦克风。" };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return { ok: true, status: "granted" };
    }

    if (id === "camera") {
      if (!navigator.mediaDevices?.getUserMedia) {
        return { ok: false, status: "unsupported", message: t("mePanels.permissions.cameraUnsupported") };
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      stream.getTracks().forEach((track) => track.stop());
      return { ok: true, status: "granted" };
    }
  } catch (error) {
    const status = await checkPermission(id);
    const deniedByUser = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    const nextStatus = deniedByUser ? "denied" : (status === "prompt" ? "denied" : status);
    return {
      ok: false,
      status: nextStatus,
      openSettings: nextStatus === "denied",
      message: deniedByUser
        ? (meta.deniedHint || error.message)
        : (error.message || meta.deniedHint),
    };
  }

  return { ok: false, status: "unsupported", message: meta.deniedHint };
}

/**
 * Open the OS app-details page so the user can flip mic/camera/storage toggles.
 * Reuses the Android overlay host's settings bridge when available.
 */
export async function openAppPermissionSettings() {
  if (!isNativePlatform()) {
    return { ok: false, message: t("mePanels.permissions.webSettingsHint") };
  }
  try {
    await openOemSettings("app");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || t("mePanels.permissions.settingsOpenFailed") };
  }
}

export async function ensurePermission(id, handlers = {}) {
  const status = await checkPermission(id);
  if (status === "granted") return { ok: true, status: "granted" };

  // Media permissions must always attempt getUserMedia on a user gesture.
  // Short-circuiting on a stale "denied" from Permissions API blocks the prompt.
  if (id === "microphone" || id === "camera") {
    const result = await requestPermission(id, handlers);
    if (!result.ok && result.status === "denied") {
      return {
        ...result,
        openSettings: true,
        message: result.message || PERMISSION_META[id]?.deniedHint,
      };
    }
    return result;
  }

  if (status === "denied") {
    return {
      ok: false,
      status: "denied",
      openSettings: true,
      message: PERMISSION_META[id]?.deniedHint || "权限已被拒绝。",
    };
  }
  return requestPermission(id, handlers);
}
