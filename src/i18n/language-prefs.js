/**
 * App locale vs conversation language — separate concerns.
 * Storage locale ids: zh-CN | en (en-US aliases to en).
 */

import { getLocale, setLocale } from "./index.js";

export const LANGUAGE_PREFS_KEY = "yueqi.language.prefs.v1";
export const LANGUAGE_PREFS_CHANGED = "yueqi:language-prefs-changed";

/** @typedef {"zh-CN"|"en-US"} SupportedLocale */
/** @typedef {"follow-user"|"fixed-zh-CN"|"fixed-en-US"|"character-default"} ConversationLanguageMode */

export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US"]);

const DEFAULT_PREFS = Object.freeze({
  schemaVersion: 1,
  appLocale: "zh-CN",
  conversationLanguageMode: "follow-user",
  characterDefaultLanguage: "",
  /** Last stable conversation language for follow-user / proactive */
  conversationLanguage: "zh-CN",
  /** Recent user-message language votes (ISO-ish) */
  recentUserLanguages: [],
});

/** Map product locale → i18n pack id used by t(). */
export function toPackLocale(locale) {
  const id = String(locale || "").trim();
  if (id === "en" || id === "en-US" || id === "en-GB") return "en";
  return "zh-CN";
}

/** Map pack id → SupportedLocale. */
export function toSupportedLocale(packOrLocale) {
  const id = String(packOrLocale || "").trim();
  if (id === "en" || id === "en-US" || id === "en-GB") return "en-US";
  return "zh-CN";
}

function storageGet() {
  try {
    return JSON.parse(localStorage.getItem(LANGUAGE_PREFS_KEY) || "null");
  } catch {
    return null;
  }
}

function storageSet(bag) {
  try {
    localStorage.setItem(LANGUAGE_PREFS_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

/**
 * @param {Partial<typeof DEFAULT_PREFS>} [raw]
 */
export function normalizeLanguagePrefs(raw = {}) {
  const mode = ["follow-user", "fixed-zh-CN", "fixed-en-US", "character-default"].includes(raw.conversationLanguageMode)
    ? raw.conversationLanguageMode
    : DEFAULT_PREFS.conversationLanguageMode;
  const appLocale = toSupportedLocale(raw.appLocale || getLocale());
  const conversationLanguage = toSupportedLocale(raw.conversationLanguage || appLocale);
  const characterDefaultLanguage = raw.characterDefaultLanguage
    ? toSupportedLocale(raw.characterDefaultLanguage)
    : "";
  const recent = Array.isArray(raw.recentUserLanguages)
    ? raw.recentUserLanguages.map(toSupportedLocale).slice(-8)
    : [];
  return {
    schemaVersion: 1,
    appLocale,
    conversationLanguageMode: mode,
    characterDefaultLanguage,
    conversationLanguage,
    recentUserLanguages: recent,
  };
}

export function loadLanguagePrefs() {
  const raw = storageGet();
  if (!raw || typeof raw !== "object") {
    return normalizeLanguagePrefs({
      appLocale: getLocale(),
      conversationLanguage: toSupportedLocale(getLocale()),
    });
  }
  return normalizeLanguagePrefs(raw);
}

export function saveLanguagePrefs(patch = {}) {
  const changesAppLocale = Object.prototype.hasOwnProperty.call(patch, "appLocale");
  const next = normalizeLanguagePrefs({
    ...loadLanguagePrefs(),
    ...patch,
    // The product language picker owns appLocale. Patches about conversation
    // language (including the per-message heuristics) must never drag the UI
    // back to a stale value stored here.
    ...(changesAppLocale ? {} : { appLocale: toSupportedLocale(getLocale()) }),
  });
  storageSet(next);
  if (globalThis.window?.dispatchEvent && typeof globalThis.CustomEvent === "function") {
    globalThis.window.dispatchEvent(new CustomEvent(LANGUAGE_PREFS_CHANGED, { detail: next }));
  }
  // Keep UI pack in sync when appLocale changes — never mark onboarding locale as chosen.
  const pack = toPackLocale(next.appLocale);
  if (changesAppLocale && getLocale() !== pack) {
    setLocale(pack, { chosen: false, syncPrefs: false });
  }
  return next;
}

/**
 * Resolve conversation language for model output.
 * @param {{ characterDefaultLanguage?: string, userMessagePrimaryLanguage?: string }} [opts]
 */
export function resolveConversationLanguage(opts = {}) {
  const prefs = loadLanguagePrefs();
  if (prefs.conversationLanguageMode === "fixed-zh-CN") return "zh-CN";
  if (prefs.conversationLanguageMode === "fixed-en-US") return "en-US";
  if (prefs.conversationLanguageMode === "character-default") {
    return toSupportedLocale(opts.characterDefaultLanguage || prefs.characterDefaultLanguage || prefs.conversationLanguage);
  }
  // follow-user
  if (opts.userMessagePrimaryLanguage) {
    return toSupportedLocale(opts.userMessagePrimaryLanguage);
  }
  return prefs.conversationLanguage || prefs.appLocale || "zh-CN";
}

/**
 * Detect primary language of a short user message (heuristic, not ML).
 * @param {string} text
 * @returns {SupportedLocale|null} null if uncertain / too short
 */
export function detectMessageLanguage(text) {
  const s = String(text || "").trim();
  if (s.length < 4) return null;
  // Skip code-like
  if (/^[{[`]/.test(s) || /https?:\/\//.test(s) && s.length < 40) return null;
  const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (han === 0 && latin === 0) return null;
  if (han >= latin * 1.2 && han >= 2) return "zh-CN";
  if (latin >= han * 1.5 && latin >= 8) return "en-US";
  return null;
}

/**
 * Update follow-user conversation language from a user message.
 * Requires several agreeing votes before switching.
 */
export function noteUserMessageLanguage(text) {
  const detected = detectMessageLanguage(text);
  if (!detected) return loadLanguagePrefs();
  const prefs = loadLanguagePrefs();
  if (prefs.conversationLanguageMode !== "follow-user") return prefs;
  const recent = [...prefs.recentUserLanguages, detected].slice(-5);
  const same = recent.filter((x) => x === detected).length;
  const patch = { recentUserLanguages: recent };
  if (same >= 3 && detected !== prefs.conversationLanguage) {
    patch.conversationLanguage = detected;
  } else if (!prefs.conversationLanguage) {
    patch.conversationLanguage = detected;
  }
  // Explicit switch phrases
  const lower = String(text || "").toLowerCase();
  if (/以后用英文|请用英文|speak (to me )?in english|use english (from now|with me)/i.test(text || "")
    || /from now on.*english/i.test(lower)) {
    patch.conversationLanguage = "en-US";
    patch.recentUserLanguages = ["en-US", "en-US", "en-US"];
  }
  if (/以后用中文|请用中文|speak (to me )?in chinese|use chinese (from now|with me)/i.test(text || "")) {
    patch.conversationLanguage = "zh-CN";
    patch.recentUserLanguages = ["zh-CN", "zh-CN", "zh-CN"];
  }
  return saveLanguagePrefs(patch);
}

/** Bootstrap prefs from existing UI locale once. */
export function ensureLanguagePrefsMigrated() {
  const existing = storageGet();
  if (existing && typeof existing === "object") return loadLanguagePrefs();
  const app = toSupportedLocale(getLocale());
  return saveLanguagePrefs({
    appLocale: app,
    conversationLanguage: app,
    conversationLanguageMode: "follow-user",
  });
}
