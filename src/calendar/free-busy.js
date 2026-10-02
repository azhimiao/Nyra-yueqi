import { eventsForDate, formatDateKey } from "./engine.js";

function toMinutes(timeValue = "00:00") {
  const [hours, minutes] = timeValue.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function buildFreeBusyBlocks(events = [], dateKey = formatDateKey()) {
  const dayEvents = eventsForDate(events, dateKey)
    .map((event) => ({
      start: toMinutes(event.time || "21:00"),
      end: toMinutes(event.time || "21:00") + 30,
      title: event.title,
    }))
    .sort((a, b) => a.start - b.start);

  const blocks = [];
  let cursor = 8 * 60;
  const dayEnd = 23 * 60;
  for (const event of dayEvents) {
    if (event.start > cursor) {
      blocks.push({
        start: formatMinutes(cursor),
        end: formatMinutes(event.start),
        label: "空闲",
      });
    }
    cursor = Math.max(cursor, event.end);
  }
  if (cursor < dayEnd) {
    blocks.push({
      start: formatMinutes(cursor),
      end: formatMinutes(dayEnd),
      label: "空闲",
    });
  }
  return blocks;
}

export function formatFreeBusySummary(events = [], dateKey = formatDateKey()) {
  const blocks = buildFreeBusyBlocks(events, dateKey);
  if (!blocks.length) return "今日暂无可用空闲块。";
  return blocks.map((block) => `${block.start}-${block.end}`).join("；");
}
