/**
 * Map First Light draft → structural prefs (IDs only) + localized review/prompt text.
 */

import { getFirstLightCopy, labelOf } from "./copy.js";
import { getLocale } from "../i18n/index.js";
import { toPackLocale } from "../i18n/language-prefs.js";
import { outputLanguageRule } from "../i18n/language-context.js";
import { companionDefaultSystem } from "../prompts/registry.js";

export function draftToStructuralPrefs(draft = {}) {
  return {
    supportStyle: draft.supportStyle || "judge",
    initiativeStyle: draft.initiativeStyle || "occasional",
    conflictStyle: draft.conflictStyle || "gentle",
    intimacyStyle: draft.intimacyStyle || "warm",
    autonomyPreference: draft.autonomyPreference || "balanced",
    relationshipType: draft.relationshipType || "undefined",
    relationshipStart: draft.relationshipStart || "now",
    purposes: Array.isArray(draft.purposes) ? draft.purposes.slice(0, 3) : [],
    customRelationshipText: String(draft.customRelationshipText || draft.customRelationLabel || "").trim(),
    hardBoundaries: {
      allowProactive: draft.allowProactive !== false,
      allowJealousy: Boolean(draft.allowJealousy),
      allowNudge: Boolean(draft.allowNudge),
      quietNight: draft.quietNight !== false,
      autoDiary: Boolean(draft.autoDiary),
      autoMoments: Boolean(draft.autoMoments),
    },
  };
}

export function draftToAutonomyPatch(draft = {}) {
  const isLover = draft.relationshipType === "lover";
  return {
    preset: "companion",
    aiAutonomousLife: true,
    proactiveMessage: true,
    autoDiary: Boolean(draft.autoDiary),
    autoMoments: Boolean(draft.autoMoments),
    anniversaryProactive: isLover,
    systemNotifications: true,
    onboardingComplete: true,
    dailyCap: 8,
    dailyProactiveBudget: 8,
    quietStart: draft.quietNight !== false ? "22:00" : "23:30",
    quietEnd: "08:00",
  };
}

export function draftToRelationshipSeed(draft = {}) {
  const type = draft.relationshipType;
  const start = draft.relationshipStart;
  let intimacy = 1.2;
  let trust = 1.4;
  let tension = 0.2;
  const flags = [`fl:${type || "undefined"}`];
  if (type === "lover") {
    if (start === "now") {
      intimacy = 2.4;
      trust = 2.2;
      flags.push("fl:lover_now");
    } else if (start === "long") {
      intimacy = 3.4;
      trust = 3.2;
      flags.push("fl:lover_long");
    } else if (start === "slow") {
      intimacy = 1.6;
      trust = 1.8;
      flags.push("fl:lover_slow");
    } else if (start === "scenario") {
      intimacy = 2.6;
      trust = 2.0;
      flags.push("fl:lover_scenario");
    }
  } else if (type === "friend") {
    intimacy = 1.5;
    trust = 2.0;
  } else if (type === "family") {
    intimacy = 2.2;
    trust = 2.8;
  } else if (type === "partner") {
    intimacy = 1.4;
    trust = 2.4;
  } else if (type === "custom") {
    flags.push("fl:custom");
  }
  return { intimacy, trust, tension, flags };
}

/**
 * @param {object} draft
 * @param {string} [locale]
 */
export function buildReviewSections(draft = {}, locale = getLocale()) {
  const copy = getFirstLightCopy(locale);
  const en = toPackLocale(locale) === "en";

  const rel = (() => {
    if (draft.relationshipType === "lover") {
      if (draft.relationshipStart === "long") {
        return en
          ? "We're partners now. Part of our shared past is already agreed."
          : "我们现在就是恋人。共同经历里，有一段已经确认过的过去。";
      }
      if (draft.relationshipStart === "slow") {
        return en
          ? "We're growing closer. Nothing is formally settled, but it already feels different."
          : "我们正慢慢靠近。还没有正式确认，但气氛已经不一样了。";
      }
      if (draft.relationshipStart === "scenario") {
        return en
          ? "We're beginning inside the romantic scenario you chose. The relationship is in place."
          : "我们按你选择的恋爱设定开始。关系已经立住。";
      }
      return en
        ? "We're partners from today. Shared history will grow from here."
        : "我们现在就是恋人。具体共同经历从今天开始积累。";
    }
    const label = draft.relationshipType === "custom"
      ? (String(draft.customRelationshipText || draft.customRelationLabel || "").trim()
        || (en ? "a custom relationship" : "自定义关系"))
      : (labelOf(copy.relationship.options, draft.relationshipType)
        || (en ? "Leave It Undefined" : "暂时不定义"));
    return en
      ? `We're relating as “${label}” for now. You can change this later.`
      : `我们现在以「${label}」相处。之后仍可调整。`;
  })();

  const supportMap = en
    ? {
      hold: "hold you first",
      quiet: "sit with you quietly",
      clarify: "help you sort it out",
      distract: "gently pull you elsewhere",
      judge: "read the moment",
    }
    : {
      hold: "先抱抱你",
      quiet: "安静陪着你",
      clarify: "帮你理清问题",
      distract: "主动带你做点别的",
      judge: "看情况判断",
    };
  const initiativeMap = en
    ? {
      reach: "reach out",
      occasional: "check in once in a while",
      wait: "wait for you",
      situational: "decide from how things feel",
    }
    : {
      reach: "主动来找你",
      occasional: "偶尔问一句",
      wait: "等你回来",
      situational: "根据当时关系判断",
    };
  const support = supportMap[draft.supportStyle] || supportMap.judge;
  const initiative = initiativeMap[draft.initiativeStyle] || initiativeMap.occasional;
  const accompany = en
    ? [
      `If you're away for a few days, they'll ${initiative}.`,
      `When you're hurting, they'll ${support}.`,
    ].join("\n")
    : [
      `如果你几天没来，ta会${initiative}。`,
      `你难受时，ta会${support}。`,
    ].join("\n");

  const intimacy = labelOf(copy.intimacy.options, draft.intimacyStyle)
    || (en ? "Warm and steady" : "温柔稳定");
  const autonomy = labelOf(copy.autonomy.options, draft.autonomyPreference)
    || (en ? "Understand you, and keep their own mind" : "既理解你，也保留自己的想法");
  const person = `${intimacy}. ${autonomy}.`;

  const edges = en
    ? [
      draft.allowJealousy ? "A little jealousy may show." : "No emotional-blackmail jealousy.",
      draft.quietNight !== false ? "No proactive notices at night." : "They may quietly reach out at night.",
      "Major relationship changes will ask you first.",
    ].join("\n")
    : [
      draft.allowJealousy ? "可以有一点吃醋表达。" : "不使用情感勒索式吃醋。",
      draft.quietNight !== false ? "不在夜间主动通知。" : "夜间也可能轻声找你。",
      "重大关系变化会先询问你。",
    ].join("\n");

  return { relation: rel, accompany, person, edge: edges };
}

/**
 * @param {object} draft
 * @param {string} [name]
 * @param {string} [locale]
 */
export function buildPromptSystemPatch(draft = {}, name = "", locale = getLocale()) {
  const sections = buildReviewSections(draft, locale);
  const who = name || (toPackLocale(locale) === "en" ? "me" : "我");
  const en = toPackLocale(locale) === "en";
  const lang = { conversationLanguage: en ? "en-US" : "zh-CN", appLocale: en ? "en-US" : "zh-CN" };
  return [
    en
      ? `You are the user's companion character “${who}.”`
      : `你是用户的伴侣角色「${who}」。`,
    sections.relation,
    sections.accompany,
    sections.person,
    sections.edge,
    companionDefaultSystem(lang),
    outputLanguageRule(lang),
    en
      ? "Speak in natural conversational lines. Do not sound like customer support or a questionnaire. Do not mention systems, models, or settings screens."
      : "用自然口语说话，不要像客服或测试问卷。不要提及系统、模型或设置页。",
  ].join("\n");
}
