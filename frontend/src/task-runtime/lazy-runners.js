/**
 * lazy Explore / worldbook-merge runners. Light facade only.
 */

/** @type {Promise<typeof import("./worldbook-merge-runner.js")> | null} */
let exploreRunnersPromise = null;

function loadExploreRunnersModule() {
  if (!exploreRunnersPromise) {
    exploreRunnersPromise = import("./worldbook-merge-runner.js");
  }
  return exploreRunnersPromise;
}

export async function runWorldbookMergeTask(opts) {
  const mod = await loadExploreRunnersModule();
  return mod.runWorldbookMergeTask(opts);
}

export async function approveWorldbookMergeTask(taskId, opts) {
  const mod = await loadExploreRunnersModule();
  return mod.approveWorldbookMergeTask(taskId, opts);
}

export async function rejectWorldbookMergeTask(taskId, opts) {
  const mod = await loadExploreRunnersModule();
  return mod.rejectWorldbookMergeTask(taskId, opts);
}
