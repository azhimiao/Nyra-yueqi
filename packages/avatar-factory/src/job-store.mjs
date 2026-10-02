import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const FACTORY_ROOT = path.join(ROOT, ".avatar-factory");
export const JOBS_DIR = path.join(FACTORY_ROOT, "jobs");
export const PACKS_DIR = path.join(ROOT, "public", "avatar-packs");

export function repoRoot() {
  return ROOT;
}

export async function ensureFactoryDirs() {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  await fs.mkdir(PACKS_DIR, { recursive: true });
  await fs.mkdir(path.join(PACKS_DIR, "_fixture"), { recursive: true });
}

export async function readJson(p, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

export async function writeJson(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2), "utf8");
}

export function hashBuffer(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export async function hashFile(p) {
  return hashBuffer(await fs.readFile(p));
}

export async function createJob({ spec, provider = "fixture", autoLock = false }) {
  await ensureFactoryDirs();
  const jobId = `${spec.characterId}-${Date.now().toString(36)}`;
  const dir = path.join(JOBS_DIR, jobId);
  await fs.mkdir(dir, { recursive: true });
  const job = {
    jobId,
    characterId: spec.characterId,
    provider,
    autoLock,
    state: "created",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stageHashes: {},
    retries: {},
    error: null,
    publishable: false,
    qualityTier: null,
    packPath: null,
  };
  await writeJson(path.join(dir, "job.json"), job);
  await writeJson(path.join(dir, "character.spec.json"), spec);
  return { job, dir };
}

export async function loadJob(jobId) {
  const dir = path.join(JOBS_DIR, jobId);
  const job = await readJson(path.join(dir, "job.json"));
  if (!job) throw new Error(`job not found: ${jobId}`);
  const spec = await readJson(path.join(dir, "character.spec.json"));
  return { job, dir, spec };
}

/** Latest job for characterId (+ optional provider), by createdAt. */
export async function findLatestJob({ characterId, provider } = {}) {
  await ensureFactoryDirs();
  let entries;
  try {
    entries = await fs.readdir(JOBS_DIR);
  } catch {
    return null;
  }
  let best = null;
  for (const name of entries) {
    const dir = path.join(JOBS_DIR, name);
    const job = await readJson(path.join(dir, "job.json"));
    if (!job) continue;
    if (characterId && job.characterId !== characterId) continue;
    if (provider && job.provider !== provider) continue;
    if (!best || String(job.createdAt || "") > String(best.job.createdAt || "")) {
      best = { job, dir };
    }
  }
  return best;
}

export async function saveJob(dir, job) {
  job.updatedAt = new Date().toISOString();
  await writeJson(path.join(dir, "job.json"), job);
}

export function stageDone(job, stage, hash) {
  return job.stageHashes?.[stage] === hash;
}

export function markStage(job, stage, hash) {
  job.stageHashes = job.stageHashes || {};
  job.stageHashes[stage] = hash;
}
