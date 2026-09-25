/**
 * ToolRunV1 — single governed execution ledger (master plan §5.5 / §9).
 * Illegal transitions return validate-style errors (invalid_transition).
 */

import { mintId } from "./ids.js";
import {
  COMPANION_V2_LIMITS as L,
  checkBoolean,
  checkEnum,
  checkId,
  checkObject,
  checkPlainObject,
  checkSchemaAndRevision,
  checkString,
  checkTimestamp,
  checkTopLevel,
  error,
  isPlainObject,
  nowIso,
  result,
} from "./companion-v2-shared.js";

export const TOOL_RUN_V1_SCHEMA_VERSION = 1;

export const TOOL_RUN_STATUSES = Object.freeze([
  "planned",
  "awaiting_approval",
  "approved",
  "executing",
  "succeeded",
  "failed",
  "unknown",
  "reconciled",
  "undone",
  "expired",
]);

export const TOOL_RUN_EXPLICITNESS = Object.freeze([
  "explicit_command",
  "implicit_suggestion",
  "ambiguous",
]);

export const TOOL_RUN_PROPOSAL_SOURCES = Object.freeze([
  "model_tool_call",
  "turn_understanding",
  "regex",
  "shortcut",
  "openclaw",
  "user_ui",
]);

export const TOOL_RUN_RISKS = Object.freeze(["R0", "R1", "R2", "R3"]);

const ALLOWED = Object.freeze([
  "schemaVersion",
  "revision",
  "toolRunId",
  "capabilityId",
  "operation",
  "status",
  "risk",
  "explicitness",
  "parameters",
  "idempotencyKey",
  "proposalSource",
  "exactEffect",
  "requiresApproval",
  "receipt",
  "error",
  "createdAt",
  "updatedAt",
]);

const EDGES = Object.freeze({
  planned: ["awaiting_approval", "executing"],
  awaiting_approval: ["approved", "expired", "failed"],
  approved: ["executing"],
  executing: ["succeeded", "failed", "unknown"],
  succeeded: ["reconciled", "undone"],
  failed: ["reconciled", "undone", "expired"],
  unknown: ["reconciled", "undone", "expired"],
  reconciled: [],
  undone: [],
  expired: [],
});

function statusOf(from) {
  return typeof from === "string" ? from : from?.status;
}

export function canTransitionToolRun(from, to, run) {
  const current = statusOf(from);
  const target = String(to || "");
  if (!TOOL_RUN_STATUSES.includes(current) || !TOOL_RUN_STATUSES.includes(target)) return false;
  if (current === "unknown" && target === "succeeded") return false;
  if (current === "succeeded" && target === "planned") return false;
  if (current === "planned" && target === "executing") {
    const source = isPlainObject(run) ? run : isPlainObject(from) ? from : {};
    return source.risk === "R0" && source.requiresApproval === false;
  }
  return (EDGES[current] || []).includes(target);
}

export function validateToolRunV1(raw) {
  const objectError = checkObject(raw);
  if (objectError) return objectError;
  const errors = [
    ...checkTopLevel(raw, ALLOWED),
    ...checkSchemaAndRevision(raw, TOOL_RUN_V1_SCHEMA_VERSION),
    ...checkId(raw.toolRunId, "toolRunId"),
    ...checkString(raw.capabilityId, "capabilityId", { nonEmpty: true, max: L.capabilityId }),
    ...checkString(raw.operation, "operation", { nonEmpty: true, max: L.operation }),
    ...checkEnum(raw.status, "status", TOOL_RUN_STATUSES, { code: "invalid_status" }),
    ...checkEnum(raw.risk, "risk", TOOL_RUN_RISKS),
    ...checkEnum(raw.explicitness, "explicitness", TOOL_RUN_EXPLICITNESS, { code: "invalid_explicitness" }),
    ...checkPlainObject(raw.parameters, "parameters"),
    ...checkString(raw.idempotencyKey, "idempotencyKey", { nonEmpty: true, max: L.idempotencyKey }),
    ...checkEnum(raw.proposalSource, "proposalSource", TOOL_RUN_PROPOSAL_SOURCES),
    ...checkString(raw.exactEffect, "exactEffect", { nonEmpty: true, max: L.exactEffect }),
    ...checkBoolean(raw.requiresApproval, "requiresApproval"),
    ...checkTimestamp(raw.createdAt, "createdAt"),
    ...checkTimestamp(raw.updatedAt, "updatedAt"),
  ];
  if (raw.receipt !== undefined && raw.receipt !== null) {
    errors.push(...checkPlainObject(raw.receipt, "receipt"));
  }
  if (raw.error !== undefined && raw.error !== null) {
    if (!isPlainObject(raw.error)) errors.push(error("invalid_type", "error"));
    else {
      errors.push(...checkString(raw.error.code, "error.code", { nonEmpty: true, max: 200 }));
      errors.push(...checkString(raw.error.message, "error.message", { max: L.errorMessage }));
    }
  }
  return result(errors);
}

export function createToolRunV1(input = {}, opts = {}) {
  const src = isPlainObject(input) ? input : {};
  const createdAt = checkTimestamp(src.createdAt, "createdAt").length === 0 ? src.createdAt : nowIso(opts.clock);
  const updatedAt = checkTimestamp(src.updatedAt, "updatedAt").length === 0 ? src.updatedAt : createdAt;
  const risk = TOOL_RUN_RISKS.includes(src.risk) ? src.risk : "R2";
  const requiresApproval = typeof src.requiresApproval === "boolean" ? src.requiresApproval : risk !== "R0";
  return {
    schemaVersion: TOOL_RUN_V1_SCHEMA_VERSION,
    revision: Number.isInteger(src.revision) && src.revision >= 1 ? src.revision : 1,
    toolRunId: String(src.toolRunId || "").trim() || mintId("toolRunId"),
    capabilityId: String(src.capabilityId || "").trim(),
    operation: String(src.operation || "").trim(),
    status: TOOL_RUN_STATUSES.includes(src.status) ? src.status : "planned",
    risk,
    explicitness: TOOL_RUN_EXPLICITNESS.includes(src.explicitness) ? src.explicitness : "ambiguous",
    parameters: isPlainObject(src.parameters) ? { ...src.parameters } : {},
    idempotencyKey: String(src.idempotencyKey || "").trim(),
    proposalSource: TOOL_RUN_PROPOSAL_SOURCES.includes(src.proposalSource) ? src.proposalSource : "user_ui",
    exactEffect: String(src.exactEffect || "").trim(),
    requiresApproval,
    receipt: src.receipt === undefined ? null : src.receipt,
    error: src.error === undefined ? null : src.error,
    createdAt,
    updatedAt,
  };
}

export function transitionToolRun(run, to, patch = {}, opts = {}) {
  if (!isPlainObject(run)) return { ok: false, errors: [error("not_object", "$")] };
  if (!canTransitionToolRun(run, to, run)) {
    return { ok: false, errors: [error("invalid_transition", "status")] };
  }
  const nextPatch = isPlainObject(patch) ? patch : {};
  const next = createToolRunV1(
    {
      ...run,
      ...nextPatch,
      status: to,
      updatedAt: nowIso(opts.clock),
    },
    opts,
  );
  const validated = validateToolRunV1(next);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  return { ok: true, errors: [], record: next };
}
