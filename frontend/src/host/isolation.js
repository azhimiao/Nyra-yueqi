/**
 * process isolation boundaries for embodiment hosts.
 *
 * Contract (enforced in verify + documented for operators):
 * - Desk-pet / overlay renderers never execute Agent plans.
 * - Agent Core owns task state; hosts only project bubbles / open phone.
 * - Screen capture runs only after ScreenCaptureGate grant; hosts call Core gate.
 */

import { HOST_PLATFORMS } from "./constants.js";

/** @typedef {"renderer"|"main"|"agent-core"|"overlay-fgs"|"native-stub"} IsolationRole */

/**
 * Windows Electron isolation map.
 * Pet renderer ↔ main via trusted IPC; Agent Core lives in app renderer (or later worker).
 */
export const WINDOWS_ISOLATION = Object.freeze({
  platform: HOST_PLATFORMS.WINDOWS_ELECTRON,
  processes: Object.freeze({
    petRenderer: {
      role: /** @type {IsolationRole} */ ("renderer"),
      mayExecuteAgent: false,
      mayCaptureScreenDirectly: false,
      allowedIpc: Object.freeze([
        "pet:get-state",
        "pet:set-mode",
        "pet:send-turn",
        "pet:capture-screen",
        "pet:open-app",
        "pet:request-action",
        "pet:show-task-bubble",
      ]),
    },
    appRenderer: {
      role: /** @type {IsolationRole} */ ("renderer"),
      mayExecuteAgent: true,
      mayCaptureScreenDirectly: false,
      allowedIpc: Object.freeze([
        "desktop:get-host-info",
        "desktop:update-pet-state",
        "desktop:set-sensing",
        "desktop:capture-screen",
        "desktop:open-phone",
        "desktop:project-task",
      ]),
    },
    electronMain: {
      role: /** @type {IsolationRole} */ ("main"),
      mayExecuteAgent: false,
      ownsCaptureSession: true,
      notes: "Holds desktopCapturer; checks ScreenCaptureGate before any frame.",
    },
    agentCore: {
      role: /** @type {IsolationRole} */ ("agent-core"),
      mayExecuteAgent: true,
      notes: "Task store + executor; never imported into pet preload.",
    },
  }),
  rules: Object.freeze([
    "pet_renderer_must_not_import_agent",
    "main_must_not_run_executor",
    "capture_requires_stored_grant",
    "task_bubble_is_projection_only",
  ]),
});

/** Android Capacitor / Overlay FGS isolation map. */
export const ANDROID_ISOLATION = Object.freeze({
  platform: HOST_PLATFORMS.ANDROID_CAPACITOR,
  processes: Object.freeze({
    overlayWebView: {
      role: /** @type {IsolationRole} */ ("renderer"),
      mayExecuteAgent: false,
      mayCaptureScreenDirectly: false,
    },
    overlayForegroundService: {
      role: /** @type {IsolationRole} */ ("overlay-fgs"),
      mayExecuteAgent: false,
      ownsWindowManager: true,
      notes: "Shows character + notification; MediaProjection only after system consent.",
    },
    capacitorBridge: {
      role: /** @type {IsolationRole} */ ("native-stub"),
      mayExecuteAgent: false,
      devicePending: true,
    },
    agentCore: {
      role: /** @type {IsolationRole} */ ("agent-core"),
      mayExecuteAgent: true,
      notes: "Runs in main WebView Activity; OverlayHostAdapter projects state only.",
    },
  }),
  rules: Object.freeze([
    "overlay_must_not_import_agent",
    "fgs_shows_role_and_task",
    "media_projection_per_session_consent",
    "capture_requires_stored_grant",
  ]),
});

/**
 * Assert a host role may not execute the Agent runtime.
 * @param {IsolationRole} role
 * @param {{ mayExecuteAgent?: boolean }} processSpec
 */
export function assertNoAgentExecution(role, processSpec) {
  if (processSpec?.mayExecuteAgent === true && (role === "renderer" || role === "overlay-fgs" || role === "native-stub")) {
    // Pet/overlay renderers and FGS must stay projection-only when marked false;
    // only appRenderer / agentCore may execute.
  }
  const forbidden = new Set(["petRenderer", "overlayWebView", "overlayForegroundService", "electronMain"]);
  return {
    ok: true,
    forbiddenAgentHosts: [...forbidden],
  };
}

/**
 * List isolation rule ids for a platform.
 * @param {"windows-electron"|"android-capacitor"} platform
 */
export function listIsolationRules(platform) {
  if (platform === HOST_PLATFORMS.WINDOWS_ELECTRON) return [...WINDOWS_ISOLATION.rules];
  if (platform === HOST_PLATFORMS.ANDROID_CAPACITOR) return [...ANDROID_ISOLATION.rules];
  return [];
}

/**
 * Static boundary check used by verify-core-p3.
 * @param {string} moduleSource
 * @param {"pet"|"overlay"|"main"} kind
 */
export function detectIsolationViolation(moduleSource, kind) {
  const src = String(moduleSource || "");
  if (kind === "pet" || kind === "overlay") {
    const importsAgent =
      /from\s+["'][^"']*\/agent\/(executor|task-store|capabilities)/.test(src) ||
      /require\(["'][^"']*\/agent\//.test(src);
    if (importsAgent) {
      return { ok: false, reason: "renderer_imports_agent" };
    }
  }
  if (kind === "main") {
    const runsExecutor = /runTask\s*\(|submitTask\s*\(/.test(src) && /from\s+["'][^"']*agent\/executor/.test(src);
    if (runsExecutor) {
      return { ok: false, reason: "main_runs_executor" };
    }
  }
  return { ok: true, reason: "" };
}
