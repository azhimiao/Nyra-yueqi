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
      openingBeat: "雨打在站台顶棚上。远处灯黄得发旧，你们并肩站着，谁也没先开口。\n「……车还要多久？」",
      instruction: "雨夜末班站台。雨是第三角色。对方按这场开场关系存在，不是日常陪伴。语气克制，留白。不要拉回预制主线，也不要用陪伴的开场白。",
      durationHint: "样例",
      emotionTag: "样例",
      memorySummary: "你们一起完成了一段雨夜车站的故事。",
    },
    "en-US": {
      title: "Night Rain Station",
      premise: "The last train is delayed. One umbrella. One unfinished sentence in the rain.",
      openingBeat: "Rain taps the platform roof. The distant lamp looks worn yellow. You stand side by side; neither speaks first.\n\"…How long until the train?\"",
      instruction: "A last-train platform in the rain. Rain is a third presence. Play the opening relationship, not daily companionship. Restrained, leave space. Do not pull a fixed plot or a companion greeting.",
      durationHint: "Sample",
      emotionTag: "Sample",
      memorySummary: "You completed a story set at a rainy night station together.",
    },
  },
  "script-rooftop": {
    "zh-CN": {
      title: "屋顶晚风",
      premise: "夏天屋顶，城市在脚下发亮，有人想把秘密说出来。",
      openingBeat: "风把衣角掀起一点。楼顶的灯坏了一盏，影子就更长。\n「今天的风……像故意把人往这儿推。」",
      instruction: "夏夜屋顶。轻松里藏一点紧张。对方有话想说，先别替ta说完。按这场开场关系演，不是日常陪伴。",
      memorySummary: "你们一起完成了一段屋顶晚风的故事。",
    },
    "en-US": {
      title: "Rooftop Breeze",
      premise: "A summer roof. The city glows below. Someone wants to say a secret.",
      openingBeat: "Wind lifts a hem. One roof light is out, so the shadows run longer.\n\"The wind today… like it pushed us up here.\"",
      instruction: "A summer roof at night. Ease with a little tension. They have something to say — do not finish it for them. Play this opening, not daily companionship.",
      memorySummary: "You completed a rooftop-breeze story together.",
    },
  },
  "script-cafe": {
    "zh-CN": {
      title: "雨天咖啡馆",
      premise: "靠窗座位只剩一张，窗外雨停停走走，话题却绕不开。",
      openingBeat: "玻璃杯壁上凝着水珠。店里放着很轻的爵士，像怕吵到你们。\n「靠窗这张……好像就剩我们了。」",
      instruction: "靠窗只剩一张座位。温柔、观察入微。雨声和咖啡香交替。按这场关系演，不是日常陪伴。",
      memorySummary: "你们一起完成了一段雨天咖啡馆的故事。",
    },
    "en-US": {
      title: "Rainy Café",
      premise: "Only one window seat left. Rain comes and goes. The talk keeps circling back.",
      openingBeat: "Water beads on the glass. Soft jazz, as if afraid to interrupt.\n\"This window seat… seems to be just us.\"",
      instruction: "One window seat. Gentle, observant. Rain and coffee trade places. Play this relationship, not daily companionship.",
      memorySummary: "You completed a rainy-café story together.",
    },
  },
  "script-exam-eve": {
    "zh-CN": {
      title: "考试前夜",
      premise: "台灯还亮着，笔记摊开，有人说「再陪我一会儿」。",
      openingBeat: "时钟跳到很晚。纸页边角卷起，窗外偶尔有车灯扫过。\n「再陪我一会儿……就一会儿。」",
      instruction: "台灯还亮着。安抚优先，不说教，短句更有力。对方在备考，你只是陪着。不是日常陪伴会话。",
      memorySummary: "你们一起度过了考试前夜。",
    },
    "en-US": {
      title: "The Night Before Exams",
      premise: "The lamp is still on. Notes are open. Someone says stay a little longer.",
      openingBeat: "The clock jumps late. Page corners curl. A car light sweeps the window.\n\"Stay a little longer… just a little.\"",
      instruction: "The lamp is still on. Comfort first, no lectures, short lines. They are studying; you are only here. Not a daily companion chat.",
      memorySummary: "You spent the night before exams together.",
    },
  },
  "script-reunion": {
    "zh-CN": {
      title: "重逢",
      premise: "三年后再见，旧地方还在，人也还在，话说不完。",
      openingBeat: "巷口的旧招牌还挂着。你们对视了一秒，都先笑了。\n「……还是这儿。」",
      instruction: "三年后再见。克制怀念，动作比宣言重要。不要煽情堆砌，也不要当成日常陪伴接着聊。",
      memorySummary: "你们完成了一段重逢的故事。",
    },
    "en-US": {
      title: "Reunion",
      premise: "Three years later. The old place is still here. So are both of you. Too much to say.",
      openingBeat: "The old sign still hangs at the alley. You look at each other for a second, then both smile first.\n\"…Still here.\"",
      instruction: "A reunion after three years. Restraint over sentiment. Action over speeches. Do not continue a daily companion chat.",
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
