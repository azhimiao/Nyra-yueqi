import { Capacitor } from "@capacitor/core";
import {
  isNativeKvReady,
  readNativeKvRaw,
  removeNativeKvRaw,
  writeNativeKvRaw,
} from "../platform/kv-store.js";

/**
 * Shared App / 小手机 shell mode helpers.
 * Product default for handsets / APK: phone. App is opt-in only.
 */

export const APP_MODE_KEY = "yueqi.app.mode";
/** Set only when user picks App/Phone in wizard or Settings. */
export const APP_MODE_CHOSEN_KEY = "yueqi.app.mode.chosen";

export function normalizeAppMode(mode) {
  return mode === "phone" ? "phone" : "app";
}

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True on Capacitor APK/IPA or compact viewport. */
export function prefersPhoneShell() {
  try {
    if (isNative()) return true;
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      if (root?.classList?.contains("is-native-app")) return true;
      if (root?.classList?.contains("is-compact-shell")) return true;
    }
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      return window.matchMedia("(max-width: 1079px)").matches;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function hasExplicitAppModeChoice() {
  try {
    const raw = isNativeKvReady() ? readNativeKvRaw(APP_MODE_CHOSEN_KEY) : window.localStorage?.getItem(APP_MODE_CHOSEN_KEY);
    return raw === "1" || raw === "true" || raw === true;
  } catch {
    return false;
  }
}

export function markAppModeChosen() {
  try {
    if (isNativeKvReady()) writeNativeKvRaw(APP_MODE_CHOSEN_KEY, "1");
    else window.localStorage?.setItem(APP_MODE_CHOSEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Drops the stored shell so the wizard's UI step starts undecided again. */
export function clearAppModeChoice() {
  [APP_MODE_KEY, APP_MODE_CHOSEN_KEY].forEach((key) => {
    try {
      removeNativeKvRaw(key);
      window.localStorage?.removeItem(key);
    } catch {
      /* ignore */
    }
  });
}

/**
 * Fresh install / no explicit choice → phone on native & narrow screens.
 * Wide desktop browser without a choice → app.
 * @returns {"app"|"phone"}
 */
export function resolveDefaultAppMode() {
  if (hasExplicitAppModeChoice()) {
    try {
      const stored = isNativeKvReady() ? readNativeKvRaw(APP_MODE_KEY) : window.localStorage?.getItem(APP_MODE_KEY);
      if (stored === "phone" || stored === "app") return stored;
    } catch {
      /* ignore */
    }
  }
  return prefersPhoneShell() ? "phone" : "app";
}


export function persistAppMode(mode) {
  const next = normalizeAppMode(mode);
  if (isNativeKvReady()) writeNativeKvRaw(APP_MODE_KEY, next);
  else window.localStorage?.setItem(APP_MODE_KEY, next);
  markAppModeChosen();
  return next;
}
