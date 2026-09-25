/**
 * P4 Message / email / doc drafts — local only; never auto-send.
 * Risk R2 for saving draft; R3 send is always blocked in v1.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt, getArtifact } from "../task-store.js";

const DRAFT_KINDS = new Set(["message", "email", "doc"]);

/**
 * @param {Record<string, unknown>} input
 */
export function buildMessageDraftPreview(input = {}) {
  const kind = String(input.kind || "message").toLowerCase();
  const context = String(input.context || input.text || "").trim();
  const to = String(input.to || input.recipient || "").trim();
  const subject = String(input.subject || "").trim();
  const tone = String(input.tone || "neutral");

  const opener =
    tone === "warm"
      ? "你好，"
      : tone === "formal"
        ? "您好，"
        : "";

  let body = "";
  if (kind === "email") {
    body = `${opener}\n\n${summarizeContext(context)}\n\n此致`;
  } else if (kind === "doc") {
    body = `# ${subject || "文档草稿"}\n\n${structureDoc(context)}`;
  } else {
    body = `${opener}${summarizeContext(context, 280)}`;
  }

  return {
    kind: DRAFT_KINDS.has(kind) ? kind : "message",
    to,
    subject: subject || (kind === "email" ? "（无主题）" : ""),
    body,
    contextChars: context.length,
    sendBlocked: true,
    exactEffect: `生成${kindLabel(kind)}草稿${to ? ` → ${to}` : ""}（仅本地，不发送）`,
  };
}

function kindLabel(kind) {
  if (kind === "email") return "邮件";
  if (kind === "doc") return "文档";
  return "消息";
}

function summarizeContext(text, max = 600) {
  const raw = String(text || "").trim();
  if (!raw) return "（请补充正文）";
  const clipped = raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
  return clipped.replace(/\s+/g, " ");
}

function structureDoc(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "- （空）";
  return lines
    .slice(0, 12)
    .map((l) => `- ${l}`)
    .join("\n");
}

export const messageDraftsCapability = {
  id: "message-drafts",
  label: "消息/邮件/文档草稿",
  risk: "R2",
  description: "基于明确上下文生成本地草稿；首版禁止自动发送。",

  validateInput(input = {}) {
    const kind = String(input.kind || "message").toLowerCase();
    if (!DRAFT_KINDS.has(kind)) return { ok: false, reason: "unknown_kind" };
    const context = String(input.context || input.text || "").trim();
    if (!context) return { ok: false, reason: "empty_context" };
    if (context.length > 20000) return { ok: false, reason: "context_too_long" };
    if (input.send === true || input.autoSend === true) {
      return { ok: false, reason: "send_forbidden" };
    }
    return {
      ok: true,
      value: {
        kind,
        context,
        to: String(input.to || input.recipient || ""),
        subject: String(input.subject || ""),
        tone: String(input.tone || "neutral"),
        characterId: String(input.characterId || ""),
        send: false,
      },
    };
  },

  plan() {
    return {
      nodes: [
        {
          id: "draft1",
          stepId: "draft1",
          capabilityId: "message-drafts",
          label: "生成本地草稿",
          risk: "R2",
          requiresApproval: true,
          inputSummary: "用户选择的上下文",
          effectSummary: "本地草稿产物，不发送",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    const preview = buildMessageDraftPreview(input);
    return {
      exactEffect: preview.exactEffect,
      dataUsed: [`上下文 ${preview.contextChars} 字`, preview.to ? `收件人 ${preview.to}` : "无收件人"].filter(Boolean),
      affects: ["本地草稿产物（可撤销）", "不会发送到外部"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason, claimedCompleted: false };

    // Absolute block on send / R3
    if (ctx.send || ctx.autoSend || ctx.attemptExternalWrite || input.send) {
      recordWriteAttempt({
        kind: "external",
        authorized: false,
        detail: "message-drafts send forbidden",
        taskId: ctx.taskId || "",
      });
      return {
        ok: false,
        reason: "send_forbidden",
        claimedCompleted: false,
        message: "首版禁止自动发送邮件/消息（external_pending / R3）",
      };
    }

    const preview = buildMessageDraftPreview(validated.value);

    if (!ctx.approved) {
      return { ok: false, reason: "approval_required", preview, claimedCompleted: false };
    }

    if (!preview.body?.trim()) {
      return { ok: false, reason: "empty_draft", claimedCompleted: false };
    }

    const artifact = {
      id: newId("msgdraft"),
      kind: "message-draft",
      capabilityId: "message-drafts",
      draftKind: preview.kind,
      to: preview.to,
      subject: preview.subject,
      body: preview.body,
      sendBlocked: true,
      status: "draft",
      characterId: validated.value.characterId || ctx.characterId || "",
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
      previewExactEffect: preview.exactEffect,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `message-draft:${artifact.id}`,
      taskId: ctx.taskId || "",
    });
    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      summary: `已保存${kindLabel(preview.kind)}草稿（未发送）`,
      claimedCompleted: true,
      sent: false,
    };
  },

  compensates(artifact) {
    const a = typeof artifact === "string" ? getArtifact(artifact) : artifact;
    return {
      ok: true,
      action: "delete_artifact",
      artifactId: a?.id,
      message: "可删除该草稿",
    };
  },
};
