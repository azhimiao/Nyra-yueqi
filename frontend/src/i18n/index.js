import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { legalDocumentUrl } from "../../../shared/legal-consent.mjs";
import { applyEarlyLocale, resolveEarlyLocale } from "./early-locale.js";
import zhCN from "./locales/zh-CN.js";
import en from "./locales/en.js";

export const LOCALES = {
  "zh-CN": { id: "zh-CN", labelKey: "lang.zh", pack: zhCN },
  en: { id: "en", labelKey: "lang.en", pack: en },
};

const LOCALE_CHOSEN_KEY = "localeChosen";

function readLocaleState() {
  return readLocalObject(LOCAL_KEYS.settingsKey, {});
}

function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] == null ? `{${key}}` : String(vars[key])
  ));
}

export function hasLocaleChosen() {
  // An early/system locale is only a display default. It must never count as
  // an explicit onboarding choice on a fresh install.
  return Boolean(readLocaleState()[LOCALE_CHOSEN_KEY]);
}

/** Keeps the active pack but marks the language as never explicitly picked. */
export function clearLocaleChoice() {
  const settings = readLocaleState();
  delete settings[LOCALE_CHOSEN_KEY];
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
}

/**
 * The persisted picker choice wins. `window.__yueqiEarlyLocale` is only a
 * pre-storage hint, never an override, so no one can switch languages behind
 * the product UI's back.
 */
export function getLocale() {
  return resolveEarlyLocale();
}

export function getBrandName(locale = getLocale()) {
  return locale === "en" ? "Nyra" : "月栖";
}

/**
 * t("alerts.sttRetry", { error: "..." })
 * t("nav.chat", "en")
 */
export function t(key, localeOrVars, maybeVars) {
  let locale = getLocale();
  let vars = {};
  if (typeof localeOrVars === "string" && LOCALES[localeOrVars]) {
    locale = localeOrVars;
    vars = maybeVars || {};
  } else if (localeOrVars && typeof localeOrVars === "object") {
    vars = localeOrVars;
  }
  const pack = LOCALES[locale]?.pack || zhCN;
  const parts = String(key).split(".");
  let node = pack;
  for (const part of parts) {
    node = node?.[part];
    if (node == null) return key;
  }
  if (typeof node !== "string") return key;
  return Object.keys(vars).length ? interpolate(node, vars) : node;
}

function syncAppLocalePrefs(packId) {
  try {
    // Lazy import to avoid circular init with language-prefs → getLocale
    import("./language-prefs.js").then(({ saveLanguagePrefs, toSupportedLocale }) => {
      saveLanguagePrefs({ appLocale: toSupportedLocale(packId) });
    }).catch(() => {});
  } catch {
    /* optional */
  }
}

export function setLocale(localeId, { chosen = true, syncPrefs = true } = {}) {
  const id = LOCALES[localeId] ? localeId : "zh-CN";
  const settings = readLocaleState();
  settings.locale = id;
  if (chosen) settings[LOCALE_CHOSEN_KEY] = true;
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  if (typeof window !== "undefined") {
    // In-memory hint, so a browser that refuses storage still follows the pick.
    window.__yueqiEarlyLocale = id;
  }
  // Re-run the pre-bootstrap sync: <html lang>, the boot screen and anything
  // else painted before i18n existed must follow a live switch too.
  applyEarlyLocale();
  if (typeof document !== "undefined") {
    applyI18n(document);
    if (globalThis.window?.dispatchEvent && typeof globalThis.CustomEvent === "function") {
      globalThis.window.dispatchEvent(new CustomEvent("yueqi:locale-changed", {
        detail: { locale: id },
      }));
    }
  }
  if (syncPrefs) syncAppLocalePrefs(id);
  return id;
}

function applyAttr(node, attrSpec, locale) {
  String(attrSpec || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [attr, key] = pair.split(":");
      if (!attr || !key) return;
      node.setAttribute(attr, t(key, locale));
    });
}

export function applyI18n(root = typeof document !== "undefined" ? document : null) {
  if (!root || typeof document === "undefined") return;
  const locale = getLocale();
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.dataset.i18n;
    if (!key) return;
    const value = t(key, locale);
    if (node.dataset.i18nHtml === "true") {
      node.innerHTML = value;
    } else {
      node.textContent = value;
    }
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    applyAttr(node, node.dataset.i18nAttr, locale);
  });
  root.querySelectorAll("[data-legal-document]").forEach((node) => {
    node.setAttribute("href", legalDocumentUrl(node.dataset.legalDocument, locale));
  });

  const title = t("meta.title", locale);
  if (document.title !== title) document.title = title;

  let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (!appleTitle) {
    appleTitle = document.createElement("meta");
    appleTitle.setAttribute("name", "apple-mobile-web-app-title");
    document.head.append(appleTitle);
  }
  appleTitle.setAttribute("content", t("meta.appTitle", locale));

  const shell = root.querySelector?.(".app-shell") || document.querySelector(".app-shell");
  shell?.setAttribute("aria-label", t("brand.shellLabel", locale));
}

function syncLocaleControls(locale = getLocale()) {
  document.querySelectorAll("[data-set-locale]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.setLocale === locale);
  });
  document.querySelectorAll("[data-locale-select]").forEach((select) => {
    select.value = locale;
  });
}

function syncConversationModeControls(mode) {
  document.querySelectorAll("[data-set-conversation-mode]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.setConversationMode === mode);
  });
}

export function wireLanguageUi({ onChange, manageGate = true } = {}) {
  const gate = document.querySelector("[data-lang-gate]");
  if (manageGate) {
    const showGate = !hasLocaleChosen();
    if (gate) {
      gate.hidden = !showGate;
      gate.setAttribute("aria-hidden", showGate ? "false" : "true");
      gate.classList.toggle("is-open", showGate);
    }
  }

  document.documentElement.lang = getLocale() === "en" ? "en" : "zh-CN";
  document.documentElement.dataset.locale = getLocale();
  syncLocaleControls();

  document.querySelectorAll("[data-set-locale]").forEach((button) => {
    button.addEventListener("click", () => {
      // Wizard owns locale buttons inside the onboarding gate.
      if (button.closest("[data-onboard-gate]")) return;
      const next = setLocale(button.dataset.setLocale);
      syncLocaleControls(next);
      if (manageGate && gate && button.closest("[data-lang-gate]")) {
        gate.hidden = true;
        gate.setAttribute("aria-hidden", "true");
        gate.classList.remove("is-open");
      }
      onChange?.(next);
    });
  });

  document.querySelectorAll("[data-locale-select]").forEach((select) => {
    select.addEventListener("change", () => {
      const next = setLocale(select.value);
      syncLocaleControls(next);
      onChange?.(next);
    });
  });

  import("./language-prefs.js").then(({ loadLanguagePrefs, saveLanguagePrefs }) => {
    const prefs = loadLanguagePrefs();
    syncConversationModeControls(prefs.conversationLanguageMode);
    document.querySelectorAll("[data-set-conversation-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.setConversationMode;
        const patch = { conversationLanguageMode: mode };
        if (mode === "fixed-zh-CN") patch.conversationLanguage = "zh-CN";
        if (mode === "fixed-en-US") patch.conversationLanguage = "en-US";
        const next = saveLanguagePrefs(patch);
        syncConversationModeControls(next.conversationLanguageMode);
        onChange?.(getLocale());
      });
    });
  }).catch(() => {});

  applyI18n(document);
}
