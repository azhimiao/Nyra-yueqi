import { ensureDmConversation } from "../characters/session-context.js";
import { getMessagesBySession, saveChatMessage } from "../storage/db.js";
import { writeCompanionTurn } from "../conversation/companion-write.js";

const inFlight = new Map();

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function activityMessageId(kind, sourceId) {
  return `activity-${stableHash(`${kind}:${sourceId}`)}`;
}

/**
 * Persist one domain activity into the companion DM. The stored chat record is
 * the projection authority; App and mini-phone render the same record.
 */
export async function projectActivityToChat(input = {}) {
  const companionId = String(input.companionId || input.characterId || "").trim();
  const kind = String(input.kind || input.activityType || "activity").trim() || "activity";
  const sourceId = String(input.sourceId || input.idempotencyKey || "").trim();
  const text = String(input.text || input.content || "").trim();
  if (!companionId) return { ok: false, reason: "missing_companionId" };
  if (!sourceId) return { ok: false, reason: "missing_sourceId" };
  if (!text) return { ok: false, reason: "missing_text" };

  const messageId = String(input.messageId || activityMessageId(kind, sourceId));
  if (inFlight.has(messageId)) return inFlight.get(messageId);

  const run = (async () => {
    const sessionId = await ensureDmConversation(companionId);
    const existing = (await getMessagesBySession(sessionId, 400)).find((row) => row.id === messageId);
    if (existing) return { ok: true, deduped: true, message: existing };

    const metadata = {
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      kind: input.metadata?.kind || "activity",
      mediaType: input.metadata?.mediaType || "activity",
      activityType: kind,
      sourceId,
      source: input.metadata?.source || "domain_activity_projection",
      actionLabel: String(input.actionLabel || input.metadata?.actionLabel || "").trim(),
      deepLink: String(input.deepLink || input.metadata?.deepLink || "").trim(),
    };

    const role = input.role === "assistant" ? "assistant" : "system";
    const written = await writeCompanionTurn({
      role,
      text,
      companionId,
      characterId: companionId,
      userId: String(input.userId || "local"),
      relationshipId: input.relationshipId,
      chatSessionId: sessionId,
      messageId,
      createdAt: input.createdAt || new Date().toISOString(),
      meta: metadata,
      saveChatMessage,
    });
    return written.ok
      ? { ok: true, deduped: false, message: written.message, written }
      : { ok: false, reason: written.reason || "activity_write_failed", written };
  })().finally(() => inFlight.delete(messageId));

  inFlight.set(messageId, run);
  return run;
}
