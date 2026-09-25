/**
 * C8 observability stub — structured cutover metrics only (no chat/diary bodies).
 */

/** @typedef {"profile"|"migration"|"proposal"|"projection"|"broker"|"continuity"|"web"} MetricFamily */

const counters = new Map();
const timings = [];

function keyOf(family, name, tags = {}) {
  const tagPart = Object.keys(tags || {})
    .sort()
    .map((k) => `${k}=${String(tags[k])}`)
    .join(",");
  return `${family}:${name}${tagPart ? `|${tagPart}` : ""}`;
}

export function incrementCutoverMetric(family, name, by = 1, tags = {}) {
  const key = keyOf(family, name, tags);
  const prev = counters.get(key) || { family, name, tags, value: 0 };
  prev.value += Number(by) || 0;
  counters.set(key, prev);
  return prev.value;
}

export function recordCutoverTiming(family, name, ms, tags = {}) {
  const row = {
    family,
    name,
    ms: Math.max(0, Number(ms) || 0),
    tags: tags || {},
    at: new Date().toISOString(),
  };
  timings.push(row);
  if (timings.length > 500) timings.shift();
  return row;
}

export function snapshotCutoverMetrics() {
  return {
    counters: [...counters.values()],
    timings: timings.slice(-100),
    at: new Date().toISOString(),
  };
}

/** Test helper — clears in-memory bags. */
export function __resetCutoverMetricsForTests() {
  counters.clear();
  timings.length = 0;
}

/**
 * Privacy note for exporters: never attach message/diary/book full text.
 * Only profile names, counts, durations, fingerprints, and error codes.
 */
export const CUTOVER_METRIC_PRIVACY = Object.freeze({
  forbidBodies: true,
  allowed: [
    "profile",
    "flags",
    "counts",
    "durationsMs",
    "fingerprint",
    "errorCode",
    "providerStatus",
  ],
});
