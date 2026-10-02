/**
 * Curated relationship-safe fictional shared-moment quiz (D10 fallback).
 * Not real user memory — safe placeholder facts for when no adapter is injected.
 */
import { getLocale } from "../../../i18n/index.js";

export const CURATED_SHARED_FACTS_ZH = [
  {
    id: "fact-rain-bus",
    prompt: "我们记得的那个雨天，最后是怎样回家的？",
    options: ["挤上末班公交", "打车绕路看夜景", "走回去买了热饮", "在站台等到雨停"],
    answerIndex: 0,
    safeNote: "虚构共享时刻（示例）",
  },
  {
    id: "fact-playlist",
    prompt: "第一次一起听的歌单主题是？",
    options: ["城市夜行", "清晨咖啡", "海边公路", "冬日壁炉"],
    answerIndex: 2,
    safeNote: "虚构共享时刻（示例）",
  },
  {
    id: "fact-snack",
    prompt: "那次熬夜聊天时，我们分享的零食是？",
    options: ["薯片", "巧克力", "水果干", "饼干"],
    answerIndex: 1,
    safeNote: "虚构共享时刻（示例）",
  },
  {
    id: "fact-nickname",
    prompt: "临时起的玩笑称呼，更接近哪一个？",
    options: ["小月亮", "船长", "雾行者", "电台主持人"],
    answerIndex: 0,
    safeNote: "虚构共享时刻（示例）",
  },
  {
    id: "fact-place",
    prompt: "我们约定要再去一次的地方是？",
    options: ["天桥上看灯", "旧书店二楼", "河边长椅", "山脚茶馆"],
    answerIndex: 1,
    safeNote: "虚构共享时刻（示例）",
  },
  {
    id: "fact-promise",
    prompt: "随口答应过的小事是？",
    options: ["下次带明信片", "一起学一道菜", "日出前发消息", "交换一张旧照"],
    answerIndex: 1,
    safeNote: "虚构共享时刻（示例）",
  },
];

const SAFE_NOTE_EN = "Fictional shared moment (example)";
export const CURATED_SHARED_FACTS_EN = [
  { id: "fact-rain-bus", prompt: "How did we get home on that rainy day we remember?", options: ["Caught the last bus", "Took a taxi past the city lights", "Walked home and bought hot drinks", "Waited at the station for the rain to stop"], answerIndex: 0, safeNote: SAFE_NOTE_EN },
  { id: "fact-playlist", prompt: "What was the theme of the first playlist we heard together?", options: ["City nights", "Morning coffee", "Coastal highway", "Winter fireplace"], answerIndex: 2, safeNote: SAFE_NOTE_EN },
  { id: "fact-snack", prompt: "What snack did we share during that late-night chat?", options: ["Chips", "Chocolate", "Dried fruit", "Cookies"], answerIndex: 1, safeNote: SAFE_NOTE_EN },
  { id: "fact-nickname", prompt: "Which playful nickname did we make up?", options: ["Little Moon", "Captain", "Mist Walker", "Radio Host"], answerIndex: 0, safeNote: SAFE_NOTE_EN },
  { id: "fact-place", prompt: "Where did we promise to visit again?", options: ["The bridge to watch the lights", "The second floor of the old bookstore", "A bench by the river", "The teahouse below the mountain"], answerIndex: 1, safeNote: SAFE_NOTE_EN },
  { id: "fact-promise", prompt: "What small promise did we casually make?", options: ["Bring a postcard next time", "Learn a recipe together", "Send a message before sunrise", "Exchange an old photo"], answerIndex: 1, safeNote: SAFE_NOTE_EN },
];

export const CURATED_SHARED_FACTS = getLocale() === "en" ? CURATED_SHARED_FACTS_EN : CURATED_SHARED_FACTS_ZH;
