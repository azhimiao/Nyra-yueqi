/**
 * AssistantTask persistence — localStorage; not memory-only.
 */

const STORAGE_KEY = "yueqi.assist.agent.tasks.v1";

/** @typedef {
 *   | "CREATED"
 *   | "PREPARING"
 *   | "RUNNING"
 *   | "WAITING_FOR_APPROVAL"
 *   | "COMMITTING"
 *   | "VERIFYING"
 *   | "SUCCEEDED"
 *   | "FAILED"
 *   | "CANCELED"
 *   | "PAUSED"
 *   | "EXTERNAL_BACKEND_REQUIRED"
 * } AssistantTaskStatus
 */

/**
 * @typedef {object} AuthorizedResource
 * @property {"character"|"worldbook"|"scenario"|"theme"|"workspace-file"} type
 * @property {string} resourceId
 * @property {"read"|"propose-write"} access
 */

/**
 * @typedef {object} AssistantTaskCheckpoint
 * @property {string} [step]
 * @property {string[]} completedSideEffects
 * @property {Record<string, unknown>} [payload]
 */

/**
 * @typedef {object} AssistantTask
 * @property {string} id
 * @property {string} userId
 * @property {string} [characterId]
 * @property {string} title
 * @property {string} instruction
 * @property {AssistantTaskStatus} status
 * @property {AuthorizedResource[]} authorizedResources
 * @property {string[]} requiredCapabilities
 * @property {string} [workspaceId]
 * @property {AssistantTaskCheckpoint} [checkpoint]
 * @property {string[]} artifactIds
 * @property {string} [stepSummary]
 * @property {object} [candidate]
 * @property {object} [diff]
 * @property {string} [failureCode]
 * @property {string} [failureMessage]
 * @property {string} [commitResultId]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

function nowIso() {
  return new Date().toISOString();
}

function readAll() {
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-80)));
    }
  } catch {
    /* quota */
  }
}

/** In-memory mirror for Node tests without localStorage */
const memoryFallback = new Map();

function useMemory() {
  return typeof localStorage === "undefined";
}

/**
 * @param {Partial<AssistantTask> & { title: string, instruction: string }} input
 * @returns {AssistantTask}
 */
export function createAssistantTask(input) {
  const id = input.id || `atask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  /** @type {AssistantTask} */
  const task = {
    id,
    userId: input.userId || "local",
    characterId: input.characterId,
    title: String(input.title || "助手任务"),
    instruction: String(input.instruction || ""),
    status: input.status || "CREATED",
    authorizedResources: Array.isArray(input.authorizedResources)
      ? [...input.authorizedResources]
      : [],
    requiredCapabilities: Array.isArray(input.requiredCapabilities)
      ? [...input.requiredCapabilities]
      : [],
    workspaceId: input.workspaceId,
    checkpoint: input.checkpoint || { completedSideEffects: [] },
    artifactIds: Array.isArray(input.artifactIds) ? [...input.artifactIds] : [],
    stepSummary: input.stepSummary || "",
    candidate: input.candidate,
    diff: input.diff,
    failureCode: input.failureCode,
    failureMessage: input.failureMessage,
    commitResultId: input.commitResultId,
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  if (useMemory()) {
    memoryFallback.set(task.id, task);
    return structuredClone(task);
  }
  const rows = readAll();
  rows.push(task);
  writeAll(rows);
  return structuredClone(task);
}

/**
 * @param {string} id
 * @returns {AssistantTask|null}
 */
export function getAssistantTask(id) {
  const key = String(id || "");
  if (useMemory()) {
    const t = memoryFallback.get(key);
    return t ? structuredClone(t) : null;
  }
  return readAll().find((t) => t.id === key) || null;
}

/**
 * @param {string} id
 * @param {Partial<AssistantTask>} patch
 * @returns {AssistantTask|null}
 */
export function updateAssistantTask(id, patch) {
  const key = String(id || "");
  if (useMemory()) {
    const prev = memoryFallback.get(key);
    if (!prev) return null;
    const next = { ...prev, ...patch, id: key, updatedAt: nowIso() };
    memoryFallback.set(key, next);
    return structuredClone(next);
  }
  const rows = readAll();
  const idx = rows.findIndex((t) => t.id === key);
  if (idx < 0) return null;
  rows[idx] = { ...rows[idx], ...patch, id: key, updatedAt: nowIso() };
  writeAll(rows);
  return structuredClone(rows[idx]);
}

/**
 * @returns {AssistantTask[]}
 */
export function listAssistantTasks() {
  if (useMemory()) return [...memoryFallback.values()].map((t) => structuredClone(t));
  return readAll().map((t) => structuredClone(t));
}

/** Test helper */
export function clearAssistantTasksForTests() {
  memoryFallback.clear();
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}

export { STORAGE_KEY as ASSISTANT_TASK_STORAGE_KEY };
