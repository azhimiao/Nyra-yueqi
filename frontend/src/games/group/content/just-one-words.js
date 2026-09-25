/** Word bank for G1 只许一个词 (nyra.just-one) — original Chinese prompts. */
import { getLocale } from "../../../i18n/index.js";

export const JUST_ONE_WORDS_I18N = [
  ["月光", "moonlight"], ["雨伞", "umbrella"], ["图书馆", "library"], ["咖啡", "coffee"],
  ["火车", "train"], ["气球", "balloon"], ["海浪", "wave"], ["钢琴", "piano"],
  ["草莓", "strawberry"], ["雪山", "snowy mountain"], ["信笺", "letter"], ["灯塔", "lighthouse"],
  ["风筝", "kite"], ["樱桃", "cherry"], ["星空", "starlit sky"], ["面包", "bread"],
  ["剧院", "theater"], ["花园", "garden"], ["琥珀", "amber"], ["银杏", "ginkgo"],
  ["港湾", "harbor"], ["萤火", "firefly"], ["纸船", "paper boat"], ["暮色", "twilight"],
  ["青瓷", "celadon"], ["旅途", "journey"], ["回声", "echo"], ["晨雾", "morning mist"],
  ["蜜糖", "honey"], ["罗盘", "compass"],
];

export const JUST_ONE_WORDS = JUST_ONE_WORDS_I18N.map(([zh, en]) => getLocale() === "en" ? en : zh);
