/**
 * Calendar reminder → Agent submitTask (OC-submitTask-life).
 * User path outside Assist/Pop: phone calendar event form.
 */

import { submitTask } from "../agent/executor.js";

function buildReminderText({ title, date, time, prompt } = {}) {
  return [date, time, title, prompt].filter((part) => String(part || "").trim()).join(" ").trim();
}

/**
 * Submit a calendar reminder as an Agent task visible in Task Center.
 * @param {{
 *   title?: string,
 *   date?: string,
 *   time?: string,
 *   prompt?: string,
 *   mode?: string,
 *   eventId?: string,
 *   characterId?: string,
 * }} fields
 * @param {object} [ctx]
 */
export async function dispatchCalendarReminderTask(fields = {}, ctx = {}) {
  const title = String(fields.title || "").trim();
  const date = String(fields.date || "").trim();
  const time = String(fields.time || "21:00").trim();
  const prompt = String(fields.prompt || "").trim();
  const characterId = String(fields.characterId || ctx.characterId || "").trim();
  const text = buildReminderText({ title, date, time, prompt });

  if (!text) return { ok: false, reason: "empty" };

  const eventId = String(fields.eventId || "").trim();
  const idempotentKey = eventId
    ? `cal-event:${eventId}`
    : `cal-reminder:${characterId || "local"}:${date}:${time}:${title}`.slice(0, 160);

  const result = await submitTask({
    capabilityId: "calendar-draft",
    characterId: characterId || "local",
    title: title ? `日程：${title}` : "日程提醒",
    summary: text.slice(0, 200),
    input: { text, characterId: characterId || "local" },
    idempotentKey,
    risk: "R2",
  }, {
    ...ctx,
    commitToLocalCalendar: false,
  });

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("yueqi.task-center.refresh", {
        detail: {
          taskId: result?.value?.id || "",
          source: "calendar",
          awaitingApproval: Boolean(result?.awaitingApproval),
        },
      }));
    }
  } catch {
    /* non-browser */
  }

  return result;
}
