import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { clearLocaleChoice, hasLocaleChosen } from "../i18n/index.js";
import { CHARACTERS_MIGRATED_KEY, LOCAL_KEYS } from "../constants.js";
import { clearAccountSession } from "../account/product-access.js";
import { clearAppModeChoice, hasExplicitAppModeChoice, prefersPhoneShell } from "./app-mode.js";

export { APP_MODE_KEY } from "./app-mode.js";

export const ONBOARDING_KEY = "yueqi.onboarding.v1";
export const ACCOUNT_MODE_OFFLINE = "offline";
export const ACCOUNT_MODE_ONLINE = "online";

/**
 * @typedef {{
 *   done?: boolean,
 *   accountMode?: "offline"|"online",
 *   migratedFromLocale?: boolean,
 *   uiModeChosen?: boolean,
 *   resetAt?: string
 * }} OnboardingState
 */

/** @returns {OnboardingState} */
export function readOnboarding() {
  return readLocalObject(ONBOARDING_KEY, {});
}

/** @param {Partial<OnboardingState> & { resetAt?: string | null }} patch */
export function writeOnboarding(patch = {}) {
  const next = { ...readOnboarding(), ...patch };
  if (patch.resetAt === null) delete next.resetAt;
  writeLocalObject(ONBOARDING_KEY, next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("yueqi:onboarding-changed", { detail: next }));
  }
  return next;
}

export function getAccountMode() {
  return ACCOUNT_MODE_OFFLINE;
}

export function setAccountMode(mode) {
  return writeOnboarding({
    accountMode: mode === ACCOUNT_MODE_OFFLINE ? ACCOUNT_MODE_OFFLINE : ACCOUNT_MODE_ONLINE,
  });
}

export function isOnlineAccountMode() {
  return false;
}

/**
 * Evidence the user already used the product (not just picked a language).
 * Do NOT treat a silent default `yueqi.app.mode` as usage — that skipped the UI step.
 */
export function hasProductUsageTrace() {
  try {
    const storage = window.localStorage;
    if (!storage) return false;

    // Only count mode if the user explicitly chose it (wizard / settings).
    if (hasExplicitAppModeChoice()) return true;

    const ecosystem = readLocalObject(LOCAL_KEYS.ecosystemKey, null);
    if (ecosystem?.loggedIn || ecosystem?.token || ecosystem?.authMode === "offline") return true;

    const chat = readLocalObject(LOCAL_KEYS.chatMessagesKey, null);
    if (Array.isArray(chat) && chat.length > 0) return true;
    if (chat && typeof chat === "object" && !Array.isArray(chat)) {
      const values = Object.values(chat);
      if (values.some((entry) => Array.isArray(entry) ? entry.length > 0 : Boolean(entry))) {
        return true;
      }
    }

    const characters = readLocalObject(LOCAL_KEYS.charactersKey, null);
    if (Array.isArray(characters) && characters.length > 0) return true;
    if (characters && typeof characters === "object" && Object.keys(characters).length > 0) {
      return true;
    }

    const profile = readLocalObject(LOCAL_KEYS.profileKey, null);
    if (profile && (profile.name || profile.displayName || profile.persona)) return true;

    const memories = readLocalObject(LOCAL_KEYS.memoryKey, null);
    if (Array.isArray(memories) && memories.length > 0) return true;

    const migrated = storage.getItem(CHARACTERS_MIGRATED_KEY);
    if (migrated === "1" || migrated === "true") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function hasUiModeChosen(state = readOnboarding()) {
  return Boolean(state.uiModeChosen) || hasExplicitAppModeChoice();
}

/**
 * First-run wizard incomplete → show gate.
 * Missing `done` always means show wizard (every new install).
 * Phone builds also require an explicit UI-mode pick before treating onboarding complete.
 */
export function hasOnboardingDone() {
  const state = readOnboarding();
  if (!state.done) return false;

  // done=true but phone user never picked shell → still show UI step
  if (prefersPhoneShell() && !hasUiModeChosen(state)) {
    return false;
  }

  return true;
}

export function markOnboardingDone({ uiModeChosen = true } = {}) {
  return writeOnboarding({
    done: true,
    accountMode: ACCOUNT_MODE_OFFLINE,
    productMode: undefined,
    productModeChosen: undefined,
    uiModeChosen: Boolean(uiModeChosen),
    resetAt: null,
  });
}

/**
 * Clear completion so the first-run wizard can open again (settings → 重新引导).
 * `signOut` / `forgetLocale` make it a true cold start: the wizard then begins at
 * the language step and demands a fresh login. Chats, characters and memories stay.
 * @param {{ signOut?: boolean, forgetLocale?: boolean }} opts
 */
export function resetOnboarding({ signOut = false, forgetLocale = false } = {}) {
  clearAppModeChoice();
  if (signOut) clearAccountSession();
  if (forgetLocale) clearLocaleChoice();
  return writeOnboarding({
    done: false,
    accountMode: ACCOUNT_MODE_OFFLINE,
    productMode: undefined,
    productModeChosen: undefined,
    uiModeChosen: false,
    resetAt: new Date().toISOString(),
  });
}
