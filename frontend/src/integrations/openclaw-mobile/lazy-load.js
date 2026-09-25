/**
 * defer OpenClaw mobile runtime until first Local Agent / task run.
 * Cached module promise; safe to call from multiple entrypoints.
 */

/** @type {Promise<typeof import("./index.js")> | null} */
let mobileRuntimePromise = null;

/**
 * @returns {Promise<typeof import("./index.js")>}
 */
export function loadMobileAgentRuntime() {
  if (!mobileRuntimePromise) {
    mobileRuntimePromise = import("./index.js");
  }
  return mobileRuntimePromise;
}
