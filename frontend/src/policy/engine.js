/**
 * Policy Engine (R4) — evaluate grants before writes / tools.
 */
export function evaluatePolicy(input = {}) {
  const capabilityId = String(input.capabilityId || "").trim();
  const granted = Array.isArray(input.grantedCapabilities)
    ? input.grantedCapabilities.map(String)
    : [];
  const approvalState = String(input.approvalState || "");
  const osPermission = input.osPermission !== false;

  if (!capabilityId) return { ok: false, allow: false, reason: "missing_capability" };
  if (!osPermission) return { ok: false, allow: false, reason: "os_permission_missing" };
  if (!granted.includes(capabilityId)) {
    return { ok: false, allow: false, reason: "grant_missing" };
  }
  if (input.requiresApproval && approvalState !== "approved") {
    return { ok: false, allow: false, reason: "approval_required", next: "awaiting_approval" };
  }
  return {
    ok: true,
    allow: true,
    reason: "allowed",
    chain: ["inspect", "proposal", "diff", "policy", "approval_or_grant", "execute", "audit"],
  };
}

export function evaluateDirectAction(input = {}) {
  return evaluatePolicy({ ...input, requiresApproval: Boolean(input.requiresApproval) });
}
