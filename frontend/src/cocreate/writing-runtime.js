/** AI-assisted manuscript jobs. The runtime proposes text; it never mutates a document. */

const JOB_LABELS = Object.freeze({
  continue: "续写",
  guided: "按要求起草",
  rewrite: "改写",
  expand: "扩写",
  describe: "补充感官细节",
  dialogue: "打磨对白",
});

function compact(text, max) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return value.slice(0, max);
}

function relevantBible(project, selection) {
  const query = String(selection || "");
  const cast = project.bible.cast.filter((item) => query.includes(item.name));
  const world = project.bible.world.filter((item) => (
    query.includes(item.title)
    || item.triggers.some((trigger) => query.includes(trigger))
  ));
  return {
    cast: (cast.length ? cast : project.bible.cast.slice(0, 6)),
    world: (world.length ? world : project.bible.world.slice(0, 6)),
  };
}

export function buildWritingContext({ project, chapter, kind, start, end, instruction = "" }) {
  if (!project || !chapter) throw new Error("writing_context_requires_project_and_chapter");
  const content = String(chapter.content || "");
  const safeStart = Math.max(0, Math.min(content.length, Number(start) || 0));
  const safeEnd = Math.max(safeStart, Math.min(content.length, Number(end) || safeStart));
  const selection = content.slice(safeStart, safeEnd);
  const before = compact(content.slice(Math.max(0, safeStart - 5000), safeStart), 5000);
  const after = compact(content.slice(safeEnd, safeEnd + 2500), 2500);
  const outlineNode = project.outline.find((item) => item.chapterId === chapter.id)
    || project.outline.find((item) => item.id === chapter.outlineNodeId)
    || null;
  const chapterIndex = project.chapters.findIndex((item) => item.id === chapter.id);
  const adjacent = project.chapters
    .filter((_, index) => Math.abs(index - chapterIndex) === 1)
    .map((item) => ({ title: item.title, summary: item.summary }));
  const bible = relevantBible(project, `${selection}\n${before.slice(-1000)}\n${instruction}`);
  return {
    schemaVersion: 1,
    projectId: project.id,
    projectTitle: project.title,
    kind,
    instruction: String(instruction || ""),
    storyBible: {
      premise: project.bible.premise,
      synopsis: project.bible.synopsis,
      genre: project.bible.genre,
      style: project.bible.style,
      pov: project.bible.pov,
      tense: project.bible.tense,
      cast: bible.cast,
      world: bible.world,
    },
    outlineNode,
    adjacent,
    chapter: {
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      before,
      selection,
      after,
      start: safeStart,
      end: safeEnd,
    },
  };
}

export function buildWritingMessages(context) {
  const label = JOB_LABELS[context.kind] || "编辑";
  const selectionRule = context.kind === "continue"
    ? "从前文末尾继续写，返回可直接插入的新正文。不要复述前文。"
    : context.chapter.selection
      ? "只返回用于替换选区的新正文，保留事实和叙事视角。"
      : "返回可直接插入光标位置的新正文。";
  const system = [
    `你是专业长篇小说编辑，正在执行「${label}」。`,
    "只输出候选正文，不要解释，不要标题，不要 Markdown 代码块。",
    "作品故事圣经是事实来源。不要擅自改变姓名、既定规则、视角或时态。",
    selectionRule,
    `文体：${context.storyBible.style}`,
    `视角：${context.storyBible.pov}；时态：${context.storyBible.tense}`,
  ].join("\n");
  const user = [
    `作品：${context.projectTitle}`,
    `类型：${context.storyBible.genre}`,
    `核心设定：${context.storyBible.premise}`,
    context.storyBible.synopsis ? `简介：${context.storyBible.synopsis}` : "",
    context.outlineNode ? `当前大纲：${context.outlineNode.title}｜${context.outlineNode.summary}` : "",
    context.adjacent.length ? `相邻章节：${context.adjacent.map((item) => `${item.title}：${item.summary}`).join("；")}` : "",
    context.storyBible.cast.length
      ? `人物：${context.storyBible.cast.map((item) => `${item.name}（${item.role}）：${item.description}`).join("\n")}`
      : "",
    context.storyBible.world.length
      ? `相关世界设定：${context.storyBible.world.map((item) => `${item.title}：${item.content}`).join("\n")}`
      : "",
    `当前章节：${context.chapter.title}｜${context.chapter.summary}`,
    `前文：\n${context.chapter.before || "（无）"}`,
    context.chapter.selection ? `选区：\n${context.chapter.selection}` : "",
    context.chapter.after ? `后文：\n${context.chapter.after}` : "",
    context.instruction ? `本次要求：${context.instruction}` : "",
  ].filter(Boolean).join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

export function validateWritingCandidate(raw, context) {
  let text = String(raw || "").trim();
  text = text.replace(/^```(?:markdown|text)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!text) return { ok: false, reason: "empty_candidate" };
  if (/^(说明|解释|分析|作为 AI|以下是)/.test(text) && text.length < 120) {
    return { ok: false, reason: "explanation_instead_of_prose" };
  }
  if (text.length > 12000) return { ok: false, reason: "candidate_too_long" };
  if (context.kind !== "continue" && context.chapter.selection && text === context.chapter.selection) {
    return { ok: false, reason: "candidate_unchanged" };
  }
  return { ok: true, text };
}

export async function runWritingJob({
  project,
  chapter,
  kind,
  start,
  end,
  instruction,
  callModel,
}) {
  if (typeof callModel !== "function") return { ok: false, reason: "model_callable_required" };
  const context = buildWritingContext({ project, chapter, kind, start, end, instruction });
  const messages = buildWritingMessages(context);
  let result;
  try {
    result = await callModel({ messages, context, kind, temperature: kind === "rewrite" ? 0.58 : 0.74 });
  } catch (error) {
    return { ok: false, reason: `model_call_failed:${error?.message || error}`, context, messages };
  }
  const checked = validateWritingCandidate(result?.content || result?.text || "", context);
  if (!checked.ok) return { ...checked, context, messages };
  return {
    ok: true,
    text: checked.text,
    context,
    messages,
    source: "model",
  };
}

export { JOB_LABELS };
