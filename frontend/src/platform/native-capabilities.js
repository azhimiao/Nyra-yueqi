import { registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  CapabilityPermissionBroker,
  CAPABILITY_STATUS,
} from "../capabilities/permission-broker.js";
import {
  checkOverlayPermission,
  isOverlayRunning,
  openOemSettings,
  requestOverlayPermission,
  stopOverlay,
} from "./companion-overlay.js";
import { getPlatform, isNativePlatform, isPluginAvailable } from "./runtime.js";

const NativeCapability = registerPlugin("NativeCapability");

function isAndroidNative() {
  return isNativePlatform() && getPlatform() === "android" && isPluginAvailable("NativeCapability");
}

async function browserMediaStatus(kind) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { status: CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE, granted: false };
  }
  try {
    const query = await navigator.permissions?.query?.({ name: kind });
    if (query?.state === "granted") {
      return { status: CAPABILITY_STATUS.OS_GRANTED, granted: true };
    }
    if (query?.state === "denied") {
      return { status: CAPABILITY_STATUS.OS_DENIED, granted: false, canAskAgain: true };
    }
  } catch {
    // A user gesture + getUserMedia is the reliable browser permission path.
  }
  return { status: CAPABILITY_STATUS.OS_NOT_REQUESTED, granted: false, canAskAgain: true };
}

async function requestBrowserMedia(kind) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: kind === "microphone",
      video: kind === "camera" ? { facingMode: "user" } : false,
    });
    stream.getTracks().forEach((track) => track.stop());
    return { status: CAPABILITY_STATUS.OS_GRANTED, granted: true };
  } catch (error) {
    return {
      status: CAPABILITY_STATUS.OS_DENIED,
      granted: false,
      canAskAgain: true,
      reason: error?.name || "USER_DENIED",
    };
  }
}

export const nativeCapabilityAdapter = {
  async getCapabilityStatus(capability) {
    if (capability === "desktop.overlay") {
      if (!isNativePlatform() || getPlatform() !== "android") {
        return { status: CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE, granted: false };
      }
      const permission = await checkOverlayPermission();
      const running = permission?.granted ? await isOverlayRunning() : false;
      return {
        status: permission?.granted
          ? CAPABILITY_STATUS.OS_GRANTED
          : CAPABILITY_STATUS.SPECIAL_PERMISSION_REQUIRED,
        granted: Boolean(permission?.granted),
        nativePermission: "android.permission.SYSTEM_ALERT_WINDOW",
        canAskAgain: true,
        serviceRunning: running,
        visible: running,
      };
    }
    if (capability === "screen.capture" || capability === "screen.observe") {
      return {
        status: CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED,
        granted: false,
        canAskAgain: true,
        sessionScoped: true,
      };
    }
    if (capability === "voice.output" || capability === "calendar.internal") {
      return { status: CAPABILITY_STATUS.OS_GRANTED, granted: true };
    }
    if (capability === "notification.send" && !isAndroidNative()) {
      if (isNativePlatform()) {
        const state = await LocalNotifications.checkPermissions();
        return {
          status: state.display === "granted"
            ? CAPABILITY_STATUS.OS_GRANTED
            : state.display === "denied"
              ? CAPABILITY_STATUS.OS_DENIED
              : CAPABILITY_STATUS.OS_NOT_REQUESTED,
          granted: state.display === "granted",
          canAskAgain: state.display !== "denied",
          needsSettings: state.display === "denied",
        };
      }
      const value = globalThis.Notification?.permission;
      return {
        status: value === "granted"
          ? CAPABILITY_STATUS.OS_GRANTED
          : value === "denied"
            ? CAPABILITY_STATUS.OS_DENIED
            : CAPABILITY_STATUS.OS_NOT_REQUESTED,
        granted: value === "granted",
        canAskAgain: value !== "denied",
        needsSettings: value === "denied",
      };
    }
    if (isAndroidNative()) {
      return NativeCapability.getCapabilityStatus({ capability });
    }
    if (capability === "microphone.capture" || capability === "voice.input") {
      return browserMediaStatus("microphone");
    }
    if (capability === "camera.capture" || capability === "camera.preview") {
      return browserMediaStatus("camera");
    }
    if (capability === "location.current" && "geolocation" in navigator) {
      try {
        const query = await navigator.permissions?.query?.({ name: "geolocation" });
        return {
          status: query?.state === "granted"
            ? CAPABILITY_STATUS.OS_GRANTED
            : query?.state === "denied"
              ? CAPABILITY_STATUS.OS_DENIED
              : CAPABILITY_STATUS.OS_NOT_REQUESTED,
          granted: query?.state === "granted",
          canAskAgain: query?.state !== "denied",
        };
      } catch {
        return { status: CAPABILITY_STATUS.OS_NOT_REQUESTED, granted: false, canAskAgain: true };
      }
    }
    return { status: CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE, granted: false };
  },

  async requestCapability(capability) {
    if (capability === "desktop.overlay") {
      const result = await requestOverlayPermission();
      return {
        status: result?.granted
          ? CAPABILITY_STATUS.OS_GRANTED
          : CAPABILITY_STATUS.SPECIAL_PERMISSION_REQUIRED,
        granted: Boolean(result?.granted),
        canAskAgain: true,
        needsSettings: Boolean(result?.openedSettings && !result?.granted),
        reason: result?.granted ? "OS_GRANTED" : "SPECIAL_PERMISSION_REQUIRED",
      };
    }
    if (capability === "screen.capture" || capability === "screen.observe") {
      return {
        status: CAPABILITY_STATUS.SESSION_CONSENT_REQUIRED,
        granted: false,
        canAskAgain: true,
        sessionScoped: true,
      };
    }
    if (capability === "voice.output" || capability === "calendar.internal") {
      return { status: CAPABILITY_STATUS.OS_GRANTED, granted: true };
    }
    if (capability === "notification.send" && !isAndroidNative()) {
      if (isNativePlatform()) {
        const state = await LocalNotifications.requestPermissions();
        return {
          status: state.display === "granted"
            ? CAPABILITY_STATUS.OS_GRANTED
            : CAPABILITY_STATUS.OS_DENIED,
          granted: state.display === "granted",
          canAskAgain: state.display !== "denied",
          needsSettings: state.display === "denied",
        };
      }
      const state = await Notification.requestPermission();
      return {
        status: state === "granted" ? CAPABILITY_STATUS.OS_GRANTED : CAPABILITY_STATUS.OS_DENIED,
        granted: state === "granted",
        canAskAgain: state !== "denied",
        needsSettings: state === "denied",
      };
    }
    if (isAndroidNative()) return NativeCapability.requestCapability({ capability });
    if (capability === "microphone.capture" || capability === "voice.input") {
      return requestBrowserMedia("microphone");
    }
    if (capability === "camera.capture" || capability === "camera.preview") {
      return requestBrowserMedia("camera");
    }
    if (capability === "location.current") {
      try {
        await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject));
        return { status: CAPABILITY_STATUS.OS_GRANTED, granted: true };
      } catch (error) {
        return {
          status: CAPABILITY_STATUS.OS_DENIED,
          granted: false,
          reason: error?.message || "USER_DENIED",
        };
      }
    }
    return { status: CAPABILITY_STATUS.UNAVAILABLE_ON_DEVICE, granted: false };
  },

  async openSystemPermissionSettings(capability) {
    if (capability === "desktop.overlay") return requestOverlayPermission();
    if (isAndroidNative()) return NativeCapability.openSystemPermissionSettings({ capability });
    if (isNativePlatform()) return openOemSettings("app");
    return { opened: false, reason: "WEB_SETTINGS_UNAVAILABLE" };
  },

  async onInternalCapabilityRevoked(capability) {
    if (capability === "desktop.overlay") {
      await stopOverlay().catch(() => {});
      return;
    }
    if (isAndroidNative() && (
      capability === "microphone.capture"
      || capability === "voice.input"
    )) {
      await NativeCapability.cancelMicrophoneCapture().catch(() => {});
    }
  },
};

export const capabilityPermissionBroker = new CapabilityPermissionBroker({
  nativeAdapter: nativeCapabilityAdapter,
});

export async function getNativeCapabilityStates() {
  return capabilityPermissionBroker.getAllCapabilityStates();
}

export async function getCurrentNativeLocation() {
  if (isAndroidNative()) return NativeCapability.getCurrentLocation();
  const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    resolve,
    reject,
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
  ));
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp,
    source: "browser_geolocation",
  };
}

export function getNativeCapabilityPlugin() {
  return isAndroidNative() ? NativeCapability : null;
}
