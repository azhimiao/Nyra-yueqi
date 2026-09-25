/**
 * Unified Task FeatureMemoryAdapter — lifecycle Timeline on status changes.
 * Does not own task state (Unified Task Repository remains authority).
 */

import { createSourceRefV1 } from "../../contracts/source-ref-v1.js";
import { mintId } from "../../contracts/ids.js";
import { isFeatureEnabled } from "../../features/flags.js";
import { appendTimelineEvent } from "../../timeline/repository.js";
import { freezeCompanionScope, relationshipIdFor } from "../companion-scope.js";
import { createFeatureMemoryAdapter } from "./contract.js";
import { registerFeatureMemoryAdapter } from "./registry.js";

export const TASK_ADAPTER_FEATURE_ID = "task";

const STATE_TO_LIFECYCLE = Object.freeze({
  created: "task.created",
  draft: "task.created",
  awaiting_approval: "task.created",
  approved: "task.created",
  succeeded: "task.completed",
  completed: "task.completed",
  cancelled: "task.cancelled",
  canceled: "task.cancelled",
});

let registered = false;

function adaptersEnabled() {
  try {
    return isFeatureEnabled("unifiedMemoryAdaptersV1") === true;
  } catch {
    return false;
  }
}

function taskScope(task, scope = {}) {
  const companionId = String(
    scope.companionId || task?.companionId || task?.characterId || "",
  ).trim();
  const userId = String(scope.userId || task?.userId || "local").trim() || "local";
  return freezeCompanionScope({
    userId,
    companionId,
    relationshipId:
      scope.relationshipId
      || task?.relationshipId
      || relationshipIdFor(userId, companionId),
  });
}

/**
 * @param {object} task
 * @param {{ sourceVersion?: number, scope?: object }} [meta]
 */
export function getTaskSourceRef(task, meta = {}) {
  if (!task || typeof task !== "object") return null;
  const sourceId = String(task.taskId || task.id || "").trim();
  if (!sourceId) return null;
  const scope = taskScope(task, meta.scope || {});
  const sourceVersion = Number(meta.sourceVersion || task.sourceVersion || 1) || 1;
  const title = String(task.title || "").trim();
  const state = String(task.state || "").trim();
  const contentHash =
    String(task.contentHash || "").trim()
    || `${sourceId}:v${sourceVersion}:${state}:${title}`;
  return createSourceRefV1({
    sourceType: "unified_task",
    sourceId,
    sourceVersion,
    companionId: scope.companionId,
    relationshipId: scope.relationshipId,
    userId: scope.userId,
    realityNamespace: String(task.realityNamespace || "reality"),
    occurredAt: String(task.updatedAt || task.createdAt || new Date().toISOString()),
    visibility: String(task.visibility || "private"),
    contentHash,
  });
}

function resolveTaskLifecycle(opOrState) {
  const key = String(opOrState || "").trim().toLowerCase();
  return STATE_TO_LIFECYCLE[key] || "";
}

/**
 * @param {object} task
 * @param {object} [scope]
 * @param {{ op?: string, state?: string, sourceVersion?: number }} [meta]
 */
export function emitTaskLifecycle(task, scope = {}, meta = {}) {
  const frozen = taskScope(task, scope);
  if (!frozen.companionId) {
    return { ok: false, reason: "missing_companionId", events: [] };
  }
  const eventType =
    resolveTaskLifecycle(meta.op)
    || resolveTaskLifecycle(meta.state)
    || resolveTaskLifecycle(task.state);
  if (!eventType) {
    return { ok: true, skipped: true, reason: "no_lifecycle_for_state", events: [] };
  }
  const sourceRef = getTaskSourceRef(task, { ...meta, scope: frozen });
  if (!sourceRef) return { ok: false, reason: "missing_source_ref", events: [] };

  const idempotencyKey = `task:${sourceRef.sourceId}:${eventType.split(".").pop()}`;
  const status =
    eventType === "task.cancelled"
      ? "cancelled"
      : eventType === "task.completed"
        ? "completed"
        : "confirmed";

  const result = appendTimelineEvent({
    eventId: mintId("eventId", "task"),
    eventType,
    source: "task_adapter",
    sourceId: sourceRef.sourceId,
    idempotencyKey,
    actor: frozen.companionId,
    principal: frozen.userId,
    companionId: frozen.companionId,
    userId: frozen.userId,
    relationshipId: frozen.relationshipId,
    realityNamespace: sourceRef.realityNamespace,
    occurredAt: sourceRef.occurredAt,
    visibility: sourceRef.visibility,
    status,
    kind: "task",
    title: String(task.title || "").trim(),
    payload: {
      summary: eventType,
      taskId: sourceRef.sourceId,
      state: String(task.state || meta.state || ""),
      title: String(task.title || "").trim(),
      sourceVersion: sourceRef.sourceVersion,
      sourceRef,
    },
    evidenceRefs: [`task:${sourceRef.sourceId}:v${sourceRef.sourceVersion}`],
  });

  return {
    ok: result.ok !== false,
    events: result.ok ? [result.value] : [],
    result,
    sourceRef,
    eventType,
  };
}

/**
 * Called after UnifiedTask create / status transition when adapters flag is on.
 *
 * @param {object} task
 * @param {{
 *   op?: string,
 *   state?: string,
 *   prevState?: string,
 *   scope?: object,
 *   force?: boolean,
 * }} [opts]
 */
export function onTaskStatusChanged(task, opts = {}) {
  if (!adaptersEnabled() && opts.force !== true) {
    return { ok: true, skipped: true, reason: "flag_off" };
  }
  ensureTaskAdapterRegistered();
  const scope = opts.scope || taskScope(task);
  const op = opts.op || (opts.prevState == null && !opts.state ? "created" : "");
  return emitTaskLifecycle(task, scope, {
    op,
    state: opts.state || task?.state,
  });
}

export function ensureTaskAdapterRegistered() {
  if (registered) return taskFeatureMemoryAdapter;
  registerFeatureMemoryAdapter(TASK_ADAPTER_FEATURE_ID, taskFeatureMemoryAdapter);
  registered = true;
  return taskFeatureMemoryAdapter;
}

export function __resetTaskAdapterRegistrationForTests() {
  registered = false;
}

export const taskFeatureMemoryAdapter = createFeatureMemoryAdapter({
  featureId: TASK_ADAPTER_FEATURE_ID,
  getSourceRef: (change) => getTaskSourceRef(change),
  emitTimelineEvents: (change, scope) =>
    emitTaskLifecycle(change, scope, { op: change?.op, state: change?.state }),
  submitUnderstandingCandidates: async () => ({ ok: true, candidates: [], stub: true }),
  buildIndexDocuments: async () => [],
  handleSourceTombstone: (change, scope) =>
    emitTaskLifecycle(
      { taskId: change?.sourceId || change?.taskId, ...change, state: "cancelled" },
      scope,
      { op: "cancelled" },
    ),
  rebuildForSource: async () => ({ ok: true, skipped: true }),
  onSave: (change, scope, opts) =>
    onTaskStatusChanged(change, { ...opts, scope, state: change?.state }),
});
