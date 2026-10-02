/**
 * P4 Calendar CRUD — read free slots, preview mutations, approve → write local calendar.
 * Reuses phone calendar via local-calendar-store adapters when bound.
 * Risk R2 for writes; list/free is R0 via same capability with op=list|free.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt, getArtifact } from "../task-store.js";
import {
  listLocalEvents,
  addLocalEvent,
  updateLocalEvent,
  removeLocalEvent,
  findFreeSlots,
} from "./local-calendar-store.js";
import { extractScheduleSuggestion } from "./calendar-draft.js";

const WRITE_OPS = new Set(["create", "update", "delete"]);

/**
 * @param {Record<string, unknown>} input
 */
export function buildCalendarMutationPreview(input = {}) {
  const op = String(input.op || "create").toLowerCase();
  if (op === "list") {
    const events = listLocalEvents();
    return {
      op,
      risk: "R0",
      exactEffect: `列出本地日历事件（${events.length} 条），不写入`,
      mutation: null,
      events,
    };
  }
  if (op === "free") {
    const date = String(input.date || formatYmd(new Date()));
    const free = findFreeSlots(date);
    return {
      op,
      risk: "R0",
      exactEffect: `查询 ${date} 空闲时段（${free.length} 个小时槽），不写入`,
      mutation: null,
      freeSlots: free,
    };
  }

  if (op === "create") {
    const text = String(input.text || "");
    const now = input.nowIso ? new Date(String(input.nowIso)) : new Date();
    const sug = text
      ? extractScheduleSuggestion(text, Number.isNaN(now.getTime()) ? new Date() : now)
      : {
          title: String(input.title || "新日程"),
          date: String(input.date || formatYmd(now)),
          time: String(input.time || "09:00"),
          prompt: String(input.prompt || ""),
        };
    return {
      op,
      risk: "R2",
      exactEffect: `创建本地日历事件「${sug.title}」于 ${sug.date} ${sug.time}（确认前不写入）`,
      mutation: {
        op: "create",
        title: sug.title,
        date: sug.date,
        time: sug.time,
        prompt: sug.prompt || String(input.prompt || ""),
      },
    };
  }

  if (op === "update") {
    const id = String(input.eventId || input.id || "");
    const existing = listLocalEvents().find((e) => e.id === id);
    const patch = {
      title: input.title != null ? String(input.title) : existing?.title,
      date: input.date != null ? String(input.date) : existing?.date,
      time: input.time != null ? String(input.time) : existing?.time,
      prompt: input.prompt != null ? String(input.prompt) : existing?.prompt,
    };
    return {
      op,
      risk: "R2",
      exactEffect: existing
        ? `更新本地事件 ${id} → 「${patch.title}」 ${patch.date} ${patch.time}`
        : `更新失败：找不到事件 ${id || "(missing)"}`,
      mutation: { op: "update", eventId: id, patch, existing: existing || null },
    };
  }

  if (op === "delete") {
    const id = String(input.eventId || input.id || "");
    const existing = listLocalEvents().find((e) => e.id === id);
    return {
      op,
      risk: "R2",
      exactEffect: existing
        ? `删除本地事件「${existing.title}」（${id}）`
        : `删除失败：找不到事件 ${id || "(missing)"}`,
      mutation: { op: "delete", eventId: id, existing: existing || null },
    };
  }

  return {
    op,
    risk: "R2",
    exactEffect: `未知日历操作 ${op}`,
    mutation: null,
    error: "unknown_op",
  };
}

export const calendarCrudCapability = {
  id: "calendar-crud",
  label: "本地日历读写",
  risk: "R2",
  description: "读取空闲时间、预览后创建/更新/删除本地日历事件（可挂接小手机日历）。",

  validateInput(input = {}) {
    const op = String(input.op || "create").toLowerCase();
    const allowed = ["create", "update", "delete", "list", "free"];
    if (!allowed.includes(op)) return { ok: false, reason: "unknown_op" };

    if (op === "create") {
      const hasText = String(input.text || "").trim();
      const hasTitle = String(input.title || "").trim();
      if (!hasText && !hasTitle) return { ok: false, reason: "empty_create" };
    }
    if (op === "update" || op === "delete") {
      if (!String(input.eventId || input.id || "").trim()) {
        return { ok: false, reason: "missing_event_id" };
      }
    }
    if (op === "free" && input.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) {
      return { ok: false, reason: "invalid_date" };
    }

    return {
      ok: true,
      value: {
        op,
        text: String(input.text || ""),
        title: String(input.title || ""),
        date: String(input.date || ""),
        time: String(input.time || ""),
        prompt: String(input.prompt || ""),
        eventId: String(input.eventId || input.id || ""),
        nowIso: input.nowIso ? String(input.nowIso) : "",
        characterId: String(input.characterId || ""),
      },
    };
  },

  plan(intent) {
    const op = String(intent?.input?.op || "create");
    const write = WRITE_OPS.has(op);
    return {
      nodes: [
        {
          id: "calcrud1",
          stepId: "calcrud1",
          capabilityId: "calendar-crud",
          label: write ? "预览并写入本地日历" : "读取本地日历",
          risk: write ? "R2" : "R0",
          requiresApproval: write,
          inputSummary: `操作 ${op}`,
          effectSummary: write ? "确认后变更本地日历" : "只读查询",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    const preview = buildCalendarMutationPreview(input);
    return {
      exactEffect: preview.exactEffect,
      dataUsed: [`操作 ${preview.op}`, ...(preview.mutation ? ["本地日历事件"] : ["本地日历只读"])],
      affects: WRITE_OPS.has(preview.op) ? ["本地日历", "任务产物"] : ["无写入"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason, claimedCompleted: false };

    if (ctx.attemptExternalWrite || ctx.forceExternalCalendarApi) {
      recordWriteAttempt({
        kind: "external",
        authorized: Boolean(ctx.externalAuthorized),
        detail: "calendar-crud blocked real calendar API",
        taskId: ctx.taskId || "",
      });
      if (!ctx.externalAuthorized) {
        return { ok: false, reason: "unauthorized_external_write", claimedCompleted: false };
      }
    }

    const preview = buildCalendarMutationPreview(validated.value);
    const isWrite = WRITE_OPS.has(preview.op);

    if (!isWrite) {
      const artifact = {
        id: newId("calread"),
        kind: "calendar-read",
        capabilityId: "calendar-crud",
        op: preview.op,
        events: preview.events || null,
        freeSlots: preview.freeSlots || null,
        createdAt: nowIso(),
        taskId: ctx.taskId || "",
        undoable: false,
      };
      saveArtifact(artifact);
      return {
        ok: true,
        artifactId: artifact.id,
        artifact,
        preview,
        summary: preview.exactEffect,
        claimedCompleted: true,
      };
    }

    if (!ctx.approved) {
      return { ok: false, reason: "approval_required", preview, claimedCompleted: false };
    }

    if (preview.error === "unknown_op") {
      return { ok: false, reason: "unknown_op", claimedCompleted: false };
    }

    if (preview.op === "update" && !preview.mutation?.existing) {
      return { ok: false, reason: "event_not_found", claimedCompleted: false };
    }
    if (preview.op === "delete" && !preview.mutation?.existing) {
      return { ok: false, reason: "event_not_found", claimedCompleted: false };
    }

    let event = null;
    let undoneId = null;
    if (preview.op === "create") {
      event = addLocalEvent(preview.mutation);
    } else if (preview.op === "update") {
      event = updateLocalEvent(preview.mutation.eventId, preview.mutation.patch);
      if (!event) return { ok: false, reason: "event_not_found", claimedCompleted: false };
    } else if (preview.op === "delete") {
      undoneId = preview.mutation.eventId;
      const removed = removeLocalEvent(preview.mutation.eventId);
      if (!removed) return { ok: false, reason: "event_not_found", claimedCompleted: false };
      event = preview.mutation.existing;
    }

    const artifact = {
      id: newId("calcrud"),
      kind: "calendar-mutation",
      capabilityId: "calendar-crud",
      op: preview.op,
      previewExactEffect: preview.exactEffect,
      event,
      eventId: event?.id || undoneId,
      characterId: validated.value.characterId || ctx.characterId || "",
      status: "applied",
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `calendar-crud:${preview.op}:${artifact.eventId}`,
      taskId: ctx.taskId || "",
    });

    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      event,
      summary: `已${preview.op === "delete" ? "删除" : preview.op === "update" ? "更新" : "创建"}本地日历事件`,
      claimedCompleted: true,
    };
  },

  compensates(artifact) {
    const a = typeof artifact === "string" ? getArtifact(artifact) : artifact;
    if (!a) return { ok: false, reason: "missing_artifact" };
    if (a.op === "create" && a.eventId) {
      removeLocalEvent(a.eventId);
      return { ok: true, action: "delete_event", eventId: a.eventId };
    }
    if (a.op === "delete" && a.event) {
      const restored = addLocalEvent(a.event);
      return { ok: true, action: "restore_event", eventId: restored.id };
    }
    return { ok: true, action: "manual_review", message: "更新类撤销需对照审计手动恢复" };
  },
};

function formatYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
