import { readNativeKvRaw, writeNativeKvRaw, isNativeKvReady } from "../platform/kv-store.js";
import {
  heartbeatIntervalMs,
  loadProactiveWakePrefs,
  rollSilenceThresholdMs,
  rollWakeProbability,
} from "./config.js";

const LAST_USER_MESSAGE_KEY = "yueqi.proactive.lastUserMessageAt";
const NEXT_ELIGIBLE_KEY = "yueqi.proactive.nextEligibleAt";

function readNum(key) {
  try {
    const raw = isNativeKvReady() ? readNativeKvRaw(key) : window.localStorage.getItem(key);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeNum(key, value) {
  try {
    const s = String(value);
    if (isNativeKvReady()) writeNativeKvRaw(key, s);
    else window.localStorage.setItem(key, s);
  } catch {
    /* ignore */
  }
}

export function markUserActivity(at = Date.now()) {
  writeNum(LAST_USER_MESSAGE_KEY, at);
  // After user activity, next eligibility = now + fresh silence window
  writeNum(NEXT_ELIGIBLE_KEY, at + rollSilenceThresholdMs());
}

export function getNextEligibleAt() {
  return readNum(NEXT_ELIGIBLE_KEY);
}

/** Start the 2-hour clock even if the user has not sent a message yet. */
export function ensureWakeClockStarted(prefs = loadProactiveWakePrefs()) {
  if (!getLastUserMessageAt()) {
    markUserActivity(Date.now());
    return;
  }
  ensureNextEligibleAt(prefs);
}

export function isProactiveWakeDue(prefs = loadProactiveWakePrefs()) {
  const last = getLastUserMessageAt();
  if (!last) return false;
  return Date.now() >= ensureNextEligibleAt(prefs);
}

const RETRY_AFTER_SILENCE_MS = 30 * 60 * 1000;
const RETRY_AFTER_FAIL_MS = 15 * 60 * 1000;

/**
 * Advance the 2-hour clock only after a real spoken check-in.
 * Quiet hours and failed/silent attempts keep the slot due (short retry).
 */
export function settleWakeAttempt(result) {
  const reason = String(result?.reason || "");
  if (["quiet_hours", "dnd", "daily_cap", "autonomy_off", "onboarding_pending"].includes(reason)) {
    return;
  }
  if (result?.ok && result?.spoke) {
    markUserActivity();
    return;
  }
  const wait = result?.ok ? RETRY_AFTER_SILENCE_MS : RETRY_AFTER_FAIL_MS;
  writeNum(NEXT_ELIGIBLE_KEY, Date.now() + wait);
}

export function getLastUserMessageAt() {
  return readNum(LAST_USER_MESSAGE_KEY);
}

function ensureNextEligibleAt(prefs) {
  let next = readNum(NEXT_ELIGIBLE_KEY);
  if (next > 0) return next;
  const last = getLastUserMessageAt() || Date.now();
  next = last + rollSilenceThresholdMs(prefs);
  writeNum(NEXT_ELIGIBLE_KEY, next);
  return next;
}

/**
 * Heartbeat: after user-tunable silence window, roll probability, then wake character once.
 */
export function createHeartbeatChecker({ onTrigger, getPrefs = loadProactiveWakePrefs } = {}) {
  let timer = null;

  const tick = async () => {
    const prefs = getPrefs?.() || loadProactiveWakePrefs();
    const last = getLastUserMessageAt();
    if (!last) return;
    const nextEligible = ensureNextEligibleAt(prefs);
    if (Date.now() < nextEligible) return;

    if (!rollWakeProbability(prefs)) {
      // Missed the roll — wait another silence window (not a fixed message)
      writeNum(NEXT_ELIGIBLE_KEY, Date.now() + rollSilenceThresholdMs(prefs));
      return;
    }

    try {
      const result = await onTrigger?.({ reason: "character_wake", lastUserMessageAt: last, prefs });
      settleWakeAttempt(result ?? { ok: false, reason: "no_result" });
    } catch (error) {
      settleWakeAttempt({ ok: false, reason: "error" });
      throw error;
    }
  };

  return {
    start() {
      if (timer) window.clearInterval(timer);
      const every = Math.min(heartbeatIntervalMs(getPrefs?.() || loadProactiveWakePrefs()), 5 * 60 * 1000);
      timer = window.setInterval(() => {
        tick().catch((error) => console.error(error));
      }, every);
    },
    stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
    },
    reset(at = Date.now()) {
      markUserActivity(at);
    },
  };
}
