/**
 * Rebuild projections from injectable source lists.
 * Does not invent authorities — callers supply listSources + kinds.
 */

import { enqueueProjectionJob } from "./outbox.js";
import { processProjectionQueue } from "./worker.js";

/**
 * @param {{
 *   listSources: () => Iterable<object> | Promise<Iterable<object>>,
 *   projectionKinds?: string[],
 *   operations?: string[],
 *   process?: boolean,
 *   enqueueOpts?: object,
 * }} opts
 */
export async function rebuildProjectionsFromSources(opts = {}) {
  if (typeof opts.listSources !== "function") {
    throw new Error("rebuildProjectionsFromSources: listSources required");
  }
  const kinds = Array.isArray(opts.projectionKinds) && opts.projectionKinds.length
    ? opts.projectionKinds.map(String)
    : ["palace_text"];
  const operations = opts.operations || ["palace"];
  const sources = [...(await opts.listSources())];
  const enqueued = [];
  const errors = [];

  for (const sourceRef of sources) {
    for (const projectionKind of kinds) {
      const result = enqueueProjectionJob(
        {
          sourceRef,
          projectionKind,
          operations,
          payload: { rebuild: true },
        },
        { force: true, ...(opts.enqueueOpts || {}) },
      );
      if (!result.ok) {
        errors.push({ sourceId: sourceRef?.sourceId, projectionKind, errors: result.errors });
        continue;
      }
      enqueued.push({ jobId: result.job.jobId, deduped: Boolean(result.deduped), projectionKind });
    }
  }

  let processResult = null;
  if (opts.process !== false) {
    processResult = await processProjectionQueue({ limit: Math.max(enqueued.length, 1), includeFailed: true });
  }

  return {
    sourceCount: sources.length,
    enqueuedCount: enqueued.length,
    enqueued,
    errors,
    processResult,
  };
}
