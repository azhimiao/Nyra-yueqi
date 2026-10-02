/**
 * P4 Daily briefing — schedule/goals/projects/relation; respects OFF switch everywhere.
 * Risk R1 (local generate). Disabled users must not receive briefing via any entry.
 */

import { newId, nowIso } from "../schema.js";
import { saveArtifact, recordWriteAttempt } from "../task-store.js";
import { assertBriefingAllowed, isDailyBriefingEnabled } from "./prefs.js";
import { listLocalEvents } from "./local-calendar-store.js";

/**
 * All public entry points must funnel here.
 * @param {Record<string, unknown>} input
 * @param {Record<string, unknown>} [ctx]
 */
export function generateDailyBriefing(input = {}, ctx = {}) {
  const gate = assertBriefingAllowed();
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      claimedCompleted: false,
      bypassAttempt: Boolean(ctx.bypassBriefingPref || input.forceBriefing),
      blocked: true,
    };
  }

  // Explicit bypass attempts are rejected even if somehow prefs were ignored above
  if (ctx.bypassBriefingPref || input.forceBriefing) {
    if (!isDailyBriefingEnabled()) {
      return {
        ok: false,
        reason: "briefing_disabled",
        claimedCompleted: false,
        bypassAttempt: true,
        blocked: true,
      };
    }
  }

  const date = String(input.date || formatYmd(new Date()));
  const goals = Array.isArray(input.goals) ? input.goals.map(String) : [];
  const projects = Array.isArray(input.projects) ? input.projects.map(String) : [];
  const relationNote = String(input.relationNote || "").trim();
  const events = listLocalEvents().filter((e) => e.date === date);

  /** @type {{ id: string, text: string, source: string }[]} */
  const sections = [];
  sections.push({
    id: "cal",
    text: events.length
      ? `今日日程 ${events.length} 项：${events.map((e) => `${e.time} ${e.title}`).join("；")}`
      : "今日暂无本地日程。",
    source: "local-calendar",
  });
  if (goals.length) {
    sections.push({
      id: "goals",
      text: `目标：${goals.slice(0, 5).join("、")}`,
      source: "user-goals",
    });
  }
  if (projects.length) {
    sections.push({
      id: "projects",
      text: `项目：${projects.slice(0, 5).join("、")}`,
      source: "user-projects",
    });
  }
  if (relationNote) {
    sections.push({
      id: "relation",
      text: `关系提醒：${relationNote.slice(0, 120)}`,
      source: "relation",
    });
  }

  // Optional context graph hooks
  const contextBits = Array.isArray(ctx.contextSnippets) ? ctx.contextSnippets : [];
  for (const bit of contextBits.slice(0, 3)) {
    sections.push({
      id: `ctx-${bit.id || sections.length}`,
      text: String(bit.summary || bit.content || "").slice(0, 100),
      source: String(bit.source || "context-graph"),
    });
  }

  const briefing = {
    date,
    title: `每日简报 · ${date}`,
    sections,
    traceable: sections.every((s) => Boolean(s.source)),
    generatedAt: nowIso(),
  };

  return {
    ok: true,
    reason: null,
    briefing,
    claimedCompleted: false, // only execute marks complete after artifact save
    blocked: false,
  };
}

/**
 * Proactive / task-center / scheduler entry — must not bypass OFF.
 * @param {Record<string, unknown>} input
 * @param {Record<string, unknown>} [ctx]
 */
export function requestBriefingFromEntry(entry, input = {}, ctx = {}) {
  const gate = assertBriefingAllowed();
  if (!gate.ok) {
    return {
      ok: false,
      reason: "briefing_disabled",
      entry: String(entry || "unknown"),
      claimedCompleted: false,
      blocked: true,
    };
  }
  return {
    ...generateDailyBriefing(input, ctx),
    entry: String(entry || "direct"),
  };
}

export const dailyBriefingCapability = {
  id: "daily-briefing",
  label: "每日简报",
  risk: "R1",
  description: "基于日程、目标、项目与关系生成可追溯简报；关闭后任何入口不得绕过。",

  validateInput(input = {}) {
    if (input.forceBriefing === true) {
      // Still allow the intent to be created so execute can reject with clear reason
    }
    return {
      ok: true,
      value: {
        date: String(input.date || ""),
        goals: Array.isArray(input.goals) ? input.goals.map(String) : [],
        projects: Array.isArray(input.projects) ? input.projects.map(String) : [],
        relationNote: String(input.relationNote || ""),
        characterId: String(input.characterId || ""),
        entry: String(input.entry || "task"),
        forceBriefing: Boolean(input.forceBriefing),
      },
    };
  },

  plan() {
    return {
      nodes: [
        {
          id: "brief1",
          stepId: "brief1",
          capabilityId: "daily-briefing",
          label: "生成每日简报",
          risk: "R1",
          requiresApproval: false,
          inputSummary: "日程/目标/项目/关系",
          effectSummary: "本地简报产物（尊重关闭开关）",
        },
      ],
      edges: [],
    };
  },

  previewEffect(input) {
    if (!isDailyBriefingEnabled()) {
      return {
        exactEffect: "简报已关闭：不会生成内容",
        dataUsed: [],
        affects: ["无"],
      };
    }
    const date = input.date || formatYmd(new Date());
    return {
      exactEffect: `生成 ${date} 每日简报（可追溯来源，本地）`,
      dataUsed: ["本地日历", "目标", "项目", "关系备注"],
      affects: ["本地简报产物"],
    };
  },

  execute(input, ctx = {}) {
    const validated = this.validateInput(input);
    if (!validated.ok) return { ok: false, reason: validated.reason, claimedCompleted: false };

    // Entry-point gate (task / proactive / center / force)
    const entryResult = requestBriefingFromEntry(
      validated.value.entry || ctx.entry || "task",
      validated.value,
      { ...ctx, bypassBriefingPref: validated.value.forceBriefing || ctx.bypassBriefingPref },
    );

    if (!entryResult.ok) {
      return {
        ok: false,
        reason: entryResult.reason,
        claimedCompleted: false,
        blocked: true,
        entry: entryResult.entry,
      };
    }

    if (ctx.attemptExternalWrite) {
      recordWriteAttempt({
        kind: "external",
        authorized: false,
        detail: "daily-briefing refused external write",
        taskId: ctx.taskId || "",
      });
      return { ok: false, reason: "unauthorized_external_write", claimedCompleted: false };
    }

    const { briefing } = entryResult;
    if (!briefing?.traceable) {
      return { ok: false, reason: "not_traceable", claimedCompleted: false };
    }

    const artifact = {
      id: newId("brief"),
      kind: "daily-briefing",
      capabilityId: "daily-briefing",
      characterId: validated.value.characterId || ctx.characterId || "",
      date: briefing.date,
      title: briefing.title,
      sections: briefing.sections,
      entry: entryResult.entry,
      createdAt: nowIso(),
      taskId: ctx.taskId || "",
      undoable: true,
    };
    saveArtifact(artifact);
    recordWriteAttempt({
      kind: "local",
      authorized: true,
      detail: `briefing:${artifact.id}`,
      taskId: ctx.taskId || "",
    });
    return {
      ok: true,
      artifactId: artifact.id,
      artifact,
      briefing,
      summary: briefing.title,
      claimedCompleted: true,
    };
  },

  compensates(artifact) {
    return {
      ok: true,
      action: "delete_artifact",
      artifactId: artifact?.id,
      message: "可删除该简报",
    };
  },
};

function formatYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
