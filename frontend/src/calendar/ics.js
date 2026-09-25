export function parseIcsDate(value = "") {
  const match = value.match(/(\d{8})(?:T(\d{2})(\d{2}))?/);
  if (!match) return { date: "", time: "21:00" };
  const [, date, hour = "21", minute = "00"] = match;
  return {
    date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    time: `${hour}:${minute}`,
  };
}

export function parseIcsEvents(text = "") {
  return text
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((chunk) => {
      const summary = chunk.match(/SUMMARY(?:;[^:]*)?:(.+)/)?.[1]?.trim().replace(/\\,/g, ",") || "导入日程";
      const startRaw = chunk.match(/DTSTART(?:;[^:]*)?:(.+)/)?.[1]?.trim() || "";
      const endRaw = chunk.match(/DTEND(?:;[^:]*)?:(.+)/)?.[1]?.trim() || "";
      const parsed = parseIcsDate(startRaw);
      const endParsed = endRaw ? parseIcsDate(endRaw) : null;
      return {
        date: parsed.date,
        time: parsed.time,
        endDate: endParsed?.date || "",
        endTime: endParsed?.time || "",
        title: summary,
        mode: "proactive_message",
        prompt: `日历事件「${summary}」到了，到点后提醒对方。`,
      };
    })
    .filter((event) => event.date);
}
