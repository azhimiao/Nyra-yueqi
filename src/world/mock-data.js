import { createWorldPost } from "./schema.js";

export const WORLD_FILTERS = [
  { id: "discover", label: "推荐" },
  { id: "following", label: "关注" },
  { id: "ai", label: "AI 与未来" },
  { id: "culture", label: "人文生活" },
  { id: "daily", label: "日常碎片" },
];

export const WORLD_TRENDS = [
  { rank: 1, label: "把普通的一天认真记下来", volume: "8.6k 讨论" },
  { rank: 2, label: "雨后的城市像一封回信", volume: "5.2k 讨论" },
  { rank: 3, label: "AI 会如何理解陪伴", volume: "3.9k 讨论" },
  { rank: 4, label: "旧书修复的时间感", volume: "2.1k 讨论" },
  { rank: 5, label: "今晚你在听什么", volume: "1.7k 讨论" },
];

export const WORLD_MOCK_POSTS = [
  createWorldPost({
    id: "preview:rain-city",
    author: {
      id: "night-pages",
      name: "夜航书页",
      handle: "@night_pages",
      avatar: "夜",
      verified: true,
    },
    content:
      "雨停以后，城市里所有的灯都像刚刚醒来。路过旧书店时看见店主在收门口的纸箱，他说：有些书不是等人买，是在等一个恰好需要它的人。",
    createdAt: "2026-07-10T15:42:00+08:00",
    category: "culture",
    tags: ["城市散步", "旧书店", "雨天"],
    metrics: { likes: 2841, replies: 126, reposts: 483, views: 42000 },
    accent: "rose",
    following: true,
  }),
  createWorldPost({
    id: "preview:ai-memory",
    author: {
      id: "latent-garden",
      name: "潜空间花园",
      handle: "@latent_garden",
      avatar: "潜",
      verified: true,
    },
    content:
      "真正有温度的 AI 记忆，不应该只是“记住用户说过什么”。它还要知道什么时候不打扰、哪些事值得再次提起，以及一段沉默是否也应该被珍惜。",
    createdAt: "2026-07-10T14:18:00+08:00",
    category: "ai",
    tags: ["AI 陪伴", "长期记忆", "产品思考"],
    metrics: { likes: 6120, replies: 394, reposts: 1102, views: 96000 },
    accent: "violet",
  }),
  createWorldPost({
    id: "preview:summer-window",
    author: {
      id: "midsummer-window",
      name: "盛夏窗口",
      handle: "@summer_window",
      avatar: "夏",
    },
    content:
      "下班回家把西瓜切成很小的块，开着窗听楼下小朋友追逐的声音。没有发生什么特别的事，但今天好像也值得留一盏灯。",
    createdAt: "2026-07-10T12:36:00+08:00",
    category: "daily",
    tags: ["生活碎片", "夏天"],
    metrics: { likes: 973, replies: 48, reposts: 76, views: 12800 },
    accent: "sage",
    following: true,
  }),
  createWorldPost({
    id: "preview:gentle-tech",
    author: {
      id: "soft-machine",
      name: "温柔机器研究所",
      handle: "@soft_machine",
      avatar: "温",
      verified: true,
    },
    content:
      "我们总在讨论模型能做什么，却很少讨论它应该克制什么。下一代智能产品最稀缺的能力，或许不是主动，而是理解边界之后依然愿意在场。",
    createdAt: "2026-07-10T11:05:00+08:00",
    category: "ai",
    tags: ["技术伦理", "边界感", "交互设计"],
    metrics: { likes: 4335, replies: 271, reposts: 892, views: 71000 },
    accent: "blue",
  }),
  createWorldPost({
    id: "preview:book-repair",
    author: {
      id: "paper-temperature",
      name: "纸页的温度",
      handle: "@paper_temperature",
      avatar: "纸",
    },
    content:
      "修复一本 1987 年的诗集。清理胶痕时，在书脊里发现一张写着日期的车票。旧物最动人的地方，是它从不解释，却保留了时间经过的证据。",
    createdAt: "2026-07-10T09:27:00+08:00",
    category: "culture",
    tags: ["旧书修复", "时间", "手艺"],
    metrics: { likes: 1876, replies: 89, reposts: 316, views: 26000 },
    accent: "amber",
    following: true,
  }),
  createWorldPost({
    id: "preview:morning-cat",
    author: {
      id: "cat-observer",
      name: "街角猫观察员",
      handle: "@corner_cat",
      avatar: "猫",
    },
    content:
      "今日份街角猫：橘色那只第一次允许我坐在它旁边。我们保持了大约两分钟的礼貌沉默，然后它把尾巴搭在了我的鞋上。",
    createdAt: "2026-07-10T08:12:00+08:00",
    category: "daily",
    tags: ["猫", "早晨", "微小幸福"],
    metrics: { likes: 3258, replies: 201, reposts: 241, views: 54000 },
    accent: "peach",
  }),
];

export const WORLD_AI_INSIGHTS = {
  discover: {
    summary: "“今天的人们在讨论记忆、边界，也在分享那些微小却真实的生活。世界很吵，但仍有人认真收藏一场雨。”",
    tags: ["雨夜情绪", "温柔科技", "生活切片"],
  },
  following: {
    summary: "“你关注的人今天谈到了旧书、夏夜和一只愿意靠近的猫。共同点或许是：他们都没有忽略生活里很轻的信号。”",
    tags: ["熟悉的人", "日常温度", "慢生活"],
  },
  ai: {
    summary: "“关于 AI，人们开始把目光从能力转向边界。会记得很重要，知道何时安静、如何尊重，也同样重要。”",
    tags: ["AI 记忆", "边界感", "产品伦理"],
  },
  culture: {
    summary: "“旧书、车票和雨后的灯，都在提醒我们：时间不会回答问题，但会留下证据。”",
    tags: ["人文观察", "时间痕迹", "城市叙事"],
  },
  daily: {
    summary: "“西瓜、晚风和街角的猫。没有惊天动地的新闻，普通生活本身就是今天最温柔的头条。”",
    tags: ["生活碎片", "小确幸", "夏日"],
  },
};
