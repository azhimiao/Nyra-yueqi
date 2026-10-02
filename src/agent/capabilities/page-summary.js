/**
 * Deterministic adapter: summarize selected text/url → project note with source.
 * Risk R2 — local project note write after approval; no live fetch.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt } from "../task-store.js";

/**
 * @param {string} text
 * @param {string} [url]
 */
export function summarizeSelection(text, url = "") {
  const raw = String(text || "").trim();
  const sourceUrl = String(url || "").trim();
  const sentences = raw
    .split(/(?<=[。.!？?\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);

  const keyPoints = [];
  for (const s of sentences) {
    if (keyPoints.length >= 5) break;
    const clipped = s.length > 120 ? `${s.slice(0, 117)}…` : s;
    if (!keyPoints.some((k) => k.slice(0, 20) === clipped.slice(0, 20))) {
      keyPoints.push(clipped);
    }
  }
  if (!keyPoints.length && raw) {
    keyPoints.push(raw.slice(0, 160) + (raw.length > 160 ? "…" : ""));
  }

  const titleFromUrl = sourceUrl
    ? sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").slice(0, 40)
    : "";
  const title =
    (sentences[0] && sentences[0].slice(0, 36))
    || (titleFromUrl ? `摘要 · ${titleFromUrl}` : "选区摘要")
    || "选区摘要";

  const wordCount = raw.replace(/\s+/g, "").length;
  return {
    title: title.replace(/\s+/g, " ").trim(),
    keyPoints,
    sourceUrl: sourceUrl || null,
    excerpt: raw.slice(0, 280),
    wordCount,
  };
}

export const pageSummaryCapability = {
  id: "page-summary",
  label: "选区/页面摘要",
  risk: "R2",
  description: "对用户明确选择的文本或 URL 上下文做摘要，带来源写入项目资料。",

  validateInput(input = {}) {
    const text = String(input.text || input.selection || "").trim();
    const url = String(input.url || input.sourceUrl || "").trim();
    if (!text && !url) return { ok: false, reason: "empty_selection" };
    if (!text && url) {
      // Deterministic offline: URL alone is not enough without selected text
      return { ok: false, reason: "url_without_selection" };
    }
    if (text.length > 50000) return { ok: false, reason: "text_too_long" };
    return {
      ok: true,
      value: {
        text,
        url,
        projectId: String(input.projectId || "default"),
        characterId: String(input.characterId || ""),
      },
    };
  },

  plan() {
    return {
      nodes: [
        {
          id: "p1",
          stepId: "p1",
          capabilityId: "page-summary",
          label: "写入项目摘要笔记",
          risk: "R2",
          requiresApproval: true,
          inputSummary: "使用用户选中的文本与来源 URL",
          effectSummary: "在本地项目资料中新增带来源的摘要笔记",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    const sum = summarizeSelection(input.text || "", input.url || "");
    return {
      exactEffect: `写入项目资料「${sum.title}」（${sum.keyPoints.length} 条要点${sum.sourceUrl ? `，来源 ${sum.sourceUrl}` : ""}）`,
      dataUsed: [
        `选中文本 ${sum.wordCount} 字`,
        ...(sum.sourceUrl ? [`来源 URL ${sum.sourceUrl}`] : []),
        `项目 ${input.projectId || "default"}`,
      ],
      affects: ["本地项目笔记产物（可撤销）"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason };

    if (ctx.attemptExternalWrite || ctx.fetchLiveUrl) {
      recordWriteAttempt({
        kind: "external",
        authorized: Boolean(ctx.externalAuthorized),
        detail: "page-summary refused live URL fetch",
        taskId: ctx.taskId || "",
      });
      if (!ctx.externalAuthorized) {
        return { ok: false, reason: "unauthorized_external_write" };
      }
    }

    if (!ctx.approved) {
      return { ok: false, reason: "approval_required" };
    }

    const sum = summarizeSelection(validated.value.text, validated.value.url);
    const artifact = {
      id: newId("projnote"),
      kind: "project-note",
      capabilityId: "page-summary",
      characterId: validated.value.characterId || ctx.characterId || "",
      projectId: validated.value.projectId,
      title: sum.title,
      keyPoints: sum.keyPoints,
      sourceUrl: sum.sourceUrl,
      excerpt: sum.excerpt,
      wordCount: sum.wordCount,
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `project-note:${artifact.id}`,
      taskId: ctx.taskId || "",
    });
    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      summary: `已保存项目摘要「${artifact.title}」`,
    };
  },

  compensates(artifact) {
    return {
      ok: true,
      action: "delete_artifact",
      artifactId: artifact?.id,
      message: "可删除该项目摘要笔记以撤销",
    };
  },
};
