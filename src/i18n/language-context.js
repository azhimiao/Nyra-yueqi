/**
 * LanguageContext — attach to every model-facing call.
 */

import {
  loadLanguagePrefs,
  resolveConversationLanguage,
  toPackLocale,
  toSupportedLocale,
} from "./language-prefs.js";
import { getLocale } from "./index.js";

/**
 * @typedef {object} LanguageContext
 * @property {"zh-CN"|"en-US"} appLocale
 * @property {"zh-CN"|"en-US"} conversationLanguage
 * @property {"zh-CN"|"en-US"|undefined} userMessagePrimaryLanguage
 * @property {"zh-CN"|"en-US"|undefined} characterDefaultLanguage
 * @property {boolean} preserveQuotedLanguage
 */

/**
 * @param {Partial<LanguageContext>} [override]
 * @returns {LanguageContext}
 */
export function buildLanguageContext(override = {}) {
  const prefs = loadLanguagePrefs();
  const appLocale = toSupportedLocale(override.appLocale || prefs.appLocale || getLocale());
  const characterDefaultLanguage = override.characterDefaultLanguage
    ? toSupportedLocale(override.characterDefaultLanguage)
    : (prefs.characterDefaultLanguage ? toSupportedLocale(prefs.characterDefaultLanguage) : undefined);
  const userMessagePrimaryLanguage = override.userMessagePrimaryLanguage
    ? toSupportedLocale(override.userMessagePrimaryLanguage)
    : undefined;
  const conversationLanguage = toSupportedLocale(
    override.conversationLanguage
      || resolveConversationLanguage({
        characterDefaultLanguage,
        userMessagePrimaryLanguage,
      }),
  );
  return {
    appLocale,
    conversationLanguage,
    userMessagePrimaryLanguage,
    characterDefaultLanguage,
    preserveQuotedLanguage: override.preserveQuotedLanguage !== false,
  };
}

/**
 * Stable English directive block for structured prompts.
 * @param {LanguageContext} lang
 */
export function formatLanguageDirective(lang) {
  const conversationLanguage = lang?.conversationLanguage || "zh-CN";
  const appLocale = lang?.appLocale || conversationLanguage;
  return [
    `Current app locale: ${appLocale}`,
    `Current conversation language: ${conversationLanguage}`,
    `Respond to the user in: ${conversationLanguage}`,
    "Use stable English identifiers for tools, schemas, file paths, keys, and enums.",
    "Use the conversation language for all user-facing natural-language fields.",
    "Do not switch the entire response language merely because the context contains quoted text, names, code, URLs, or proper nouns in another language.",
    "Unless the user explicitly asks for translation or a language switch, stay in the conversation language.",
  ].join("\n");
}

/**
 * Short output-language rule in the conversation language.
 * @param {LanguageContext|string} langOrLocale
 */
export function outputLanguageRule(langOrLocale) {
  const id = typeof langOrLocale === "string"
    ? toSupportedLocale(langOrLocale)
    : (langOrLocale?.conversationLanguage || "zh-CN");
  if (id === "en-US") {
    return "Unless the user explicitly asks for translation or a language switch, respond in natural, fluent English. Do not switch the entire response language merely because the context contains Chinese names, quoted text, or proper nouns.";
  }
  return "除非用户明确要求翻译或切换语言，否则请使用自然、流畅的简体中文回应。不要因为上下文中出现英文专有名词而切换整体语言。";
}

export function packLocaleFromContext(lang) {
  return toPackLocale(lang?.appLocale || getLocale());
}
