import { App } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativePlatform } from "./runtime.js";
import { capabilityPermissionBroker } from "./native-capabilities.js";
import { handleSystemBack } from "./system-back.js";

export function initNativeBridge(handlers = {}) {
  const onDeepLink = typeof handlers.onDeepLink === "function" ? handlers.onDeepLink : null;
  const onHardwareBack = typeof handlers.onHardwareBack === "function" ? handlers.onHardwareBack : null;

  if (typeof window !== "undefined") {
    window.yueqiNativeCapability = Object.freeze({
      status: (capability) => capabilityPermissionBroker.getCapabilityStatus(capability),
      all: () => capabilityPermissionBroker.getAllCapabilityStates(),
    });
  }

  // Web / in-app custom event bridge (also used by notification click).
  if (typeof window !== "undefined" && onDeepLink) {
    window.addEventListener("yueqi:deep-link", (event) => {
      const detail = event?.detail || {};
      const href = detail.deepLink || detail.href || "";
      if (href) onDeepLink(href, detail);
    });
  }

  if (!isNativePlatform()) return;

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive && typeof handlers.onResume === "function") {
      handlers.onResume();
    }
    if (isActive && typeof window !== "undefined") {
      capabilityPermissionBroker.getAllCapabilityStates()
        .then((states) => window.dispatchEvent(new CustomEvent("yueqi:capabilities-changed", {
          detail: { states, source: "app-resume" },
        })))
        .catch(() => {});
    }
  }).catch(() => {});

  App.addListener("appUrlOpen", (data) => {
    const url = String(data?.url || "").trim();
    if (url && onDeepLink) onDeepLink(url, { source: "appUrlOpen" });
  }).catch(() => {});

  // Android system back = in-UI back (phone chevron / sheet close).
  // Only leave the app when nothing inside can consume the press.
  App.addListener("backButton", () => {
    if (handleSystemBack() === true) return;
    if (onHardwareBack?.() === true) return;
    App.minimizeApp?.().catch?.(() => {
      App.exitApp?.().catch?.(() => {});
    });
  }).catch(() => {});

  LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const extra = event?.notification?.extra || {};
    const href = String(extra.deepLink || "").trim();
    if (href && onDeepLink) onDeepLink(href, { ...extra, source: "localNotification" });
  }).catch(() => {});
}
