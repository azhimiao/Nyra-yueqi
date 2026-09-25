/**
 * Minimal structured audit log for retrieval gateway (C4).
 * Never logs API keys. Query is hashed for privacy.
 */

import { createHash } from "node:crypto";

/** @type {object[]} */
const ring = [];
const RING_MAX = 200;

/** @type {((entry: object) => void) | null} */
let sink = null;

/**
 * @param {string} query
 */
export function hashQuery(query) {
  return createHash("sha256").update(String(query || "")).digest("hex").slice(0, 16);
}

/**
 * @param {object} entry
 */
export function auditRetrieval(entry) {
  const row = {
    type: "retrieval_audit",
    ts: new Date().toISOString(),
    ...entry,
  };
  // Strip accidental key material
  for (const k of Object.keys(row)) {
    if (/api[_-]?key|subscription.?token|secret/i.test(k)) {
      delete row[k];
    }
  }
  ring.push(row);
  while (ring.length > RING_MAX) ring.shift();
  if (typeof sink === "function") {
    try {
      sink(row);
    } catch {
      /* ignore sink errors */
    }
  } else if (String(process.env.YUEQI_WEB_AUDIT_LOG || "").trim() === "1") {
    console.info(JSON.stringify(row));
  }
  return row;
}

/** @returns {object[]} */
export function getAuditEntries() {
  return ring.slice();
}

export function clearAuditEntries() {
  ring.length = 0;
}

/**
 * @param {((entry: object) => void) | null} fn
 */
export function setAuditSink(fn) {
  sink = typeof fn === "function" ? fn : null;
}
