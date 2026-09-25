/**
 * Injectable clock for temporal context (W0).
 * Production uses wall clock; tests inject fixed nowMs.
 * Full TemporalSnapshot contract is W2 — this module stays minimal.
 */

/**
 * @typedef {{
 *   nowMs: () => number;
 *   nowDate: () => Date;
 *   nowIso: () => string;
 *   timezone: () => string;
 * }} Clock
 */

/**
 * @param {{ nowMs?: number | (() => number); timezone?: string }} [opts]
 * @returns {Clock}
 */
export function createClock(opts = {}) {
  const timezone =
    opts.timezone ||
    (typeof Intl !== "undefined" && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : null) ||
    "Asia/Shanghai";

  const resolveNowMs =
    typeof opts.nowMs === "function"
      ? opts.nowMs
      : typeof opts.nowMs === "number"
        ? () => opts.nowMs
        : () => Date.now();

  return {
    nowMs: () => resolveNowMs(),
    nowDate: () => new Date(resolveNowMs()),
    nowIso: () => new Date(resolveNowMs()).toISOString(),
    timezone: () => timezone,
  };
}

/** @type {Clock} */
let activeClock = createClock();

/** @returns {Clock} */
export function getClock() {
  return activeClock;
}

/** @param {Clock} clock */
export function setClockForTests(clock) {
  activeClock = clock;
}

export function resetClockForTests() {
  activeClock = createClock();
}

/**
 * Minimal stub for later TemporalSnapshot (W2). Not a full contract.
 * @param {Clock} [clock]
 */
export function captureTemporalSnapshotBasics(clock = getClock()) {
  const ms = clock.nowMs();
  return {
    capturedAt: new Date(ms).toISOString(),
    timezone: clock.timezone(),
    nowMs: ms,
  };
}
