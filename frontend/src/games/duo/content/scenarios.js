/** Original “如果是我们” scenarios (D8). */
import { getLocale } from "../../../i18n/index.js";

export const IF_WE_SCENARIOS_ZH = [
  {
    id: "rain-station",
    prompt: "暴雨困在陌生车站，我们会先做什么？",
    options: [
      { id: "a", label: "找干粮和热水" },
      { id: "b", label: "一起看窗外发呆" },
      { id: "c", label: "规划改签路线" },
      { id: "d", label: "给彼此讲一个故事" },
    ],
  },
  {
    id: "lost-map",
    prompt: "在小城里把地图弄丢了，我们会？",
    options: [
      { id: "a", label: "跟着直觉乱走" },
      { id: "b", label: "问一位本地人" },
      { id: "c", label: "找地标重新定位" },
      { id: "d", label: "先坐下吃点东西冷静" },
    ],
  },
  {
    id: "one-ticket",
    prompt: "只剩一张心仪展览的票，我们会？",
    options: [
      { id: "a", label: "让对方去，自己在外面等" },
      { id: "b", label: "抽签决定" },
      { id: "c", label: "一起改看别的展览" },
      { id: "d", label: "轮流进去各看一半时间" },
    ],
  },
  {
    id: "midnight-call",
    prompt: "半夜忽然失眠，我们更可能？",
    options: [
      { id: "a", label: "轻声语音陪一会儿" },
      { id: "b", label: "各自安静但不挂断" },
      { id: "c", label: "一起列明天要做的小事" },
      { id: "d", label: "听同一首慢歌" },
    ],
  },
  {
    id: "surprise-day",
    prompt: "突然多出一整天空闲，我们会优先？",
    options: [
      { id: "a", label: "补觉与慢早餐" },
      { id: "b", label: "短途走走看看" },
      { id: "c", label: "待在家把清单清空" },
      { id: "d", label: "学一个从没试过的小技能" },
    ],
  },
  {
    id: "gift-budget",
    prompt: "只有很少预算送对方礼物，我们会选？",
    options: [
      { id: "a", label: "手写一封长信" },
      { id: "b", label: "一起做一顿饭" },
      { id: "c", label: "自制小物件" },
      { id: "d", label: "陪对方完成一件心事" },
    ],
  },
];

export const IF_WE_SCENARIOS_EN = [
  { id: "rain-station", prompt: "A storm strands us at an unfamiliar station. What do we do first?", options: [
    { id: "a", label: "Find food and hot water" }, { id: "b", label: "Watch the rain together" },
    { id: "c", label: "Plan a new route" }, { id: "d", label: "Tell each other a story" },
  ] },
  { id: "lost-map", prompt: "We lose our map in a small town. What do we do?", options: [
    { id: "a", label: "Follow our instincts" }, { id: "b", label: "Ask a local" },
    { id: "c", label: "Use landmarks to reorient" }, { id: "d", label: "Sit down and eat something first" },
  ] },
  { id: "one-ticket", prompt: "Only one ticket remains for an exhibition we both love. What do we do?", options: [
    { id: "a", label: "Let the other go in and wait outside" }, { id: "b", label: "Draw lots" },
    { id: "c", label: "Choose another exhibition together" }, { id: "d", label: "Split the visit time" },
  ] },
  { id: "midnight-call", prompt: "We suddenly cannot sleep at midnight. What are we most likely to do?", options: [
    { id: "a", label: "Stay on a quiet voice call" }, { id: "b", label: "Stay silent without hanging up" },
    { id: "c", label: "List tomorrow's small tasks together" }, { id: "d", label: "Listen to the same slow song" },
  ] },
  { id: "surprise-day", prompt: "A whole free day suddenly opens up. What do we choose first?", options: [
    { id: "a", label: "Sleep in and have a slow breakfast" }, { id: "b", label: "Take a short trip" },
    { id: "c", label: "Stay home and clear the list" }, { id: "d", label: "Learn a new small skill" },
  ] },
  { id: "gift-budget", prompt: "With only a tiny gift budget, what would we choose?", options: [
    { id: "a", label: "Write a long letter" }, { id: "b", label: "Cook a meal together" },
    { id: "c", label: "Make something by hand" }, { id: "d", label: "Help fulfill one heartfelt wish" },
  ] },
];

export const IF_WE_SCENARIOS = getLocale() === "en" ? IF_WE_SCENARIOS_EN : IF_WE_SCENARIOS_ZH;
