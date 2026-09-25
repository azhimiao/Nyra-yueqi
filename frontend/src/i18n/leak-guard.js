/**
 * Dev-only: warn when en-US UI renders unexpected Chinese (not user content).
 */

import { buildLanguageContext } from "./language-context.js";
import { toPackLocale } from "./language-prefs.js";

const HAN_RE = /[\u4e00-\u9fff]/;

/** @type {WeakSet<object>} */
const SEEN = typeof WeakSet !== "undefined" ? new WeakSet() : null;

function isDev() {
  try {
    return Boolean(import.meta?.env?.DEV)
      || (typeof location !== "undefined" && /localhost|127\.0\.0\.1/.test(location.hostname));
  } catch {
    return false;
  }
}

/**
 * @param {string} text
 * @param {{ source?: string, allow?: boolean }} [meta]
 */
export function warnIfChineseUiLeak(text, meta = {}) {
  if (!isDev() || meta.allow) return;
  const lang = buildLanguageContext();
  if (toPackLocale(lang.appLocale) !== "en") return;
  const s = String(text || "");
  if (!HAN_RE.test(s)) return;
  const tag = `[I18N_LEAK] Unexpected Chinese text rendered in en-US UI${meta.source ? ` (${meta.source})` : ""}: ${s.slice(0, 80)}`;
  console.warn(tag);
}

/**
 * Observe textContent mutations under root (dev only).
 * @param {ParentNode} root
 */
export function installUiLeakObserver(root) {
  if (!isDev() || !root || typeof MutationObserver === "undefined") return () => {};
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") {
        warnIfChineseUiLeak(m.target?.textContent, { source: "characterData" });
      }
      m.addedNodes?.forEach((node) => {
        if (node.nodeType === 1) {
          const el = /** @type {HTMLElement} */ (node);
          if (el.dataset?.i18nAllowZh === "true" || el.closest?.("[data-i18n-allow-zh]")) return;
          warnIfChineseUiLeak(el.textContent, { source: el.tagName });
        }
      });
    }
  });
  obs.observe(root, { characterData: true, childList: true, subtree: true });
  return () => obs.disconnect();
}

/**
 * Detect dominant Chinese in model output when conversationLanguage is en-US.
 * @param {string} text
 * @param {{ conversationLanguage?: string, isTranslationTask?: boolean }} [opts]
 * @returns {{ mismatch: boolean, code?: string }}
 */
export function detectModelLanguageMismatch(text, opts = {}) {
  const conversationLanguage = opts.conversationLanguage || buildLanguageContext().conversationLanguage;
  if (conversationLanguage !== "en-US" || opts.isTranslationTask) {
    return { mismatch: false };
  }
  const s = String(text || "").trim();
  if (s.length < 8) return { mismatch: false };
  const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (han >= 8 && han > latin * 1.5) {
    return { mismatch: true, code: "LANGUAGE_MISMATCH_MODEL_OUTPUT" };
  }
  return { mismatch: false };
}

export const LANGUAGE_MISMATCH_RETRY_HINT =
  "Your previous reply was mostly Chinese. Rewrite the entire user-facing reply in natural English. Keep quoted Chinese, names, and code unchanged.";
