/**
 * TodayContext — frozen prompt block from snapshot + confirmed calendar + open follow-ups (plan §6.3).
 * Cap ~350 tokens via line/count limits.
 *
 * Calendar authority: reads phone-data / Calendar Repository `listEvents` (not MemPalace).
 * When `unifiedMemoryAdaptersV1` projects calendar.* Timeline rows, align via
 * `payload.sourceRef.sourceId` === calendar event `id` (TodayContext still prefers repository rows).
 */

import { createTemporalSnapshotV1 } from "../contracts/temporal-snapshot-v1.js";
import { listTimelineEvents } from "../timeline/repository.js";
import { estimatePromptTokens } from "../prompt/budget.js";
import { getClock } from "./clock.js";
import { isEventEligibleForTodayContext, resolveEventStatus } from "./contract.js";
import { applyExpiry } from "./expiry.js";

const WEEKDAY_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const WEEKDAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Soft token budget for the whole TodayContext block (plan §10.2). */
export const TODAY_CONTEXT_TOKEN_BUDGET = 350;
const MAX_CONFIRMED_LINES = 6;
const MAX_FOLLOW_UP_LINES = 4;
const MAX_OBSERVATION_LINES = 4;

/**
 * @param {object} snapshot
 */
export function formatCurrentTimeLine(snapshot) {
  const en = snapshot.locale === "en";
  const weekday = en
    ? (WEEKDAY_EN[snapshot.weekday] || "")
    : (WEEKDAY_ZH[snapshot.weekday] || "");
  return `${snapshot.localDate} ${snapshot.localTime}，${weekday}，${snapshot.timezone}`;
}

/**
 * Normalize calendar library events for a localDate.
 * @param {Array<{ date?: string, time?: string, title?: string, id?: string }>} events
 * @param {string} localDate
 */
export function filterCalendarForLocalDate(events, localDate) {
  return (events || [])
    .filter((e) => e && String(e.date || "") === localDate)
    .slice()
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

/**
 * @param {object} event timeline / temporal event
 * @param {object} snapshot
 */
function timelineSummary(event) {
  const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
  return String(
    event.title
    || payload.summary
    || payload.title
    || event.temporalText
    || event.eventType
    || "事项",
  ).trim();
}

/**
 * Open follow-ups: confirmed/active only (after expiry), needsFollowUp or follow_up kind.
 * @param {object[]} timelineEvents
 * @param {object} snapshot
 */
export function selectOpenFollowUps(timelineEvents, snapshot) {
  return (timelineEvents || [])
    .map((e) => applyExpiry(e, snapshot).event)
    .filter((e) => isEventEligibleForTodayContext(e, { allowProposed: false }))
    .filter((e) => {
      const payload = e.payload && typeof e.payload === "object" ? e.payload : {};
      const kind = e.kind || payload.kind || "";
      return (
        e.needsFollowUp === true
        || payload.needsFollowUp === true
        || kind === "follow_up"
        || ["schedule_commitment", "shared_plan", "followup_promise"].includes(e.eventType)
      );
    });
}

/**
 * Recent observations (confirmed/active/legacy), not expired.
 * @param {object[]} timelineEvents
 * @param {object} snapshot
 */
export function selectRecentObservations(timelineEvents, snapshot) {
  return (timelineEvents || [])
    .map((e) => applyExpiry(e, snapshot).event)
    .filter((e) => {
      if (!e || e.tombstone) return false;
      const status = resolveEventStatus(e);
      if (["expired", "cancelled", "superseded"].includes(status)) return false;
      const payload = e.payload && typeof e.payload === "object" ? e.payload : {};
      const kind = e.kind || payload.kind || e.eventType || "";
      return kind === "observation" || e.eventType === "observation" || payload.kind === "observation";
    });
}

/**
 * Build TodayContext object + prompt text.
 *
 * @param {{
 *   snapshot?: object,
 *   clock?: import("./clock.js").Clock,
 *   calendarEvents?: object[],
 *   timelineEvents?: object[],
 *   observations?: object[],
 *   tokenBudget?: number,
 * }} [input]
 */
export function buildTodayContext(input = {}) {
  const snapshot = input.snapshot && typeof input.snapshot === "object"
    ? input.snapshot
    : createTemporalSnapshotV1({}, { clock: input.clock || getClock() });

  const confirmedCalendar = filterCalendarForLocalDate(
    input.calendarEvents || [],
    snapshot.localDate,
  ).slice(0, MAX_CONFIRMED_LINES);

  // Timeline calendar-kind confirmed for today (optional enrichment)
  const timelineConfirmed = (input.timelineEvents || [])
    .map((e) => applyExpiry(e, snapshot).event)
    .filter((e) => isEventEligibleForTodayContext(e))
    .filter((e) => {
      const payload = e.payload && typeof e.payload === "object" ? e.payload : {};
      const kind = e.kind || payload.kind || "";
      if (kind !== "calendar" && e.eventType !== "calendar") return false;
      const dateKey = payload.localDate || payload.date || "";
      if (dateKey) return dateKey === snapshot.localDate;
      // Fall back: startsAt local day match via ISO prefix heuristic when timezone-aligned
      const starts = String(e.startsAt || payload.startsAt || "");
      return starts.startsWith(snapshot.localDate);
    })
    .slice(0, MAX_CONFIRMED_LINES);

  const followUps = selectOpenFollowUps(input.timelineEvents || [], snapshot)
    .slice(0, MAX_FOLLOW_UP_LINES);

  const observations = (
    Array.isArray(input.observations) && input.observations.length
      ? input.observations
      : selectRecentObservations(input.timelineEvents || [], snapshot)
  ).slice(0, MAX_OBSERVATION_LINES);

  const confirmedItems = [
    ...confirmedCalendar.map((e) => ({
      time: String(e.time || "").trim(),
      title: String(e.title || "提醒").trim(),
      source: "本地日历",
      // Repository event id — matches Timeline lifecycle sourceRef.sourceId when adapters on
      sourceId: String(e.id || ""),
    })),
    ...timelineConfirmed.map((e) => {
      const payload = e.payload && typeof e.payload === "object" ? e.payload : {};
      const refId = payload.sourceRef?.sourceId || payload.calendarEventId || "";
      return {
        time: "",
        title: timelineSummary(e),
        source: "时间线",
        sourceId: String(e.eventId || e.sourceId || ""),
        calendarSourceId: String(refId || e.sourceId || ""),
      };
    }),
  ].slice(0, MAX_CONFIRMED_LINES);

  const followUpItems = followUps.map((e) => ({
    title: timelineSummary(e),
    source: e.sourceType === "conversation" || e.source === "conversation"
      ? "用户明确要求"
      : "时间线",
    sourceId: String(e.eventId || ""),
    status: resolveEventStatus(e),
  }));

  const observationItems = observations.map((e) => ({
    title: timelineSummary(e),
    source: "近期对话",
    sourceId: String(e.eventId || e.sourceId || ""),
  }));

  const trimmed = { confirmed: false, followUps: false, observations: false };
  let text = formatTodayContextText({
    snapshot,
    confirmedItems,
    followUpItems,
    observationItems,
  });

  const budget = Number(input.tokenBudget) > 0 ? Number(input.tokenBudget) : TODAY_CONTEXT_TOKEN_BUDGET;
  // Progressive trim: observations → follow-ups → confirmed extras
  let obs = observationItems;
  let fus = followUpItems;
  let conf = confirmedItems;
  while (estimatePromptTokens(text) > budget && (obs.length || fus.length > 1 || conf.length > 1)) {
    if (obs.length) {
      obs = obs.slice(0, -1);
      trimmed.observations = true;
    } else if (fus.length > 1) {
      fus = fus.slice(0, -1);
      trimmed.followUps = true;
    } else if (conf.length > 1) {
      conf = conf.slice(0, -1);
      trimmed.confirmed = true;
    } else {
      break;
    }
    text = formatTodayContextText({
      snapshot,
      confirmedItems: conf,
      followUpItems: fus,
      observationItems: obs,
    });
  }

  return {
    snapshot,
    confirmedItems: conf,
    followUpItems: fus,
    observationItems: obs,
    text,
    tokens: estimatePromptTokens(text),
    trimmed,
  };
}

/**
 * @param {{
 *   snapshot: object,
 *   confirmedItems: object[],
 *   followUpItems: object[],
 *   observationItems: object[],
 * }} parts
 */
export function formatTodayContextText(parts) {
  const { snapshot, confirmedItems, followUpItems, observationItems } = parts;
  const lines = [
    "【当前时间】",
    formatCurrentTimeLine(snapshot),
    "",
    "【今日已确认事项】",
  ];
  if (!confirmedItems.length) {
    lines.push("- （无）");
  } else {
    for (const item of confirmedItems) {
      const timePrefix = item.time ? `${item.time} ` : "";
      lines.push(`- ${timePrefix}${item.title}（来源：${item.source}）`);
    }
  }
  lines.push("", "【待跟进事项】");
  if (!followUpItems.length) {
    lines.push("- （无）");
  } else {
    for (const item of followUpItems) {
      lines.push(`- ${item.title}（来源：${item.source}）`);
    }
  }
  lines.push("", "【最近共同经历】");
  if (!observationItems.length) {
    lines.push("- （无）");
  } else {
    for (const item of observationItems) {
      lines.push(`- ${item.title}`);
    }
  }
  return lines.join("\n");
}

/**
 * Best-effort load of calendar + timeline for a companion (no heavy refactor).
 * Safe in Node tests when storage is empty / missing.
 *
 * @param {{
 *   snapshot?: object,
 *   companionId?: string,
 *   relationshipId?: string,
 *   calendarEvents?: object[],
 *   timelineEvents?: object[],
 * }} [input]
 */
export function buildTodayContextForCompanion(input = {}) {
  let calendarEvents = Array.isArray(input.calendarEvents) ? input.calendarEvents : null;
  let timelineEvents = Array.isArray(input.timelineEvents) ? input.timelineEvents : null;

  if (!calendarEvents) {
    calendarEvents = loadCalendarEventsSafe();
  }

  if (!timelineEvents) {
    const companionId = String(input.companionId || "").trim();
    timelineEvents = companionId
      ? listTimelineEvents({
        companionId,
        relationshipId: input.relationshipId,
        limit: 40,
        statusFilter: "today_context",
      })
      : [];
  }

  return buildTodayContext({
    snapshot: input.snapshot,
    calendarEvents,
    timelineEvents,
    tokenBudget: input.tokenBudget,
  });
}

function loadCalendarEventsSafe() {
  try {
    // Soft dependency: phone-data pulls UI/calendar; failure must not break prompt assemble.
    // eslint-disable-next-line no-unsanitized/method
    const mod = globalThis.__YUEQI_PHONE_DATA__ || null;
    if (mod?.listEvents) return mod.listEvents() || [];
  } catch {
    /* ignore */
  }
  return [];
}
