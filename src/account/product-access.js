/**
 * Open-source tree: there is no cloud account and no hosted model.
 * The shell always runs as a local BYOK session.
 */

export const MODEL_SOURCE_BYOK = "byok";
export const MODEL_SOURCE_HOSTED = "hosted";
export const PRODUCT_MODE_DEVELOPER = MODEL_SOURCE_BYOK;
export const PRODUCT_MODE_SUBSCRIPTION = MODEL_SOURCE_HOSTED;

const OFFLINE = Object.freeze({
  chosen: true,
  mode: MODEL_SOURCE_BYOK,
  modelSource: MODEL_SOURCE_BYOK,
  authMode: "offline",
  credits: 0,
  hostedTier: "standard",
  loggedIn: false,
  token: "",
  username: "",
  userId: "local",
});

export function normalizeModelSource() {
  return MODEL_SOURCE_BYOK;
}

export function normalizeProductMode() {
  return MODEL_SOURCE_BYOK;
}

export function normalizeHostedTier() {
  return "standard";
}

export function readProductAccess() {
  return { ...OFFLINE };
}

export function writeProductAccess() {
  globalThis.window?.dispatchEvent?.(new CustomEvent("yueqi:product-access-changed", { detail: { ...OFFLINE } }));
  return { ...OFFLINE };
}

export function clearAccountSession() {
  return writeProductAccess();
}

export function isHostedModelSource() {
  return false;
}

export function isManagedProductMode() {
  return false;
}

export function isLocalOfflineSession() {
  return true;
}
