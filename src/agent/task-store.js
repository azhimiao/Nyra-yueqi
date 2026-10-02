/**
 * Agent task persistence — localStorage `yueqi.agent.tasks.v1`.
 * Works in browser + Node (memory / injected storage).
 */

import { AGENT_SCHEMA_VERSION, AGENT_TASKS_KEY, TERMINAL_STATES } from "./schema.js";

/**
 * @typedef {{
 *   schemaVersion: number,
 *   tasks: Record<string, object>,
 *   artifacts: Record<string, object>,
 *   writeLog: { at: string, kind: string, authorized: boolean, detail: string, taskId: string }[],
 * }} AgentBag
 */

/** @type {AgentBag|null} */
let memoryBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setAgentStorageForTests(storage) {
  testStorage = storage;
  memoryBag = null;
}

function emptyBag() {
  return {
    schemaVersion: AGENT_SCHEMA_VERSION,
    tasks: {},
    artifacts: {},
    writeLog: [],
  };
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function readBag() {
  if (memoryBag) return memoryBag;
  const storage = ls();
  if (!storage) {
    memoryBag = emptyBag();
    return memoryBag;
  }
  try {
    const raw = storage.getItem(AGENT_TASKS_KEY);
    if (!raw) {
      memoryBag = emptyBag();
      return memoryBag;
    }
    const parsed = JSON.parse(raw);
    memoryBag = {
      schemaVersion: Number(parsed?.schemaVersion) || AGENT_SCHEMA_VERSION,
      tasks: parsed?.tasks && typeof parsed.tasks === "object" ? parsed.tasks : {},
      artifacts: parsed?.artifacts && typeof parsed.artifacts === "object" ? parsed.artifacts : {},
      writeLog: Array.isArray(parsed?.writeLog) ? parsed.writeLog : [],
    };
    return memoryBag;
  } catch {
    memoryBag = emptyBag();
    return memoryBag;
  }
}

function writeBag(bag) {
  memoryBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(AGENT_TASKS_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

export function clearAllAgentTasks() {
  memoryBag = emptyBag();
  const storage = ls();
  try {
    storage?.removeItem?.(AGENT_TASKS_KEY);
    storage?.setItem?.(AGENT_TASKS_KEY, JSON.stringify(memoryBag));
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} task
 */
export function saveTask(task) {
  if (!task?.id) return { ok: false, reason: "missing_id" };
  const bag = readBag();
  bag.tasks[task.id] = {
    ...task,
    updatedAt: new Date().toISOString(),
  };
  writeBag(bag);
  return { ok: true, value: bag.tasks[task.id] };
}

/**
 * @param {string} taskId
 */
export function getTask(taskId) {
  const id = String(taskId || "").trim();
  if (!id) return null;
  return readBag().tasks[id] || null;
}

/**
 * Find task with same idempotent key (prefer non-terminal; else latest terminal).
 * @param {string} idempotentKey
 * @param {string} [characterId]
 * @param {{ includeTerminal?: boolean }} [opts]
 */
export function findTaskByIdempotentKey(idempotentKey, characterId = "", opts = {}) {
  const key = String(idempotentKey || "").trim();
  if (!key) return null;
  const cid = String(characterId || "").trim();
  const includeTerminal = opts.includeTerminal !== false;
  const bag = readBag();
  let terminal = null;
  for (const task of Object.values(bag.tasks)) {
    if (String(task?.intent?.idempotentKey || "") !== key) continue;
    if (cid && String(task?.intent?.characterId || "") !== cid) continue;
    if (TERMINAL_STATES.includes(task.state)) {
      if (includeTerminal) {
        if (!terminal || String(task.updatedAt || "") > String(terminal.updatedAt || "")) {
          terminal = task;
        }
      }
      continue;
    }
    return task;
  }
  return terminal;
}

/**
 * @param {{ state?: string|string[], characterId?: string, limit?: number }} [opts]
 */
export function listTasks(opts = {}) {
  const bag = readBag();
  let rows = Object.values(bag.tasks);
  if (opts.characterId) {
    const cid = String(opts.characterId);
    rows = rows.filter((t) => String(t?.intent?.characterId || "") === cid);
  }
  if (opts.state) {
    const states = Array.isArray(opts.state) ? opts.state : [opts.state];
    rows = rows.filter((t) => states.includes(t.state));
  }
  rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const limit = Number(opts.limit) || 0;
  return limit > 0 ? rows.slice(0, limit) : rows;
}

/**
 * @param {object} artifact
 */
export function saveArtifact(artifact) {
  if (!artifact?.id) return { ok: false, reason: "missing_id" };
  const bag = readBag();
  bag.artifacts[artifact.id] = artifact;
  writeBag(bag);
  return { ok: true, value: artifact };
}

/**
 * @param {string} artifactId
 */
export function getArtifact(artifactId) {
  return readBag().artifacts[String(artifactId || "")] || null;
}

/**
 * @param {{ kind?: string, characterId?: string }} [opts]
 */
export function listArtifacts(opts = {}) {
  let rows = Object.values(readBag().artifacts);
  if (opts.kind) rows = rows.filter((a) => a.kind === opts.kind);
  if (opts.characterId) {
    const cid = String(opts.characterId);
    rows = rows.filter((a) => String(a.characterId || "") === cid);
  }
  rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return rows;
}

/**
 * Record a write attempt for unauthorized-external audit.
 * @param {{ kind: string, authorized: boolean, detail: string, taskId?: string }} entry
 */
export function recordWriteAttempt(entry) {
  const bag = readBag();
  bag.writeLog.push({
    at: new Date().toISOString(),
    kind: String(entry.kind || "unknown"),
    authorized: Boolean(entry.authorized),
    detail: String(entry.detail || ""),
    taskId: String(entry.taskId || ""),
  });
  writeBag(bag);
}

export function listWriteAttempts() {
  return readBag().writeLog.slice();
}

export function countUnauthorizedExternalWrites() {
  return readBag().writeLog.filter((w) => w.kind === "external" && !w.authorized).length;
}

export function exportAgentBag() {
  return structuredClone(readBag());
}

export function importAgentBag(bag) {
  if (!bag || typeof bag !== "object") return { ok: false, reason: "invalid_bag" };
  memoryBag = {
    schemaVersion: Number(bag.schemaVersion) || AGENT_SCHEMA_VERSION,
    tasks: bag.tasks && typeof bag.tasks === "object" ? bag.tasks : {},
    artifacts: bag.artifacts && typeof bag.artifacts === "object" ? bag.artifacts : {},
    writeLog: Array.isArray(bag.writeLog) ? bag.writeLog : [],
  };
  writeBag(memoryBag);
  return { ok: true };
}

export function getAgentStoreKey() {
  return AGENT_TASKS_KEY;
}
