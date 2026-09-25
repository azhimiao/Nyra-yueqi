/** ImagegenJob validate / degrade (F6 / E3). */

import { MAX_PROMPT_CHARS } from "./constants.js";

const STATUSES = new Set(["queued", "running", "succeeded", "failed"]);

/**
 * @typedef {object} ImagegenJob
 * @property {number} schemaVersion
 * @property {string} id
 * @property {"queued"|"running"|"succeeded"|"failed"} status
 * @property {string} prompt
 * @property {string|null} revisedPrompt
 * @property {string} createdAt
 * @property {string|null} finishedAt
 * @property {string|null} error
 * @property {string|null} mediaId
 * @property {string|null} photoId
 * @property {number} width
 * @property {number} height
 * @property {string} model
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: ImagegenJob } | { ok: false, errors: string[] }}
 */
export function validateImagegenJob(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["not_object"] };
  }
  const job = /** @type {Record<string, unknown>} */ (raw);
  if (Number(job.schemaVersion) !== 1) errors.push("schemaVersion");
  if (!String(job.id || "").trim()) errors.push("id");
  if (!STATUSES.has(String(job.status || ""))) errors.push("status");
  if (typeof job.prompt !== "string") errors.push("prompt");
  if (!String(job.createdAt || "").trim()) errors.push("createdAt");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      id: String(job.id),
      status: /** @type {ImagegenJob["status"]} */ (String(job.status)),
      prompt: String(job.prompt).slice(0, MAX_PROMPT_CHARS),
      revisedPrompt: job.revisedPrompt == null ? null : String(job.revisedPrompt),
      createdAt: String(job.createdAt),
      finishedAt: job.finishedAt == null ? null : String(job.finishedAt),
      error: job.error == null ? null : String(job.error).slice(0, 200),
      mediaId: job.mediaId == null ? null : String(job.mediaId),
      photoId: job.photoId == null ? null : String(job.photoId),
      width: Math.max(0, Number(job.width) || 0),
      height: Math.max(0, Number(job.height) || 0),
      model: String(job.model || ""),
    },
  };
}

/**
 * @param {unknown} raw
 * @returns {ImagegenJob}
 */
export function degradeImagegenJob(raw) {
  try {
    const checked = validateImagegenJob(raw);
    if (checked.ok) return checked.value;
  } catch {
    /* fall through */
  }
  const id = raw && typeof raw === "object" && raw.id
    ? String(/** @type {{ id?: unknown }} */ (raw).id)
    : `igj-degraded-${Date.now()}`;
  return {
    schemaVersion: 1,
    id,
    status: "failed",
    prompt: "",
    revisedPrompt: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    error: "invalid_job",
    mediaId: null,
    photoId: null,
    width: 0,
    height: 0,
    model: "",
  };
}

/**
 * @param {Partial<ImagegenJob> & { prompt?: string }} [partial]
 * @returns {ImagegenJob}
 */
export function createImagegenJob(partial = {}) {
  const now = new Date().toISOString();
  const id = partial.id || `igj-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return degradeImagegenJob({
    schemaVersion: 1,
    id,
    status: partial.status || "queued",
    prompt: String(partial.prompt || "").slice(0, MAX_PROMPT_CHARS),
    revisedPrompt: partial.revisedPrompt ?? null,
    createdAt: partial.createdAt || now,
    finishedAt: partial.finishedAt ?? null,
    error: partial.error ?? null,
    mediaId: partial.mediaId ?? null,
    photoId: partial.photoId ?? null,
    width: partial.width || 0,
    height: partial.height || 0,
    model: partial.model || "",
  });
}
