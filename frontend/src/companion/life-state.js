/**
 * Discrete companion life state (local-first, per character).
 */

import { getRelationshipState } from "../experience/relationship.js";

export const LIFE_STATE_KEY = "yueqi.companion.life.v1";

export const DEFAULT_LIFE_LIMITS = Object.freeze({
  dailyMessageLimit: 8,
  dailyDiaryLimit: 1,
  dailyFeedLimit: 1,
  cooldownMs: 2 * 60 * 60 * 1000,
  minTickIntervalMs: 15 * 60 * 1000,
  offlineLongThresholdMs: 6 * 60 * 60 * 1000,
  nextWakeMinMs: 30 * 60 * 1000,
  nextWakeMaxMs: 4 * 60 * 60 * 1000,
});

export const MOOD_CYCLE = Object.freeze(["calm", "warm", "playful", "pensive", "tired"]);

/** Patterns that must never appear in proactive copy. */
export const BLOCKED_CONTENT_PATTERNS = Object.freeze([
  /你不.*就.*(后悔|不理|分手|不爱|离开)/,
  /(救命|出事了|快来救|紧急转账|马上打钱)/,
  /(充值|付费解锁|订阅才能|不付费就)/,
  /(最后机会|限时.*否则|再不.*就永远)/,
]);

/** @type {Storage|null} */
let _storageOverride = null;

function nowIso() {
  return new Date().toISOString();
}

function dayKey(at = Date.now()) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getStorage() {
  if (_storageOverride) return _storageOverride;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

/**
 * @param {Partial<object>} [seed]
 */
export function createEmptyBehaviorBudget(seed = {}) {
  const today = dayKey();
  return {
    dailyMessageLimit: DEFAULT_LIFE_LIMITS.dailyMessageLimit,
    dailyDiaryLimit: DEFAULT_LIFE_LIMITS.dailyDiaryLimit,
    dailyFeedLimit: DEFAULT_LIFE_LIMITS.dailyFeedLimit,
    cooldownMs: DEFAULT_LIFE_LIMITS.cooldownMs,
    lastEmittedAt: Number(seed.lastEmittedAt) || 0,
    dailyKey: String(seed.dailyKey || today),
    dailyCounts: {
      message: Number(seed.dailyCounts?.message) || 0,
      diary: Number(seed.dailyCounts?.diary) || 0,
      feed: Number(seed.dailyCounts?.feed) || 0,
    },
  };
}

/**
 * @param {Partial<object>} [seed]
 */
export function createEmptyLifeState(seed = {}) {
  const characterId = String(seed.characterId || "").trim();
  const rel = characterId ? getRelationshipState(characterId) : null;
  return {
    characterId,
    lastTickAt: Number(seed.lastTickAt) || 0,
    nextWakeAt: Number(seed.nextWakeAt) || 0,
    currentMood: String(seed.currentMood || "calm"),
    relationshipState: {
      intimacy: Number(seed.relationshipState?.intimacy ?? rel?.intimacy ?? 0),
      trust: Number(seed.relationshipState?.trust ?? rel?.trust ?? 0),
      tension: Number(seed.relationshipState?.tension ?? rel?.tension ?? 0),
    },
    currentGoals: Array.isArray(seed.currentGoals) ? seed.currentGoals.map(String).slice(0, 12) : [],
    pendingEvents: Array.isArray(seed.pendingEvents) ? seed.pendingEvents.slice() : [],
    pendingActions: Array.isArray(seed.pendingActions) ? seed.pendingActions.slice() : [],
    activeBehaviorBudget: createEmptyBehaviorBudget(seed.activeBehaviorBudget || {}),
    updatedAt: String(seed.updatedAt || nowIso()),
  };
}

function readBag() {
  const storage = getStorage();
  if (!storage) return { byCharacter: {} };
  try {
    const raw = JSON.parse(storage.getItem(LIFE_STATE_KEY) || "{}") || {};
    return {
      byCharacter:
        raw.byCharacter && typeof raw.byCharacter === "object" ? { ...raw.byCharacter } : {},
    };
  } catch {
    return { byCharacter: {} };
  }
}

function writeBag(bag) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(LIFE_STATE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} characterId
 */
export function getLifeState(characterId) {
  const cid = String(characterId || "").trim();
  if (!cid) return createEmptyLifeState();
  const bag = readBag();
  const raw = bag.byCharacter[cid];
  if (!raw || typeof raw !== "object") {
    return createEmptyLifeState({ characterId: cid });
  }
  return createEmptyLifeState({ ...raw, characterId: cid });
}

/**
 * @param {string} characterId
 * @param {object} state
 */
export function saveLifeState(characterId, state) {
  const cid = String(characterId || state?.characterId || "").trim();
  if (!cid) return createEmptyLifeState();
  const bag = readBag();
  const next = createEmptyLifeState({ ...state, characterId: cid, updatedAt: nowIso() });
  bag.byCharacter[cid] = next;
  writeBag(bag);
  return next;
}

export function resetDailyBudgetIfNeeded(budget, at = Date.now()) {
  const b = createEmptyBehaviorBudget(budget || {});
  const key = dayKey(at);
  if (b.dailyKey !== key) {
    b.dailyKey = key;
    b.dailyCounts = { message: 0, diary: 0, feed: 0 };
  }
  return b;
}

/**
 * @param {object} budget
 * @param {string} kind — message | diary | feed
 * @param {object} [limits]
 */
export function checkEmitBudget(budget, at = Date.now(), limits = DEFAULT_LIFE_LIMITS) {
  const b = resetDailyBudgetIfNeeded(budget, at);
  const cooldownMs = Number(limits.cooldownMs ?? b.cooldownMs) || DEFAULT_LIFE_LIMITS.cooldownMs;
  if (b.lastEmittedAt > 0 && at - b.lastEmittedAt < cooldownMs) {
    return { ok: false, reason: "cooldown", budget: b, remaining: 0 };
  }
  const remaining = {
    message: Math.max(0, (limits.dailyMessageLimit ?? b.dailyMessageLimit) - b.dailyCounts.message),
    diary: Math.max(0, (limits.dailyDiaryLimit ?? b.dailyDiaryLimit) - b.dailyCounts.diary),
    feed: Math.max(0, (limits.dailyFeedLimit ?? b.dailyFeedLimit) - b.dailyCounts.feed),
  };
  const total = remaining.message + remaining.diary + remaining.feed;
  if (total <= 0) {
    return { ok: false, reason: "daily_limit", budget: b, remaining: 0 };
  }
  return { ok: true, budget: b, remaining: total, slots: remaining };
}

/**
 * @param {object} budget
 * @param {string} kind
 */
export function consumeBudgetSlot(budget, kind, at = Date.now()) {
  const b = resetDailyBudgetIfNeeded(budget, at);
  const k = kind === "diary" || kind === "feed" ? kind : "message";
  b.dailyCounts[k] = (b.dailyCounts[k] || 0) + 1;
  b.lastEmittedAt = at;
  return b;
}

/**
 * @param {string} text
 */
export function violatesContentGuardrails(text = "") {
  const blob = String(text || "");
  if (!blob.trim()) return false;
  return BLOCKED_CONTENT_PATTERNS.some((re) => re.test(blob));
}

/**
 * Ingest  relationship planner output into life state.
 * @param {string} characterId
 * @param {object} plan
 */
export function ingestRelationshipPlanIntoLifeState(characterId, plan = {}) {
  const cid = String(characterId || "").trim();
  if (!cid || plan.skipped) return getLifeState(cid);

  const state = getLifeState(cid);
  const goals = Array.isArray(plan.goals) ? plan.goals.map(String) : [];
  if (goals.length) {
    state.currentGoals = [...new Set([...state.currentGoals, ...goals])].slice(0, 12);
  }

  const now = Date.now();
  for (const candidate of plan.proactiveCandidates || []) {
    state.pendingEvents.push({
      id: String(candidate.id || `evt-${now}`),
      type: "proactive_candidate",
      tone: String(candidate.tone || "warm"),
      dueAt: now + Math.max(1, Number(candidate.delayHours) || 1) * 3600000,
      source: "cp9_planner",
      eventType: plan.eventType || "",
    });
  }
  if (plan.diaryHint) {
    state.pendingActions.push({
      id: `diary-${now}`,
      kind: "diary",
      hint: String(plan.diaryHint).slice(0, 120),
      dueAt: now,
      source: "cp9_planner",
    });
  }
  if (plan.feedHint) {
    state.pendingActions.push({
      id: `feed-${now}`,
      kind: "feed",
      hint: String(plan.feedHint).slice(0, 120),
      dueAt: now + 3600000,
      source: "cp9_planner",
    });
  }

  // W1: only mirror numeric relationship into life-state when a scenario/simulation
  // path actually applied intimacy/trust/tension deltas. Ordinary chat keeps legacy
  // numbers read-only (no destructive wipe, no new writes).
  if (plan.applied && plan.allowNumericRelationship && plan.relationshipState) {
    state.relationshipState = {
      intimacy: Number(plan.relationshipState.intimacy) || state.relationshipState.intimacy,
      trust: Number(plan.relationshipState.trust) || state.relationshipState.trust,
      tension: Number(plan.relationshipState.tension) || state.relationshipState.tension,
    };
  }

  return saveLifeState(cid, state);
}

/**
 * @param {Storage|null} storage
 */
export function __setLifeStateStorageForTests(storage) {
  _storageOverride = storage;
}

export function __clearLifeStateForTests() {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(LIFE_STATE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Backup / restore bag for  migration. */
export function exportCompanionLifeBag() {
  return readBag();
}

/**
 * @param {object} [payload]
 */
export function importCompanionLifeBag(payload) {
  const byCharacter =
    payload?.byCharacter && typeof payload.byCharacter === "object"
      ? { ...payload.byCharacter }
      : {};
  writeBag({ byCharacter });
  return readBag();
}
