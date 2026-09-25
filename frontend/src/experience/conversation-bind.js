/**
 * Scenario / experience conversations must never share the companion Pop DM.
 */

import { resolveConversationBinding } from "../context/session-map.js";
import {
  appendAssistantCandidate,
  getSession,
  selectVisibleHistory,
  sendUser,
} from "../conversation/index.js";

export function scenarioChatSessionId({
  packageId = "",
  openingId = "",
  runId = "",
} = {}) {
  const pkg = String(packageId || "pkg").trim() || "pkg";
  const opening = String(openingId || "opening").trim() || "opening";
  const run = String(runId || "new").trim() || "new";
  return `scenario:${pkg}:${opening}:${run}`;
}

export function isIsolatedScenarioSession(session) {
  if (!session || typeof session !== "object") return false;
  if (String(session.meta?.conversationKind || "") === "scenario") return true;
  const cid = String(session.characterId || "");
  return cid.startsWith("__scenario__") || cid.startsWith("__") || cid.startsWith("char-scenario:");
}

export function isScenarioHistoryRow(row = {}) {
  if (row.meta?.openingSeed === true) return true;
  if (row.mode === "immersive") return true;
  const source = String(row.meta?.source || "");
  if (source.startsWith("scenario")) return true;
  if (row.meta?.experienceSessionId) return true;
  return false;
}

/**
 * Bind (or create) a Conversation V2 session owned by the work, not the companion DM.
 * @param {{
 *   packageId?: string,
 *   openingId?: string,
 *   runId?: string,
 *   chatSessionId?: string,
 *   conversationSessionId?: string,
 *   characterId?: string,
 * }} opts
 */
export function bindScenarioConversation(opts = {}) {
  const existingId = String(opts.conversationSessionId || "").trim();
  if (existingId) {
    const existing = getSession(existingId);
    if (existing && isIsolatedScenarioSession(existing)) {
      return {
        ok: true,
        session: existing,
        conversationSessionId: existing.id,
        chatSessionId: String(existing.meta?.chatSessionId || opts.chatSessionId || ""),
        reused: true,
      };
    }
  }

  const chatSessionId = String(opts.chatSessionId || "").trim()
    || scenarioChatSessionId(opts);
  const participantIds = [opts.characterId].map((id) => String(id || "").trim()).filter(Boolean);
  const binding = resolveConversationBinding({
    chatSessionId,
    conversationKind: "scenario",
    participantIds,
  });
  if (!binding.ok) {
    return { ok: false, reason: binding.error || "scenario_session_failed" };
  }
  return {
    ok: true,
    session: binding.session,
    conversationSessionId: binding.conversationSessionId,
    chatSessionId: binding.chatSessionId,
    ownerKey: binding.ownerKey,
    reused: !binding.created,
  };
}

/**
 * If an older run still points at the companion DM, copy only scenario turns
 * into a fresh isolated session. Companion opening / 宝贝 lines stay in Pop.
 */
export function rebindAwayFromCompanionDm(opts = {}) {
  const from = opts.fromSession || (opts.conversationSessionId ? getSession(opts.conversationSessionId) : null);
  if (from && isIsolatedScenarioSession(from)) {
    return {
      ok: true,
      session: from,
      conversationSessionId: from.id,
      migrated: false,
    };
  }

  const bound = bindScenarioConversation({
    packageId: opts.packageId,
    openingId: opts.openingId,
    runId: opts.runId,
    characterId: opts.characterId,
  });
  if (!bound.ok) return bound;

  const dest = getSession(bound.conversationSessionId);
  const destHistory = dest ? selectVisibleHistory(dest) : [];
  if (from && dest && destHistory.length === 0) {
    for (const row of selectVisibleHistory(from).filter(isScenarioHistoryRow)) {
      const text = String(row.text || row.content || "").trim();
      if (!text) continue;
      const meta = {
        ...(row.meta && typeof row.meta === "object" ? row.meta : {}),
        migratedFromCompanionDm: true,
      };
      if (row.role === "user") sendUser(dest.id, text, meta);
      else appendAssistantCandidate(dest.id, text, meta);
    }
  }

  return {
    ok: true,
    session: getSession(bound.conversationSessionId),
    conversationSessionId: bound.conversationSessionId,
    migrated: Boolean(from && !isIsolatedScenarioSession(from)),
  };
}
