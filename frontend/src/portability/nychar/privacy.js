/**
 * Privacy boundary for .nychar packages.
 * Reject any private user history / secrets that must never travel with a Character pack.
 */

import { PortabilityError } from "../errors.js";

/** Exact JSON object keys that indicate forbidden private user data. */
export const NYCHAR_FORBIDDEN_KEYS = Object.freeze([
  "userId",
  "user_id",
  "userProfile",
  "conversations",
  "conversation",
  "conversationV2",
  "messages",
  "chatHistory",
  "memories",
  "memory",
  "diary",
  "activity",
  "history",
  "timeline",
  "relationshipTimeline",
  "continuity",
  "intimacy",
  "intimacyScore",
  "relationshipScore",
  "milestones",
  "sharedEvents",
  "inferredFacts",
  "billingCredit",
  "BillingCredit",
  "creditsBalance",
  "payment",
  "paymentOrder",
  "wallet",
  "serverLedger",
  "credentials",
  "auth",
  "password",
  "passwordHash",
  "apiKey",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "gateSessionToken",
  "ttsApiKey",
  "sttApiKey",
  "provider",
]);

const FORBIDDEN_KEY_SET = new Set(NYCHAR_FORBIDDEN_KEYS.map((k) => k.toLowerCase()));

/** Substring hits in serialized package JSON (field names / nested dumps). */
const FORBIDDEN_BLOB_RES = Object.freeze([
  /"conversations"\s*:/i,
  /"conversationV2"\s*:/i,
  /"messages"\s*:/i,
  /"memories"\s*:/i,
  /"billingCredit"\s*:/i,
  /"BillingCredit"\s*:/i,
  /"apiKey"\s*:/i,
  /"gateSessionToken"\s*:/i,
  /"intimacyScore"\s*:/i,
  /"relationshipTimeline"\s*:/i,
  /sk-[a-zA-Z0-9_-]{12,}/,
]);

/**
 * Recursively walk JSON-like values for forbidden private field names.
 * @param {unknown} value
 * @param {string[]} [hits]
 */
export function collectForbiddenKeys(value, hits = []) {
  if (value == null) return hits;
  if (Array.isArray(value)) {
    for (const item of value) collectForbiddenKeys(item, hits);
    return hits;
  }
  if (typeof value !== "object") return hits;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_SET.has(String(key).toLowerCase())) {
      hits.push(key);
    }
    collectForbiddenKeys(child, hits);
  }
  return hits;
}

/**
 * Scan component JSON objects and/or raw package UTF-8 for forbidden private data.
 * @param {object|object[]|string|Uint8Array} input
 * @throws {PortabilityError} nychar_forbidden_user_data
 */
export function assertNycharPrivacy(input) {
  const hits = new Set();

  if (typeof input === "string" || input instanceof Uint8Array) {
    const text =
      typeof input === "string"
        ? input
        : new TextDecoder("utf-8", { fatal: false }).decode(input);
    for (const re of FORBIDDEN_BLOB_RES) {
      if (re.test(text)) hits.add(re.source);
    }
    try {
      const parsed = JSON.parse(text);
      for (const key of collectForbiddenKeys(parsed)) hits.add(key);
    } catch {
      /* binary / not a single JSON root — substring checks above still apply */
    }
  } else if (Array.isArray(input)) {
    for (const item of input) {
      for (const key of collectForbiddenKeys(item)) hits.add(key);
    }
  } else if (input && typeof input === "object") {
    for (const key of collectForbiddenKeys(input)) hits.add(key);
  }

  if (hits.size) {
    throw new PortabilityError(
      "nychar_forbidden_user_data",
      [...hits].slice(0, 12).join(","),
    );
  }
  return true;
}
