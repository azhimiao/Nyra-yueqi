/**
 * Live companion preview — local templates first; optional model polish.
 * Preview never writes long-term memory.
 */

import { getFirstLightCopy } from "./copy.js";
import { getLocale } from "../i18n/index.js";
import { toPackLocale } from "../i18n/language-prefs.js";
import { renderPrompt } from "../prompts/registry.js";
import { buildLanguageContext } from "../i18n/language-context.js";
import { buildOpeningIntroLines } from "../chat/opening-intro.js";

const TEMPLATES_ZH = {
  balanced: [
    "你不用现在就把事情说清楚。",
    "我可以先陪你待一会儿，等你想说的时候再说。",
  ],
  softer: [
    "没关系，先靠过来一点。",
    "我在这儿。你想安静一会儿，也可以。",
  ],
  direct: [
    "我听见你了。",
    "你要是愿意，我们可以把最卡住的那一点先说开。",
  ],
  proactive: [
    "这几天没见你，我有点惦记。",
    "不急着解释。回来了就好，我先陪着你。",
  ],
  lessComfort: [
    "我在。",
    "你准备好了再说。需要我安静，还是一起想想下一步，你定。",
  ],
};

const TEMPLATES_EN = {
  balanced: [
    "You don't have to explain everything right now.",
    "I can stay with you for a while — talk when you're ready.",
  ],
  softer: [
    "It's alright. Come a little closer.",
    "I'm here. Quiet is fine too.",
  ],
  direct: [
    "I hear you.",
    "If you want, we can name the part that feels stuck first.",
  ],
  proactive: [
    "I missed you these past few days.",
    "No rush to explain. You're back — that's enough for now.",
  ],
  lessComfort: [
    "I'm here.",
    "When you're ready. Quiet company, or next steps — you choose.",
  ],
};

function templatesForLocale(locale = getLocale()) {
  return toPackLocale(locale) === "en" ? TEMPLATES_EN : TEMPLATES_ZH;
}

/**
 * @param {object} draft
 * @param {string} [tone]
 * @param {string} [locale]
 */
export function buildPreviewLines(draft = {}, tone = "balanced", locale = getLocale()) {
  const TEMPLATES = templatesForLocale(locale);
  const key = TEMPLATES[tone] ? tone : "balanced";
  // Explicit user tone picks always win — do not remap via earlier style answers.
  if (key !== "balanced") {
    return [...TEMPLATES[key]];
  }
  let lines = [...TEMPLATES.balanced];
  if (draft.supportStyle === "hold") lines = [...TEMPLATES.softer];
  if (draft.conflictStyle === "direct") lines = [...TEMPLATES.direct];
  if (draft.initiativeStyle === "reach") lines = [...TEMPLATES.proactive];
  return lines;
}

/**
 * @param {object} draft
 * @param {{ callModel?: Function, collectProviderConfig?: Function, locale?: string }} [deps]
 */
export async function polishPreviewLines(draft, deps = {}) {
  const locale = deps.locale || getLocale();
  const copy = getFirstLightCopy(locale);
  const base = buildPreviewLines(draft, draft.previewTone || "balanced", locale);
  if (typeof deps.callModel !== "function" || typeof deps.collectProviderConfig !== "function") {
    return { lines: base, source: "template" };
  }
  try {
    const config = await deps.collectProviderConfig();
    if (!config?.baseUrl || !config?.apiKey || !config?.model) {
      return { lines: base, source: "template" };
    }
    const language = buildLanguageContext({
      appLocale: locale,
      conversationLanguage: toPackLocale(locale) === "en" ? "en-US" : "zh-CN",
    });
    const system = renderPrompt("first_light.preview_polish", { language });
    const result = await deps.callModel(
      config,
      [
        { role: "system", content: typeof system === "string" ? system : system },
        {
          role: "user",
          content: `support:${draft.supportStyle || ""}; initiative:${draft.initiativeStyle || ""}; intimacy:${draft.intimacyStyle || ""}.\n${base.join("\n")}`,
        },
      ],
      { stream: false, temperature: 0.7 },
    );
    const text = String(result?.content || result?.text || "").trim();
    const lines = text
      .split(/\n+/)
      .map((s) => s.replace(/^["「]|["」]$/g, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (lines.length >= 1) return { lines, source: "model" };
  } catch {
    /* fall through */
  }
  return { lines: base, source: "template", notice: copy.offlinePreview };
}

/**
 * @param {object} draft
 * @param {string} [locale]
 */
export function firstMessageForDraft(draft = {}, locale = getLocale()) {
  return buildOpeningIntroLines({
    // v1 appearance asks「你希望怎么称呼我？」— that is callCharacterAs, not the official name.
    characterName: draft.characterName,
    callCharacterAs: draft.callCharacterAs || draft.name,
    callUserAs: draft.callUserAs,
    relationshipType: draft.relationshipType,
    relationshipStart: draft.relationshipStart,
    sharedHistory: draft.sharedHistory,
    customRelationshipText: draft.customRelationshipText,
    customRelationLabel: draft.customRelationLabel,
  }, locale);
}
