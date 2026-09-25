/**
 * Android Capacitor overlay / permission stubs.
 * Used when CompanionOverlay native plugin is absent (web / CI).
 */

import { createOverlayHostAdapter } from "./overlay-host-adapter.js";
import { HOST_PLATFORMS } from "./constants.js";

/** @returns {import("./overlay-host-adapter.js").CompanionOverlayPluginLike} */
export function createCompanionOverlayPluginStub() {
  return {
    async checkPermission() {
      return { granted: false, stub: true, devicePending: true };
    },
    async requestPermission() {
      return {
        granted: false,
        openedSettings: false,
        stub: true,
        devicePending: true,
        reason: "device_pending",
      };
    },
    async isRunning() {
      return { running: false, stub: true, devicePending: true };
    },
    async start() {
      return { running: false, stub: true, devicePending: true };
    },
    async stop() {
      return { running: false, stub: true, devicePending: true };
    },
    async updateState() {},
    async getCapabilities() {
      return {
        overlay: true,
        text: true,
        audio: false,
        screenCapture: true,
        stub: true,
        devicePending: true,
      };
    },
  };
}

/**
 * Build an OverlayHostAdapter marked device_pending (default for CI).
 */
export function createAndroidOverlayStubAdapter() {
  return createOverlayHostAdapter({
    platform: HOST_PLATFORMS.ANDROID_CAPACITOR,
    devicePending: true,
    plugin: createCompanionOverlayPluginStub(),
  });
}

/**
 * Foreground service + OEM checklist (software-layer tracking).
 * Each item is verified on-device before clearing device_pending.
 */
export const ANDROID_FGS_CHECKLIST = Object.freeze([
  {
    id: "SYSTEM_ALERT_WINDOW_granted",
    title: "显示在其他应用上层",
    status: "device_pending",
  },
  {
    id: "POST_NOTIFICATIONS_requested_api33",
    title: "通知权限（API 33+）",
    status: "device_pending",
  },
  {
    id: "FGS_type_specialUse_or_mediaProjection",
    title: "前台服务类型 specialUse | mediaProjection",
    status: "stub_declared",
  },
  {
    id: "persistent_notification_shows_character_and_task",
    title: "常驻通知展示角色与任务态",
    status: "device_pending",
  },
  {
    id: "user_can_stop_from_notification",
    title: "通知可停止悬浮 / 停止看屏",
    status: "device_pending",
  },
  {
    id: "media_projection_consent_per_session",
    title: "每次采集走系统 MediaProjection 同意",
    status: "stub_declared",
  },
  {
    id: "stop_share_releases_virtual_display",
    title: "停止共享后不再产生新帧",
    status: "device_pending",
  },
  {
    id: "oem_autostart_battery_matrix",
    title: "小米 / 华为 / OPPO / vivo 保活矩阵",
    status: "device_pending",
  },
]);
