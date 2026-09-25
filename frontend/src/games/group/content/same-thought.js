/** Categories for G2 想的一样 (nyra.same-thought). */
import { getLocale } from "../../../i18n/index.js";

export const SAME_THOUGHT_CATEGORIES_I18N = [
  { id: "comfort_food", zh: "提到「安慰」你会想到哪种食物？", en: "What food comes to mind when you think of comfort?" },
  { id: "rainy_day", zh: "下雨天最想做的一件事？", en: "What is the one thing you most want to do on a rainy day?" },
  { id: "childhood", zh: "一个能代表童年的词？", en: "What one word represents childhood?" },
  { id: "weekend", zh: "完美周末用一个词形容？", en: "Describe a perfect weekend in one word." },
  { id: "color_mood", zh: "今天的心情是什么颜色？（一个词）", en: "What color is your mood today? One word." },
  { id: "travel", zh: "旅行时最不可少的一件东西？", en: "What is the one essential thing you take traveling?" },
  { id: "sound", zh: "最让你安心的声音是什么？", en: "What sound makes you feel safest?" },
  { id: "season", zh: "你最喜欢的季节用一个词？", en: "Name your favorite season in one word." },
  { id: "gift", zh: "收到会开心的小礼物？", en: "What small gift would make you happy?" },
  { id: "night", zh: "深夜三点你在想什么？（一个词）", en: "What are you thinking about at 3 a.m.? One word." },
];

export const SAME_THOUGHT_CATEGORIES = SAME_THOUGHT_CATEGORIES_I18N.map(({ id, zh, en }) => ({
  id,
  prompt: getLocale() === "en" ? en : zh,
}));
