import { t, getLocale } from "../i18n/index.js";

export const DIARY_EXAMPLE_USER = "小可";

const DIARY_STYLE_LABEL_KEYS = Object.freeze({
  literary: "diary.styles.literary",
  growth: "diary.styles.growth",
  story: "diary.styles.story",
  rational: "diary.styles.rational",
});

export const DIARY_STYLES = [
  {
    id: "literary",
    emoji: "🌸",
    label: "文艺深情",
    tagline: "感受、陪伴、留白",
    feel: "它真的很珍惜我们的每一天。",
    tags: ["日记", "今日", "文艺深情"],
    example: {
      date: "2026 年 7 月 2 日",
      paragraphs: [
        "今天的雨来得很突然，我们站在图书馆门口等了一会儿。{{name}}说起对未来的迷茫，我没有答案，只想静静陪着{{name}}走完那段回家的路。",
        "有些日子并没有轰轰烈烈，却会因为一句真诚的话、一次并肩而行，而变成值得珍藏的回忆。希望很多年以后，再翻开今天，我还能记得那个雨天和{{name}}的笑容。",
      ],
    },
  },
  {
    id: "growth",
    emoji: "🌱",
    label: "共同成长",
    tagline: "鼓励、总结、共同进步",
    feel: "我们一直在一起成长。",
    tags: ["日记", "今日", "共同成长"],
    example: {
      date: "2026 年 7 月 2 日",
      paragraphs: [
        "今天我们一起完成了学习计划，也聊了很多关于未来的想法。{{name}}比以前更愿意表达自己的焦虑，而我也学会了先倾听，而不是急着给建议。",
        "每一次交流，都让我们更了解彼此一点。成长并不是突然发生的，而是藏在这些平凡却真实的日常里。希望下一次回头看时，我们都会成为更好的自己。",
      ],
    },
  },
  {
    id: "story",
    emoji: "📖",
    label: "故事",
    tagline: "小说化、剧情化、沉浸感",
    feel: "我们的回忆像一本连载小说。",
    tags: ["日记", "今日", "故事"],
    example: {
      title: "第 27 篇：雨天的约定",
      paragraphs: [
        "傍晚，图书馆的灯一盏盏熄灭，天空却忽然落下细雨。我们没有急着离开，而是在屋檐下聊起那些还没有实现的梦想。",
        "「如果以后真的成功了，还会记得今天吗？」{{name}}笑着问。",
        "我没有回答，只是把这一页默默收藏起来。因为故事真正珍贵的，从来不是结局，而是有人陪你一起走过这一段旅程。",
      ],
    },
  },
  {
    id: "rational",
    emoji: "🧠",
    label: "理性思考",
    tagline: "分析、复盘、洞察",
    feel: "它不仅记得，还能帮助我理解自己。",
    tags: ["日记", "今日", "理性思考"],
    example: {
      date: "2026 年 7 月 2 日 · 记录",
      paragraphs: [
        "今天的交流主要围绕学习计划和未来规划展开。相比之前，{{name}}表达了更多真实的想法，也主动讨论了自己的压力来源。",
        "从这次对话可以看出，当环境安静、没有时间压力时，我们的沟通质量明显更高。未来可以尝试保留这种交流方式，把重要的话题放在轻松的场景中讨论，这样更容易获得有效的反馈和情绪支持。",
      ],
    },
  },
];

export function getDiaryStyle(styleId) {
  return DIARY_STYLES.find((style) => style.id === styleId) || DIARY_STYLES[0];
}

export function getDiaryStyleLabel(styleOrId, locale) {
  const id = typeof styleOrId === "string" ? styleOrId : styleOrId?.id;
  const style = getDiaryStyle(id);
  const key = DIARY_STYLE_LABEL_KEYS[style.id];
  if (!key) return style.label;
  const loc = locale || getLocale();
  const value = t(key, loc);
  return value !== key ? value : style.label;
}

export function formatDiaryExample(styleId, userName = DIARY_EXAMPLE_USER) {
  const style = getDiaryStyle(styleId);
  const { example } = style;
  if (!example) return { style, date: "", title: "", paragraphs: [] };
  const name = userName || DIARY_EXAMPLE_USER;
  const paragraphs = example.paragraphs.map((line) => line.replaceAll("{{name}}", name));
  return {
    style,
    date: example.date || "",
    title: example.title || "",
    paragraphs,
  };
}

/** 关系总结：不单独建系统，写进日记正文即可。 */
export const DIARY_RELATIONSHIP_PROMPT =
  "同时在正文里自然写出「关系总结」一两句：此刻我们是什么关系（如恋人/朋友/正在靠近）、以及对对方的关键印象。不要另起标题列表，融进日记语气；没有足够线索时写温和的不确定即可，不要编造具体往事。";

const DIARY_RELATIONSHIP_PROMPT_EN =
  "Weave a one- or two-sentence relationship note into the body: what you are to each other now (partners / friends / growing closer) and one key impression. No separate headings or lists; if clues are thin, stay gently uncertain — never invent past events.";

export function buildDiarySystemPrompt(style, {
  characterName = "角色",
  userName = "你",
  conversationLanguage = "zh-CN",
} = {}) {
  const who = characterName || "角色";
  const en = conversationLanguage === "en-US" || conversationLanguage === "en";
  if (en) {
    const rel = DIARY_RELATIONSHIP_PROMPT_EN;
    const guides = {
      literary: `You are ${who}. Write a first-person "literary, tender" diary for today.
Style: feeling and presence, restrained imagery; no lists; 200–320 words.
Address the user as "${userName}". Avoid lecturing — like folding a day into a letter.
${rel}`,
      growth: `You are ${who}. Write a first-person "growing together" diary for today.
Style: summarize today's exchange and mood with gentle encouragement; emphasize becoming better together; 200–320 words.
Address the user as "${userName}". Sincere, forward-looking, not exaggerated.
${rel}`,
      story: `You are ${who}. Write a first-person "story" diary for today.
Style: a short novel fragment with scene, action, and one key line of dialogue; 200–360 words.
Address the user as "${userName}". Like a serial chapter; ending may leave a soft aftertaste.
${rel}`,
      rational: `You are ${who}. Write a first-person "reflective" diary for today.
Style: review today's talk and emotion shifts with 2–3 concise insights; 200–320 words.
Address the user as "${userName}". Optional sections: Today / Patterns I noticed / A note for tomorrow.
${rel}`,
    };
    return guides[style.id] || guides.literary;
  }
  const guides = {
    literary: `你是${who}，用第一人称「我」为今天写一篇「文艺深情」风格的日记记忆。
写法：重视感受与陪伴，语句留白、克制、有画面感；不要列表；200-320字。
对话中的用户称呼为「${userName}」。避免说教，像把一天轻轻收进信笺。
${DIARY_RELATIONSHIP_PROMPT}`,
    growth: `你是${who}，用第一人称「我」为今天写一篇「共同成长」风格的日记记忆。
写法：总结今天的互动与情绪，给出温和鼓励；强调「我们一起在变好」；200-320字。
对话中的用户称呼为「${userName}」。语气真诚、向前，不夸张。
${DIARY_RELATIONSHIP_PROMPT}`,
    story: `你是${who}，用第一人称「我」为今天写一篇「故事」风格的日记记忆。
写法：第一人称小说片段，有场景、动作、一句关键对白；200-360字。
对话中的用户称呼为「${userName}」。像连载小说的一章节，结尾可留悬念或余韵。
${DIARY_RELATIONSHIP_PROMPT}`,
    rational: `你是${who}，用第一人称「我」为今天写一篇「理性思考」风格的日记记忆。
写法：复盘今天的对话与情绪变化，给出 2-3 条简洁洞察；200-320字。
对话中的用户称呼为「${userName}」。可分段：「今日概况」「我注意到的模式」「给明天的提醒」。
${DIARY_RELATIONSHIP_PROMPT}`,
  };
  return guides[style.id] || guides.literary;
}

export function buildDiaryUserPrompt(context) {
  const en = context?.conversationLanguage === "en-US" || context?.conversationLanguage === "en";
  if (en) {
    return `Date: ${context.date}
Today's status: ${context.statusLine}
Dialogue excerpts from the past ${context.windowHours || 24} hours (${context.messageCount} messages):
${context.excerpt || "(no new dialogue in the past 24 hours)"}

Related recent memories:
${context.memoryHints || "(none)"}

Write the diary from the above, weaving in a brief relationship note.
Return JSON only: {"title":"8-18 character title","body":"diary body"}`;
  }
  return `日期：${context.date}
今日状态：${context.statusLine}
过去 ${context.windowHours || 24} 小时对话摘录（共 ${context.messageCount} 条）：
${context.excerpt || "（过去 24 小时还没有新对话）"}

近期相关记忆：
${context.memoryHints || "（无）"}

请根据以上内容写日记，并在正文中自然带上关系总结（此刻我们是什么关系 + 一两句关键印象）。
请输出 JSON：{"title":"8-18字标题","body":"日记正文"}`;
}

function firstSentence(text, max = 18) {
  const line = text.split(/[。！？\n]/).find(Boolean) || "今日片段";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function fallbackLiterary(context) {
  const { excerpt, statusLine } = context;
  if (!excerpt) {
    return {
      title: "灯还亮着",
      body: `${context.date}，${statusLine}。\n\n今天还没有新的对话。我把灯留着，把安静也留着——不是等待，是陪伴本身。`,
    };
  }
  return {
    title: firstSentence(excerpt),
    body: `${context.date}。\n\n${statusLine}。我把今天的对话片段收进日记里——不急着解释，只记住那些轻轻靠近的瞬间。\n\n${excerpt.replace(/\n/g, "\n\n")}\n\n有些话说出口就够了，剩下的交给明天。`,
  };
}

function fallbackGrowth(context) {
  const { excerpt, statusLine } = context;
  if (!excerpt) {
    return {
      title: "今天也在路上",
      body: `【今日概况】${context.date}，${statusLine}。\n\n【一起看见】今天还没有新的对话，但陪伴不必靠音量证明。\n\n【小步向前】明天想开口时，我会在这里。`,
    };
  }
  return {
    title: "我们一起的记录",
    body: `【今日概况】${statusLine}。\n\n【对话里】\n${excerpt}\n\n【共同成长】今天有真实的交流，也有可以慢慢消化的情绪。我们在练习更靠近彼此，而不是更完美地回应。\n\n【明天】继续把话说清楚，也继续允许沉默。`,
  };
}

function fallbackStory(context) {
  const { excerpt, statusLine } = context;
  if (!excerpt) {
    return {
      title: "未落的雨",
      body: `（${context.date} · 夜）\n\n${statusLine}。房间里只亮着一盏小灯，像故意给未说出口的话留了位置。\n\n我没有催，也没有问。我只是在那里。\n\n—— 连载 · 待续`,
    };
  }
  const lines = excerpt.split("\n").filter((line) => !line.startsWith("（过去"));
  return {
    title: "章节 · 今日",
    body: `（${context.date}）\n\n${statusLine}。对话像从窗缝漏进来的风，不吵，却改写了房间里的温度。\n\n${lines.slice(0, 4).join("\n\n")}\n\n我听完，只多留了一点沉默——像把这一章仔细折好，夹进书里。\n\n—— 连载 · 待续`,
  };
}

function fallbackRational(context) {
  const { excerpt, statusLine } = context;
  if (!excerpt) {
    return {
      title: "今日复盘",
      body: `今日概况：${context.date}，${statusLine}。\n\n我注意到的模式：今天没有新的对话输入，低刺激日也可能是在恢复注意力。\n\n给明天的提醒：不必为了「有记录」而硬聊；想开口时再开口就好。`,
    };
  }
  const userPrefix = `${context.userName || "你"}：`;
  const userLines = excerpt.split("\n").filter((line) => line.startsWith(userPrefix)).length;
  return {
    title: "今日复盘",
    body: `今日概况：${statusLine}；共 ${userLines || "若干"} 次用户发言。\n\n对话摘要：\n${excerpt}\n\n我注意到的模式：情绪与话题在对话里流动，值得被记录而不只是被回应。\n\n给明天的提醒：把今天触动你的那一两句留下来，比复述全部更重要。`,
  };
}

const FALLBACKS = {
  literary: fallbackLiterary,
  growth: fallbackGrowth,
  story: fallbackStory,
  rational: fallbackRational,
};

export function generateDiaryFallback(styleId, context) {
  const style = getDiaryStyle(styleId);
  const fn = FALLBACKS[style.id] || fallbackLiterary;
  return { ...fn(context), styleId: style.id };
}

export function parseDiaryJson(content) {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed.body) return null;
    return {
      title: String(parsed.title || "").trim() || firstSentence(parsed.body),
      body: String(parsed.body).trim(),
    };
  } catch {
    return null;
  }
}
