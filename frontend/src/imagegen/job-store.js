/** Local job history for 绘境 (F6). */

import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { IMAGEGEN_JOBS_KEY, MAX_JOBS } from "./constants.js";
import { createImagegenJob, degradeImagegenJob, validateImagegenJob } from "./schema.js";

/**
 * @returns {import("./schema.js").ImagegenJob[]}
 */
export function listImagegenJobs() {
  const raw = readLocalObject(IMAGEGEN_JOBS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => degradeImagegenJob(item)).slice(0, MAX_JOBS);
}

/**
 * @param {import("./schema.js").ImagegenJob[]} jobs
 */
function writeJobs(jobs) {
  writeLocalObject(IMAGEGEN_JOBS_KEY, jobs.slice(0, MAX_JOBS));
}

/**
 * @param {Partial<import("./schema.js").ImagegenJob> & { prompt?: string }} partial
 */
export function appendImagegenJob(partial = {}) {
  const job = createImagegenJob(partial);
  const next = [job, ...listImagegenJobs()].slice(0, MAX_JOBS);
  writeJobs(next);
  return job;
}

/**
 * @param {string} id
 * @param {Partial<import("./schema.js").ImagegenJob>} patch
 */
export function updateImagegenJob(id, patch = {}) {
  const jobs = listImagegenJobs();
  const index = jobs.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const merged = degradeImagegenJob({ ...jobs[index], ...patch, id, schemaVersion: 1 });
  const checked = validateImagegenJob(merged);
  const value = checked.ok ? checked.value : merged;
  jobs[index] = value;
  writeJobs(jobs);
  return value;
}

/**
 * Metadata-only export for backup (no blobs).
 */
export function exportImagegenJobsForBackup() {
  return listImagegenJobs().map((job) => ({
    ...job,
    // keep mediaId/photoId refs; blobs live in media store
  }));
}
