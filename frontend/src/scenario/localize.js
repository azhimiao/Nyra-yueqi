/**
 * Formal localized display overlays for official scenario presets.
 * Stable IDs unchanged; rules/beats graphs stay shared.
 */

import { toSupportedLocale } from "../i18n/language-prefs.js";
import { getLocale } from "../i18n/index.js";

/** @type {Record<string, { "zh-CN": object, "en-US": object }>} */
export const SCENARIO_LOCALIZED = Object.freeze({
  "script-rain-station": {
    "zh-CN": {
      title: "夜雨车站",
      premise: "末班车误点，雨里只剩一把伞和一句没说完的话。",
      openingBeat: "雨打在站台顶棚上。远处灯黄得发旧，你们并肩站着，谁也没先开口。",
      castHint: "语气克制，留白；雨声是第三角色。",
      durationHint: "开放 · 可长谈",
      emotionTag: "克制 · 雨夜",
      memorySummary: "你们一起完成了一段雨夜车站的故事。",
    },
    "en-US": {
      title: "Night Rain Station",
      premise: "The last train is delayed. One umbrella. One unfinished sentence in the rain.",
      openingBeat: "Rain taps the platform roof. The distant lamp looks worn yellow. You stand side by side; neither speaks first.",
      castHint: "Restrained tone, leave space; rain is a third presence.",
      durationHint: "Open-ended · long talk welcome",
      emotionTag: "Restrained · rainy night",
      memorySummary: "You completed a story set at a rainy night station together.",
    },
  },
  "script-rooftop": {
    "zh-CN": {
      title: "屋顶晚风",
      premise: "城市灯火在脚下，风把没说完的话送到耳边。",
      openingBeat: "晚风从楼顶掠过。你们靠着矮墙，远处车灯连成细线。",
      castHint: "轻声、开阔、不急着定论。",
      memorySummary: "你们一起完成了一段屋顶晚风的故事。",
    },
    "en-US": {
      title: "Rooftop Breeze",
      premise: "City lights below. Wind carries unfinished words to your ears.",
      openingBeat: "Evening wind crosses the roof. You lean on the low wall; distant headlights draw thin lines.",
      castHint: "Soft voice, open sky, no rush to conclusions.",
      memorySummary: "You completed a rooftop-breeze story together.",
    },
  },
  "script-cafe": {
    "zh-CN": {
      title: "雨天咖啡馆",
      premise: "窗外雨线斜斜，杯沿的雾气把时间放慢。",
      openingBeat: "雨敲窗玻璃。你们对坐，热气在杯口升起来。",
      castHint: "慢、暖、允许沉默。",
      memorySummary: "你们一起完成了一段雨天咖啡馆的故事。",
    },
    "en-US": {
      title: "Rainy Café",
      premise: "Rain streaks the window. Steam at the rim slows time.",
      openingBeat: "Rain taps the glass. You sit across from each other; steam rises from the cups.",
      castHint: "Slow, warm, silence is allowed.",
      memorySummary: "You completed a rainy-café story together.",
    },
  },
  "script-exam-eve": {
    "zh-CN": {
      title: "考试前夜",
      premise: "台灯下的安静，比任何鼓励都更贴近。",
      memorySummary: "你们一起度过了考试前夜。",
    },
    "en-US": {
      title: "The Night Before Exams",
      premise: "Quiet under the desk lamp — closer than any pep talk.",
      memorySummary: "You spent the night before exams together.",
    },
  },
  "script-reunion": {
    "zh-CN": {
      title: "重逢",
      premise: "久别之后，第一句要说什么，风都替你们犹豫。",
      memorySummary: "你们完成了一段重逢的故事。",
    },
    "en-US": {
      title: "Reunion",
      premise: "After a long time apart, even the wind hesitates over the first words.",
      memorySummary: "You completed a reunion story together.",
    },
  },
});

/**
 * Overlay localized display fields onto a preset (does not mutate source).
 * @param {object} preset
 * @param {string} [locale]
 */
export function localizeScenarioPreset(preset, locale) {
  if (!preset?.id) return preset;
  const loc = toSupportedLocale(locale || getLocale());
  const pack = SCENARIO_LOCALIZED[preset.id]?.[loc]
    || SCENARIO_LOCALIZED[preset.id]?.["zh-CN"];
  if (!pack) {
    return {
      ...preset,
      contentLanguage: "zh-CN",
      localizationMissing: loc !== "zh-CN",
    };
  }
  return {
    ...preset,
    ...pack,
    contentLanguage: loc,
    localizationMissing: false,
    eventType: "scenario_completed",
    scenarioId: preset.id,
  };
}

export function scenarioMemoryCandidate(presetId, locale) {
  const loc = toSupportedLocale(locale || getLocale());
  return SCENARIO_LOCALIZED[presetId]?.[loc]?.memorySummary
    || SCENARIO_LOCALIZED[presetId]?.["zh-CN"]?.memorySummary
    || "";
}
