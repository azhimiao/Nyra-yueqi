/**
 * Action risk policy R0–R3 (plan §7.3).
 * Does not execute — only normalizes approval / reversibility flags.
 */

import { ACTION_RISKS, createActionProposalV1 } from "../contracts/action-proposal-v1.js";

/**
 * @param {"R0"|"R1"|"R2"|"R3"} risk
 * @param {"explicit_command"|"implicit_suggestion"|"ambiguous"} [explicitness]
 */
export function policyForRisk(risk, explicitness = "ambiguous") {
  const r = ACTION_RISKS.includes(risk) ? risk : "R3";
  const exp = explicitness || "ambiguous";
  switch (r) {
    case "R0":
      // View weather / calendar / local read — may run directly; results must cite sources (W4+)
      return {
        risk: "R0",
        requiresApproval: false,
        reversible: true,
        mayAutoExecute: true,
        strategy: "direct_with_source",
      };
    case "R1":
      // Explicit command → execute with undo; implicit suggestion → confirm first
      return {
        risk: "R1",
        requiresApproval: exp !== "explicit_command",
        reversible: true,
        mayAutoExecute: exp === "explicit_command",
        strategy: exp === "explicit_command" ? "execute_with_undo" : "confirm_suggestion",
      };
    case "R2":
      // Local calendar write / notify / settings — show exactEffect then confirm
      return {
        risk: "R2",
        requiresApproval: true,
        reversible: true,
        mayAutoExecute: false,
        strategy: "confirm_exact_effect",
      };
    case "R3":
    default:
      // Delete / external publish / purchase / send message — always per-item confirm
      return {
        risk: "R3",
        requiresApproval: true,
        reversible: false,
        mayAutoExecute: false,
        strategy: "always_confirm_no_batch",
        forbidBatchConsent: true,
      };
  }
}

/**
 * Apply policy fields onto an ActionProposal (immutable).
 * @param {object} proposal
 */
export function applyActionPolicy(proposal) {
  const base = createActionProposalV1(proposal || {});
  const policy = policyForRisk(base.risk, base.explicitness);
  return {
    ...base,
    requiresApproval: policy.requiresApproval,
    reversible: typeof proposal?.reversible === "boolean" ? proposal.reversible : policy.reversible,
    policy,
  };
}

/**
 * @param {object[]} proposals
 */
export function applyActionPolicyToAll(proposals) {
  return (Array.isArray(proposals) ? proposals : []).map(applyActionPolicy);
}

/**
 * Observation / temporal mention must not become calendar write proposals.
 * @param {object} understanding
 */
export function assertNoCalendarWriteForObservation(understanding) {
  const mentions = Array.isArray(understanding?.temporalMentions)
    ? understanding.temporalMentions
    : [];
  const actions = Array.isArray(understanding?.actionProposals)
    ? understanding.actionProposals
    : [];
  const hasObservationOnly = mentions.some(
    (m) => m?.kind === "observation" && m?.commitment === false,
  );
  const hasCalendarAction = actions.some(
    (a) => a?.capabilityId === "calendar" || a?.operation === "create_reminder",
  );
  if (hasObservationOnly && hasCalendarAction) {
    // Observation and calendar action in same turn can coexist only if calendar was explicit
    const explicitCal = actions.some(
      (a) =>
        (a?.capabilityId === "calendar" || a?.operation === "create_reminder")
        && a?.explicitness === "explicit_command",
    );
    return { ok: explicitCal, reason: explicitCal ? "" : "observation_must_not_write_calendar" };
  }
  if (hasObservationOnly && !hasCalendarAction) {
    return { ok: true, reason: "" };
  }
  return { ok: true, reason: "" };
}
