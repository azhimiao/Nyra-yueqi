import {
  appendAssistantCandidate,
  getSharedHistory,
  getSession,
  saveSession,
  sendUser,
} from "../conversation/index.js";
import { getMessagesBySession } from "../storage/db.js";
import { prepareShortTermContext } from "./short-term.js";
import {
  inferConversationKind,
  resolveConversationBinding,
  touchSessionMappingReconcile,
} from "./session-map.js";

function fingerprint(role, content, legacyId = "") {
  const body = String(content || "").trim().replace(/\s+/g, " ");
  let hash = 2166136261;
  const seed = `${role}|${legacyId}|${body}`;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${role}:${legacyId}:${(hash >>> 0).toString(16)}:${body.slice(0, 120)}`;
}

function addIdentity(keys, value) {
  const key = String(value || "").trim();
  if (key) keys.add(key);
  return keys;
}

/** Every durable id a Conversation V2 node has ever been known by, including tombstones. */
function collectConversationIdentities(session) {
  const keys = new Set();
  for (const node of Object.values(session?.messageNodes || {})) {
    addIdentity(keys, node?.id);
    const meta = node?.meta || {};
    addIdentity(keys, meta.clientMessageId);
    addIdentity(keys, meta.legacyMessageId);
    addIdentity(keys, meta.conversationNodeId);
    addIdentity(keys, meta.conversationTurnId);
    for (const candidate of node?.candidates || []) {
      addIdentity(keys, candidate?.id);
      addIdentity(keys, candidate?.meta?.clientMessageId);
      addIdentity(keys, candidate?.meta?.legacyMessageId);
    }
  }
  return keys;
}

function collectRowIdentities(row) {
  const meta = row?.metadata && typeof row.metadata === "object"
    ? row.metadata
    : (row?.meta && typeof row.meta === "object" ? row.meta : {});
  return [
    row?.id,
    row?.messageId,
    row?.sourceMessageId,
    meta.clientMessageId,
    meta.legacyMessageId,
    meta.conversationNodeId,
    meta.conversationTurnId,
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

/**
 * Conversation V2 is authoritative. Legacy IDB rows are imported through an
 * explicit, idempotent reconciliation step keyed by chatSessionId mapping —
 * group chats never write into a member character's DM active session.
 */
export async function resolveAuthoritativeHistory(input = {}) {
  const readOnly = input.readOnly === true;
  const characterId = String(input.characterId || "").trim();
  const chatSessionId = String(input.chatSessionId || input.legacySessionId || "").trim();
  const conversationKind = input.conversationKind || inferConversationKind(chatSessionId);
  const participantIds = Array.isArray(input.participantIds) ? input.participantIds : [];

  if (conversationKind === "dm" && !characterId) {
    return { ok: false, error: "characterId_required", messages: [], audit: { authority: "conversation_v2" } };
  }

  const binding = resolveConversationBinding({
    chatSessionId: chatSessionId || (characterId ? `char:${characterId}` : ""),
    characterId,
    conversationKind,
    participantIds,
    conversationSessionId: input.conversationSessionId,
  });
  if (!binding.ok) {
    return { ok: false, error: binding.error || "binding_failed", messages: [], audit: { authority: "conversation_v2" } };
  }

  const session = getSession(binding.conversationSessionId);
  if (!session) {
    return { ok: false, error: "session_not_found", messages: [], audit: { authority: "conversation_v2" } };
  }

  const before = getSharedHistory(session.id);
  const existingIds = collectConversationIdentities(session);
  const existingLegacyIds = new Set(before.map((item) => String(item.meta?.legacyMessageId || "")).filter(Boolean));
  const existingFingerprints = new Set(before.map((item) => fingerprint(item.role, item.content, item.meta?.legacyMessageId || "")));
  let imported = 0;
  const repairQueue = [];

  async function reconcileRows(rows, sourceId, migrationLabel) {
    for (const row of rows || []) {
      if (!row || (row.role !== "user" && row.role !== "assistant")) continue;
      const aliases = collectRowIdentities(row);
      const legacyId = aliases[0] || "";
      const content = String(row.content ?? row.text ?? "").trim();
      if (!content) continue;
      const fp = fingerprint(row.role, content, legacyId);
      if (aliases.some((key) => existingIds.has(key))) continue;
      if ((legacyId && existingLegacyIds.has(legacyId)) || existingFingerprints.has(fp)) continue;
      const meta = {
        ...(row.metadata || row.meta || {}),
        legacyMessageId: legacyId,
        legacySessionId: sourceId,
        authorityMigration: migrationLabel,
        originalCreatedAt: row.createdAt || "",
        conversationKind: binding.conversationKind,
      };
      const result = row.role === "user"
        ? sendUser(session.id, content, meta)
        : appendAssistantCandidate(session.id, content, meta);
      if (result?.ok) {
        imported += 1;
        addIdentity(existingIds, result.node?.id);
        for (const key of aliases) existingIds.add(key);
        if (legacyId) existingLegacyIds.add(legacyId);
        existingFingerprints.add(fp);
      } else {
        repairQueue.push({
          legacyMessageId: legacyId,
          role: row.role,
          reason: result?.reason || "write_failed",
          at: new Date().toISOString(),
        });
      }
    }
  }

  // Non-chat products provide their persisted turns here. They are reconciled
  // into Conversation V2 once, so the broker still reads one authority.
  if (!readOnly && Array.isArray(input.sourceMessages) && input.sourceMessages.length) {
    await reconcileRows(
      input.sourceMessages,
      chatSessionId || binding.chatSessionId,
      "product_store_to_conversation_v2",
    );
  }

  const legacySessionId = chatSessionId || String(input.legacySessionId || "").trim();
  if (!readOnly && legacySessionId && input.reconcileLegacy !== false) {
    const legacy = await getMessagesBySession(legacySessionId, Number(input.legacyLimit) || 240);
    await reconcileRows(legacy, legacySessionId, "idb_to_conversation_v2");
  }

  const refreshed = getSession(session.id);
  if (!readOnly && refreshed) {
    refreshed.meta = {
      ...(refreshed.meta || {}),
      historyAuthority: "conversation_v2",
      legacyChatSessionId: legacySessionId,
      conversationKind: binding.conversationKind,
      legacyReconciledAt: new Date().toISOString(),
      legacyImportedCount: Number(refreshed.meta?.legacyImportedCount || 0) + imported,
      repairQueue: [...(Array.isArray(refreshed.meta?.repairQueue) ? refreshed.meta.repairQueue : []), ...repairQueue].slice(-40),
    };
    saveSession(refreshed);
  }
  if (!readOnly) {
    touchSessionMappingReconcile(binding.chatSessionId, {
      lastReconciledAt: new Date().toISOString(),
      legacyImportedCount: imported,
    });
  }

  const rows = getSharedHistory(session.id, { branchId: input.branchId || undefined });
  const short = prepareShortTermContext(rows, {
    tokenBudget: input.tokenBudget,
    maxMessages: input.maxMessages,
    currentInput: input.currentInput,
  });
  const active = getSession(session.id);
  return {
    ok: true,
    conversationSessionId: session.id,
    branchId: active?.activeBranchId || "",
    conversationKind: binding.conversationKind,
    chatSessionId: binding.chatSessionId,
    messages: short.messages,
    allMessages: rows,
    short,
    audit: {
      authority: "conversation_v2",
      conversationKind: binding.conversationKind,
      legacySessionId,
      imported,
      repairCount: repairQueue.length,
      sourceCount: rows.length,
      selectedCount: short.messages.length,
      selectedTokens: short.tokens,
      omittedMessageIds: short.omittedMessageIds,
      mappingCreated: binding.created,
    },
  };
}

