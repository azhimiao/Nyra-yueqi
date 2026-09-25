/**
 * ActionProposal V1 — governed capability request from TurnUnderstanding (plan §5.4).
 * W3 produces proposals only; W4 wires execution.
 */

import { mintId } from "./ids.js";

export const ACTION_PROPOSAL_SCHEMA_VERSION = 1;

export const ACTION_RISKS = Object.freeze(["R0", "R1", "R2", "R3"]);

export const ACTION_EXPLICITNESS = Object.freeze([
  "explicit_command",
  "implicit_suggestion",
  "ambiguous",
]);

export const ACTION_PROPOSAL_STATUSES = Object.freeze([
  "proposed",
  "approved",
  "rejected",
  "executed",
  "failed",
]);

/**
 * @param {object} raw
 */
export function validateActionProposalV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== ACTION_PROPOSAL_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of [
    "proposalId",
    "capabilityId",
    "operation",
    "title",
    "exactEffect",
  ]) {
    if (!String(raw[key] ?? "").trim()) errors.push(key);
  }
  if (!ACTION_RISKS.includes(raw.risk)) errors.push("risk_enum");
  if (!ACTION_EXPLICITNESS.includes(raw.explicitness)) errors.push("explicitness_enum");
  if (!ACTION_PROPOSAL_STATUSES.includes(raw.status)) errors.push("status_enum");
  if (typeof raw.requiresApproval !== "boolean") errors.push("requiresApproval");
  if (typeof raw.reversible !== "boolean") errors.push("reversible");
  if (!raw.parameters || typeof raw.parameters !== "object" || Array.isArray(raw.parameters)) {
    errors.push("parameters");
  }
  if (!Array.isArray(raw.evidenceRefs)) errors.push("evidenceRefs");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createActionProposalV1(input = {}) {
  const risk = ACTION_RISKS.includes(input.risk) ? input.risk : "R2";
  const explicitness = ACTION_EXPLICITNESS.includes(input.explicitness)
    ? input.explicitness
    : "ambiguous";
  const status = ACTION_PROPOSAL_STATUSES.includes(input.status) ? input.status : "proposed";
  return {
    schemaVersion: ACTION_PROPOSAL_SCHEMA_VERSION,
    proposalId: String(input.proposalId || mintId("eventId", "ap")).trim(),
    capabilityId: String(input.capabilityId || "").trim(),
    operation: String(input.operation || "").trim(),
    title: String(input.title || "").trim(),
    parameters:
      input.parameters && typeof input.parameters === "object" && !Array.isArray(input.parameters)
        ? { ...input.parameters }
        : {},
    risk,
    explicitness,
    exactEffect: String(input.exactEffect || "").trim(),
    requiresApproval: typeof input.requiresApproval === "boolean"
      ? input.requiresApproval
      : risk !== "R0",
    reversible: typeof input.reversible === "boolean" ? input.reversible : risk === "R0" || risk === "R1",
    evidenceRefs: Array.isArray(input.evidenceRefs)
      ? input.evidenceRefs.map((r) => String(r)).filter(Boolean)
      : [],
    status,
  };
}
