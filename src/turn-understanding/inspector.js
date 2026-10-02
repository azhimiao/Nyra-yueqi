/**
 * Debug inspector for TurnUnderstanding proposals (plan §7.1).
 */

/**
 * @param {object} understanding
 * @param {{ dropped?: object[] }} [meta]
 */
export function summarizeUnderstanding(understanding, meta = {}) {
  const u = understanding && typeof understanding === "object" ? understanding : {};
  const actions = Array.isArray(u.actionProposals) ? u.actionProposals : [];
  const events = Array.isArray(u.eventProposals) ? u.eventProposals : [];
  const mentions = Array.isArray(u.temporalMentions) ? u.temporalMentions : [];
  const webs = Array.isArray(u.webRequests) ? u.webRequests : [];
  const signals = Array.isArray(u.relationshipSignals) ? u.relationshipSignals : [];

  return {
    turnId: String(u.turnId || ""),
    interpreter: u.interpreter || "",
    conversationalIntent: u.conversationalIntent || "",
    counts: {
      temporalMentions: mentions.length,
      eventProposals: events.length,
      actionProposals: actions.length,
      webRequests: webs.length,
      relationshipSignals: signals.length,
      memoryCandidates: Array.isArray(u.memoryCandidates) ? u.memoryCandidates.length : 0,
      evidenceRefs: Array.isArray(u.evidenceRefs) ? u.evidenceRefs.length : 0,
      dropped: Array.isArray(meta.dropped) ? meta.dropped.length : 0,
    },
    events: events.map((e) => ({
      eventId: e.eventId,
      kind: e.kind,
      status: e.status,
      title: e.title,
      needsFollowUp: e.needsFollowUp,
    })),
    actions: actions.map((a) => ({
      proposalId: a.proposalId,
      capabilityId: a.capabilityId,
      operation: a.operation,
      risk: a.risk,
      requiresApproval: a.requiresApproval,
      explicitness: a.explicitness,
      exactEffect: a.exactEffect,
    })),
    mentions: mentions.map((m) => ({
      kind: m.kind,
      commitment: m.commitment,
      proposedOnly: m.proposedOnly,
      text: String(m.text || "").slice(0, 80),
    })),
    webRequests: webs.map((w) => ({
      kind: w.kind,
      query: w.query,
      city: w.city,
    })),
    dropped: Array.isArray(meta.dropped)
      ? meta.dropped.map((d) => ({ kind: d.kind, reason: d.reason }))
      : [],
  };
}

/**
 * Human-readable one-liner for logs.
 * @param {object} understanding
 */
export function formatUnderstandingLine(understanding) {
  const s = summarizeUnderstanding(understanding);
  const actionBits = s.actions
    .map((a) => `${a.risk}:${a.capabilityId}${a.requiresApproval ? "(approve)" : ""}`)
    .join(",") || "-";
  const eventBits = s.events.map((e) => `${e.kind}/${e.status}`).join(",") || "-";
  return `[turnUnderstanding] turn=${s.turnId} intent=${s.conversationalIntent} via=${s.interpreter} events=${eventBits} actions=${actionBits}`;
}
