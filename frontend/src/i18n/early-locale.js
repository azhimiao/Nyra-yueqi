/**
 * Pre-bootstrap locale.
 *
 * The in-product language picker is the only way a user chooses a language, and
 * it persists that choice in `LOCAL_KEYS.settingsKey`. Anything that paints
 * before i18n boots (boot screen, instant phone shell, startup failure notice)
 * must read the same record, otherwise a refresh or a cold start repaints in
 * Chinese for someone who already picked English.
 */

import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject } from "../lib/utils.js";

const SUPPORTED = new Set(["zh-CN", "en"]);

/** Persisted choice, or "" when the user has not picked a language yet. */
export function readStoredLocale() {
  const id = String(readLocalObject(LOCAL_KEYS.settingsKey, {})?.locale || "");
  return SUPPORTED.has(id) ? id : "";
}

export function resolveEarlyLocale() {
  const stored = readStoredLocale();
  if (stored) return stored;
  // In-memory hint only — covers the window between picking a language and the
  // storage write landing, and private-mode browsers where storage throws.
  const hint = typeof window === "undefined" ? "" : window.__yueqiEarlyLocale;
  return SUPPORTED.has(hint) ? hint : "zh-CN";
}

/** Align the document with the persisted choice before the app bundle loads. */
export function applyEarlyLocale() {
  const locale = resolveEarlyLocale();
  if (typeof window !== "undefined") window.__yueqiEarlyLocale = locale;
  if (typeof document === "undefined") return locale;

  const root = document.documentElement;
  root.lang = locale === "en" ? "en" : "zh-CN";
  root.dataset.locale = locale;

  const brand = document.querySelector("[data-boot-brand]");
  if (brand) brand.textContent = locale === "en" ? "Nyra" : "\u6708\u6816 \u00b7 Nyra";

  return locale;
}
