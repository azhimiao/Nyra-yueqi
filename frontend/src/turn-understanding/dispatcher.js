/**
 * Proposal dispatcher — W3 shadow + W4 execute mode (plan §W3/§W4).
 * Execute mode: R0/eligible R1 may run; R2/R3 require approveProposal.
 */

import { processActionProposals } from "./executor.js";
import { clearProposalStoreForTests } from "./proposal-store.js";

/** @type {Map<string, object>} */
const shadowByTurnId = new Map();

/** @type {object[]} */
const shadowLog = [];

/**
 * Non-authoritative in-memory store. Cleared on reload. Not a second task/calendar authority.
 * @param {object} understanding validated TurnUnderstandingV1
 * @param {{ mode?: "shadow"|"execute", note?: string, execution?: object }} [opts]
 */
export function shadowRecord(understanding, opts = {}) {
  const turnId = String(understanding?.turnId || "").trim();
  if (!turnId) {
    return { ok: false, reason: "missing_turnId", executed: false };
  }

  const mode = opts.mode || "shadow";
  const execution = opts.execution || null;
  const record = {
    turnId,
    recordedAt: new Date().toISOString(),
    mode,
    note:
      opts.note
      || (mode === "execute" ? "execute_controlled_actions" : "shadow_only_no_side_effects"),
    understanding,
    executed: Boolean(execution?.executed),
    calendarWrite: Boolean(execution?.calendarWrite),
    openClawInvoked: Boolean(execution?.openClawInvoked),
    timelineAppend: false,
    pendingApproval: execution?.pendingApproval || [],
    executionResults: execution?.results || [],
  };

  const existing = shadowByTurnId.get(turnId);
  if (existing) {
    const same =
      JSON.stringify(fingerprint(existing.understanding))
      === JSON.stringify(fingerprint(understanding));
    if (same && mode === existing.mode) {
      return { ok: true, idempotent: true, record: existing, executed: existing.executed };
    }
    shadowByTurnId.set(turnId, record);
    shadowLog.push({ ...record, replacedPrior: true });
    return { ok: true, replaced: true, record, executed: record.executed };
  }

  shadowByTurnId.set(turnId, record);
  shadowLog.push(record);
  return { ok: true, record, executed: record.executed };
}

function fingerprint(u) {
  return {
    turnId: u?.turnId,
    interpreter: u?.interpreter,
    conversationalIntent: u?.conversationalIntent,
    temporalMentions: (u?.temporalMentions || []).map((m) => m?.text || m?.kind),
    eventProposals: (u?.eventProposals || []).map((e) => ({
      eventId: e?.eventId,
      kind: e?.kind,
      status: e?.status,
      title: e?.title,
    })),
    actionProposals: (u?.actionProposals || []).map((a) => ({
      proposalId: a?.proposalId,
      risk: a?.risk,
      capabilityId: a?.capabilityId,
      requiresApproval: a?.requiresApproval,
    })),
    webRequests: (u?.webRequests || []).map((w) => w?.query || w?.kind),
  };
}

/**
 * @param {string} turnId
 */
export function getShadowRecord(turnId) {
  return shadowByTurnId.get(String(turnId || "").trim()) || null;
}

export function listShadowRecords() {
  return [...shadowByTurnId.values()];
}

export function getShadowLog() {
  return [...shadowLog];
}

export function clearShadowStoreForTests() {
  shadowByTurnId.clear();
  shadowLog.length = 0;
  clearProposalStoreForTests();
}

/**
 * Dispatch entry — shadow (W3) or execute (W4).
 * @param {object} understanding
 * @param {{ mode?: "shadow"|"execute", sourceText?: string, nowIso?: string }} [opts]
 */
export async function dispatchProposals(understanding, opts = {}) {
  const mode = opts.mode || "shadow";
  if (mode === "shadow") {
    return shadowRecord(understanding, { mode: "shadow" });
  }
  if (mode !== "execute") {
    return {
      ok: false,
      reason: "unknown_dispatch_mode",
      executed: false,
      mode,
    };
  }

  const execution = await processActionProposals(understanding, {
    sourceText: opts.sourceText,
    nowIso: opts.nowIso,
  });

  const recorded = shadowRecord(understanding, {
    mode: "execute",
    note: "execute_controlled_actions",
    execution,
  });

  return {
    ok: true,
    mode: "execute",
    executed: Boolean(execution.executed),
    calendarWrite: Boolean(execution.calendarWrite),
    openClawInvoked: false,
    pendingApproval: execution.pendingApproval || [],
    results: execution.results || [],
    record: recorded.record,
  };
}
