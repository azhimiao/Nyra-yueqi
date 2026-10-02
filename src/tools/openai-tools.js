/**
 * OpenAI-compatible tool schema from CapabilityOperationV2 descriptors.
 */

import {
  listRequestableOperations,
  resolveOperationAvailability,
} from "../capabilities/operation-registry-v2.js";
import { operationRowsFromCapabilitySnapshot } from "../capabilities/runtime-snapshot.js";

export function operationToolName(capabilityId, operation) {
  return `${String(capabilityId || "").replace(/\./g, "_")}__${String(operation || "")}`;
}

export function parseOperationToolName(name) {
  const raw = String(name || "");
  const idx = raw.lastIndexOf("__");
  if (idx <= 0) return { capabilityId: "", operation: "" };
  return {
    capabilityId: raw.slice(0, idx).replace(/_/g, "."),
    operation: raw.slice(idx + 2),
  };
}

export function operationsToOpenAiTools(operations = []) {
  return operations.map((op) => ({
    type: "function",
    function: {
      name: operationToolName(op.capabilityId, op.operation),
      description: op.description
        || `${op.capabilityId}.${op.operation} risk=${op.risk} approval=${op.approval}`,
      parameters: op.inputSchema && typeof op.inputSchema === "object" ? op.inputSchema : { type: "object", properties: {} },
    },
  }));
}

export function requestableOpenAiTools(runtime = {}) {
  const snapshot = runtime?.capabilityRuntimeSnapshot || runtime?.snapshot;
  // An explicit array — including [] — is a filter. Idle companion turns pass
  // [] so ordinary chat does not advertise the whole capability surface.
  const hasOperationFilter = Array.isArray(runtime?.operationIds)
    || Array.isArray(runtime?.relevantOperationIds);
  const requestedIds = new Set(
    (runtime?.operationIds || runtime?.relevantOperationIds || [])
      .map(String)
      .filter(Boolean),
  );
  if (snapshot) {
    const rows = operationRowsFromCapabilitySnapshot(snapshot, { requestableOnly: true });
    return operationsToOpenAiTools(
      hasOperationFilter
        ? rows.filter((row) => requestedIds.has(String(row.operationId || `${row.capabilityId}.${row.operation}`)))
        : rows,
    );
  }
  const rows = listRequestableOperations(runtime);
  return operationsToOpenAiTools(
    hasOperationFilter
      ? rows.filter((row) => requestedIds.has(String(row.operationId || `${row.capabilityId}.${row.operation}`)))
      : rows,
  );
}

export function describeToolAvailability(op, runtime = {}) {
  return resolveOperationAvailability(op, runtime);
}
