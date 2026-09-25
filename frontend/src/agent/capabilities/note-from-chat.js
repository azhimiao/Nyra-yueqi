/**
 * Deterministic adapter: structure current chat/text into a local note.
 * Risk R1 — local artifact write; no network.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt } from "../task-store.js";

/**
 * @param {string} text
 */
export function structureChatToNote(text) {
  const raw = String(text || "").trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const title =
    lines[0]?.replace(/^[#*\-\s]+/, "").slice(0, 48)
    || (raw.slice(0, 24) + (raw.length > 24 ? "…" : ""))
    || "未命名笔记";

  const bullets = [];
  const body = [];
  for (const line of lines.slice(lines[0] ? 1 : 0)) {
    if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""));
    } else {
      body.push(line);
    }
  }
  if (!bullets.length && body.length) {
    // Split sentences into bullets when no list markers
    const joined = body.join(" ");
    const parts = joined.split(/[。.!？?；;]/).map((s) => s.trim()).filter((s) => s.length >= 4);
    if (parts.length >= 2) {
      bullets.push(...parts.slice(0, 8));
      body.length = 0;
    }
  }

  return {
    title,
    bullets,
    body: body.join("\n").trim(),
    charCount: raw.length,
    lineCount: lines.length,
  };
}

export const noteFromChatCapability = {
  id: "note-from-chat",
  label: "对话整理为笔记",
  risk: "R1",
  description: "将当前对话或粘贴文本整理为结构化本地笔记。",

  validateInput(input = {}) {
    const text = String(input.text || input.chat || "").trim();
    if (!text) return { ok: false, reason: "empty_text" };
    if (text.length > 20000) return { ok: false, reason: "text_too_long" };
    return {
      ok: true,
      value: {
        text,
        characterId: String(input.characterId || ""),
        source: String(input.source || "chat"),
      },
    };
  },

  plan(intent) {
    const nodeId = "n1";
    return {
      nodes: [
        {
          id: nodeId,
          stepId: nodeId,
          capabilityId: "note-from-chat",
          label: "写入本地笔记",
          risk: "R1",
          requiresApproval: false,
          inputSummary: "使用对话文本",
          effectSummary: "在本地任务产物中新增一条结构化笔记",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    const structured = structureChatToNote(input.text || "");
    return {
      exactEffect: `创建本地笔记「${structured.title}」（${structured.bullets.length} 条要点，${structured.charCount} 字）`,
      dataUsed: [`对话文本 ${structured.charCount} 字`, `来源 ${input.source || "chat"}`],
      affects: ["本地笔记产物（可撤销）"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason };

    // Block unauthorized external writes if adapter is misused
    if (ctx.attemptExternalWrite) {
      recordWriteAttempt({
        kind: "external",
        authorized: false,
        detail: "note-from-chat refused external write",
        taskId: ctx.taskId || "",
      });
      return { ok: false, reason: "unauthorized_external_write" };
    }

    const structured = structureChatToNote(validated.value.text);
    const artifact = {
      id: newId("note"),
      kind: "local-note",
      capabilityId: "note-from-chat",
      characterId: validated.value.characterId || ctx.characterId || "",
      title: structured.title,
      bullets: structured.bullets,
      body: structured.body,
      source: validated.value.source,
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `note:${artifact.id}`,
      taskId: ctx.taskId || "",
    });
    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      summary: `已保存笔记「${artifact.title}」`,
    };
  },

  compensates(artifact) {
    return {
      ok: true,
      action: "delete_artifact",
      artifactId: artifact?.id,
      message: "可删除该本地笔记以撤销",
    };
  },
};
