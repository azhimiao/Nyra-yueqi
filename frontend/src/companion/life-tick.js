/**
 * Discrete companion life tick (local-first, no per-minute LLM).
 */

import { loadProactiveWakePrefs } from "../proactive/config.js";
import { t } from "../i18n/index.js";
import {
  checkEmitBudget,
  consumeBudgetSlot,
  createEmptyLifeState,
  DEFAULT_LIFE_LIMITS,
  getLifeState,
  MOOD_CYCLE,
  saveLifeState,
  violatesContentGuardrails,
} from "./life-state.js";
import {
  filterAutonomyCandidates,
  isAiAutonomousLifeEnabled,
  isWithinAutonomyQuietHours,
  recordAutonomyProactiveUse,
  shouldAllowProactiveWake,
} from "./autonomy-prefs.js";
import { appendActivity } from "./activity-log.js";

export const WAKE_SOURCES = Object.freeze([
  "user_message",
  "open_app",
  "view_diary",
  "like_feed",
  "long_offline",
  "anniversary",
  "calendar",
  "visibility_restore",
]);

const USER_INITIATED_SOURCES = new Set([
  "user_message",
  "open_app",
  "view_diary",
  "like_feed",
  "visibility_restore",
]);

/**
 * Compress offline elapsed time into a few key phases — never per-minute simulation.
 * @param {number} elapsedMs
 * @returns {object[]}
 */
export function compressOfflineElapsed(elapsedMs) {
  const ms = Math.max(0, Number(elapsedMs) || 0);
  const hours = ms / 3600000;
  const phases = [];
  if (hours >= 24) {
    phases.push({ kind: "day_passed", units: Math.min(7, Math.floor(hours / 24)) });
  } else if (hours >= 6) {
    phases.push({ kind: "half_day", units: 1 });
  } else if (hours >= 1) {
    phases.push({ kind: "hour_block", units: Math.min(3, Math.floor(hours)) });
  } else if (ms >= 15 * 60 * 1000) {
    phases.push({ kind: "brief_absence", units: 1 });
  }
  return phases.slice(0, 3);
}

/**
 * Deterministic mood advance from compressed catch-up phases.
 * @param {object} state
 * @param {object[]} phases
 */
export function advanceMoodDeterministic(state, phases = []) {
  if (!phases.length) return { from: state.currentMood, to: state.currentMood, delta: 0 };
  let idx = MOOD_CYCLE.indexOf(state.currentMood);
  if (idx < 0) idx = 0;
  let steps = 0;
  for (const phase of phases) {
    if (phase.kind === "day_passed") steps += phase.units;
    else if (phase.kind === "half_day") steps += 1;
    else if (phase.kind === "hour_block") steps += 1;
    else steps += 1;
  }
  steps = Math.min(2, steps);
  const to = MOOD_CYCLE[(idx + steps) % MOOD_CYCLE.length];
  return { from: state.currentMood, to, delta: steps };
}

/**
 * Offline catch-up for relationship snapshot.
 * W1: ordinary life ticks must not mutate intimacy/trust/tension (legacy read-only).
 * @param {object} state
 * @param {object[]} phases
 */
export function advanceRelationshipSnapshot(state, phases = []) {
  void phases;
  // Preserve existing numbers without decay/growth on ordinary companion path.
  return { ...(state.relationshipState || {}) };
}

function processDuePendingEvents(state, now) {
  const due = [];
  const remaining = [];
  for (const evt of state.pendingEvents || []) {
    const dueAt = Number(evt.dueAt) || 0;
    if (dueAt > 0 && dueAt <= now) due.push(evt);
    else remaining.push(evt);
  }
  state.pendingEvents = remaining.slice(0, 24);
  return due;
}

function pc(key, vars) {
  return t(`phone.companion.${key}`, vars);
}

function buildCandidateFromEvent(evt, state, source) {
  const tone = String(evt.tone || "warm");
  const id = String(evt.id || `cand-${Date.now()}`);
  switch (evt.type) {
    case "proactive_candidate":
      return {
        id,
        kind: "message",
        tone,
        text: tone === "gentle"
          ? pc("proactiveGentle")
          : tone === "celebratory"
            ? pc("proactiveAnniversary")
            : pc("proactiveCasual"),
        source: evt.source || source,
        eventType: evt.eventType || "",
      };
    case "calendar":
      return {
        id,
        kind: "message",
        tone: "warm",
        text: pc("calendarReminder", { title: String(evt.title || pc("calendarDefault")).slice(0, 40) }),
        source: "calendar",
      };
    case "anniversary":
      return {
        id,
        kind: "message",
        tone: "celebratory",
        text: pc("anniversaryGreeting"),
        source: "anniversary",
      };
    case "long_offline":
      return {
        id,
        kind: "message",
        tone: "casual",
        text: pc("longOffline"),
        source: "long_offline",
      };
    default:
      if (state.currentGoals[0]) {
        return {
          id,
          kind: "message",
          tone,
          text: pc("followUp", { goal: state.currentGoals[0].slice(0, 48) }),
          source: source || "life_tick",
        };
      }
      return null;
  }
}

function buildEmitCandidates(state, catchUp, dueEvents, source) {
  const candidates = [];
  for (const evt of dueEvents) {
    const c = buildCandidateFromEvent(evt, state, source);
    if (c) candidates.push(c);
  }
  for (const action of (state.pendingActions || []).filter((a) => Number(a.dueAt) <= Date.now())) {
    candidates.push({
      id: String(action.id || `act-${Date.now()}`),
      kind: action.kind === "diary" || action.kind === "feed" ? action.kind : "message",
      tone: "warm",
      text: String(action.hint || "").slice(0, 80),
      source: action.source || source,
    });
  }
  if (!candidates.length && catchUp.some((p) => p.kind === "day_passed" || p.kind === "half_day")) {
    candidates.push({
      id: `catchup-${Date.now()}`,
      kind: "diary",
      tone: "pensive",
      text: pc("offlineCatchup"),
      source: "offline_catchup",
    });
  }
  if (source === "like_feed" && !candidates.length) {
    candidates.push({
      id: `like-${Date.now()}`,
      kind: "message",
      tone: "playful",
      text: pc("likeThanks"),
      source: "like_feed",
    });
  }
  return candidates;
}

function computeNextWakeAt(now, source, prefs = {}) {
  const p = prefs.silenceMinMin != null ? prefs : loadProactiveWakePrefs();
  const minMs = DEFAULT_LIFE_LIMITS.nextWakeMinMs;
  const maxMs = DEFAULT_LIFE_LIMITS.nextWakeMaxMs;
  const span = Math.max(minMs, (Number(p.silenceMaxMin) || 180) * 60 * 1000);
  const base = Math.min(maxMs, Math.max(minMs, span * 0.5));
  const jitter = USER_INITIATED_SOURCES.has(source) ? base * 0.8 : base;
  return now + jitter;
}

/**
 * Optional model stub — deterministic by default; never required live.
 * @param {object} input
 * @param {{ modelFn?: (prompt: string) => Promise<object|null> }} [opts]
 */
export async function enrichCandidatesWithModelStub(input = {}, opts = {}) {
  const base = runCompanionLifeTick(input);
  if (typeof opts.modelFn !== "function") {
    return { ...base, modelSource: "deterministic" };
  }
  try {
    const prompt = [
      "Companion life tick stub.",
      `source=${input.source || "manual"}`,
      `mood=${base.state?.currentMood || "calm"}`,
    ].join("\n");
    const augment = await opts.modelFn(prompt);
    if (augment && typeof augment === "object") {
      return { ...base, modelAugment: augment, modelSource: "stub" };
    }
  } catch {
    /* fall through */
  }
  return { ...base, modelSource: "deterministic" };
}

/**
 * @param {{
 *   characterId: string,
 *   source?: string,
 *   now?: number,
 *   isFeatureEnabled?: (key: string) => boolean,
 *   isWithinDnd?: (date: Date, settings?: object) => boolean,
 *   notificationSettings?: object,
 *   limits?: object,
 *   calendarEvent?: object,
 *   anniversaryEvent?: object,
 *   force?: boolean,
 * }} input
 */
export function runCompanionLifeTick(input = {}) {
  const characterId = String(input.characterId || "").trim();
  const source = String(input.source || "manual").trim();
  const now = Number(input.now) || Date.now();

  if (!characterId) {
    return { ok: false, reason: "missing_character", skipped: true };
  }

  if (input.isFeatureEnabled && !input.isFeatureEnabled("proactive")) {
    return { ok: true, skipped: true, reason: "proactive_disabled" };
  }

  if (!shouldAllowProactiveWake(source) && !USER_INITIATED_SOURCES.has(source) && !input.force) {
    return { ok: true, skipped: true, reason: "autonomy_disabled" };
  }

  let state = getLifeState(characterId);
  const userInitiated = USER_INITIATED_SOURCES.has(source);
  const minInterval = Number(input.limits?.minTickIntervalMs) || DEFAULT_LIFE_LIMITS.minTickIntervalMs;

  if (
    !input.force
    && !userInitiated
    && state.lastTickAt > 0
    && now - state.lastTickAt < minInterval
  ) {
    return { ok: true, skipped: true, reason: "tick_throttled", nextWakeAt: state.nextWakeAt };
  }

  if (!input.force && !userInitiated && state.nextWakeAt > now) {
    return { ok: true, skipped: true, reason: "not_due", nextWakeAt: state.nextWakeAt };
  }

  if (
    !userInitiated
    && (input.isWithinDnd?.(new Date(now), input.notificationSettings || {}) || isWithinAutonomyQuietHours(new Date(now)))
  ) {
    state.nextWakeAt = now + DEFAULT_LIFE_LIMITS.nextWakeMinMs;
    saveLifeState(characterId, state);
    return { ok: true, skipped: true, reason: "quiet_hours", nextWakeAt: state.nextWakeAt };
  }

  const elapsed = state.lastTickAt > 0 ? now - state.lastTickAt : 0;
  const longOffline =
    elapsed >= (Number(input.limits?.offlineLongThresholdMs) || DEFAULT_LIFE_LIMITS.offlineLongThresholdMs);
  const catchUp = compressOfflineElapsed(elapsed);

  if (longOffline && source !== "long_offline") {
    state.pendingEvents.push({
      id: `offline-${now}`,
      type: "long_offline",
      tone: "casual",
      dueAt: now,
      source: "offline_compression",
    });
  }
  if (input.calendarEvent) {
    state.pendingEvents.push({
      id: `cal-${input.calendarEvent.id || now}`,
      type: "calendar",
      title: input.calendarEvent.title,
      tone: "warm",
      dueAt: now,
      source: "calendar",
    });
  }
  if (input.anniversaryEvent) {
    state.pendingEvents.push({
      id: `anniv-${now}`,
      type: "anniversary",
      tone: "celebratory",
      dueAt: now,
      source: "anniversary",
    });
  }

  const moodShift = advanceMoodDeterministic(state, catchUp);
  state.currentMood = moodShift.to;
  state.relationshipState = advanceRelationshipSnapshot(state, catchUp);

  const dueEvents = processDuePendingEvents(state, now);
  const budgetCheck = checkEmitBudget(state.activeBehaviorBudget, now, input.limits);
  const rawCandidates = budgetCheck.ok
    ? buildEmitCandidates(state, catchUp, dueEvents, source)
    : [];

  const safeCandidates = [];
  let budget = budgetCheck.budget || state.activeBehaviorBudget;
  const autonomyFiltered = filterAutonomyCandidates(rawCandidates);
  for (const cand of autonomyFiltered) {
    const text = String(cand.text || cand.hint || "");
    if (violatesContentGuardrails(text)) continue;
    const kind = cand.kind === "diary" || cand.kind === "feed" ? cand.kind : "message";
    const slotCheck = checkEmitBudget(budget, now, input.limits);
    if (!slotCheck.ok) break;
    if (kind === "message" && slotCheck.slots.message <= 0) continue;
    if (kind === "diary" && slotCheck.slots.diary <= 0) continue;
    if (kind === "feed" && slotCheck.slots.feed <= 0) continue;
    budget = consumeBudgetSlot(budget, kind, now);
    safeCandidates.push({ ...cand, kind, emittedAt: now });
  }

  if (safeCandidates.length && !userInitiated) {
    recordAutonomyProactiveUse(safeCandidates.length);
    const first = safeCandidates[0];
    appendActivity({
      title: first.kind === "diary"
        ? pc("wroteDiary")
        : first.kind === "feed"
          ? pc("postedMoment")
          : pc("proactiveMessage"),
      reason: pc("sourcePrefix", { source }),
      capability: first.kind === "diary" ? pc("autoDiary") : first.kind === "feed" ? pc("autoMoment") : pc("proactiveMsg"),
      resourcesRead: [pc("lifeState")],
      changes: [String(first.text || "").slice(0, 60)],
      usedModel: false,
      source: "life_tick",
      characterId,
    });
  }

  // When autonomy is off, user-initiated ticks may still advance mood without emitting.
  if (!isAiAutonomousLifeEnabled() && !userInitiated && !safeCandidates.length) {
    /* already filtered */
  }

  state.pendingActions = (state.pendingActions || []).filter(
    (a) => !safeCandidates.some((c) => c.id === a.id),
  );
  state.activeBehaviorBudget = budget;
  state.lastTickAt = now;
  state.nextWakeAt = computeNextWakeAt(now, source, input.prefs || loadProactiveWakePrefs());
  state = saveLifeState(characterId, state);

  return {
    ok: true,
    skipped: false,
    source,
    catchUp,
    moodShift,
    dueEvents,
    candidates: safeCandidates,
    budgetReason: budgetCheck.ok ? null : budgetCheck.reason,
    state,
    nextWakeAt: state.nextWakeAt,
    tickCount: 1,
  };
}

/**
 * Simulate many minutes offline — must NOT produce per-minute ticks.
 * @param {object} input
 * @param {number} offlineMs
 */
export function simulateOfflineCatchUp(input = {}, offlineMs = 0) {
  const characterId = String(input.characterId || "").trim();
  if (!characterId) return { ok: false, reason: "missing_character" };
  const state = getLifeState(characterId);
  const start = Number(input.now) || Date.now();
  const past = start - Math.max(0, Number(offlineMs) || 0);
  saveLifeState(characterId, createEmptyLifeState({
    ...state,
    characterId,
    lastTickAt: past,
    nextWakeAt: past,
  }));
  return runCompanionLifeTick({
    ...input,
    characterId,
    source: "long_offline",
    now: start,
    force: true,
  });
}
