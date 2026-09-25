/**
 * Proactive "找你" prefs — user-tunable probability + silence window.
 * Competitor pattern (追发): adjustable delay/threshold; fire = wake character once,
 * not a fixed canned line.
 */

const PREFS_KEY = "yueqi.proactive.wake.v1";

/** Product cadence: one outreach attempt every two waking hours. */
export const TWO_HOUR_WAKE = Object.freeze({
  probability: 100,
  silenceMinMin: 120,
  silenceMaxMin: 120,
  checkEveryMin: 5,
});

const DEFAULTS = Object.freeze({ ...TWO_HOUR_WAKE });

/**  discrete life tick limits (extends wake prefs, not duplicated). */
export const LIFE_TICK_LIMITS = Object.freeze({
  dailyMessageLimit: 8,
  dailyDiaryLimit: 1,
  dailyFeedLimit: 1,
  cooldownMs: 2 * 60 * 60 * 1000,
  minTickIntervalMs: 15 * 60 * 1000,
  offlineLongThresholdMs: 6 * 60 * 60 * 1000,
});

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

export function getDefaultProactiveWakePrefs() {
  return { ...DEFAULTS };
}

/**
 * @param {Partial<typeof DEFAULTS>} raw
 */
export function normalizeProactiveWakePrefs(raw = {}) {
  const probability = clamp(raw.probability, 0, 100, DEFAULTS.probability);
  let silenceMinMin = clamp(raw.silenceMinMin, 5, 24 * 60, DEFAULTS.silenceMinMin);
  let silenceMaxMin = clamp(raw.silenceMaxMin, 5, 24 * 60, DEFAULTS.silenceMaxMin);
  if (silenceMaxMin < silenceMinMin) {
    const t = silenceMinMin;
    silenceMinMin = silenceMaxMin;
    silenceMaxMin = t;
  }
  const checkEveryMin = clamp(raw.checkEveryMin, 1, 60, DEFAULTS.checkEveryMin);
  return { probability, silenceMinMin, silenceMaxMin, checkEveryMin };
}

export function loadProactiveWakePrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return getDefaultProactiveWakePrefs();
    return normalizeProactiveWakePrefs(raw);
  } catch {
    return getDefaultProactiveWakePrefs();
  }
}

export function saveProactiveWakePrefs(patch = {}) {
  const next = normalizeProactiveWakePrefs({ ...loadProactiveWakePrefs(), ...patch });
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** @deprecated profile slider seed — kept for first-run migration */
export function proactiveFrequencyFromProfile(ranges = []) {
  const fromPrefs = loadProactiveWakePrefs().probability;
  if (ranges[1] == null || ranges[1] === "") return fromPrefs;
  return Number(ranges[1] ?? fromPrefs);
}

/** Check interval for heartbeat (ms). */
export function heartbeatIntervalMs(prefs = loadProactiveWakePrefs()) {
  const p = normalizeProactiveWakePrefs(prefs);
  return Math.max(60 * 1000, p.checkEveryMin * 60 * 1000);
}

/**
 * Roll a silence threshold in [min, max] minutes → ms.
 * Higher probability slightly biases toward shorter waits (still user-bounded).
 */
export function rollSilenceThresholdMs(prefs = loadProactiveWakePrefs()) {
  const p = normalizeProactiveWakePrefs(prefs);
  const span = Math.max(0, p.silenceMaxMin - p.silenceMinMin);
  const t = Math.random();
  // Mild bias: higher probability → lean shorter within the window
  const bias = 1 - (p.probability / 100) * 0.35;
  const u = Math.pow(t, bias);
  const minutes = p.silenceMinMin + span * u;
  return Math.round(minutes * 60 * 1000);
}

/** Roll whether this eligible tick should wake the character. */
export function rollWakeProbability(prefs = loadProactiveWakePrefs()) {
  const p = normalizeProactiveWakePrefs(prefs);
  if (p.probability <= 0) return false;
  if (p.probability >= 100) return true;
  return Math.random() * 100 < p.probability;
}

/** @deprecated old API — map to check interval */
export function inactivityThresholdMs(freq = 50) {
  const prefs = loadProactiveWakePrefs();
  const mid = (prefs.silenceMinMin + prefs.silenceMaxMin) / 2;
  return Math.max(5 * 60 * 1000, mid * 60 * 1000 * (1.2 - (Number(freq) || 50) / 200));
}
