/** Spectrum prompts for 同频 (D1). */
import { getLocale } from "../../../i18n/index.js";

export const SPECTRA_I18N = [
  { id: "hot-cold", zh: ["冰冷", "灼热"], en: ["icy", "scorching"] },
  { id: "quiet-loud", zh: ["安静", "喧闹"], en: ["quiet", "loud"] },
  { id: "safe-wild", zh: ["安稳", "冒险"], en: ["safe", "adventurous"] },
  { id: "soft-hard", zh: ["柔软", "坚硬"], en: ["soft", "hard"] },
  { id: "past-future", zh: ["怀旧", "未来感"], en: ["nostalgic", "futuristic"] },
  { id: "solo-crowd", zh: ["独处", "热闹"], en: ["solitude", "a crowd"] },
  { id: "sweet-salty", zh: ["甜", "咸"], en: ["sweet", "salty"] },
  { id: "slow-fast", zh: ["慢节奏", "快节奏"], en: ["slow-paced", "fast-paced"] },
  { id: "simple-complex", zh: ["简单", "复杂"], en: ["simple", "complex"] },
  { id: "day-night", zh: ["白昼", "夜晚"], en: ["day", "night"] },
  { id: "near-far", zh: ["亲近", "疏离"], en: ["close", "distant"] },
  { id: "play-serious", zh: ["玩笑", "认真"], en: ["playful", "serious"] },
];

export const SPECTRA = SPECTRA_I18N.map(({ id, zh, en }) => {
  const [left, right] = getLocale() === "en" ? en : zh;
  return { id, left, right };
});
