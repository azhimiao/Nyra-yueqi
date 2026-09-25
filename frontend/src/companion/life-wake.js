/**
 * Wake sources for discrete companion life ticks.
 */

import { runCompanionLifeTick, WAKE_SOURCES } from "./life-tick.js";
import { runProductionLifePlanner } from "./life-planner.js";
import { projectLifePlannerDecision } from "./life-product-adapter.js";
import { emitCompanionLifeChanged } from "./pet-presence-bridge.js";
import { bindScenarioMemoryBridgeListeners } from "./scenario-memory-bridge.js";
import { rescheduleProactiveScheduler, runDueProactiveWake } from "../proactive/scheduler.js";
import { subscribeAppEvent } from "../world/app-events.js";
import { ensureWakeClockStarted, isProactiveWakeDue, settleWakeAttempt } from "../proactive/heartbeat.js";
import {
  isAiAutonomousLifeEnabled,
  isAutonomyCapabilityEnabled,
} from "./autonomy-prefs.js";

/** @type {{ unbind?: () => void, deps?: object|null, unbindAppEvents?: () => void, unbindScenarioMemory?: () => void }} */
let bound = { unbind: null, deps: null, unbindAppEvents: null, unbindScenarioMemory: null };

/**  filtered app events →  wake sources. */
const APP_EVENT_WAKE_SOURCES = Object.freeze({
  "pop.message.sent": "user_message",
  "pop.message.read": "open_app",
  "feed.post.liked": "like_feed",
  "diary.viewed": "view_diary",
  "diary.created": "view_diary",
  "feed.post.created": "like_feed",
  "calendar.event.reached": "calendar",
  "scenario.event.completed": "open_app",
});

/**
 * @param {object} deps
 * @param {() => string} [deps.getActiveCharacterId]
 * @param {(key: string) => boolean} [deps.isFeatureEnabled]
 * @param {(date: Date, settings?: object) => boolean} [deps.isWithinDnd]
 * @param {() => object} [deps.collectLibraryState]
 */
export function buildLifeTickInput(deps = {}, overrides = {}) {
  const library = deps.collectLibraryState?.() || {};
  return {
    isFeatureEnabled: deps.isFeatureEnabled,
    isWithinDnd: deps.isWithinDnd,
    notificationSettings: library.notificationSettings || {},
    limits: overrides.limits,
    prefs: overrides.prefs,
    ...overrides,
  };
}

/**
 * @param {string} source
 * @param {object} deps
 * @param {object} [overrides]
 */
export function wakeCompanionLife(source, deps = {}, overrides = {}) {
  const characterId = String(
    overrides.characterId || deps.getActiveCharacterId?.() || "",
  ).trim();
  if (!characterId) {
    return { ok: false, skipped: true, reason: "missing_character" };
  }
  const result = runCompanionLifeTick({
    ...buildLifeTickInput(deps, overrides),
    characterId,
    source,
  });
  if (result?.state) {
    emitCompanionLifeChanged(characterId, {
      source,
      moodShift: result.moodShift || null,
      skipped: Boolean(result.skipped),
    });
  }
  return result;
}

/**
 * Production wake for sparse autonomous sources. User-driven surfaces keep the
 * synchronous local tick; background sources may add one evidence-bound model plan.
 */
export async function wakeCompanionLifeWithPlanner(source, deps = {}, overrides = {}) {
  const characterId = String(
    overrides.characterId || deps.getActiveCharacterId?.() || "",
  ).trim();
  if (!characterId) return { ok: false, skipped: true, reason: "missing_character" };
  const profile = overrides.characterCard || deps.collectCharacterProfile?.() || {};
  const library = deps.collectLibraryState?.() || {};
  const evidence = [
    ...(Array.isArray(overrides.evidence) ? overrides.evidence : []),
    ...(overrides.appEvent ? [{
      kind: "app_event",
      id: overrides.appEvent.id || `${source}:${overrides.appEvent.at || Date.now()}`,
      summary: overrides.appEvent.payload?.title || overrides.appEvent.type || source,
    }] : []),
  ];
  const result = await runProductionLifePlanner({
    ...buildLifeTickInput(deps, overrides),
    ...overrides,
    characterId,
    source,
    characterCard: profile,
    collectProviderConfig: deps.collectProviderConfig,
    recentMemoryHints: overrides.recentMemoryHints || [],
    evidence,
    notificationSettings: library.notificationSettings || {},
  });
  result.projection = await projectLifePlannerDecision(result, {
    ...deps,
    companionId: characterId,
  });
  if (result?.state) {
    emitCompanionLifeChanged(characterId, {
      source,
      moodShift: result.moodShift || null,
      planner: result.planner || null,
      skipped: Boolean(result.skipped),
    });
  }
  return result;
}

async function catchUpProactiveIfDue() {
  if (!isAiAutonomousLifeEnabled() || !isAutonomyCapabilityEnabled("proactiveMessage")) return;
  ensureWakeClockStarted();
  if (!isProactiveWakeDue()) return;
  const result = await runDueProactiveWake();
  settleWakeAttempt(result);
}

/**
 * Bind visibility / resume listeners (minimal wiring).
 * @param {object} deps — same shape as proactive scheduler deps + getActiveCharacterId
 */
function bindFilteredAppEventWake(deps = {}) {
  bound.unbindAppEvents?.();
  bound.unbindAppEvents = subscribeAppEvent("*", (evt) => {
    const source = APP_EVENT_WAKE_SOURCES[evt.type];
    if (!source) return;
    wakeCompanionLife(source, deps, { appEvent: evt });
  });
  return bound.unbindAppEvents;
}

export function bindCompanionLifeWakeListeners(deps = {}) {
  bound.deps = deps;
  bound.unbind?.();
  bindFilteredAppEventWake(deps);
  bound.unbindScenarioMemory?.();
  bound.unbindScenarioMemory = bindScenarioMemoryBridgeListeners();

  const onVisibility = () => {
    if (document.hidden) return;
    wakeCompanionLife("visibility_restore", deps);
    rescheduleProactiveScheduler();
    void catchUpProactiveIfDue(deps);
  };

  document.addEventListener("visibilitychange", onVisibility);

  bound.unbind = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    bound.unbindAppEvents?.();
    bound.unbindAppEvents = null;
    bound.unbindScenarioMemory?.();
    bound.unbindScenarioMemory = null;
    bound.unbind = null;
    bound.deps = null;
  };

  return bound.unbind;
}

export function unbindCompanionLifeWakeListeners() {
  bound.unbind?.();
}

export { WAKE_SOURCES };
