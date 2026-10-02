from pathlib import Path

root = Path(r"f:/beautiful")

files = {
    "src/agent-orchestrator/index.js": r'''/**
 * Agent Orchestrator (R4) — single routing entry for user input.
 */
export const ROUTE_KINDS = Object.freeze([
  "companion_chat",
  "direct_action",
  "agent_session",
  "unified_task",
  "experience",
]);

/**
 * @param {{
 *   text?: string,
 *   agentId?: string,
 *   skillId?: string,
 *   experienceId?: string,
 *   intent?: string,
 *   requiresTools?: boolean,
 *   multiStep?: boolean,
 * }} input
 */
export function routeUserInput(input = {}) {
  const text = String(input.text || "").trim();
  const agentId = String(input.agentId || "").trim();
  const skillId = String(input.skillId || "").trim();
  const experienceId = String(input.experienceId || "").trim();
  const intent = String(input.intent || "").trim();

  if (experienceId || intent === "experience") {
    return { ok: true, route: "experience", experienceId, agentId, skillId };
  }
  if (input.multiStep || input.requiresTools) {
    return { ok: true, route: "unified_task", agentId, skillId, reason: "multi_step_or_tools" };
  }
  if (agentId || skillId) {
    return { ok: true, route: "agent_session", agentId, skillId };
  }
  if (intent === "direct_action") {
    return { ok: true, route: "direct_action", agentId: "", skillId: "" };
  }
  return {
    ok: true,
    route: "companion_chat",
    agentId: "",
    skillId: "",
    createTask: false,
    text,
  };
}

export function normalizeAgentSessionPolicy(input = {}) {
  return {
    mode: ["isolated_copy", "shared_session"].includes(input.mode) ? input.mode : "isolated_copy",
    readGlobalMemory: input.readGlobalMemory !== false,
    writeBackCandidates: Boolean(input.writeBackCandidates),
    writeBackMode: ["none", "summary", "candidates"].includes(input.writeBackMode)
      ? input.writeBackMode
      : (input.writeBackCandidates ? "candidates" : "none"),
  };
}
''',
    "src/tasks/unified-task-repo.js": r'''/**
 * Unified Task Repository (R4) — sole task authority.
 */
import { createUnifiedTaskV1, validateUnifiedTaskV1, mintId } from "../contracts/index.js";

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
  return { ok: true, value: task, deduped: false };
}

export function transitionTask(taskId, state, patch = {}) {
  const bag = readBag();
  const task = bag.tasks.find((t) => t.taskId === taskId);
  if (!task) return { ok: false, reason: "not_found" };
  task.state = state;
  task.updatedAt = new Date().toISOString();
  Object.assign(task, patch);
  const saved = writeBag(bag);
  if (!saved.ok) return saved;
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
''',
    "src/policy/engine.js": r'''/**
 * Policy Engine (R4) — evaluate grants before writes / tools.
 */
export function evaluatePolicy(input = {}) {
  const capabilityId = String(input.capabilityId || "").trim();
  const granted = Array.isArray(input.grantedCapabilities)
    ? input.grantedCapabilities.map(String)
    : [];
  const approvalState = String(input.approvalState || "");
  const osPermission = input.osPermission !== false;

  if (!capabilityId) return { ok: false, allow: false, reason: "missing_capability" };
  if (!osPermission) return { ok: false, allow: false, reason: "os_permission_missing" };
  if (!granted.includes(capabilityId)) {
    return { ok: false, allow: false, reason: "grant_missing" };
  }
  if (input.requiresApproval && approvalState !== "approved") {
    return { ok: false, allow: false, reason: "approval_required", next: "awaiting_approval" };
  }
  return {
    ok: true,
    allow: true,
    reason: "allowed",
    chain: ["inspect", "proposal", "diff", "policy", "approval_or_grant", "execute", "audit"],
  };
}

export function evaluateDirectAction(input = {}) {
  return evaluatePolicy({ ...input, requiresApproval: Boolean(input.requiresApproval) });
}
''',
}

for rel, content in files.items():
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("wrote", rel)
print("ok")
