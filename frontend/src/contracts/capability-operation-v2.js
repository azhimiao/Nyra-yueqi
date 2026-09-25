/**
 * CapabilityOperationV2 — self-registering descriptor (no runtime registry yet).
 * Executor functions are not serializable; store executorId only.
 */

import {
  COMPANION_V2_LIMITS as L,
  checkArray,
  checkBoolean,
  checkEnum,
  checkObject,
  checkPlainObject,
  checkSchemaAndRevision,
  checkString,
  checkStringArray,
  checkTopLevel,
  error,
  isPlainObject,
  result,
} from "./companion-v2-shared.js";

export const CAPABILITY_OPERATION_V2_SCHEMA_VERSION = 2;

export const CAPABILITY_RISKS = Object.freeze(["R0", "R1", "R2", "R3"]);

const ALLOWED = Object.freeze([
  "schemaVersion",
  "capabilityId",
  "operation",
  "inputSchema",
  "outputSchema",
  "discoverable",
  "requestable",
  "executable",
  "reasonCodes",
  "risk",
  "approval",
  "featureFlag",
  "platforms",
  "requires",
  "idempotencyKeyPolicy",
  "receiptRequired",
  "reversible",
  "executorId",
  "revision",
]);

const FORBIDDEN = Object.freeze(["executor", "undoExecutor", "fn", "handler"]);

export function validateCapabilityOperationV2(raw) {
  const objectError = checkObject(raw);
  if (objectError) return objectError;
  const errors = [
    ...checkTopLevel(raw, ALLOWED, FORBIDDEN),
    ...checkSchemaAndRevision(raw, CAPABILITY_OPERATION_V2_SCHEMA_VERSION),
    ...checkString(raw.capabilityId, "capabilityId", { nonEmpty: true, max: L.capabilityId }),
    ...checkString(raw.operation, "operation", { nonEmpty: true, max: L.operation }),
    ...checkPlainObject(raw.inputSchema, "inputSchema"),
    ...checkPlainObject(raw.outputSchema, "outputSchema"),
    ...checkBoolean(raw.discoverable, "discoverable"),
    ...checkBoolean(raw.requestable, "requestable"),
    ...checkBoolean(raw.executable, "executable"),
    ...checkStringArray(raw.reasonCodes, "reasonCodes", { max: L.reasonCodesMax, maxItem: 200 }),
    ...checkEnum(raw.risk, "risk", CAPABILITY_RISKS),
    ...checkString(raw.approval, "approval", { nonEmpty: true, max: L.approval }),
    ...checkString(raw.featureFlag, "featureFlag", { required: false, max: L.featureFlag }),
    ...checkStringArray(raw.platforms, "platforms", { required: false, max: L.platformsMax, maxItem: 64 }),
    ...checkPlainObject(raw.requires, "requires"),
    ...checkString(raw.idempotencyKeyPolicy, "idempotencyKeyPolicy", { nonEmpty: true, max: 200 }),
    ...checkBoolean(raw.receiptRequired, "receiptRequired"),
    ...checkBoolean(raw.reversible, "reversible"),
    ...checkString(raw.executorId, "executorId", { nonEmpty: true, max: L.executorId }),
  ];
  if (isPlainObject(raw.requires)) {
    for (const key of Object.keys(raw.requires)) {
      if (!["permission", "network", "account", "provider", "foreground"].includes(key)) {
        errors.push(error("unknown_field", `requires.${key}`));
      }
    }
  }
  return result(errors);
}

export function createCapabilityOperationV2(input = {}) {
  const src = isPlainObject(input) ? input : {};
  const requires = isPlainObject(src.requires) ? src.requires : {};
  return {
    schemaVersion: CAPABILITY_OPERATION_V2_SCHEMA_VERSION,
    revision: Number.isInteger(src.revision) && src.revision >= 1 ? src.revision : 1,
    capabilityId: String(src.capabilityId || "").trim(),
    operation: String(src.operation || "").trim(),
    inputSchema: isPlainObject(src.inputSchema) ? { ...src.inputSchema } : {},
    outputSchema: isPlainObject(src.outputSchema) ? { ...src.outputSchema } : {},
    discoverable: typeof src.discoverable === "boolean" ? src.discoverable : false,
    requestable: typeof src.requestable === "boolean" ? src.requestable : false,
    executable: typeof src.executable === "boolean" ? src.executable : false,
    reasonCodes: Array.isArray(src.reasonCodes) ? src.reasonCodes.map((item) => String(item)) : [],
    risk: CAPABILITY_RISKS.includes(src.risk) ? src.risk : "R2",
    approval: String(src.approval || "").trim() || "required",
    ...(src.featureFlag !== undefined ? { featureFlag: String(src.featureFlag || "") } : {}),
    ...(Array.isArray(src.platforms) ? { platforms: src.platforms.map((item) => String(item)) } : {}),
    requires: {
      ...(requires.permission !== undefined ? { permission: requires.permission } : {}),
      ...(requires.network !== undefined ? { network: requires.network } : {}),
      ...(requires.account !== undefined ? { account: requires.account } : {}),
      ...(requires.provider !== undefined ? { provider: requires.provider } : {}),
      ...(requires.foreground !== undefined ? { foreground: requires.foreground } : {}),
    },
    idempotencyKeyPolicy: String(src.idempotencyKeyPolicy || "").trim(),
    receiptRequired: typeof src.receiptRequired === "boolean" ? src.receiptRequired : true,
    reversible: typeof src.reversible === "boolean" ? src.reversible : false,
    executorId: String(src.executorId || "").trim(),
  };
}
