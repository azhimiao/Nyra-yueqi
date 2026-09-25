/**
 * Capability / Grant / Approval / Audit V1
 */

export const CAPABILITY_SCHEMA_VERSION = 1;
export const GRANT_SCHEMA_VERSION = 1;
export const APPROVAL_SCHEMA_VERSION = 1;
export const AUDIT_SCHEMA_VERSION = 1;

export const APPROVAL_STATES = Object.freeze([
  "pending",
  "approved",
  "denied",
  "expired",
  "revoked",
]);

export function validateCapabilityV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== CAPABILITY_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["capabilityId", "operation", "riskClass"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  return { ok: errors.length === 0, errors };
}

export function createCapabilityV1(input = {}) {
  return {
    schemaVersion: CAPABILITY_SCHEMA_VERSION,
    capabilityId: String(input.capabilityId || ""),
    operation: String(input.operation || ""),
    riskClass: String(input.riskClass || "low"), // low | medium | high | critical
    description: String(input.description || ""),
    requiresApproval: Boolean(input.requiresApproval),
    writeClass: String(input.writeClass || "internal"), // internal | user_data | external | proactive
  };
}

export function validateGrantV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== GRANT_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["grantId", "userId", "capabilityId", "scope", "principal"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  return { ok: errors.length === 0, errors };
}

export function createGrantV1(input = {}) {
  return {
    schemaVersion: GRANT_SCHEMA_VERSION,
    grantId: String(input.grantId || ""),
    userId: String(input.userId || ""),
    companionId: String(input.companionId || ""),
    agentId: String(input.agentId || ""),
    skillId: String(input.skillId || ""),
    packageVersion: String(input.packageVersion || ""),
    capabilityId: String(input.capabilityId || ""),
    scope: String(input.scope || ""),
    principal: String(input.principal || ""),
    duration: String(input.duration || "session"),
    foregroundOnly: input.foregroundOnly !== false,
    dataBoundary: String(input.dataBoundary || "companion"),
    createdAt: String(input.createdAt || new Date().toISOString()),
    expiresAt: String(input.expiresAt || ""),
    revokedAt: String(input.revokedAt || ""),
  };
}

export function validateApprovalV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== APPROVAL_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["approvalId", "userId", "capabilityId", "taskId", "state"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (!APPROVAL_STATES.includes(raw.state)) errors.push("state");
  return { ok: errors.length === 0, errors };
}

export function createApprovalV1(input = {}) {
  return {
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalId: String(input.approvalId || ""),
    userId: String(input.userId || ""),
    capabilityId: String(input.capabilityId || ""),
    taskId: String(input.taskId || ""),
    grantId: String(input.grantId || ""),
    state: APPROVAL_STATES.includes(input.state) ? input.state : "pending",
    proposal: input.proposal && typeof input.proposal === "object" ? input.proposal : {},
    diff: input.diff && typeof input.diff === "object" ? input.diff : {},
    decidedAt: String(input.decidedAt || ""),
    createdAt: String(input.createdAt || new Date().toISOString()),
  };
}

export function validateAuditV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== AUDIT_SCHEMA_VERSION) errors.push("schemaVersion");
  for (const key of ["auditId", "operationId", "principal", "occurredAt"]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  return { ok: errors.length === 0, errors };
}

export function createAuditV1(input = {}) {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    auditId: String(input.auditId || ""),
    operationId: String(input.operationId || ""),
    principal: String(input.principal || ""),
    userId: String(input.userId || ""),
    companionId: String(input.companionId || ""),
    agentId: String(input.agentId || ""),
    skillId: String(input.skillId || ""),
    packageVersion: String(input.packageVersion || ""),
    taskId: String(input.taskId || ""),
    grantId: String(input.grantId || ""),
    approvalId: String(input.approvalId || ""),
    outcome: String(input.outcome || "ok"),
    detail: input.detail && typeof input.detail === "object" ? input.detail : {},
    occurredAt: String(input.occurredAt || new Date().toISOString()),
  };
}
