/**
 * TaskStateProjection
 * Projects Agent task lifecycle into host bubble states: waiting | running | done | blocked.
 */

import { HOST_SCHEMA_VERSION, HOST_TASK_STATES } from "./constants.js";

/** Agent → host projection map */
export const AGENT_TO_HOST_STATE = Object.freeze({
  draft: "waiting",
  proposed: "waiting",
  awaiting_approval: "waiting",
  running: "running",
  paused: "blocked",
  completed: "done",
  failed: "blocked",
  cancelled: "done",
});

const HOST_LABELS = Object.freeze({
  waiting: "等待中",
  running: "进行中",
  done: "已完成",
  blocked: "需处理",
});

/**
 * @param {string} agentState
 * @returns {"waiting"|"running"|"done"|"blocked"}
 */
export function mapAgentStateToHost(agentState) {
  const mapped = AGENT_TO_HOST_STATE[agentState];
  return HOST_TASK_STATES.includes(mapped) ? mapped : "blocked";
}

/**
 * @typedef {{
 *   schemaVersion: number,
 *   taskId: string,
 *   characterId: string,
 *   agentState: string,
 *   state: "waiting"|"running"|"done"|"blocked",
 *   label: string,
 *   title: string,
 *   bubbleText: string,
 *   updatedAt: string,
 * }} TaskStateProjection
 */

/**
 * Build a host-facing projection from an agent task (or partial).
 * @param {{
 *   id?: string,
 *   taskId?: string,
 *   characterId?: string,
 *   state?: string,
 *   intent?: { title?: string, characterId?: string, summary?: string },
 *   title?: string,
 *   summary?: string,
 *   updatedAt?: string,
 *   outcome?: { message?: string },
 * }} task
 * @returns {TaskStateProjection}
 */
export function projectTaskState(task = {}) {
  const agentState = String(task.state || "draft");
  const state = mapAgentStateToHost(agentState);
  const title =
    String(task.intent?.title || task.title || "").trim() ||
    "任务";
  const summary = String(task.intent?.summary || task.summary || task.outcome?.message || "").trim();
  const bubbleText = buildBubbleText(state, title, summary);
  return {
    schemaVersion: HOST_SCHEMA_VERSION,
    taskId: String(task.id || task.taskId || ""),
    characterId: String(task.characterId || task.intent?.characterId || ""),
    agentState,
    state,
    label: HOST_LABELS[state],
    title,
    bubbleText,
    updatedAt: String(task.updatedAt || new Date().toISOString()),
  };
}

/**
 * @param {"waiting"|"running"|"done"|"blocked"} state
 * @param {string} title
 * @param {string} summary
 */
export function buildBubbleText(state, title, summary) {
  const short = summary ? truncate(summary, 48) : truncate(title, 48);
  switch (state) {
    case "waiting":
      return `等你确认：${short}`;
    case "running":
      return `正在做：${short}`;
    case "done":
      return `做完了：${short}`;
    case "blocked":
      return `卡住了：${short}`;
    default:
      return short;
  }
}

function truncate(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Project a list of tasks for tray / notification strips.
 * Prefer waiting → running → blocked → done.
 * @param {object[]} tasks
 * @param {{ limit?: number }} [opts]
 */
export function projectTaskList(tasks = [], opts = {}) {
  const limit = Number.isInteger(opts.limit) ? opts.limit : 5;
  const order = { waiting: 0, running: 1, blocked: 2, done: 3 };
  const projected = (Array.isArray(tasks) ? tasks : [])
    .map((t) => projectTaskState(t))
    .filter((p) => p.taskId)
    .sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));
  return projected.slice(0, Math.max(0, limit));
}

export function isHostTaskState(value) {
  return HOST_TASK_STATES.includes(value);
}
