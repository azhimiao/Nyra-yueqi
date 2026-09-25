import { msUntil } from "../lib/time.js";
import { anniversaryEventForToday } from "../calendar/anniversaries.js";
import { upcomingCalendarEvents } from "../calendar/engine.js";
import { isSchedulableMode } from "../calendar/modes.js";
import { loadProactiveWakePrefs, LIFE_TICK_LIMITS } from "./config.js";
import { createHeartbeatChecker, ensureWakeClockStarted } from "./heartbeat.js";
import { runProactiveAction } from "./pipeline.js";
import { wakeCompanionLifeWithPlanner } from "../companion/life-wake.js";
import { emitAppEvent } from "../world/app-events.js";
import {
  isAiAutonomousLifeEnabled,
  isAutonomyCapabilityEnabled,
  assertAutonomyAllowed,
  enableAlwaysOnProactiveOutreach,
  isWithinAutonomyQuietHours,
} from "../companion/autonomy-prefs.js";

let timers = [];
let heartbeat = null;
let schedulerDeps = null;

function clearTimers() {
  timers.forEach((timer) => window.clearTimeout(timer));
  timers = [];
}

function scheduleTimer(delay, callback) {
  const timer = window.setTimeout(async () => {
    try {
      await callback();
    } catch (error) {
      console.error(error);
    } finally {
      rescheduleProactiveScheduler();
    }
  }, delay);
  timers.push(timer);
}

function getFrequency() {
  return schedulerDeps?.getProactiveFrequency?.() ?? loadProactiveWakePrefs().probability;
}

function proactiveActionDeps(overrides = {}) {
  return {
    mode: overrides.mode,
    refreshDailyStatus: schedulerDeps.refreshDailyStatus,
    isWithinDnd: schedulerDeps.isWithinDnd,
    notificationSettings: schedulerDeps.collectLibraryState?.().notificationSettings,
    addMessage: schedulerDeps.addMessage,
    ingestMemoryAndRender: schedulerDeps.ingestMemoryAndRender,
    showCompanionNotification: schedulerDeps.showCompanionNotification,
    collectCharacterProfile: overrides.collectCharacterProfile || schedulerDeps.collectCharacterProfile,
    collectProviderConfig: schedulerDeps.collectProviderConfig,
    buildDiaryDeps: schedulerDeps.buildDiaryDeps,
    collectLibraryState: schedulerDeps.collectLibraryState,
    getRuntimeState: schedulerDeps.getRuntimeState,
    getProactiveFrequency: schedulerDeps.getProactiveFrequency,
    beginSummaryGeneration: schedulerDeps.beginSummaryGeneration,
    isSummaryGenerationCurrent: schedulerDeps.isSummaryGenerationCurrent,
    updateSegmentSummary: schedulerDeps.updateSegmentSummary,
    onCharacterWoke: schedulerDeps.onCharacterWoke,
    ...overrides,
  };
}

function scheduleCalendarSources() {
  if (!schedulerDeps || !schedulerDeps.isFeatureEnabled?.("proactive")) return;
  if (!isAiAutonomousLifeEnabled() || !isAutonomyCapabilityEnabled("proactiveMessage")) return;
  const grants = schedulerDeps.collectExternalGrants?.() || {};
  if (!grants.notification && !grants["通知"]) return;

  const events = schedulerDeps.collectLibraryState?.().events || [];
  const actionable = upcomingCalendarEvents(events).filter(
    ({ event }) => isSchedulableMode(event.mode),
  );

  actionable.forEach(({ event, triggerAt }) => {
    const delay = msUntil(triggerAt);
    scheduleTimer(delay, async () => {
      emitAppEvent("calendar.event.reached", {
        appId: "calendar",
        eventId: event.id || "",
        title: event.title || "",
        mode: event.mode || "",
      });
      const lifeResult = await wakeCompanionLifeWithPlanner("calendar", schedulerDeps, {
        calendarEvent: event,
        limits: LIFE_TICK_LIMITS,
      });
      if (lifeResult.projection?.action !== "SEND_PROACTIVE_MESSAGE" || !lifeResult.projection?.ok) {
        await runProactiveAction(event, proactiveActionDeps({ mode: event.mode }));
      }
    });
  });
}

function scheduleAnniversarySource() {
  if (!schedulerDeps || !schedulerDeps.isFeatureEnabled?.("proactive")) return;
  if (!isAiAutonomousLifeEnabled() || !isAutonomyCapabilityEnabled("anniversaryProactive")) return;
  if (!assertAutonomyAllowed("anniversary").ok) return;
  const grants = schedulerDeps.collectExternalGrants?.() || {};
  if (!grants.notification && !grants["通知"]) return;
  const event = anniversaryEventForToday(schedulerDeps.getAnniversaryDate?.());
  if (!event) return;
  const [hours, minutes] = event.time.split(":").map(Number);
  const target = new Date();
  target.setHours(hours || 9, minutes || 0, 0, 0);
  if (target.getTime() <= Date.now()) return;
  scheduleTimer(msUntil(target), async () => {
    const lifeResult = await wakeCompanionLifeWithPlanner("anniversary", schedulerDeps, {
      anniversaryEvent: event,
      limits: LIFE_TICK_LIMITS,
    });
    if (lifeResult.projection?.action !== "SEND_PROACTIVE_MESSAGE" || !lifeResult.projection?.ok) {
      await runProactiveAction(event, proactiveActionDeps({ mode: event.mode }));
    }
  });
}

/** Speak a 2-hour check-in. Planner may send; otherwise wake the character once. */
export async function runDueProactiveWake() {
  if (!schedulerDeps) return { ok: false, spoke: false, reason: "no_deps" };
  if (isWithinAutonomyQuietHours()) return { ok: false, spoke: false, reason: "quiet_hours" };
  const gate = assertAutonomyAllowed("message");
  if (!gate.ok) return { ok: false, spoke: false, reason: gate.reason };
  const lifeResult = await wakeCompanionLifeWithPlanner("long_offline", schedulerDeps, {
    limits: LIFE_TICK_LIMITS,
  });
  if (lifeResult.projection?.action === "SEND_PROACTIVE_MESSAGE" && lifeResult.projection?.ok) {
    return { ok: true, spoke: true };
  }
  return runProactiveAction({
    id: `wake-${Date.now()}`,
    kind: "character_wake",
    wakeOnce: true,
  }, proactiveActionDeps({
    mode: "character_wake",
    gateContinuity: false,
    wakeSource: "heartbeat",
  }));
}

function startHeartbeatSource() {
  heartbeat?.stop();
  if (!schedulerDeps?.isFeatureEnabled?.("proactive")) return;
  if (!isAiAutonomousLifeEnabled() || !isAutonomyCapabilityEnabled("proactiveMessage")) return;
  ensureWakeClockStarted();

  heartbeat = createHeartbeatChecker({
    getPrefs: () => loadProactiveWakePrefs(),
    onTrigger: () => runDueProactiveWake(),
  });
  heartbeat.start();
}

export function startProactiveScheduler(deps) {
  schedulerDeps = deps;
  enableAlwaysOnProactiveOutreach();
  rescheduleProactiveScheduler();
}

export function rescheduleProactiveScheduler() {
  clearTimers();
  if (!schedulerDeps) return;
  scheduleCalendarSources();
  scheduleAnniversarySource();
  startHeartbeatSource();
}

export function stopProactiveScheduler() {
  clearTimers();
  heartbeat?.stop();
  heartbeat = null;
  schedulerDeps = null;
}

export function notifyUserActivity(at = Date.now()) {
  heartbeat?.reset(at);
}

export { getFrequency, loadProactiveWakePrefs };
