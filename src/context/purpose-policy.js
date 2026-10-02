/**
 * Purpose → context source policy matrix (CPE §W6).
 * Surfaces must not invent their own include flags when a purpose is known.
 */

export const PURPOSE_POLICY = Object.freeze({
  chat: Object.freeze({
    includeHistory: true,
    includeBranchSummary: true,
    includeContextGraph: true,
    includeCohabit: true,
    includeMoments: true,
    includeWorldbook: true,
    includeExternal: false,
    includePalace: true,
    includeStable: true,
    historyStyle: "full_branch",
    notes: "IM contract; DM or group branch via chatSessionId map",
  }),
  deskpet: Object.freeze({
    includeHistory: true,
    includeBranchSummary: true,
    includeContextGraph: true,
    includeCohabit: true,
    includeMoments: true,
    includeWorldbook: true,
    includeExternal: false,
    includePalace: false,
    includeStable: true,
    historyStyle: "short_window",
    historyMaxMessages: 12,
    momentsRequireHighRelevance: true,
    notes: "Shorter reply contract; DM only",
  }),
  proactive: Object.freeze({
    includeHistory: true,
    includeBranchSummary: true,
    includeContextGraph: true,
    includeCohabit: true,
    includeMoments: false,
    includeWorldbook: true,
    includeExternal: false,
    includePalace: false,
    includeStable: true,
    historyStyle: "short_window",
    historyMaxMessages: 8,
    allowSilence: true,
    notes: "May choose SILENCE; no private Palace / wide recall by default",
  }),
  diary: Object.freeze({
    includeHistory: true,
    includeBranchSummary: false,
    includeContextGraph: true,
    includeCohabit: true,
    includeMoments: true,
    includeWorldbook: false,
    includeExternal: false,
    includePalace: true,
    includeStable: true,
    historyStyle: "day_window",
    notes: "Output is a diary document; V2 branch only",
  }),
  scenario: Object.freeze({
    includeHistory: true,
    includeBranchSummary: true,
    includeContextGraph: true,
    includeCohabit: false,
    includeMoments: false,
    includeWorldbook: true,
    includeExternal: false,
    includePalace: true,
    includeStable: false,
    historyStyle: "scenario_branch",
    notes: "Open RP; shared_fiction Palace only; write curtain to cohabit separately",
  }),
  adventure: Object.freeze({
    includeHistory: true,
    includeBranchSummary: true,
    includeContextGraph: true,
    includeCohabit: false,
    includeMoments: false,
    includeWorldbook: true,
    includeExternal: false,
    includePalace: false,
    includeStable: false,
    historyStyle: "adventure_session",
    notes: "DM state machine; completion events only",
  }),
  cocreate: Object.freeze({
    includeHistory: true,
    includeBranchSummary: true,
    includeContextGraph: false,
    includeCohabit: false,
    includeMoments: false,
    includeWorldbook: true,
    includeExternal: false,
    includePalace: false,
    includeStable: false,
    historyStyle: "project_session",
    notes: "Writing tool; do not read romantic private memories",
  }),
  // M8 §10.1 — light purpose extensions for media / calendar surfaces
  reading: Object.freeze({
    includeHistory: true,
    includeBranchSummary: false,
    includeContextGraph: false,
    includeCohabit: false,
    includeMoments: false,
    includeWorldbook: false,
    includeExternal: false,
    includePalace: true,
    includeStable: false,
    historyStyle: "short_window",
    historyMaxMessages: 12,
    notes: "Current book/chapter/progress; book chunks on intent — not relationship history",
  }),
  listening: Object.freeze({
    includeHistory: true,
    includeBranchSummary: false,
    includeContextGraph: false,
    includeCohabit: true,
    includeMoments: false,
    includeWorldbook: false,
    includeExternal: false,
    includePalace: false,
    includeStable: true,
    historyStyle: "short_window",
    historyMaxMessages: 10,
    notes: "Current track/session; shared listen events — not broad Palace",
  }),
  calendar: Object.freeze({
    includeHistory: false,
    includeBranchSummary: false,
    includeContextGraph: false,
    includeCohabit: false,
    includeMoments: false,
    includeWorldbook: false,
    includeExternal: false,
    includePalace: false,
    includeStable: true,
    historyStyle: "short_window",
    historyMaxMessages: 4,
    notes: "Temporal snapshot + calendar/task; not diary body",
  }),
});

export function getPurposePolicy(purpose = "chat") {
  return PURPOSE_POLICY[purpose] || PURPOSE_POLICY.chat;
}

/**
 * Merge request flags with purpose defaults. Explicit false/true on input wins.
 */
export function applyPurposePolicy(request = {}) {
  const policy = getPurposePolicy(request.purpose);
  const pick = (key, fallback) => {
    if (Object.prototype.hasOwnProperty.call(request, key) && request[key] !== undefined) {
      return request[key];
    }
    return fallback;
  };
  return {
    ...request,
    includeHistory: pick("includeHistory", policy.includeHistory) !== false,
    includeBranchSummary: pick("includeBranchSummary", policy.includeBranchSummary) !== false,
    includeContextGraph: pick("includeContextGraph", policy.includeContextGraph) !== false,
    includeCohabit: pick("includeCohabit", policy.includeCohabit) !== false,
    includeMoments: pick("includeMoments", policy.includeMoments) !== false,
    includeWorldbook: pick("includeWorldbook", policy.includeWorldbook) !== false,
    includeExternal: pick("includeExternal", policy.includeExternal) === true,
    includePalace: pick("includePalace", policy.includePalace !== false) !== false,
    includeStable: pick("includeStable", policy.includeStable !== false) !== false,
    historyStyle: request.historyStyle || policy.historyStyle,
    historyMaxMessages: Number(request.historyMaxMessages) || policy.historyMaxMessages || 80,
    allowSilence: policy.allowSilence === true,
    policyNotes: policy.notes,
  };
}
