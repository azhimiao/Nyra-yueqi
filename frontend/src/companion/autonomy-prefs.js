/**
 * Companion autonomy prefs — master switch, presets, quiet hours, budgets.
 * Gates proactive message / diary / moments / anniversary / scenario&game memory.
 */

import { saveProactiveWakePrefs, TWO_HOUR_WAKE } from "../proactive/config.js";

export const AUTONOMY_PREFS_KEY = "yueqi.autonomy.v1";
export const AUTONOMY_CHANGED_EVENT = "yueqi:autonomy-changed";

/** @type {null | object} */
let testBag = null;

export const FREQUENCY_TO_WAKE = Object.freeze({
  low: { probability: 100, silenceMinMin: 120, silenceMaxMin: 120, checkEveryMin: 5, dailyCap: 8 },
  medium: { probability: 100, silenceMinMin: 120, silenceMaxMin: 120, checkEveryMin: 5, dailyCap: 8 },
  high: { probability: 100, silenceMinMin: 120, silenceMaxMin: 120, checkEveryMin: 5, dailyCap: 8 },
});

export const AUTONOMY_PRESETS = Object.freeze({
  quiet: Object.freeze({
    preset: "quiet",
    aiAutonomousLife: false,
    proactiveMessage: false,
    autoDiary: false,
    autoMoments: false,
    anniversaryProactive: false,
    scenarioMemory: false,
    gameMemory: false,
    systemNotifications: false,
    frequency: "low",
    dailyCap: 0,
    dailyProactiveBudget: 0,
  }),
  companion: Object.freeze({
    preset: "companion",
    aiAutonomousLife: true,
    proactiveMessage: true,
    autoDiary: true,
    autoMoments: true,
    anniversaryProactive: true,
    scenarioMemory: false,
    gameMemory: false,
    systemNotifications: true,
    frequency: "medium",
    dailyCap: 8,
    dailyProactiveBudget: 8,
    quietStart: "22:00",
    quietEnd: "08:00",
  }),
  immersive: Object.freeze({
    preset: "immersive",
    aiAutonomousLife: true,
    proactiveMessage: true,
    autoDiary: true,
    autoMoments: true,
    anniversaryProactive: true,
    scenarioMemory: true,
    gameMemory: true,
    systemNotifications: true,
    frequency: "high",
    dailyCap: 8,
    dailyProactiveBudget: 8,
    quietStart: "23:30",
    quietEnd: "07:00",
  }),
});

export const DEFAULT_AUTONOMY = Object.freeze({
  schemaVersion: 1,
  onboardingComplete: false,
  preset: "quiet",
  aiAutonomousLife: false,
  proactiveMessage: false,
  autoDiary: false,
  autoMoments: false,
  anniversaryProactive: false,
  scenarioMemory: false,
  gameMemory: false,
  systemNotifications: true,
  deskPetVisible: false,
  frequency: "medium",
  dailyCap: 8,
  quietStart: "22:00",
  quietEnd: "08:00",
  wifiOnlyMedia: false,
  pauseOnLowBattery: true,
  lowBatteryPauseCompanion: true,
  powerSaveNoMedia: true,
  dailyModelBudget: 40,
  dailyProactiveBudget: 8,
  /** runtime counters — reset by date key */
  budgetDate: "",
  proactiveUsedToday: 0,
  modelUsedToday: 0,
});

function storage() {
  if (typeof localStorage !== "undefined") return localStorage;
  return null;
}

export function __setAutonomyBagForTests(bag) {
  testBag = bag && typeof bag === "object" ? bag : null;
}

export function __clearAutonomyBagForTests() {
  testBag = null;
  try {
    storage()?.removeItem(AUTONOMY_PREFS_KEY);
  } catch {
    /* ignore */
  }
}

function clampInt(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function clampTime(raw, fallback) {
  const s = String(raw || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":").map(Number);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return fallback;
}

/**
 * @param {Partial<typeof DEFAULT_AUTONOMY>} raw
 */
export function normalizeAutonomyPrefs(raw = {}) {
  const freq = ["low", "medium", "high"].includes(raw.frequency) ? raw.frequency : DEFAULT_AUTONOMY.frequency;
  const preset = ["quiet", "companion", "immersive", "custom"].includes(raw.preset)
    ? raw.preset
    : DEFAULT_AUTONOMY.preset;
  return {
    schemaVersion: 1,
    onboardingComplete: Boolean(raw.onboardingComplete),
    preset,
    aiAutonomousLife: Boolean(raw.aiAutonomousLife),
    proactiveMessage: Boolean(raw.proactiveMessage),
    autoDiary: Boolean(raw.autoDiary),
    autoMoments: Boolean(raw.autoMoments),
    anniversaryProactive: Boolean(raw.anniversaryProactive),
    scenarioMemory: Boolean(raw.scenarioMemory),
    gameMemory: Boolean(raw.gameMemory),
    systemNotifications: raw.systemNotifications !== false,
    deskPetVisible: raw.deskPetVisible === true,
    frequency: freq,
    dailyCap: clampInt(raw.dailyCap, 0, 20, DEFAULT_AUTONOMY.dailyCap),
    quietStart: clampTime(raw.quietStart, DEFAULT_AUTONOMY.quietStart),
    quietEnd: clampTime(raw.quietEnd, DEFAULT_AUTONOMY.quietEnd),
    wifiOnlyMedia: Boolean(raw.wifiOnlyMedia),
    pauseOnLowBattery: raw.pauseOnLowBattery !== false,
    lowBatteryPauseCompanion: raw.lowBatteryPauseCompanion !== false,
    powerSaveNoMedia: raw.powerSaveNoMedia !== false,
    dailyModelBudget: clampInt(raw.dailyModelBudget, 0, 500, DEFAULT_AUTONOMY.dailyModelBudget),
    dailyProactiveBudget: clampInt(raw.dailyProactiveBudget, 0, 50, DEFAULT_AUTONOMY.dailyProactiveBudget),
    budgetDate: String(raw.budgetDate || ""),
    proactiveUsedToday: clampInt(raw.proactiveUsedToday, 0, 9999, 0),
    modelUsedToday: clampInt(raw.modelUsedToday, 0, 9999, 0),
  };
}

export function loadAutonomyPrefs() {
  if (testBag) return normalizeAutonomyPrefs(testBag);
  try {
    const raw = JSON.parse(storage()?.getItem(AUTONOMY_PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return normalizeAutonomyPrefs(DEFAULT_AUTONOMY);
    return normalizeAutonomyPrefs(raw);
  } catch {
    return normalizeAutonomyPrefs(DEFAULT_AUTONOMY);
  }
}

function emitChanged(prefs) {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(AUTONOMY_CHANGED_EVENT, { detail: { prefs } }));
}

/**
 * @param {Partial<typeof DEFAULT_AUTONOMY>} patch
 */
export function saveAutonomyPrefs(patch = {}) {
  const next = normalizeAutonomyPrefs({ ...loadAutonomyPrefs(), ...patch });
  if (testBag) {
    Object.keys(testBag).forEach((k) => delete testBag[k]);
    Object.assign(testBag, next);
  } else {
    try {
      storage()?.setItem(AUTONOMY_PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  emitChanged(next);
  return next;
}

/**
 * Apply named preset. Marks onboarding complete.
 * @param {"quiet"|"companion"|"immersive"|"custom"} presetId
 * @param {Partial<typeof DEFAULT_AUTONOMY>} [extra]
 */
export function applyAutonomyPreset(presetId, extra = {}) {
  if (presetId === "custom") {
    return saveAutonomyPrefs({
      ...extra,
      preset: "custom",
      onboardingComplete: true,
    });
  }
  const base = AUTONOMY_PRESETS[presetId] || AUTONOMY_PRESETS.quiet;
  return saveAutonomyPrefs({
    ...base,
    ...extra,
    onboardingComplete: true,
  });
}

/** Effective autonomous life — false until onboarding chooses a mode. */
export function isAiAutonomousLifeEnabled(prefs = loadAutonomyPrefs()) {
  if (!prefs.onboardingComplete) return false;
  return prefs.aiAutonomousLife === true;
}

/**
 * @param {"proactiveMessage"|"autoDiary"|"autoMoments"|"anniversaryProactive"|"scenarioMemory"|"gameMemory"|"systemNotifications"|"deskPetVisible"} capability
 */
export function isAutonomyCapabilityEnabled(capability, prefs = loadAutonomyPrefs()) {
  if (capability === "deskPetVisible") return prefs.deskPetVisible === true;
  if (capability === "systemNotifications") {
    if (!prefs.onboardingComplete) return true;
    return prefs.systemNotifications !== false;
  }
  if (!isAiAutonomousLifeEnabled(prefs)) return false;
  return prefs[capability] === true;
}

/**
 * Quiet hours from autonomy prefs (independent of library DND when set).
 * @param {Date} [date]
 * @param {ReturnType<typeof loadAutonomyPrefs>} [prefs]
 */
export function isWithinAutonomyQuietHours(date = new Date(), prefs = loadAutonomyPrefs()) {
  const [sh, sm] = prefs.quietStart.split(":").map(Number);
  const [eh, em] = prefs.quietEnd.split(":").map(Number);
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ensureAutonomyBudgetDay(prefs = loadAutonomyPrefs(), now = new Date()) {
  const key = todayKey(now);
  if (prefs.budgetDate === key) return prefs;
  return saveAutonomyPrefs({
    budgetDate: key,
    proactiveUsedToday: 0,
    modelUsedToday: 0,
  });
}

/**
 * @param {"message"|"diary"|"feed"|"anniversary"|"media"|"model"} kind
 * @param {{ batteryLevel?: number|null, charging?: boolean, connectionType?: string, powerSave?: boolean }} [env]
 */
export function assertAutonomyAllowed(kind, env = {}, prefsIn = loadAutonomyPrefs()) {
  const prefs = ensureAutonomyBudgetDay(prefsIn);
  if (!prefs.onboardingComplete && ["message", "diary", "feed", "anniversary"].includes(kind)) {
    return { ok: false, reason: "onboarding_pending" };
  }
  if (!isAiAutonomousLifeEnabled(prefs) && ["message", "diary", "feed", "anniversary"].includes(kind)) {
    return { ok: false, reason: "autonomy_off" };
  }
  const map = {
    message: "proactiveMessage",
    diary: "autoDiary",
    feed: "autoMoments",
    anniversary: "anniversaryProactive",
  };
  if (map[kind] && !isAutonomyCapabilityEnabled(map[kind], prefs)) {
    return { ok: false, reason: `${map[kind]}_off` };
  }
  if (["message", "diary", "feed", "anniversary"].includes(kind) && isWithinAutonomyQuietHours(new Date(), prefs)) {
    return { ok: false, reason: "quiet_hours" };
  }
  const dailyCap = Math.min(prefs.dailyCap, prefs.dailyProactiveBudget);
  if (["message", "diary", "feed", "anniversary"].includes(kind) && prefs.proactiveUsedToday >= dailyCap) {
    return { ok: false, reason: "daily_cap" };
  }
  if (kind === "model" && prefs.modelUsedToday >= prefs.dailyModelBudget) {
    return { ok: false, reason: "model_budget" };
  }
  const battery = env.batteryLevel;
  if (
    typeof battery === "number"
    && battery >= 0
    && battery <= 0.2
    && !env.charging
    && prefs.lowBatteryPauseCompanion
    && ["message", "diary", "feed", "anniversary", "media"].includes(kind)
  ) {
    return { ok: false, reason: "low_battery" };
  }
  if (kind === "media" || (kind === "model" && env.media)) {
    if (prefs.wifiOnlyMedia && env.connectionType && env.connectionType !== "wifi" && env.connectionType !== "ethernet") {
      return { ok: false, reason: "wifi_only" };
    }
    if (prefs.powerSaveNoMedia && env.powerSave) {
      return { ok: false, reason: "power_save" };
    }
  }
  return { ok: true, prefs };
}

export function recordAutonomyProactiveUse(count = 1) {
  const prefs = ensureAutonomyBudgetDay();
  return saveAutonomyPrefs({
    proactiveUsedToday: prefs.proactiveUsedToday + Math.max(0, Number(count) || 0),
  });
}

export function recordAutonomyModelUse(count = 1) {
  const prefs = ensureAutonomyBudgetDay();
  return saveAutonomyPrefs({
    modelUsedToday: prefs.modelUsedToday + Math.max(0, Number(count) || 0),
  });
}

/**
 * Filter life-tick candidates by autonomy.
 * @param {object[]} candidates
 */
export function filterAutonomyCandidates(candidates = [], prefs = loadAutonomyPrefs()) {
  return (candidates || []).filter((c) => {
    const kind = String(c.kind || "message");
    if (kind === "diary") return assertAutonomyAllowed("diary", {}, prefs).ok;
    if (kind === "feed") return assertAutonomyAllowed("feed", {}, prefs).ok;
    return assertAutonomyAllowed("message", {}, prefs).ok;
  });
}

/** Wake sources that are proactive (not user-initiated). */
export function shouldAllowProactiveWake(source = "", prefs = loadAutonomyPrefs()) {
  const src = String(source || "");
  if (["user_message", "open_app", "view_diary", "like_feed", "visibility_restore"].includes(src)) {
    return true; // tick may run for mood; emit still filtered
  }
  if (!isAiAutonomousLifeEnabled(prefs)) return false;
  if (src === "anniversary") return isAutonomyCapabilityEnabled("anniversaryProactive", prefs);
  if (src === "calendar") return isAutonomyCapabilityEnabled("proactiveMessage", prefs);
  if (src === "long_offline") return isAutonomyCapabilityEnabled("proactiveMessage", prefs);
  return isAutonomyCapabilityEnabled("proactiveMessage", prefs);
}

export function autonomyStatusSummary(prefs = loadAutonomyPrefs()) {
  const p = ensureAutonomyBudgetDay(prefs);
  return {
    onboardingComplete: p.onboardingComplete,
    preset: p.preset,
    aiAutonomousLife: isAiAutonomousLifeEnabled(p),
    frequency: p.frequency,
    dailyCap: Math.min(p.dailyCap, p.dailyProactiveBudget),
    usedToday: p.proactiveUsedToday,
    quietStart: p.quietStart,
    quietEnd: p.quietEnd,
    inQuietHours: isWithinAutonomyQuietHours(new Date(), p),
    proactiveMessage: isAutonomyCapabilityEnabled("proactiveMessage", p),
    autoDiary: isAutonomyCapabilityEnabled("autoDiary", p),
    autoMoments: isAutonomyCapabilityEnabled("autoMoments", p),
  };
}

/** Sync wake prefs probability from frequency (best-effort). */
export function wakePatchFromAutonomy(prefs = loadAutonomyPrefs()) {
  return FREQUENCY_TO_WAKE[prefs.frequency] || FREQUENCY_TO_WAKE.medium;
}

const ALWAYS_ON_MIGRATION = "yueqi.proactive.alwaysOn.v2";

/** After First Light, turn outreach on once for existing quiet-by-default bags. */
export function enableAlwaysOnProactiveOutreach() {
  let firstLightDone = false;
  try {
    const v2 = JSON.parse(storage()?.getItem("yueqi.firstLight.v2") || "null");
    const v1 = JSON.parse(storage()?.getItem("yueqi.firstLight.v1") || "null");
    firstLightDone = Boolean(v2?.done || v1?.done);
  } catch {
    firstLightDone = false;
  }
  const overlay = typeof document !== "undefined"
    && document.documentElement.classList.contains("first-light-active");
  if (overlay || !firstLightDone) return loadAutonomyPrefs();

  let migrated = false;
  try {
    migrated = storage()?.getItem(ALWAYS_ON_MIGRATION) === "1";
  } catch {
    migrated = false;
  }
  const prefs = loadAutonomyPrefs();
  if (migrated && prefs.aiAutonomousLife && prefs.proactiveMessage) return prefs;
  const next = saveAutonomyPrefs({
    onboardingComplete: true,
    aiAutonomousLife: true,
    proactiveMessage: true,
    dailyCap: Math.max(8, prefs.dailyCap || 0),
    dailyProactiveBudget: Math.max(8, prefs.dailyProactiveBudget || 0),
  });
  saveProactiveWakePrefs(TWO_HOUR_WAKE);
  try {
    storage()?.setItem(ALWAYS_ON_MIGRATION, "1");
  } catch {
    /* ignore */
  }
  return next;
}
