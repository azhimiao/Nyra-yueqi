/**
 * TurnUnderstanding V1 — shadow (W3) + controlled execute (W4).
 */

export {
  TURN_UNDERSTANDING_SCHEMA_VERSION,
  CONVERSATIONAL_INTENTS,
  TURN_INTERPRETERS,
  createTurnUnderstandingV1,
  validateTurnUnderstandingV1,
  ACTION_PROPOSAL_SCHEMA_VERSION,
  ACTION_RISKS,
  ACTION_EXPLICITNESS,
  ACTION_PROPOSAL_STATUSES,
  createActionProposalV1,
  validateActionProposalV1,
} from "./contract.js";

export { interpretDeterministic } from "./deterministic-fallback.js";
export {
  validateUnderstanding,
  proposalHasValidEvidence,
  evidenceRefsContiguousInUserText,
} from "./validator.js";
export {
  policyForRisk,
  applyActionPolicy,
  applyActionPolicyToAll,
  assertNoCalendarWriteForObservation,
} from "./action-policy.js";
export {
  shadowRecord,
  dispatchProposals,
  getShadowRecord,
  listShadowRecords,
  getShadowLog,
  clearShadowStoreForTests,
} from "./dispatcher.js";
export { summarizeUnderstanding, formatUnderstandingLine } from "./inspector.js";
export { interpretTurn, understandTurn } from "./interpreter.js";
export {
  processActionProposals,
  approveProposal,
  rejectProposal,
  undoProposal,
  clearExecutorCalendarForTests,
  listLocalEvents,
} from "./executor.js";
export {
  getProposalRecord,
  listProposalRecords,
  onActionProposal,
  clearProposalStoreForTests,
  getExecutedCorrelation,
  listPendingProposals,
  expireStaleProposals,
  findProposalByCorrelationId,
  ACTION_PROPOSAL_STORE_KEY,
} from "./proposal-store.js";
export {
  ACTION_PROPOSAL_STORE_KEY as PROPOSAL_REPOSITORY_KEY,
  saveProposal,
  getProposal,
  listPending,
  updateStatus,
  expireStale,
  findByCorrelationId,
  __setProposalStorageForTests,
  clearProposalsForTests,
} from "./proposal-repository.js";

import { understandTurn } from "./interpreter.js";
import { dispatchProposals, shadowRecord } from "./dispatcher.js";
import { isFeatureEnabled } from "../features/flags.js";

/**
 * Convenience: understand + shadow record (no side effects).
 * Safe to fire-and-forget after user message write.
 *
 * @param {object} [input]
 */
export async function understandTurnShadow(input = {}) {
  const result = await understandTurn(input);
  const dispatched = shadowRecord(result.understanding);
  return {
    ...result,
    shadow: dispatched,
  };
}

/**
 * W4: understand + dispatch. When turnUnderstandingV1 is on, uses execute mode
 * (R0 auto; R2/R3 pending approval). Explicit opts.mode overrides the default.
 *
 * @param {object} [input]
 * @param {{ mode?: "shadow"|"execute", nowIso?: string }} [opts]
 */
export async function understandTurnDispatch(input = {}, opts = {}) {
  const result = await understandTurn(input);
  const flagOn = isFeatureEnabled("turnUnderstandingV1");
  const mode = opts.mode ?? (flagOn ? "execute" : "shadow");
  const dispatched = await dispatchProposals(result.understanding, {
    mode,
    sourceText: String(input.text || ""),
    nowIso: opts.nowIso,
  });
  return {
    ...result,
    dispatch: dispatched,
    shadow: dispatched,
  };
}
