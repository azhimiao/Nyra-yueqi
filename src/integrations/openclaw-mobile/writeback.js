/**
 * Write OpenClaw / Assist task results back into shared companion history (M4 + M6).
 * Uses frozen initiatingCompanionId — never the live UI active character.
 */

import { writeCompanionTurn } from "../../conversation/companion-write.js";
import { appendTimelineEvent } from "../../timeline/repository.js";
import { freezeCompanionScope, requireCompanionScope } from "../../memory/companion-scope.js";

/**
 * @param {{
 *   companionId?: string,
 *   characterId?: string,
 *   initiatingCompanionId?: string,
 *   userId?: string,
 *   relationshipId?: string,
 *   chatSessionId?: string,
 *   summary: string,
 *   taskId?: string,
 *   saveChatMessage?: Function,
 * }} input
 */
export async function writeOpenClawResultToCompanionHistory(input = {}) {
  const scopeCheck = requireCompanionScope(freezeCompanionScope({
    userId: input.userId,
    companionId: input.initiatingCompanionId || input.companionId || input.characterId,
    relationshipId: input.relationshipId,
    taskId: input.taskId,
    initiatingCompanionId: input.initiatingCompanionId || input.companionId || input.characterId,
  }));
  if (!scopeCheck.ok) return { ok: false, reason: scopeCheck.reason };
  const scope = scopeCheck.scope;
  const summary = String(input.summary || "").trim();
  if (!summary) return { ok: false, reason: "incomplete" };

  const text = `【共同完成】${summary}`.slice(0, 800);
  const written = await writeCompanionTurn({
    role: "system",
    text,
    userId: scope.userId,
    companionId: scope.initiatingCompanionId || scope.companionId,
    characterId: scope.initiatingCompanionId || scope.companionId,
    relationshipId: scope.relationshipId,
    chatSessionId: input.chatSessionId || "",
    meta: {
      source: "openclaw_writeback",
      taskId: input.taskId || scope.taskId || "",
      kind: "task_result",
      initiatingCompanionId: scope.initiatingCompanionId,
      relationshipId: scope.relationshipId,
    },
    saveChatMessage: input.saveChatMessage,
    skipIdbProjection: typeof input.saveChatMessage !== "function",
  });

  const timeline = appendTimelineEvent({
    companionId: scope.initiatingCompanionId || scope.companionId,
    userId: scope.userId,
    relationshipId: scope.relationshipId,
    actor: scope.initiatingCompanionId || scope.companionId,
    principal: scope.userId,
    source: "openclaw_task",
    sourceId: String(input.taskId || ""),
    eventType: "shared_task_completed",
    realityNamespace: "reality",
    idempotencyKey: `openclaw:${scope.companionId}:${input.taskId || hash(summary)}`,
    payload: {
      summary: summary.slice(0, 200),
      needsFollowUp: false,
      initiatingCompanionId: scope.initiatingCompanionId,
    },
  });

  return {
    ok: Boolean(written.ok),
    conversation: written,
    timeline,
    scope,
  };
}

function hash(text) {
  let h = 0;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
