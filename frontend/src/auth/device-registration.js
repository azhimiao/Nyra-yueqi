import { getPlatform, isNativePlatform, isPluginAvailable } from "../platform/runtime.js";
import { getNativeCapabilityPlugin } from "../platform/native-capabilities.js";

const INSTALLATION_ID_KEY = "yueqi.auth.installationId.v1";
function createInstallationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(24);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function getInstallationId() {
  let current = "";
  try {
    current = String(globalThis.localStorage?.getItem(INSTALLATION_ID_KEY) || "").trim();
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  if (current.length >= 16) return current;
  const created = createInstallationId();
  try {
    globalThis.localStorage?.setItem(INSTALLATION_ID_KEY, created);
  } catch {
    // The server still receives a request-scoped ID when storage is unavailable.
  }
  return created;
}

export async function getRegistrationDevice() {
  const installationId = getInstallationId();
  if (
    isNativePlatform()
    && getPlatform() === "android"
    && isPluginAvailable("NativeCapability")
  ) {
    try {
      const native = await getNativeCapabilityPlugin()?.getDeviceRegistrationId?.();
      return {
        platform: "android",
        platformDeviceId: String(native?.platformDeviceId || "").trim(),
        installationId,
      };
    } catch {
      // Fall back to the installation identifier without blocking registration.
    }
  }
  return {
    platform: isNativePlatform() ? getPlatform() : "web",
    platformDeviceId: "",
    installationId,
  };
}
