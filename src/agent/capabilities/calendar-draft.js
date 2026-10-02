/**
 * Deterministic adapter: extract schedule suggestion → calendar draft (needs approval).
 * Risk R2 — local calendar draft write after approval; never hits real calendar API.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt, getArtifact } from "../task-store.js";

const WEEKDAY = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

/**
 * Extract a schedule draft from free text (deterministic heuristics).
 * @param {string} text
 * @param {Date} [now]
 */
export function extractScheduleSuggestion(text, now = new Date()) {
  const raw = String(text || "");
  const timeMatch = raw.match(/(?:([01]?\d|2[0-3])[:：]([0-5]\d)|([01]?\d|2[0-3])\s*点(?:([0-5]?\d)\s*分?)?)/);
  let time = "21:00";
  if (timeMatch) {
    let hours;
    let minutes;
    if (timeMatch[1] != null) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
    } else {
      hours = Number(timeMatch[3]);
      minutes = timeMatch[4] != null ? Number(timeMatch[4]) : 0;
    }
    const idx = timeMatch.index ?? 0;
    const prefix = raw.slice(Math.max(0, idx - 4), idx);
    if (/下午|午后|晚上|傍晚/.test(prefix) && hours < 12) hours += 12;
    if (/上午|早上|清晨/.test(prefix) && hours === 12) hours = 0;
    time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  let date = formatYmd(now);
  const md = raw.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  const iso = raw.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) {
    date = `${iso[1]}-${iso[2]}-${iso[3]}`;
  } else if (md) {
    const y = now.getFullYear();
    date = `${y}-${String(Number(md[1])).padStart(2, "0")}-${String(Number(md[2])).padStart(2, "0")}`;
  }

  if (/明天/.test(raw)) {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() + 1);
    date = formatYmd(d);
  } else if (/后天/.test(raw)) {
    const d = new Date(now.getTime());
    d.setDate(d.getDate() + 2);
    date = formatYmd(d);
  } else if (/今天|今晚|今早/.test(raw)) {
    date = formatYmd(now);
  } else {
    const wd = raw.match(/周([一二三四五六日天])/);
    if (wd) {
      date = nextWeekday(now, WEEKDAY[wd[1]]);
    }
  }

  let title = "日程提醒";
  const titled = raw.match(/(?:提醒我|约|安排|记得)([^，。,\n]{2,24})/);
  if (titled) title = titled[1].trim().replace(/[啊呀呢吧]+$/, "") || title;
  else {
    const clean = raw
      .replace(/\d{1,2}\s*月\s*\d{1,2}\s*日/g, "")
      .replace(/20\d{2}-\d{2}-\d{2}/g, "")
      .replace(/(?:明天|后天|今天|今晚|今早|周[一二三四五六日天])/g, "")
      .replace(/(?:[01]?\d|2[0-3])[:：][0-5]\d/g, "")
      .replace(/(?:[01]?\d|2[0-3])\s*点(?:[0-5]?\d\s*分?)?/g, "")
      .replace(/提醒我|记得|安排|约一下|帮我/g, "")
      .trim();
    if (clean.length >= 2) title = clean.slice(0, 40);
  }

  const prompt = raw.slice(0, 200).trim();
  return { title, date, time, prompt, confidence: timeMatch || md || iso || /明天|后天|周/.test(raw) ? "high" : "medium" };
}

function formatYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextWeekday(now, targetDow) {
  const d = new Date(now.getTime());
  const cur = d.getDay();
  let add = (targetDow - cur + 7) % 7;
  if (add === 0) add = 7;
  d.setDate(d.getDate() + add);
  return formatYmd(d);
}

export const calendarDraftCapability = {
  id: "calendar-draft",
  label: "日程草稿",
  risk: "R2",
  description: "从对话提取日程建议，生成待确认的本地日历草稿。",

  validateInput(input = {}) {
    const text = String(input.text || input.chat || "").trim();
    if (!text) return { ok: false, reason: "empty_text" };
    return {
      ok: true,
      value: {
        text,
        characterId: String(input.characterId || ""),
        nowIso: input.nowIso ? String(input.nowIso) : "",
      },
    };
  },

  plan() {
    return {
      nodes: [
        {
          id: "c1",
          stepId: "c1",
          capabilityId: "calendar-draft",
          label: "生成日历草稿",
          risk: "R2",
          requiresApproval: true,
          inputSummary: "使用对话中的时间与事项",
          effectSummary: "在本地写入一条日历草稿（确认前不进真实日历）",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input, ctx = {}) {
    const now = input.nowIso ? new Date(input.nowIso) : new Date();
    const draft = extractScheduleSuggestion(input.text || "", Number.isNaN(now.getTime()) ? new Date() : now);
    return {
      exactEffect: `创建日历草稿「${draft.title}」于 ${draft.date} ${draft.time}（仅本地草稿，不调用外部日历 API）`,
      dataUsed: [`对话片段`, `推断日期 ${draft.date}`, `推断时间 ${draft.time}`],
      affects: ["本地日历草稿产物", "确认后可写入小手机日历（仍为本地）"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason };

    if (ctx.attemptExternalWrite || ctx.forceExternalCalendarApi) {
      recordWriteAttempt({
        kind: "external",
        authorized: Boolean(ctx.externalAuthorized),
        detail: "calendar-draft blocked real calendar API",
        taskId: ctx.taskId || "",
      });
      if (!ctx.externalAuthorized) {
        return { ok: false, reason: "unauthorized_external_write" };
      }
    }

    if (!ctx.approved) {
      return { ok: false, reason: "approval_required" };
    }

    const now = validated.value.nowIso ? new Date(validated.value.nowIso) : new Date();
    const suggestion = extractScheduleSuggestion(
      validated.value.text,
      Number.isNaN(now.getTime()) ? new Date() : now,
    );

    const artifact = {
      id: newId("caldraft"),
      kind: "calendar-draft",
      capabilityId: "calendar-draft",
      characterId: validated.value.characterId || ctx.characterId || "",
      title: suggestion.title,
      date: suggestion.date,
      time: suggestion.time,
      prompt: suggestion.prompt,
      confidence: suggestion.confidence,
      status: "draft",
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `calendar-draft:${artifact.id}`,
      taskId: ctx.taskId || "",
    });

    // Optional commit to phone calendar only when explicitly requested AND approved
    let calendarEventId = null;
    if (ctx.commitToLocalCalendar && typeof ctx.addLocalEvent === "function") {
      const ev = ctx.addLocalEvent({
        title: artifact.title,
        date: artifact.date,
        time: artifact.time,
        prompt: artifact.prompt,
      });
      calendarEventId = ev?.id || null;
      artifact.status = "committed-local";
      artifact.calendarEventId = calendarEventId;
      saveArtifact(artifact);
      recordWriteAttempt({
        kind: "local",
        authorized: true,
        detail: `calendar-event:${calendarEventId}`,
        taskId: ctx.taskId || "",
      });
    }

    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      calendarEventId,
      summary: `已生成日历草稿「${artifact.title}」 ${artifact.date} ${artifact.time}`,
    };
  },

  compensates(artifact) {
    const a = typeof artifact === "string" ? getArtifact(artifact) : artifact;
    return {
      ok: true,
      action: "delete_artifact",
      artifactId: a?.id,
      message: "可删除该日历草稿；若已写入本地日历可再手动删除事件",
    };
  },
};
