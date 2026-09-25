import { eventPromptOf } from "../calendar/event-types.js";
import { isNotificationOnlyMode, normalizeEventMode, DEFAULT_EVENT_MODE } from "../calendar/modes.js";

function hoursSince(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return null;
  return Math.max(0, (Date.now() - value) / 3600000);
}

function inactivityBand(hours) {
  if (hours == null) return "unknown";
  if (hours < 1) return "warm";
  if (hours < 6) return "quiet";
  if (hours < 18) return "miss";
  return "long";
}

function toneFor({ status = {}, band }) {
  if (status.asleep) return "低声、像被轻轻叫醒，不抱怨";
  if (band === "long") return "克制地表达惦记，不追问消失原因";
  if (band === "miss") return "轻轻靠近，给对方一个能接住的话头";
  if (status.weather?.condition === "rain") return "安静、低频、适合陪伴";
  if (status.weather?.condition === "clear") return "清醒、明亮、可以主动一点";
  return "温和、短句、有存在感";
}

function channelFor(mode, band) {
  if (isNotificationOnlyMode(mode)) return "notification";
  if (band === "warm") return "inline";
  return "segmented-message";
}

export function buildProactiveStrategy(event = {}, status = {}, context = {}) {
  const lastUserHours = hoursSince(context.runtimeState?.lastUserActivityAt);
  const band = inactivityBand(lastUserHours);
  const calendarCount = context.library?.events?.length || 0;
  const albumCount = context.library?.photos?.length || 0;
  const mode = normalizeEventMode(context.mode || event.mode || DEFAULT_EVENT_MODE);
  const prompt = eventPromptOf(event);

  return {
    type: "reminder",
    typeLabel: "日程提醒",
    prompt,
    mode,
    band,
    channel: channelFor(mode, band),
    tone: toneFor({ status, band }),
    lastUserHours,
    contextWeight: Math.min(1, 0.35 + calendarCount * 0.04 + albumCount * 0.02),
    shouldMentionSleep: Boolean(status.asleep),
    shouldMentionWeather: /rain|snow|clear/.test(status.weather?.condition || ""),
    maxSegments: 2,
  };
}

export function formatProactiveStrategy(strategy = {}) {
  const hours = strategy.lastUserHours == null
    ? "未知"
    : `${strategy.lastUserHours.toFixed(strategy.lastUserHours < 10 ? 1 : 0)}h`;
  return [
    `类型：${strategy.typeLabel || "日程提醒"}`,
    `渠道：${strategy.channel || "segmented-message"}`,
    `离线：${hours}`,
    `语气：${strategy.tone || "温和"}`,
    `分段：最多 ${strategy.maxSegments || 2} 段`,
  ].join("；");
}
