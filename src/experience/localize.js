/**
 * Formal EN/ZH display overlays for ExperiencePackage presets.
 * Package IDs stay shared; lore rules stay structural.
 */

import { toSupportedLocale } from "../i18n/language-prefs.js";
import { getLocale } from "../i18n/index.js";

export const EXPERIENCE_LOCALIZED = Object.freeze({
  "exp-night-rain-station": {
    "zh-CN": {
      title: "夜雨车站",
      subtitle: "末班车误点，雨里只剩一把伞和一句没说完的话。",
      synopsis: "雨夜站台，同一角色与用户共同经历一段可自由推进的开放情境。三开场关系不同，后续不得强制合流。",
      playerRole: "与ta同撑一把伞的人",
      memorySummary: "你们一起完成了一段雨夜车站的故事。",
    },
    "en-US": {
      title: "Night Rain Station",
      subtitle: "The last train is delayed. One umbrella. One unfinished sentence.",
      synopsis: "A rainy platform you share with your companion — open-ended, freely paced. Three openings start from different bonds and must not force a single ending.",
      playerRole: "The one sharing an umbrella with them",
      memorySummary: "You completed a story set at a rainy night station together.",
    },
  },
  "exp-mist-harbor-lighthouse": {
    "zh-CN": {
      title: "雾港灯塔",
      subtitle: "潮声里的灯火，把归途与告别都照亮一点。",
      synopsis: "雾中港湾与灯塔。开放情境，尊重用户行动因果。",
      playerRole: "与ta同望灯火的人",
      memorySummary: "你们一起完成了一段雾港灯塔的故事。",
    },
    "en-US": {
      title: "Mist Harbor Lighthouse",
      subtitle: "Lamplight in the tide — enough to soften both homecoming and goodbye.",
      synopsis: "A misty harbor and lighthouse. Open-ended; honor the consequences of what the user actually does.",
      playerRole: "The one watching the light with them",
      memorySummary: "You completed a story set at a mist-harbor lighthouse together.",
    },
  },
});

export function localizeExperiencePackage(pkg, locale) {
  if (!pkg?.id) return pkg;
  const loc = toSupportedLocale(locale || getLocale());
  const pack = EXPERIENCE_LOCALIZED[pkg.id]?.[loc]
    || EXPERIENCE_LOCALIZED[pkg.id]?.["zh-CN"];
  if (!pack) {
    return { ...pkg, contentLanguage: "zh-CN", localizationMissing: loc !== "zh-CN" };
  }
  return {
    ...pkg,
    title: pack.title,
    subtitle: pack.subtitle,
    synopsis: pack.synopsis,
    playerRole: pack.playerRole ?? pkg.playerRole,
    contentLanguage: loc,
    localizationMissing: false,
    memorySummary: pack.memorySummary,
  };
}
