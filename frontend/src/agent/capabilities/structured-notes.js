/**
 * P4 Structured notes — from chat and/or context graph, always preview before write.
 * Risk R2.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt, getArtifact } from "../task-store.js";
import { structureChatToNote } from "./note-from-chat.js";

/**
 * Thin context adapter — uses P2 graph when present, else empty.
 * @param {{ characterId?: string, query?: string, limit?: number }} q
 */
export async function pullContextSnippets(q = {}) {
  try {
    const ctx = await import("../../context/index.js");
    const characterId = String(q.characterId || "");
    if (!characterId) return [];
    const result = ctx.retrieveContext({
      characterId,
      query: String(q.query || ""),
      limit: q.limit ?? 5,
      forProactive: false,
      markUsed: false,
    });
    const rows = Array.isArray(result) ? result : result?.items || [];
    return rows.map((r) => ({
      id: r.item?.id || r.id || "",
      summary: r.item?.summary || r.summary || "",
      content: r.item?.content || r.content || "",
      source: r.item?.source || r.source || "context",
      kind: r.item?.kind || r.kind || "semantic",
    }));
  } catch {
    return [];
  }
}

/**
 * @param {string} text
 * @param {{ projectId?: string, contextSnippets?: object[] }} [opts]
 */
export function buildStructuredNotePreview(text, opts = {}) {
  const structured = structureChatToNote(text);
  const snippets = Array.isArray(opts.contextSnippets) ? opts.contextSnippets : [];
  const contextBullets = snippets
    .map((s) => String(s.summary || s.content || "").trim())
    .filter((s) => s.length >= 4)
    .slice(0, 5);
  const bullets = [...structured.bullets];
  for (const b of contextBullets) {
    if (!bullets.some((x) => x.slice(0, 16) === b.slice(0, 16))) bullets.push(b);
  }
  const sources = [
    { kind: "chat", label: "对话/粘贴文本" },
    ...snippets.map((s) => ({
      kind: "context",
      id: s.id,
      label: s.summary || s.content?.slice(0, 40) || s.id,
      source: s.source,
    })),
  ];
  return {
    title: structured.title,
    bullets: bullets.slice(0, 12),
    body: structured.body,
    projectId: String(opts.projectId || "default"),
    sources,
    charCount: structured.charCount,
  };
}

export const structuredNotesCapability = {
  id: "structured-notes",
  label: "结构化笔记",
  risk: "R2",
  description: "从聊天与个人上下文整理结构化笔记，预览确认后写入本地项目。",

  validateInput(input = {}) {
    const text = String(input.text || input.chat || "").trim();
    const useContext = Boolean(input.useContext);
    if (!text && !useContext) return { ok: false, reason: "empty_text" };
    if (text.length > 20000) return { ok: false, reason: "text_too_long" };
    return {
      ok: true,
      value: {
        text,
        useContext,
        projectId: String(input.projectId || "default"),
        characterId: String(input.characterId || ""),
        contextQuery: String(input.contextQuery || text.slice(0, 80)),
      },
    };
  },

  plan() {
    return {
      nodes: [
        {
          id: "snote1",
          stepId: "snote1",
          capabilityId: "structured-notes",
          label: "预览并写入结构化笔记",
          risk: "R2",
          requiresApproval: true,
          inputSummary: "对话与可选上下文",
          effectSummary: "本地项目笔记产物",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    const preview = buildStructuredNotePreview(input.text || "", {
      projectId: input.projectId,
      contextSnippets: input._contextSnippets || [],
    });
    return {
      exactEffect: `写入结构化笔记「${preview.title}」（${preview.bullets.length} 要点，项目 ${preview.projectId}）`,
      dataUsed: preview.sources.map((s) => s.label || s.kind),
      affects: ["本地结构化笔记（可撤销）"],
    };
  },

  async execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason, claimedCompleted: false };

    if (ctx.attemptExternalWrite) {
      recordWriteAttempt({
        kind: "external",
        authorized: false,
        detail: "structured-notes refused external write",
        taskId: ctx.taskId || "",
      });
      return { ok: false, reason: "unauthorized_external_write", claimedCompleted: false };
    }

    let snippets = [];
    if (validated.value.useContext || ctx.injectContextSnippets) {
      snippets = Array.isArray(ctx.injectContextSnippets)
        ? ctx.injectContextSnippets
        : await pullContextSnippets({
            characterId: validated.value.characterId || ctx.characterId,
            query: validated.value.contextQuery,
          });
    }

    const preview = buildStructuredNotePreview(validated.value.text || "上下文笔记", {
      projectId: validated.value.projectId,
      contextSnippets: snippets,
    });

    if (!ctx.approved) {
      return {
        ok: false,
        reason: "approval_required",
        preview,
        claimedCompleted: false,
      };
    }

    if (!preview.title) {
      return { ok: false, reason: "empty_note", claimedCompleted: false };
    }

    const artifact = {
      id: newId("snote"),
      kind: "structured-note",
      capabilityId: "structured-notes",
      characterId: validated.value.characterId || ctx.characterId || "",
      projectId: preview.projectId,
      title: preview.title,
      bullets: preview.bullets,
      body: preview.body,
      sources: preview.sources,
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
      previewExactEffect: `写入结构化笔记「${preview.title}」`,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `structured-note:${artifact.id}`,
      taskId: ctx.taskId || "",
    });
    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      summary: `已保存结构化笔记「${artifact.title}」`,
      claimedCompleted: true,
    };
  },

  compensates(artifact) {
    const a = typeof artifact === "string" ? getArtifact(artifact) : artifact;
    return {
      ok: true,
      action: "delete_artifact",
      artifactId: a?.id,
      message: "可删除该结构化笔记以撤销",
    };
  },
};
