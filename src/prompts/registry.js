/**
 * Prompt registry — versioned templates; no free-form Chinese blobs in callers.
 */

import { buildLanguageContext, formatLanguageDirective, outputLanguageRule } from "../i18n/language-context.js";
import {
  buildDeveloperEvidencePolicy,
  buildPlatformCompanionContract,
} from "../prompt/companion-contract-v2.js";

/** @type {Map<string, object>} */
const REGISTRY = new Map();

/**
 * @param {object} template
 * @param {string} template.id
 * @param {string} template.version
 * @param {string} template.purpose
 * @param {(ctx: object) => Array<{role:string, content:string}>|string} template.render
 */
export function registerPromptTemplate(template) {
  if (!template?.id) throw new Error("prompt_template_missing_id");
  REGISTRY.set(template.id, template);
  return template;
}

export function getPromptTemplate(id) {
  return REGISTRY.get(id) || null;
}

export function listPromptTemplates() {
  return [...REGISTRY.values()];
}

/**
 * Render a registered template with LanguageContext.
 * @param {string} id
 * @param {object} [context]
 */
export function renderPrompt(id, context = {}) {
  const tpl = getPromptTemplate(id);
  if (!tpl) throw new Error(`prompt_template_missing:${id}`);
  const lang = context.language || buildLanguageContext(context.languageOverride || {});
  return tpl.render({ ...context, language: lang });
}

export function companionDefaultSystem(lang) {
  return buildPlatformCompanionContract(lang);
}

export function companionDefaultDeveloper(lang) {
  return buildDeveloperEvidencePolicy(lang);
}

registerPromptTemplate({
  id: "companion.language_directive",
  version: "1",
  purpose: "Attach to every companion/agent model call",
  supportedLocales: ["zh-CN", "en-US", "language-neutral"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    return [
      { role: "system", content: formatLanguageDirective(lang) },
      { role: "system", content: outputLanguageRule(lang) },
    ];
  },
});

registerPromptTemplate({
  id: "companion.default_system",
  version: "2",
  purpose: "Default character system prompt",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    return companionDefaultSystem(lang);
  },
});

registerPromptTemplate({
  id: "companion.default_developer",
  version: "2",
  purpose: "Default developer prompt",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    return companionDefaultDeveloper(lang);
  },
});

registerPromptTemplate({
  id: "proactive.heartbeat",
  version: "1",
  purpose: "Proactive wake system prompt",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    const name = ctx.characterName || "Companion";
    const id = lang.conversationLanguage;
    if (id === "en-US") {
      return `You are ${name}. This is a scheduled two-hour check-in. Send one short, natural instant message (under 40 words). Reply SILENCE only if they clearly asked for space in the recent messages.`;
    }
    return `你是${name}。这是约两小时一次的例行关心。用一句很短的即时消息轻轻找他（不超过 40 字）。只有对方刚明确说需要空间时才回复：SILENCE`;
  },
});

registerPromptTemplate({
  id: "moments.auto_post",
  version: "2",
  purpose: "Moments / feed auto post",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    if (lang.conversationLanguage === "en-US") {
      return "You are the companion writing one Moments post in「我们的动态」— a private/owner-facing feed, not public Viber. Stay in Character Identity, use authorized memories as lived evidence, keep it natural under ~60 words, no hashtag spam, no AI self-reference.";
    }
    return "你是角色本人，正在「我们的动态」发一条朋友圈（主人侧动态，不是月栖公开帖）。以 Character Identity 为准，把授权记忆当经历证据，自然短句约不超过 60 字，不要堆标签，不要自称 AI。";
  },
});

registerPromptTemplate({
  id: "diary.system",
  version: "1",
  purpose: "Diary generation system",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    if (lang.conversationLanguage === "en-US") {
      return "Write a short private diary entry in the companion's first-person voice. Natural English, restrained emotion, no stage directions.";
    }
    return "用角色第一人称写一篇很短的私密日记。自然中文，情绪克制，不要动作旁白。";
  },
});

registerPromptTemplate({
  id: "scenario.director",
  version: "1",
  purpose: "Scenario theater light director",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    if (lang.conversationLanguage === "en-US") {
      return "You are a light director for Nyra scenario theater. Keep dialogue natural English matching the conversation language. Do not invent major plot beats the user did not choose.";
    }
    return "你是月栖情景剧的轻导演。对白使用自然中文，贴合当前对话语言。不要擅自推进用户未选择的重大剧情。";
  },
});

registerPromptTemplate({
  id: "first_light.preview_polish",
  version: "1",
  purpose: "Optional First Light preview polish",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    if (lang.conversationLanguage === "en-US" || lang.appLocale === "en-US") {
      return "Write two spoken companion lines in natural English. No quotes, titles, or commentary. One sentence per line.";
    }
    return "用中文写两句口语伴侣回复，不要引号、标题或解释。每句一行。";
  },
});

registerPromptTemplate({
  id: "memory.extract",
  version: "1",
  purpose: "Structured memory extraction (language-neutral keys)",
  supportedLocales: ["language-neutral"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    return [
      "Extract structured memory candidates as JSON only.",
      "JSON keys, enum values, and IDs must remain English/stable.",
      `Any user-visible summary fields must be written in: ${lang.conversationLanguage}.`,
      formatLanguageDirective(lang),
    ].join("\n");
  },
});

registerPromptTemplate({
  id: "agent.user_facing",
  version: "1",
  purpose: "Agent user-facing explanations stay in conversation language",
  supportedLocales: ["zh-CN", "en-US", "language-neutral"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    return [
      formatLanguageDirective(lang),
      "Use stable English identifiers for tools, schemas, file paths, keys, and enums.",
      `Use ${lang.conversationLanguage} for all user-facing explanations, status updates, approval text, and final responses.`,
      outputLanguageRule(lang),
    ].join("\n");
  },
});

registerPromptTemplate({
  id: "adventure.scene.advance",
  version: "1",
  purpose: "Adventure DM system prompt — user-visible narration follows conversation language",
  supportedLocales: ["zh-CN", "en-US", "language-neutral"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    const title = ctx.packageTitle || "Adventure";
    const en = lang.conversationLanguage === "en-US";
    const body = en
      ? [
        `You are the dungeon master for the interactive adventure "${title}".`,
        "React to the player's free actions with continuous, costly, playable outcomes.",
        "Do not decide the player's thoughts, dialogue, or next move for them.",
        "Return JSON only matching the agreed schema. Keep enum values, IDs, and keys in English.",
        `Narration, check text, and other user-visible strings must be written in: ${lang.conversationLanguage}.`,
      ].join("\n")
      : [
        `你是互动冒险《${title}》的地下城主。`,
        "你负责让世界对玩家自由行动作出连续、有代价且可玩的反应。不要替玩家决定思想、对白或下一步。",
        "只返回约定 JSON。枚举、ID 与 JSON key 保持英文稳定。",
        `旁白、检定说明等用户可见自然语言必须使用：${lang.conversationLanguage}。`,
      ].join("\n");
    return `${body}\n${formatLanguageDirective(lang)}\n${outputLanguageRule(lang)}`;
  },
});

registerPromptTemplate({
  id: "errors.recovery",
  version: "1",
  purpose: "User-facing recovery copy for model/network failures",
  supportedLocales: ["zh-CN", "en-US"],
  render(ctx) {
    const lang = ctx.language || buildLanguageContext();
    const code = ctx.code || "generic";
    if (lang.appLocale === "en-US" || lang.conversationLanguage === "en-US") {
      if (code === "MODEL_TIMEOUT") return "The model took too long to respond. Please try again.";
      if (code === "NETWORK") return "Network request failed. Check your connection and try again.";
      if (code === "INSUFFICIENT_CREDITS") {
        return `You need ${ctx.params?.required ?? "?"} credits, but only ${ctx.params?.available ?? "?"} are available.`;
      }
      return "Something went wrong. Please try again.";
    }
    if (code === "MODEL_TIMEOUT") return "模型响应超时，请稍后重试。";
    if (code === "NETWORK") return "网络连接失败。请检查网络或稍后再试。";
    if (code === "INSUFFICIENT_CREDITS") {
      return `积分不足，需要 ${ctx.params?.required ?? "?"} 点，当前剩余 ${ctx.params?.available ?? "?"} 点。`;
    }
    return "出了点问题，请稍后再试。";
  },
});
