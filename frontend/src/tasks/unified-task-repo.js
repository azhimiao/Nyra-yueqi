/**
 * Unified Task Repository (R4) — sole task authority.
 */
import { createUnifiedTaskV1, validateUnifiedTaskV1, mintId } from "../contracts/index.js";
import { onTaskStatusChanged } from "../memory/adapters/task.js";

export const UNIFIED_TASK_KEY = "yueqi.unified.tasks.v1";

let testStorage = null;
export function __setUnifiedTaskStorageForTests(storage) { testStorage = storage; }

function ls() {
  if (testStorage) return testStorage;
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function readBag() {
  try {
    const raw = ls()?.getItem(UNIFIED_TASK_KEY);
    const bag = raw ? JSON.parse(raw) : null;
    if (!bag || typeof bag !== "object") return { schemaVersion: 1, tasks: [] };
    if (!Array.isArray(bag.tasks)) bag.tasks = [];
    return bag;
  } catch { return { schemaVersion: 1, tasks: [] }; }
}

function writeBag(bag) {
  try { ls()?.setItem(UNIFIED_TASK_KEY, JSON.stringify(bag)); return { ok: true }; }
  catch (e) { return { ok: false, reason: e?.message || "write_failed" }; }
}

export function createTask(input = {}) {
  const task = createUnifiedTaskV1({
    ...input,
    taskId: input.taskId || mintId("taskId"),
    idempotencyKey: String(input.idempotencyKey || "").trim() || mintId("taskId", "idem"),
    state: input.state || "draft",
  });
  const v = validateUnifiedTaskV1(task);
  if (!v.ok) return { ok: false, reason: "invalid_task", errors: v.errors };
  const bag = readBag();
  const idx = bag.tasks.findIndex((t) => t.idempotencyKey === task.idempotencyKey);
  if (idx >= 0) {
    return { ok: true, value: bag.tasks[idx], deduped: true };
  }
  bag.tasks.unshift(task);
  if (bag.tasks.length > 2000) bag.tasks.length = 2000;
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  try {
    onTaskStatusChanged(task, { op: "created", state: task.state });
  } catch {
    /* adapter projection non-fatal */
  }
  return { ok: true, value: task, deduped: false };
}

export function transitionTask(taskId, state, patch = {}) {
  const bag = readBag();
  const task = bag.tasks.find((t) => t.taskId === taskId);
  if (!task) return { ok: false, reason: "not_found" };
  const prevState = task.state;
  task.state = state;
  task.updatedAt = new Date().toISOString();
  Object.assign(task, patch);
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
  try {
    onTaskStatusChanged(task, { state, prevState });
  } catch {
    /* adapter projection non-fatal */
  }
  return { ok: true, value: task };
}

export function getTask(taskId) {
  return readBag().tasks.find((t) => t.taskId === taskId) || null;
}

export function listTasks({ limit = 50 } = {}) {
  return readBag().tasks.slice(0, Math.max(1, Math.min(200, Number(limit) || 50)));
}

export function clearUnifiedTasksForTests() {
  writeBag({ schemaVersion: 1, tasks: [] });
}
