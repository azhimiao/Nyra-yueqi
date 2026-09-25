/** Chinese word banks for Duo games (original, non-commercial). */
import { getLocale } from "../../../i18n/index.js";

export const CIPHER_WORDS_ZH = [
  "月光", "雨巷", "纸鹤", "灯笼", "青砖", "竹影", "蝉鸣", "风筝", "海盐", "云朵",
  "书签", "墨痕", "茶烟", "窗花", "星轨", "回廊", "苔藓", "银杏", "鼓点", "琴弦",
  "信笺", "暖炉", "雪线", "潮汐", "山谷", "灯塔", "渡口", "麦田", "橘皮", "雾凇",
  "石径", "莲池", "烟火", "晚风", "晨露", "旧伞", "瓷杯", "绒毯", "沙漏", "罗盘",
  "灯影", "花市", "码头", "青石", "星沙", "雨披", "旅记", "航标", "灯芯", "霜叶",
  "回声", "云梯", "雀斑", "蜜柑", "风铃", "折扇", "青苔", "溪石", "月台", "信箱",
];

export const QUESTION_WORDS_ZH = [
  "图书馆", "热可可", "夜巴士", "旧相机", "海边公路", "录音棚", "天台花园",
  "二手书店", "雨天电影", "手工面包", "露营灯", "地铁末班", "望远镜", "明信片",
  "植物园", "黑胶唱片", "木桌", "柠檬汽水", "山谷帐篷", "城市灯火",
];

export const TABOO_TARGETS_ZH = [
  {
    target: "电影院",
    forbidden: ["电影", "银幕", "爆米花", "放映", "票根"],
  },
  {
    target: "火锅",
    forbidden: ["辣", "汤底", "涮", "筷子", "花椒"],
  },
  {
    target: "地铁",
    forbidden: ["车厢", "站台", "线路", "刷卡", "轨道"],
  },
  {
    target: "雨伞",
    forbidden: ["雨", "撑开", "伞骨", "避雨", "淋湿"],
  },
  {
    target: "明信片",
    forbidden: ["邮票", "寄出", "书写", "旅行", "地址"],
  },
  {
    target: "露营",
    forbidden: ["帐篷", "篝火", "睡袋", "野外", "营地"],
  },
  {
    target: "书店",
    forbidden: ["书架", "阅读", "畅销", "借阅", "小说"],
  },
  {
    target: "咖啡馆",
    forbidden: ["咖啡", "拿铁", "吧台", "浓缩", "豆子"],
  },
];

export const CIPHER_WORDS_EN = [
  "moonlight", "rain alley", "paper crane", "lantern", "blue brick", "bamboo shadow", "cicada", "kite", "sea salt", "cloud",
  "bookmark", "ink mark", "tea steam", "paper cut", "star trail", "cloister", "moss", "ginkgo", "drumbeat", "string",
  "letter", "hearth", "snowline", "tide", "valley", "lighthouse", "ferry", "wheat field", "orange peel", "frost",
  "stone path", "lotus pond", "fireworks", "evening breeze", "morning dew", "old umbrella", "porcelain cup", "blanket", "hourglass", "compass",
  "lamplight", "flower market", "pier", "flagstone", "star sand", "raincoat", "travel journal", "beacon", "wick", "frosted leaf",
  "echo", "sky ladder", "freckle", "tangerine", "wind chime", "folding fan", "moss", "stream stone", "platform", "mailbox",
];

export const QUESTION_WORDS_EN = [
  "library", "hot cocoa", "night bus", "old camera", "coastal highway", "recording studio", "rooftop garden",
  "used bookstore", "rainy-day movie", "homemade bread", "camping lantern", "last subway", "telescope", "postcard",
  "botanical garden", "vinyl record", "wooden table", "lemon soda", "valley tent", "city lights",
];

export const TABOO_TARGETS_EN = [
  { target: "cinema", forbidden: ["movie", "screen", "popcorn", "projection", "ticket"] },
  { target: "hot pot", forbidden: ["spicy", "broth", "dip", "chopsticks", "peppercorn"] },
  { target: "subway", forbidden: ["carriage", "platform", "line", "fare card", "rail"] },
  { target: "umbrella", forbidden: ["rain", "open", "ribs", "shelter", "wet"] },
  { target: "postcard", forbidden: ["stamp", "mail", "write", "travel", "address"] },
  { target: "camping", forbidden: ["tent", "campfire", "sleeping bag", "outdoors", "campsite"] },
  { target: "bookstore", forbidden: ["shelf", "read", "bestseller", "borrow", "novel"] },
  { target: "café", forbidden: ["coffee", "latte", "counter", "espresso", "beans"] },
];

export const CIPHER_WORDS = getLocale() === "en" ? CIPHER_WORDS_EN : CIPHER_WORDS_ZH;
export const QUESTION_WORDS = getLocale() === "en" ? QUESTION_WORDS_EN : QUESTION_WORDS_ZH;
export const TABOO_TARGETS = getLocale() === "en" ? TABOO_TARGETS_EN : TABOO_TARGETS_ZH;
export const SEQUENCE_SYMBOLS = ["🔴", "🔵", "🟢", "🟡", "🟣", "⚫"];
