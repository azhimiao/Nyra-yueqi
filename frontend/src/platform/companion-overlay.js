import { registerPlugin } from "@capacitor/core";
import { getPlatform, isNativePlatform, isPluginAvailable } from "./runtime.js";

const NativeOverlay = registerPlugin("CompanionOverlay");

function webStub() {
  return {
    async checkPermission() {
      return { granted: false };
    },
    async requestPermission() {
      return { granted: false, openedSettings: false };
    },
    async isRunning() {
      return { running: false };
    },
    async getCapabilities() {
      return { overlay: false, text: false, audio: false, screenCapture: false };
    },
    async captureScreen() {
      return { ok: false, code: "DEVICE_UNSUPPORTED", capability: "screen.capture" };
    },
    async start() {
      throw new Error("系统悬浮仅在 Android 可用");
    },
    async stop() {
      return { running: false };
    },
    async updateState() {},
    async openOemSettings() {},
    addListener() {
      return { remove: () => {} };
    },
  };
}

function getPlugin() {
  if (!isNativePlatform() || getPlatform() !== "android") return webStub();
  if (!isPluginAvailable("CompanionOverlay")) return webStub();
  return NativeOverlay;
}

export function isAndroidOverlaySupported() {
  return isNativePlatform() && getPlatform() === "android";
}

export async function checkOverlayPermission() {
  return getPlugin().checkPermission();
}

export async function requestOverlayPermission() {
  return getPlugin().requestPermission();
}

export async function isOverlayRunning() {
  const result = await getPlugin().isRunning();
  return Boolean(result?.running);
}

export async function getOverlayCapabilities() {
  return getPlugin().getCapabilities();
}

export async function captureOverlayScreen() {
  return getPlugin().captureScreen();
}

export async function startOverlay(state = {}) {
  return getPlugin().start({ stateJson: JSON.stringify(state) });
}

export async function waitForOverlayRunning(timeoutMs = 3500) {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  while (Date.now() <= deadline) {
    if (await isOverlayRunning()) return true;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return isOverlayRunning();
}

export async function stopOverlay() {
  return getPlugin().stop();
}

export async function updateOverlayState(state = {}) {
  return getPlugin().updateState({ stateJson: JSON.stringify(state) });
}

export async function openOemSettings(kind = "battery") {
  return getPlugin().openOemSettings({ kind });
}

export async function requestBatteryExemption() {
  const plugin = getPlugin();
  if (typeof plugin.requestBatteryExemption !== "function") {
    return { granted: false };
  }
  return plugin.requestBatteryExemption();
}

export function onOverlayEvent(eventName, callback) {
  const plugin = getPlugin();
  if (!plugin.addListener) return () => {};
  let handle;
  let disposed = false;

  try {
    const registration = plugin.addListener(eventName, callback);
    if (registration && typeof registration.then === "function") {
      registration
        .then((nextHandle) => {
          if (disposed) {
            nextHandle?.remove?.();
            return;
          }
          handle = nextHandle;
        })
        .catch(() => {});
    } else {
      handle = registration;
    }
  } catch {
    return () => {};
  }

  return () => {
    disposed = true;
    try {
      const removal = handle?.remove?.();
      removal?.catch?.(() => {});
    } catch {
      // Listener cleanup must never block app shutdown.
    }
  };
}

/** Build a compact data URL for overlay look (max edge ~256). Never returns megabyte payloads. */
export async function blobToOverlayDataUrl(blob, maxEdge = 256) {
  if (!blob) return "";
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      return canvas.toDataURL("image/webp", 0.82);
    } catch {
      // fall through to Image path
    }
  }
  if (blob.size > 400 * 1024) {
    // Avoid stuffing Intent/prefs with raw full-size data URLs
    return "";
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.82));
      } catch {
        resolve("");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
}
