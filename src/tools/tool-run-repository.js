/**
 * Persisted ToolRun ledger. One idempotencyKey → one run. Unknown never auto-retries.
 */

import {
  createToolRunV1,
  transitionToolRun,
  validateToolRunV1,
} from "../contracts/tool-run-v1.js";
import { runRepositoryTransaction } from "../storage/db.js";
import { getAllRecords } from "../storage/db.js";

const STORE = "tool_runs";

function asId(run) {
  return String(run?.toolRunId || run?.id || "").trim();
}

export async function putToolRun(run, opts = {}) {
  const record = createToolRunV1({ ...run, toolRunId: asId(run) || run?.toolRunId });
  const validated = validateToolRunV1(record);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  const stored = { ...record, id: record.toolRunId };
  const tx = opts.runTransaction || runRepositoryTransaction;
  const result = await tx(
    {
      idempotencyKey: `tool-run:${record.idempotencyKey || record.toolRunId}`,
      ops: [{ type: "put", store: STORE, record: stored }],
    },
    opts.backend ? { backend: opts.backend } : {},
  );
  if (!result?.ok) return { ok: false, error: result?.error, duplicate: Boolean(result?.duplicate) };
  return { ok: true, record: stored, duplicate: Boolean(result.duplicate) };
}

export async function getToolRun(toolRunId, opts = {}) {
  const id = String(toolRunId || "").trim();
  if (!id) return null;
  if (typeof opts.list === "function") {
    return (await opts.list()).find((item) => asId(item) === id) || null;
  }
  const rows = await getAllRecords(STORE);
  return rows.find((item) => asId(item) === id) || null;
}

export async function listPendingApprovals(opts = {}) {
  const rows = typeof opts.list === "function" ? await opts.list() : await getAllRecords(STORE);
  return rows.filter((item) => item.status === "awaiting_approval" || item.status === "planned");
}

export async function transitionPersistedToolRun(toolRunId, to, patch = {}, opts = {}) {
  const current = await getToolRun(toolRunId, opts);
  if (!current) return { ok: false, errors: [{ code: "missing_field", path: "toolRunId" }] };
  if (current.status === "unknown" && to === "executing") {
    return { ok: false, errors: [{ code: "invalid_transition", path: "status" }] };
  }
  const moved = transitionToolRun(current, to, patch);
  if (!moved.ok) return moved;
  return putToolRun(moved.record, {
    ...opts,
    runTransaction: async (input, txOpts) => {
      const tx = opts.runTransaction || runRepositoryTransaction;
      return tx(
        { ...input, idempotencyKey: `tool-run-rev:${moved.record.toolRunId}:${moved.record.revision}:${to}` },
        txOpts,
      );
    },
  });
}

export function toolRunFromModelCall({
  capabilityId,
  operation,
  parameters = {},
  risk = "R2",
  exactEffect = "",
  idempotencyKey,
  proposalSource = "model_tool_call",
  requiresApproval,
} = {}) {
  const approval = typeof requiresApproval === "boolean" ? requiresApproval : risk !== "R0";
  return createToolRunV1({
    capabilityId,
    operation,
    parameters,
    risk,
    exactEffect: exactEffect || `${capabilityId}.${operation}`,
    idempotencyKey: idempotencyKey || `${capabilityId}:${operation}:${JSON.stringify(parameters)}`,
    proposalSource,
    // R0 runs may start from planned. An explicitly authorized R1 operation
    // starts approved so the ledger still records the approval boundary.
    status: approval ? "awaiting_approval" : (risk === "R0" ? "planned" : "approved"),
    requiresApproval: approval,
    explicitness: "explicit_command",
  });
}
