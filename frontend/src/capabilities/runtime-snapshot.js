/**
 * One immutable capability view for a model turn. Prompt claims and the tools
 * request are projections of this same snapshot.
 */

import {
  listCapabilityOperations,
  resolveOperationAvailability,
} from "./operation-registry-v2.js";

export const CAPABILITY_RUNTIME_SNAPSHOT_VERSION = 1;

function freezeRows(rows) {
  return Object.freeze(rows.map((row) => Object.freeze({
    ...row,
    reasonCodes: Object.freeze([...(row.reasonCodes || [])]),
    inputSchema: Object.freeze({ ...(row.inputSchema || {}) }),
    outputSchema: Object.freeze({ ...(row.outputSchema || {}) }),
  })));
}

export function buildCapabilityRuntimeSnapshot(runtime = {}, opts = {}) {
  const operations = listCapabilityOperations().map((operation) => {
    const availability = resolveOperationAvailability(operation, runtime);
    return {
      capabilityId: operation.capabilityId,
      operation: operation.operation,
      operationId: `${operation.capabilityId}.${operation.operation}`,
      known: availability.discoverable,
      requestable: availability.requestable,
      executable: availability.executable,
      reasonCodes: availability.reasonCodes,
      risk: operation.risk,
      approval: operation.approval,
      executorId: operation.executorId,
      inputSchema: operation.inputSchema,
      outputSchema: operation.outputSchema,
    };
  });
  const snapshot = {
    version: CAPABILITY_RUNTIME_SNAPSHOT_VERSION,
    snapshotId: String(opts.snapshotId || `cap-${Date.now().toString(36)}`),
    capturedAt: String(opts.capturedAt || new Date().toISOString()),
    runtime: Object.freeze({
      platform: String(runtime.platform || "web"),
      networkOnline: runtime.networkOnline === true || runtime.network === true,
      foreground: runtime.foreground === true,
      featureFlags: Object.freeze({ ...(runtime.featureFlags || runtime.flags || {}) }),
    }),
    operations: freezeRows(operations),
  };
  return Object.freeze(snapshot);
}

export function operationRowsFromCapabilitySnapshot(snapshot, { requestableOnly = false } = {}) {
  const rows = Array.isArray(snapshot?.operations) ? snapshot.operations : [];
  return rows.filter((row) => !requestableOnly || row.requestable === true);
}

export function formatCapabilityRuntimeSnapshot(snapshot, lang = "zh-CN", operationIds = []) {
  const ids = new Set((Array.isArray(operationIds) ? operationIds : []).map(String));
  const rows = operationRowsFromCapabilitySnapshot(snapshot)
    .filter((row) => ids.size > 0 && ids.has(row.operationId) && row.known)
    .map((row) => {
      const status = row.executable ? "executable" : (row.requestable ? "requestable" : "known");
      const reasons = row.reasonCodes?.length ? `; reasons=${row.reasonCodes.join("|")}` : "";
      return `- ${row.operationId}: ${status}; risk=${row.risk}; approval=${row.approval}${reasons}`;
    });
  if (!rows.length) return "";
  const english = String(lang || "").toLowerCase().startsWith("en");
  return [
    english ? "[Relevant capability state]" : "【本轮相关能力状态】",
    ...rows,
    english
      ? "Known or requestable is not success. Only a successful ToolRun receipt proves completion."
      : "已知或可请求都不等于成功；只有成功的 ToolRun 回执能证明完成。",
  ].join("\n");
}

