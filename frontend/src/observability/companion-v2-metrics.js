/**
 * Privacy-safe Companion V2 counters. No prompt text, no user content.
 */

const counters = new Map();

export function incrementCompanionV2Metric(name, by = 1) {
  const key = String(name || "unknown");
  counters.set(key, (counters.get(key) || 0) + Number(by || 0));
  return counters.get(key);
}

export function snapshotCompanionV2Metrics() {
  return Object.fromEntries(counters.entries());
}

export function resetCompanionV2Metrics() {
  counters.clear();
}

export const COMPANION_V2_METRIC_NAMES = Object.freeze([
  "prompt_fallback",
  "prompt_truncated",
  "migration_run",
  "toolrun_mismatch",
  "cutover_rollback",
]);
