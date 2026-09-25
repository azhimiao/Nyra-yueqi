/**
 * ReadingContextBuilder — local context only for companion co-read comments.
 * Never injects full book / full chapter / “you have read this book”.
 */

const DEFAULT_MAX_CHARS = 1200;
const SYNOPSIS_MAX = 250;

/**
 * @param {{
 *   paragraphs: string[],
 *   startPara: number,
 *   endPara: number,
 *   quote: string,
 *   book?: { title?: string, author?: string, synopsis?: string, id?: string },
 *   chapterTitle?: string,
 *   progress?: number,
 *   userNote?: string,
 *   maxChars?: number,
 * }} input
 */
export function buildReadingCommentContext(input = {}) {
  const paragraphs = Array.isArray(input.paragraphs) ? input.paragraphs : [];
  const startPara = Math.max(0, Math.floor(Number(input.startPara) || 0));
  const endPara = Math.max(startPara, Math.floor(Number(input.endPara) || startPara));
  const quote = String(input.quote || "").trim();
  const maxChars = Math.max(400, Math.min(2000, Number(input.maxChars) || DEFAULT_MAX_CHARS));

  const beforeCount = quote.length > 200 ? 1 : 2;
  const afterCount = quote.length > 200 ? 1 : 2;
  const beforeStart = Math.max(0, startPara - beforeCount);
  const afterEnd = Math.min(paragraphs.length, endPara + 1 + afterCount);

  let contextBefore = paragraphs.slice(beforeStart, startPara).join("\n\n");
  let contextAfter = paragraphs.slice(endPara + 1, afterEnd).join("\n\n");

  const synopsis = String(input.book?.synopsis || "").trim().slice(0, SYNOPSIS_MAX)
    || defaultSynopsisFromParagraphs(paragraphs);

  // Shrink local context to budget (quote reserved).
  const reserved = quote.length + synopsis.length + 80;
  let budget = Math.max(200, maxChars - reserved);
  contextBefore = trimToBudget(contextBefore, Math.floor(budget * 0.5), "end");
  contextAfter = trimToBudget(contextAfter, Math.ceil(budget * 0.5), "start");

  const chapterTitle = String(input.chapterTitle || detectChapterNear(paragraphs, startPara) || "").trim();
  const progress = Math.max(0, Math.min(1, Number(input.progress) || 0));

  const payload = {
    book: {
      id: String(input.book?.id || ""),
      title: String(input.book?.title || "").trim() || "未命名",
      author: String(input.book?.author || "").trim(),
      synopsis,
    },
    reading: {
      chapter: chapterTitle,
      progress,
    },
    contextBefore,
    highlight: quote,
    contextAfter,
    userNote: String(input.userNote || "").trim().slice(0, 280),
    instruction:
      "用户刚刚在正文里划了一句。请以你自己的身份，在划线下方用一两句口语写一句「想法」评论（像微信读书的想法），直接说你对这一句的感受或联想。"
      + "不要提问用户为什么划线，不要总结全书，不要假装读过提供上下文以外的内容，不要用教学口吻。",
  };

  return {
    payload,
    promptBlock: formatReadingCommentPrompt(payload),
    approxChars: countChars(payload),
  };
}

export function formatReadingCommentPrompt(payload) {
  const lines = [
    "<yueqi-reading-comment>",
    `书名：${payload.book.title}`,
    payload.book.author ? `作者：${payload.book.author}` : "",
    `简介：${payload.book.synopsis}`,
    payload.reading.chapter ? `当前章节：${payload.reading.chapter}` : "",
    `阅读进度：${Math.round((payload.reading.progress || 0) * 100)}%`,
    "",
    "局部上文：",
    payload.contextBefore || "（无）",
    "",
    "用户划线：",
    payload.highlight,
    "",
    "局部下文：",
    payload.contextAfter || "（无）",
  ];
  if (payload.userNote) {
    lines.push("", `用户附注：${payload.userNote}`);
  }
  lines.push("", payload.instruction, "</yueqi-reading-comment>");
  return lines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
}

function defaultSynopsisFromParagraphs(paragraphs) {
  const text = paragraphs.slice(0, 6).join("").replace(/\s+/g, " ").trim();
  if (!text) return "一本正在共读的电子书。";
  return `${text.slice(0, SYNOPSIS_MAX - 1)}${text.length > SYNOPSIS_MAX - 1 ? "…" : ""}`;
}

function detectChapterNear(paragraphs, index) {
  for (let i = index; i >= 0 && i >= index - 8; i -= 1) {
    const p = String(paragraphs[i] || "").trim();
    if (/^(第?\s*\d+\s*章|[Cc]hapter\s*\d+|开篇|序章|尾声|第[一二三四五六七八九十]+部分)/.test(p)) {
      return p.slice(0, 40);
    }
  }
  return "";
}

function trimToBudget(text, budget, from) {
  const s = String(text || "");
  if (s.length <= budget) return s;
  if (from === "end") return `…${s.slice(-budget)}`;
  return `${s.slice(0, budget)}…`;
}

function countChars(payload) {
  return [
    payload.book?.synopsis,
    payload.contextBefore,
    payload.highlight,
    payload.contextAfter,
    payload.userNote,
  ].join("").length;
}
