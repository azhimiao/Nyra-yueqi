/**
 * Projection outbox worker — process pending jobs via registry handlers.
 * May run synchronously in tests.
 */

import { getProjector } from "./registry.js";
import {
  getProjectionJob,
  listProjectionJobs,
  updateProjectionJob,
} from "./outbox.js";

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * @param {object} job
 * @param {{ maxAttempts?: number, nowIso?: string }} [opts]
 * @returns {Promise<{ ok: boolean, job: object, result?: unknown, error?: string, skipped?: boolean }>}
 */
export async function processProjectionJob(job, opts = {}) {
  const current = getProjectionJob(job?.jobId) || job;
  if (!current?.jobId) return { ok: false, job: current, error: "missing_job" };
  if (current.status === "complete") return { ok: true, job: current, skipped: true };
  if (current.status === "dead") return { ok: false, job: current, error: "dead", skipped: true };

  const kind = String(current.projectionKind || "").trim();
  const handler = getProjector(kind);
  if (!handler) {
    const failed = updateProjectionJob(current.jobId, {
      status: "failed",
      lastError: `no_projector:${kind}`,
      attempts: Number(current.attempts || 0) + 1,
    });
    return { ok: false, job: failed, error: `no_projector:${kind}` };
  }

  updateProjectionJob(current.jobId, { status: "running" });
  try {
    const result = await handler(current, { nowIso: opts.nowIso || new Date().toISOString() });
    const done = updateProjectionJob(current.jobId, {
      status: "complete",
      lastError: null,
      attempts: Number(current.attempts || 0) + 1,
      resultSummary:
        result && typeof result === "object"
          ? { ok: result.ok !== false, keys: Object.keys(result).slice(0, 8) }
          : { ok: true },
    });
    return { ok: true, job: done, result };
  } catch (err) {
    const attempts = Number(current.attempts || 0) + 1;
    const maxAttempts = Number(opts.maxAttempts) > 0 ? Number(opts.maxAttempts) : DEFAULT_MAX_ATTEMPTS;
    const message = err instanceof Error ? err.message : String(err || "error");
    const status = attempts >= maxAttempts ? "dead" : "failed";
    const failed = updateProjectionJob(current.jobId, {
      status,
      lastError: message,
      attempts,
      nextAttemptAt: new Date(Date.now() + attempts * 1000).toISOString(),
    });
    return { ok: false, job: failed, error: message };
  }
}

/**
 * Process pending (and optionally failed) jobs. Sync-friendly for tests.
 * @param {{ limit?: number, includeFailed?: boolean, maxAttempts?: number }} [opts]
 */
export async function processProjectionQueue(opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || 50);
  const pending = listProjectionJobs({ status: "pending" });
  const failed = opts.includeFailed ? listProjectionJobs({ status: "failed" }) : [];
  const batch = [...pending, ...failed].slice(0, limit);
  const results = [];
  for (const job of batch) {
    results.push(await processProjectionJob(job, opts));
  }
  return { processed: results.length, results };
}
