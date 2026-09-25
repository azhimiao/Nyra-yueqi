import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";

export const MODEL_SOURCE_BYOK = "byok";
export const MODEL_SOURCE_HOSTED = "hosted";

export const PRODUCT_MODE_DEVELOPER = MODEL_SOURCE_BYOK;
export const PRODUCT_MODE_SUBSCRIPTION = MODEL_SOURCE_HOSTED;

export function normalizeModelSource(_value) {
  return MODEL_SOURCE_BYOK;
}

export function normalizeProductMode(value) {
  return normalizeModelSource(value);
}

export function normalizeHostedTier(_value) {
  return "standard";
}

function localAccess(current = {}) {
  return {
    chosen: true,
    mode: MODEL_SOURCE_BYOK,
    modelSource: MODEL_SOURCE_BYOK,
    authMode: "offline",
    credits: 0,
    hostedTier: "standard",
    loggedIn: false,
    token: "",
    username: "本机",
    userId: "local",
  };
}

export function readProductAccess() {
  const ecosystem = readLocalObject(LOCAL_KEYS.ecosystemKey, {}) || {};
  return localAccess(ecosystem);
}

export function writeProductAccess(access = {}) {
  const current = readLocalObject(LOCAL_KEYS.ecosystemKey, {}) || {};
  const next = {
    ...current,
    ...access,
    modelSource: MODEL_SOURCE_BYOK,
    authMode: "offline",
    loggedIn: false,
    token: "",
    cloudSave: false,
    billingBalance: 0,
    hostedTier: "standard",
    username: "本机",
    userId: "local",
  };
  delete next.productMode;
  delete next.subscriptionStatus;
  delete next.credits;
  writeLocalObject(LOCAL_KEYS.ecosystemKey, next);
  globalThis.window?.dispatchEvent?.(new CustomEvent("yueqi:product-access-changed", { detail: next }));
  return next;
}

export function ensureLocalOfflineSession() {
  return writeProductAccess(readLocalObject(LOCAL_KEYS.ecosystemKey, {}) || {});
}

export function clearAccountSession() {
  return writeProductAccess({
    username: "",
  });
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
