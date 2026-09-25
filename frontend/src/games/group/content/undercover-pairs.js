/** Word pairs for G3 谁是卧底 — civilian / undercover. Original Chinese pairs. */
import { getLocale } from "../../../i18n/index.js";

export const UNDERCOVER_PAIRS_I18N = [
  { zh: ["牛奶", "豆浆"], en: ["milk", "soy milk"] },
  { zh: ["火车", "地铁"], en: ["train", "subway"] },
  { zh: ["西瓜", "哈密瓜"], en: ["watermelon", "cantaloupe"] },
  { zh: ["毛笔", "钢笔"], en: ["brush pen", "fountain pen"] },
  { zh: ["咖啡", "奶茶"], en: ["coffee", "milk tea"] },
  { zh: ["相声", "脱口秀"], en: ["comedy duo", "stand-up comedy"] },
  { zh: ["自行车", "电动车"], en: ["bicycle", "e-bike"] },
  { zh: ["饺子", "包子"], en: ["dumplings", "steamed buns"] },
  { zh: ["钢琴", "吉他"], en: ["piano", "guitar"] },
  { zh: ["电影院", "剧院"], en: ["cinema", "theater"] },
  { zh: ["书包", "双肩包"], en: ["schoolbag", "backpack"] },
  { zh: ["台灯", "落地灯"], en: ["desk lamp", "floor lamp"] },
];

export const UNDERCOVER_PAIRS = UNDERCOVER_PAIRS_I18N.map((pair) => {
  const [civilian, undercover] = getLocale() === "en" ? pair.en : pair.zh;
  return { civilian, undercover };
});
