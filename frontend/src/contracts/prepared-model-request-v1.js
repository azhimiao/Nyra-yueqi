/**
 * PreparedModelRequestV1 — sole compiler output before transport (§5.4).
 * DOM references are forbidden. Empty tools arrays are valid.
 */

import { mintId } from "./ids.js";
import {
  COMPANION_V2_LIMITS as L,
  checkArray,
  checkBoolean,
  checkEnum,
  checkId,
  checkNumber,
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

export const PREPARED_MODEL_REQUEST_V1_SCHEMA_VERSION = 1;

export const PREPARED_MESSAGE_ROLES = Object.freeze([
  "system",
  "developer",
  "user",
  "assistant",
  "tool",
]);

const ALLOWED = Object.freeze([
  "schemaVersion",
  "revision",
  "requestId",
  "snapshotHash",
  "messages",
  "tools",
  "toolChoice",
  "budgetLedger",
  "protectedBlockIds",
  "outputReserveTokens",
  "providerMode",
]);

const FORBIDDEN_DOM = Object.freeze(["element", "textarea", "innerHTML"]);

function forbidDomKeys(obj, path, errors) {
  if (!isPlainObject(obj) && !Array.isArray(obj)) return;
  if (isPlainObject(obj)) {
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_DOM.includes(key)) errors.push(error("forbidden_field", path ? `${path}.${key}` : key));
    }
  }
}

export function validatePreparedModelRequestV1(raw) {
  const objectError = checkObject(raw);
  if (objectError) return objectError;
  const errors = [
    ...checkTopLevel(raw, ALLOWED, FORBIDDEN_DOM),
    ...checkSchemaAndRevision(raw, PREPARED_MODEL_REQUEST_V1_SCHEMA_VERSION),
    ...checkId(raw.requestId, "requestId"),
    ...checkString(raw.snapshotHash, "snapshotHash", { nonEmpty: true, max: 128 }),
    ...checkString(raw.providerMode, "providerMode", { nonEmpty: true, max: L.providerMode }),
    ...checkNumber(raw.outputReserveTokens, "outputReserveTokens", { integer: true, min: 0 }),
    ...checkArray(raw.tools, "tools", { max: L.toolsMax }),
    ...checkStringArray(raw.protectedBlockIds, "protectedBlockIds", { max: L.genericItems, maxItem: 200 }),
  ];
  if (raw.toolChoice !== undefined && raw.toolChoice !== null && typeof raw.toolChoice !== "string" && !isPlainObject(raw.toolChoice)) {
    errors.push(error("invalid_type", "toolChoice"));
  }

  const messageErrors = checkArray(raw.messages, "messages", { min: 1, max: L.messagesMax });
  errors.push(...messageErrors);
  if (!messageErrors.length && Array.isArray(raw.messages)) {
    raw.messages.forEach((message, index) => {
      const path = `messages[${index}]`;
      if (!isPlainObject(message)) {
        errors.push(error("invalid_type", path));
        return;
      }
      forbidDomKeys(message, path, errors);
      errors.push(...checkEnum(message.role, `${path}.role`, PREPARED_MESSAGE_ROLES));
      errors.push(...checkString(message.provenance, `${path}.provenance`, { nonEmpty: true, max: L.provenance }));
      if (message.content === undefined) errors.push(error("missing_field", `${path}.content`));
    });
  }

  const ledgerErrors = checkArray(raw.budgetLedger, "budgetLedger", { max: L.budgetLedgerMax });
  errors.push(...ledgerErrors);
  if (!ledgerErrors.length && Array.isArray(raw.budgetLedger)) {
    raw.budgetLedger.forEach((item, index) => {
      const path = `budgetLedger[${index}]`;
      if (!isPlainObject(item)) {
        errors.push(error("invalid_type", path));
        return;
      }
      errors.push(...checkString(item.blockId, `${path}.blockId`, { nonEmpty: true, max: 200 }));
      errors.push(...checkString(item.source, `${path}.source`, { nonEmpty: true, max: 200 }));
      errors.push(...checkNumber(item.chars, `${path}.chars`, { integer: true, min: 0 }));
      errors.push(...checkNumber(item.estimatedTokens, `${path}.estimatedTokens`, { integer: true, min: 0 }));
      errors.push(...checkBoolean(item.truncated, `${path}.truncated`));
      errors.push(...checkString(item.omittedReason, `${path}.omittedReason`, { required: false, max: 500 }));
    });
  }

  return result(errors);
}

export function createPreparedModelRequestV1(input = {}) {
  const src = isPlainObject(input) ? input : {};
  const messages = Array.isArray(src.messages)
    ? src.messages.map((message) => ({
      role: String(message?.role || ""),
      content: message?.content,
      provenance: String(message?.provenance || ""),
    }))
    : [];
  const budgetLedger = Array.isArray(src.budgetLedger)
    ? src.budgetLedger.map((item) => ({
      blockId: String(item?.blockId || ""),
      source: String(item?.source || ""),
      chars: Number.isInteger(item?.chars) ? item.chars : 0,
      estimatedTokens: Number.isInteger(item?.estimatedTokens) ? item.estimatedTokens : 0,
      truncated: Boolean(item?.truncated),
      ...(item?.omittedReason ? { omittedReason: String(item.omittedReason) } : {}),
    }))
    : [];

  const record = {
    schemaVersion: PREPARED_MODEL_REQUEST_V1_SCHEMA_VERSION,
    revision: Number.isInteger(src.revision) && src.revision >= 1 ? src.revision : 1,
    requestId: String(src.requestId || "").trim() || mintId("requestId"),
    snapshotHash: String(src.snapshotHash || "").trim(),
    messages,
    tools: Array.isArray(src.tools) ? [...src.tools] : [],
    budgetLedger,
    protectedBlockIds: Array.isArray(src.protectedBlockIds)
      ? src.protectedBlockIds.map((item) => String(item))
      : [],
    outputReserveTokens: Number.isInteger(src.outputReserveTokens) && src.outputReserveTokens >= 0
      ? src.outputReserveTokens
      : 0,
    providerMode: String(src.providerMode || "").trim(),
  };
  if (src.toolChoice !== undefined) record.toolChoice = src.toolChoice;
  return record;
}
