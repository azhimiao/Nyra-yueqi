/** Candidate pools for 留下三个 (D9). */
import { getLocale } from "../../../i18n/index.js";

export const LEAVE_THREE_POOLS_I18N = [
  {
    id: "weekend",
    zh: { title: "周末想留下的三件事", candidates: ["散步", "看电影", "做饭", "午睡", "写信", "逛市集", "听歌", "整理相册"] },
    en: { title: "Three things to keep for the weekend", candidates: ["take a walk", "watch a movie", "cook", "nap", "write a letter", "visit a market", "listen to music", "organize photos"] },
  },
  {
    id: "comfort",
    zh: { title: "最想保留的三种舒适", candidates: ["热汤", "软毯", "安静角", "晚风", "旧歌", "台灯", "猫叫声", "慢咖啡"] },
    en: { title: "Three comforts to keep", candidates: ["hot soup", "soft blanket", "quiet corner", "evening breeze", "old song", "desk lamp", "a cat's meow", "slow coffee"] },
  },
  {
    id: "trip",
    zh: { title: "旅行箱只留三样", candidates: ["相机", "围巾", "笔记", "耳机", "零食", "地图", "雨衣", "小灯"] },
    en: { title: "Keep only three things in your suitcase", candidates: ["camera", "scarf", "notebook", "headphones", "snacks", "map", "raincoat", "small lamp"] },
  },
  {
    id: "memory",
    zh: { title: "想一起记住的三个瞬间", candidates: ["第一次见面", "共撑一把伞", "夜聊到天亮", "一起迷路", "分享耳机", "窗边沉默", "庆祝小事", "重逢拥抱"] },
    en: { title: "Three moments to remember together", candidates: ["first meeting", "sharing an umbrella", "talking until dawn", "getting lost together", "sharing headphones", "quiet by the window", "celebrating something small", "a reunion hug"] },
  },
];

export const LEAVE_THREE_POOLS = LEAVE_THREE_POOLS_I18N.map(({ id, zh, en }) => ({
  id,
  ...(getLocale() === "en" ? en : zh),
}));
