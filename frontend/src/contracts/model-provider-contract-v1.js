/**
 * Model Provider Contract V1 — managed vs BYOK share one request shape.
 * R1 defines the contract only; no billing implementation / metering here.
 */

export const BILLING_SOURCES = Object.freeze(["managed", "byok", "local_dev"]);
export const MODEL_PROVIDER_CONTRACT_VERSION = 1;

/**
 * @param {object} raw
 */
export function validateModelRequestContractV1(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["not_object"] };
  if (raw.schemaVersion !== MODEL_PROVIDER_CONTRACT_VERSION) errors.push("schemaVersion");
  for (const key of [
    "requestId",
    "idempotencyKey",
    "billingSource",
    "operation",
    "userId",
    "companionId",
  ]) {
    if (!String(raw[key] || "").trim()) errors.push(key);
  }
  if (!BILLING_SOURCES.includes(raw.billingSource)) errors.push("billingSource");
  if (!Array.isArray(raw.messages)) errors.push("messages");
  return { ok: errors.length === 0, errors };
}

/**
 * @param {Partial<object>} input
 */
export function createModelRequestContractV1(input = {}) {
  return {
    schemaVersion: MODEL_PROVIDER_CONTRACT_VERSION,
    requestId: String(input.requestId || ""),
    idempotencyKey: String(input.idempotencyKey || ""),
    billingSource: BILLING_SOURCES.includes(input.billingSource) ? input.billingSource : "byok",
    operation: String(input.operation || "chat"),
    userId: String(input.userId || ""),
    companionId: String(input.companionId || ""),
    agentId: String(input.agentId || ""),
    skillId: String(input.skillId || ""),
    experienceId: String(input.experienceId || ""),
    taskId: String(input.taskId || ""),
    modelTier: String(input.modelTier || "default"),
    messages: Array.isArray(input.messages) ? input.messages : [],
    tools: Array.isArray(input.tools) ? input.tools : [],
    stream: Boolean(input.stream),
    // Settlement fields reserved for R9 — must remain unused until Model Gateway exists.
    reservedCredits: 0,
    chargedCredits: input.billingSource === "byok" ? 0 : Number(input.chargedCredits) || 0,
  };
}
