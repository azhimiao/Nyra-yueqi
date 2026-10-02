/**
 * Commit idempotency for character candidate imports.
 * Key: taskId + artifactHash + operationType
 */

/**
 * @param {unknown} value
 */
export async function sha256Hex(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  const data = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Node fallback
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}

/**
 * @param {{ id?: string, taskId?: string }} task
 * @param {object} candidate
 * @param {string} [operationType]
 */
export async function buildCommitIdempotencyKey(task, candidate, operationType = "character.create") {
  const taskId = String(task?.id || task?.taskId || "");
  const artifactHash = await sha256Hex(candidate);
  return `${taskId}::${artifactHash}::${operationType}`;
}

const IDEMPOTENCY_STORAGE = "yueqi.assist.agent.commit-idempotency.v1";

/** @type {Map<string, { characterId: string, name?: string, at: string }>} */
const memoryIndex = new Map();

function readIndex() {
  if (typeof localStorage === "undefined") {
    return Object.fromEntries(memoryIndex);
  }
  try {
    return JSON.parse(localStorage.getItem(IDEMPOTENCY_STORAGE) || "{}") || {};
  } catch {
    return {};
  }
}

function writeIndex(map) {
  if (typeof localStorage === "undefined") {
    memoryIndex.clear();
    for (const [k, v] of Object.entries(map)) memoryIndex.set(k, v);
    return;
  }
  try {
    localStorage.setItem(IDEMPOTENCY_STORAGE, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

/**
 * @param {string} key
 */
export function lookupCommitIdempotency(key) {
  const all = readIndex();
  return all[key] || memoryIndex.get(key) || null;
}

/**
 * @param {string} key
 * @param {{ characterId: string, name?: string, [k: string]: unknown }} result
 */
export function recordCommitIdempotency(key, result) {
  const all = readIndex();
  all[key] = {
    ...result,
    characterId: result.characterId,
    name: result.name,
    at: new Date().toISOString(),
  };
  writeIndex(all);
  memoryIndex.set(key, all[key]);
}

export function clearCommitIdempotencyForTests() {
  memoryIndex.clear();
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(IDEMPOTENCY_STORAGE);
  } catch {
    /* */
  }
}

export { IDEMPOTENCY_STORAGE };
