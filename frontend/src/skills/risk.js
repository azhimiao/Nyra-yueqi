/**
 * Risk level checker for skill packages.
 * Reuses agent RISK_LEVELS / approval rules.
 */

import {
  RISK_LEVELS,
  isExternalWriteRisk,
  riskRequiresApproval,
} from "../agent/schema.js";

const RANK = Object.freeze({ R0: 0, R1: 1, R2: 2, R3: 3 });

/**
 * @param {string} risk
 */
export function isValidRisk(risk) {
  return RISK_LEVELS.includes(/** @type {any} */ (risk));
}

/**
 * @param {string} a
 * @param {string} b
 */
export function compareRisk(a, b) {
  if (!isValidRisk(a) || !isValidRisk(b)) return NaN;
  return RANK[/** @type {keyof typeof RANK} */ (a)]
    - RANK[/** @type {keyof typeof RANK} */ (b)];
}

/**
 * Skill effective risk cannot exceed manifest max; undeclared elevation blocked.
 * @param {{
 *   manifestRisk: string,
 *   requestedRisk: string,
 *   permissions?: string[],
 * }} input
 */
export function checkSkillRisk(input) {
  const manifestRisk = String(input.manifestRisk || "");
  const requestedRisk = String(input.requestedRisk || manifestRisk);
  if (!isValidRisk(manifestRisk)) {
    return { ok: false, reason: "invalid_manifest_risk", risk: manifestRisk };
  }
  if (!isValidRisk(requestedRisk)) {
    return { ok: false, reason: "invalid_requested_risk", risk: requestedRisk };
  }
  if (compareRisk(requestedRisk, manifestRisk) > 0) {
    return {
      ok: false,
      reason: "risk_elevation_blocked",
      manifestRisk,
      requestedRisk,
    };
  }

  const perms = Array.isArray(input.permissions) ? input.permissions : [];
  if (perms.includes("network") && compareRisk(requestedRisk, "R1") < 0) {
    return { ok: false, reason: "network_requires_r1_plus" };
  }
  if (perms.includes("file") && compareRisk(requestedRisk, "R1") < 0) {
    return { ok: false, reason: "file_requires_r1_plus" };
  }
  if (perms.includes("credentials") && compareRisk(requestedRisk, "R2") < 0) {
    return { ok: false, reason: "credentials_requires_r2_plus" };
  }
  if (isExternalWriteRisk(requestedRisk) && !perms.includes("network")) {
    return { ok: false, reason: "r3_requires_network_permission" };
  }

  return {
    ok: true,
    risk: requestedRisk,
    requiresApproval: riskRequiresApproval(requestedRisk),
    isExternalWrite: isExternalWriteRisk(requestedRisk),
  };
}

export { riskRequiresApproval, isExternalWriteRisk, RISK_LEVELS };
