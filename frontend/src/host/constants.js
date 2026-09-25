/**
 * shared host bridge constants.
 */

export const HOST_SCHEMA_VERSION = 1;

/** Persistent grant record for screen capture (never implied). */
export const SCREEN_CAPTURE_GRANT_KEY = "yueqi.host.screenCaptureGrant.v1";

/** Surfaces that may request screen frames after explicit grant. */
export const CAPTURE_SURFACES = Object.freeze(["windows-electron", "android-overlay", "simulator"]);

/** Grant lifetime scopes. */
export const GRANT_SCOPES = Object.freeze(["session", "persistent"]);

/**
 * Host-facing task projection states (plan §P3).
 * Distinct from agent lifecycle states in src/agent/schema.js.
 */
export const HOST_TASK_STATES = Object.freeze(["waiting", "running", "done", "blocked"]);

export const HOST_PLATFORMS = Object.freeze({
  WINDOWS_ELECTRON: "windows-electron",
  ANDROID_CAPACITOR: "android-capacitor",
  SIMULATOR: "simulator",
});
