/**
 * Unified Memory Projection Outbox path (plan M1).
 *
 * Coexistence with companion-intelligence W5:
 * - `src/memory/projection/*` — existing Palace index contract / project-to-palace /
 *   stale-sweep / rebuild used when `palaceProjectionV1` is on.
 * - `src/projections/*` (this module) — unified SourceRef-keyed outbox + worker +
 *   registry gated by `memoryProjectionOutboxV1` (default false). Product writers
 *   are not wired in M1.
 *
 * Do not delete or replace W5. Later waves may bridge enqueue → projectToPalace.
 */

export {
  PROJECTION_JOB_STATUSES,
  PROJECTION_OPERATIONS,
  enqueueProjectionJob,
  listProjectionJobs,
  getProjectionJob,
  updateProjectionJob,
  isProjectionOutboxEnabled,
  __setProjectionOutboxStoreForTests,
  __clearProjectionOutboxForTests,
} from "./outbox.js";

export {
  registerProjector,
  getProjector,
  listProjectorKinds,
  unregisterProjector,
  __clearProjectionRegistryForTests,
} from "./registry.js";

export { processProjectionJob, processProjectionQueue } from "./worker.js";

export { rebuildProjectionsFromSources } from "./rebuild.js";

/** Soft pointer for discoverability — W5 palace projection surface. */
export const LEGACY_PALACE_PROJECTION_PATH = "src/memory/projection";
