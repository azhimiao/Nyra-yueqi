/** Rating / quiz prompts for Duo games. */
import { getLocale } from "../../../i18n/index.js";

const pick = ({ zh, en }) => getLocale() === "en" ? en : zh;

export const RATING_PROMPTS_I18N = [
  { zh: "今天的心情有多明亮？", en: "How bright does your mood feel today?" },
  { zh: "对突然旅行的渴望有多强？", en: "How much do you want to take a spontaneous trip?" },
  { zh: "现在有多想安静待着？", en: "How much do you want some quiet right now?" },
  { zh: "对甜食的欲望有多高？", en: "How strong is your craving for something sweet?" },
  { zh: "此刻社交电量还剩多少？", en: "How much social energy do you have left?" },
  { zh: "对雨天的喜欢程度？", en: "How much do you enjoy rainy days?" },
  { zh: "想被认真倾听的程度？", en: "How much do you want someone to really listen?" },
  { zh: "对新鲜事物的好奇有多足？", en: "How curious are you about something new?" },
  { zh: "此刻需要拥抱的强度？", en: "How much do you need a hug right now?" },
  { zh: "对深夜聊天的兴致？", en: "How interested are you in a late-night chat?" },
  { zh: "对整理房间的动力？", en: "How motivated are you to tidy your room?" },
  { zh: "对一首老歌的共鸣强度？", en: "How strongly does an old song resonate with you?" },
];

export const TWENTY_Q_HINTS_I18N = [
  { zh: "它通常出现在室内。", en: "It is usually found indoors." },
  { zh: "它和出行有关。", en: "It is related to travel." },
  { zh: "它可能发出声音。", en: "It may make a sound." },
  { zh: "它常常和食物有关。", en: "It is often related to food." },
  { zh: "它偏自然场景。", en: "It belongs more to a natural setting." },
];

export const RATING_PROMPTS = RATING_PROMPTS_I18N.map(pick);
export const TWENTY_Q_HINTS = TWENTY_Q_HINTS_I18N.map(pick);
