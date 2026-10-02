/**
 * Model Gateway runtime helpers (R9) — managed/BYOK share one request contract.
 */
import {
  createModelRequestContractV1,
  validateModelRequestContractV1,
  mintId,
} from "../contracts/index.js";

export function buildGatewayRequest(input = {}) {
  const billingSource = input.billingSource === "managed" ? "managed" : (input.billingSource === "local_dev" ? "local_dev" : "byok");
  const req = createModelRequestContractV1({
    ...input,
    requestId: input.requestId || mintId("requestId"),
    idempotencyKey: input.idempotencyKey || mintId("requestId", "idem"),
    billingSource,
    chargedCredits: billingSource === "byok" ? 0 : Number(input.chargedCredits) || 0,
  });
  const v = validateModelRequestContractV1(req);
  return { ok: v.ok, value: req, errors: v.errors };
}

/** Switching billing source must not rewrite companion primary keys. */
export function assertIdentityStable(before, after) {
  const keys = ["userId", "companionId", "agentId", "skillId", "experienceId"];
  for (const k of keys) {
    if (String(before?.[k] || "") !== String(after?.[k] || "")) {
      return { ok: false, reason: `identity_changed:${k}` };
    }
  }
  return { ok: true };
}
