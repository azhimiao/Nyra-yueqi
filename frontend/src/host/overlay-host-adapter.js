/**
 * OverlayHostAdapter (Android Capacitor overlay).
 * Stubs + bridge shape for device_pending verification without real devices.
 */

import { HOST_PLATFORMS, HOST_SCHEMA_VERSION } from "./constants.js";
import { ANDROID_ISOLATION } from "./isolation.js";
import { projectTaskState } from "./task-state-projection.js";

/**
 * Minimal Capacitor plugin shape (CompanionOverlay).
 * @typedef {{
 *   checkPermission?: () => Promise<{ granted: boolean }>,
 *   requestPermission?: () => Promise<{ granted: boolean, openedSettings?: boolean }>,
 *   isRunning?: () => Promise<{ running: boolean }>,
 *   start?: (opts?: { stateJson?: string }) => Promise<{ running: boolean }>,
 *   stop?: () => Promise<{ running: boolean }>,
 *   updateState?: (opts?: { stateJson?: string }) => Promise<void>,
 *   getCapabilities?: () => Promise<Record<string, boolean>>,
 * }} CompanionOverlayPluginLike
 */

/**
 * @param {{
 *   plugin?: CompanionOverlayPluginLike|null,
 *   devicePending?: boolean,
 *   platform?: string,
 * }} [deps]
 */
export function createOverlayHostAdapter(deps = {}) {
  const platform = deps.platform || HOST_PLATFORMS.ANDROID_CAPACITOR;
  const devicePending = deps.devicePending !== false;
  const plugin = deps.plugin || null;
  /** @type {{ overlay: boolean, notification: boolean, screenCapture: boolean, microphone: boolean }} */
  let permissionSnapshot = {
    overlay: false,
    notification: false,
    screenCapture: false,
    microphone: false,
  };
  let running = false;
  let lastStateJson = "{}";
  let lastProjection = null;

  async function callPlugin(method, arg) {
    if (!plugin || typeof plugin[method] !== "function") {
      return { stub: true, devicePending: true };
    }
    return plugin[method](arg);
  }

  return {
    kind: "overlay",
    platform,
    schemaVersion: HOST_SCHEMA_VERSION,
    isolation: ANDROID_ISOLATION,
    mayExecuteAgent: false,
    devicePending,

    getPermissionSnapshot() {
      return { ...permissionSnapshot };
    },

    async checkPermissions() {
      const overlay = await callPlugin("checkPermission");
      const caps = await callPlugin("getCapabilities");
      permissionSnapshot = {
        overlay: Boolean(overlay?.granted),
        notification: true,
        screenCapture: Boolean(caps?.screenCapture ?? false),
        microphone: Boolean(caps?.audio ?? false),
      };
      return {
        ...permissionSnapshot,
        stub: Boolean(overlay?.stub || !plugin),
        devicePending,
      };
    },

    async requestOverlayPermission() {
      const result = await callPlugin("requestPermission");
      if (result?.stub) {
        permissionSnapshot.overlay = false;
        return {
          ok: false,
          granted: false,
          reason: "device_pending",
          devicePending: true,
        };
      }
      permissionSnapshot.overlay = Boolean(result?.granted);
      return {
        ok: true,
        granted: permissionSnapshot.overlay,
        openedSettings: Boolean(result?.openedSettings),
        devicePending,
      };
    },

    async startOverlay(state = {}) {
      lastStateJson = JSON.stringify(state || {});
      const result = await callPlugin("start", { stateJson: lastStateJson });
      if (result?.stub) {
        running = false;
        return { ok: false, running: false, reason: "device_pending", devicePending: true };
      }
      running = Boolean(result?.running);
      return { ok: running, running, devicePending };
    },

    async stopOverlay() {
      const result = await callPlugin("stop");
      running = false;
      if (result?.stub) {
        return { ok: true, running: false, stub: true, devicePending: true };
      }
      return { ok: true, running: false, devicePending };
    },

    isRunning() {
      return running;
    },

    /**
     * Push task bubble into overlay state JSON (projection only).
     * @param {object} taskOrProjection
     */
    async showTaskBubble(taskOrProjection = {}) {
      const projection = taskOrProjection?.bubbleText
        ? {
            schemaVersion: HOST_SCHEMA_VERSION,
            taskId: String(taskOrProjection.taskId || ""),
            characterId: String(taskOrProjection.characterId || ""),
            agentState: String(taskOrProjection.agentState || ""),
            state: taskOrProjection.state,
            label: String(taskOrProjection.label || ""),
            title: String(taskOrProjection.title || ""),
            bubbleText: String(taskOrProjection.bubbleText || ""),
            updatedAt: String(taskOrProjection.updatedAt || new Date().toISOString()),
          }
        : projectTaskState(taskOrProjection);
      lastProjection = projection;
      const state = {
        mode: "bubble",
        bubbleText: projection.bubbleText,
        taskProjection: projection,
        playState: projection.state === "running" ? "thinking" : "idle",
      };
      lastStateJson = JSON.stringify(state);
      await callPlugin("updateState", { stateJson: lastStateJson });
      return { ok: true, projection, devicePending };
    },

    getLastProjection() {
      return lastProjection;
    },

    /** Foreground-service checklist ids. */
    foregroundServiceChecklist() {
      return [
        "SYSTEM_ALERT_WINDOW_granted",
        "POST_NOTIFICATIONS_requested_api33",
        "FGS_type_specialUse_or_mediaProjection",
        "persistent_notification_shows_character_and_task",
        "user_can_stop_from_notification",
        "media_projection_consent_per_session",
        "stop_share_releases_virtual_display",
        "oem_autostart_battery_matrix",
      ];
    },

    describe() {
      return {
        kind: "overlay",
        platform,
        mayExecuteAgent: false,
        devicePending,
        capabilities: ["overlay", "permission-stubs", "task-bubble", "fgs-checklist"],
        isolationRules: [...ANDROID_ISOLATION.rules],
        fgsChecklist: this.foregroundServiceChecklist(),
      };
    },
  };
}

export const OverlayHostAdapter = {
  create: createOverlayHostAdapter,
};
