/**
 * Revoke derived context when authoritative chat evidence changes.
 *
 * Conversation history, Context Graph, Stable Memory, branch summaries and
 * MemPalace are separate stores. Removing only the chat bubble leaves the
 * derived copies available to prompt assembly, so message mutation must cross
 * that boundary explicitly.
 */

import { forgetCompanionChatSource } from "../companion/session-hooks.js";
import { invalidateSessionConsolidation } from "../companion/memory-consolidator.js";
import { invalidateBranchSummariesForConversation } from "../context/branch-summary.js";
import { deleteItem, listItems } from "../context/store.js";
import { getSession } from "../conversation/index.js";
import { forgetUnderstandingByEvidenceRefs } from "../memory/candidate-ledger.js";
import { clearContinuity } from "../relationship/continuity-store.js";
import { getAllRecords, storeRecord } from "../storage/db.js";
import { tombstoneTimelineEventsByEvidenceRefs } from "../timeline/repository.js";

function normalizedRefs(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )];
}

function rowReferences(row, refs) {
  if (!row || !refs.size) return false;
  const direct = [
    row.sourceId,
    row.sourceMessageId,
    row.messageId,
    row.drawerId,
    typeof row.sourceRef === "string" ? row.sourceRef : "",
    row.sourceRef?.sourceId,
    row.sourceRef?.messageId,
    row.meta?.sourceMessageId,
    row.meta?.userEvidenceRef,
    row.meta?.assistantEvidenceRef,
  ];
  if (direct.some((value) => refs.has(String(value || "").trim()))) return true;
  const arrays = [
    row.evidenceRefs,
    row.sourceMessageIds,
    row.meta?.evidenceRefs,
  ];
  return arrays.some(
    (values) => Array.isArray(values) && values.some((value) => refs.has(String(value))),
  );
}

async function invalidatePalaceRows(evidenceRefs, derivedSourceIds, reason, at) {
  const refs = new Set([...evidenceRefs, ...derivedSourceIds]);
  if (!refs.size) return { memoriesInvalidated: 0, kgInvalidated: 0 };
  let memoriesInvalidated = 0;
  const drawerIds = new Set();
  try {
    const memories = await getAllRecords("memories");
    for (const memory of memories) {
      if (memory?.invalidatedAt || !rowReferences(memory, refs)) continue;
      drawerIds.add(String(memory.drawerId || memory.id || "").trim());
      await storeRecord("memories", {
        ...memory,
        searchable: false,
        stale: true,
        invalidatedAt: at,
        tombstone: { reason, at },
      });
      memoriesInvalidated += 1;
    }
  } catch {
    // Browser storage may be unavailable during tests/early boot. The
    // authoritative localStorage ledgers were already revoked above.
  }

  let kgInvalidated = 0;
  if (drawerIds.size) {
    try {
      const facts = await getAllRecords("palace_kg");
      for (const fact of facts) {
        if (
          fact?.invalidatedAt
          || !drawerIds.has(String(fact?.sourceDrawerId || "").trim())
        ) {
          continue;
        }
        await storeRecord("palace_kg", {
          ...fact,
          validUntil: at,
          invalidatedAt: at,
        });
        kgInvalidated += 1;
      }
    } catch {
      /* same best-effort storage boundary as memories */
    }
  }
  return { memoriesInvalidated, kgInvalidated };
}

/**
 * User messages are evidence authority, so deleting/editing one revokes
 * candidate/stable/context memories. Assistant mutation only invalidates
 * summaries/timeline derived from that reply.
 */
export async function invalidateChatMessageEvidence(input = {}) {
  const evidenceRefs = normalizedRefs(input.evidenceRefs);
  const reason = String(input.reason || "message_deleted").trim() || "message_deleted";
  const at = new Date().toISOString();
  const userEvidence = input.role === "user";
  const sessionId = String(input.conversationSessionId || "").trim();
  const session = sessionId ? getSession(sessionId) : null;
  const characterId = String(
    input.characterId || session?.characterId || session?.meta?.productCharacterId || "",
  ).trim();

  const understanding = userEvidence
    ? forgetUnderstandingByEvidenceRefs({
      evidenceRefs,
      reason,
      palaceStore: input.palaceStore,
    })
    : {
      ok: true,
      candidatesForgotten: 0,
      stableForgotten: 0,
      forgottenCandidates: [],
      forgottenStable: [],
    };

  let contextDeleted = 0;
  if (userEvidence && evidenceRefs.length) {
    const refs = new Set(evidenceRefs);
    for (const item of listItems({ includeFrozen: true, limit: 10000 })) {
      if (!rowReferences(item, refs)) continue;
      deleteItem(item.id, { nowIso: at });
      contextDeleted += 1;
    }
  }

  const summaries = invalidateBranchSummariesForConversation({
    conversationSessionId: sessionId,
    reason,
  });
  const timeline = tombstoneTimelineEventsByEvidenceRefs(evidenceRefs, { reason, at });
  const continuity = characterId
    ? clearContinuity({ companionId: characterId })
    : { ok: true };
  const buffer = forgetCompanionChatSource({
    characterId,
    sessionId,
    texts: input.sourceTexts,
  });
  const consolidation = invalidateSessionConsolidation({ characterId, sessionId });

  const derivedSourceIds = normalizedRefs([
    ...(understanding.forgottenCandidates || []).map((row) => row.candidateId),
    ...(understanding.forgottenStable || []).map((row) => row.memoryId || row.id),
  ]);
  const palace = userEvidence
    ? await invalidatePalaceRows(evidenceRefs, derivedSourceIds, reason, at)
    : { memoriesInvalidated: 0, kgInvalidated: 0 };

  return {
    ok: understanding.ok !== false
      && summaries.ok !== false
      && timeline.ok !== false
      && continuity.ok !== false,
    candidatesForgotten: understanding.candidatesForgotten || 0,
    stableForgotten: understanding.stableForgotten || 0,
    contextDeleted,
    branchSummariesInvalidated: summaries.invalidated || 0,
    timelineTombstoned: timeline.tombstoned || 0,
    memoriesInvalidated: palace.memoriesInvalidated,
    kgInvalidated: palace.kgInvalidated,
    companionBufferDropped: buffer.dropped || 0,
    consolidationRemoved: Boolean(consolidation.removed),
  };
}

let repairPromise = null;
const DELETED_EVIDENCE_REPAIR_KEY = "yueqi.chat.deletedEvidenceRepair.v1";

function repairMarkerStorage() {
  try {
    return globalThis.localStorage || globalThis.window?.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * One-time boot repair for versions that deleted Conversation V2 nodes without
 * revoking their derived memory. Idempotent: all target stores use tombstones
 * or invalidation timestamps.
 */
export function repairDeletedMessageEvidence() {
  if (repairPromise) return repairPromise;
  repairPromise = (async () => {
    const markerStorage = repairMarkerStorage();
    if (markerStorage?.getItem(DELETED_EVIDENCE_REPAIR_KEY) === "1") {
      return { ok: true, skipped: "already_repaired" };
    }
    const { listSessions } = await import("../conversation/index.js");
    const totals = {
      sessionsScanned: 0,
      messagesRepaired: 0,
      candidatesForgotten: 0,
      stableForgotten: 0,
      contextDeleted: 0,
      branchSummariesInvalidated: 0,
      timelineTombstoned: 0,
      memoriesInvalidated: 0,
      kgInvalidated: 0,
    };

    for (const session of listSessions()) {
      totals.sessionsScanned += 1;
      const nodes = Object.values(session?.messageNodes || {});
      for (const node of nodes) {
        if (!node?.meta?.deletedAt) continue;
        const refs = [node.id, node.meta?.clientMessageId];
        if (node.role === "user") {
          for (const child of nodes) {
            if (child?.parentMessageId !== node.id) continue;
            refs.push(child.id, child.meta?.clientMessageId);
          }
        }
        const repaired = await invalidateChatMessageEvidence({
          role: node.role === "user" ? "user" : "assistant",
          evidenceRefs: refs,
          conversationSessionId: session.id,
          reason: "deleted_message_boot_repair",
        });
        totals.messagesRepaired += 1;
        for (const key of [
          "candidatesForgotten",
          "stableForgotten",
          "contextDeleted",
          "branchSummariesInvalidated",
          "timelineTombstoned",
          "memoriesInvalidated",
          "kgInvalidated",
        ]) {
          totals[key] += Number(repaired[key]) || 0;
        }
      }
    }
    markerStorage?.setItem(DELETED_EVIDENCE_REPAIR_KEY, "1");
    return { ok: true, ...totals };
  })().catch((error) => ({
    ok: false,
    reason: error?.message || "deleted_message_repair_failed",
  }));
  return repairPromise;
}

export function __resetDeletedMessageEvidenceRepairForTests() {
  repairPromise = null;
}
