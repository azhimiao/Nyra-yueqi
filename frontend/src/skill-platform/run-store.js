/**
 * SkillRun persistence — `yueqi.skills.runs.v1`.
 * Pins skillVersion at create; CAS updates via stateRevision.
 */

import { getCatalogEntry, getInstallation } from "./store.js";
import {
  SKILL_RUN_SCHEMA_VERSION,
  SKILL_RUN_STORAGE_KEY,
  SKILL_RUN_STATUSES,
  createSkillRun,
  validateSkillRun,
} from "./run-schema.js";
import { defaultScopesForMode, validateScopes } from "./scopes.js";
import { bindConversationForRun } from "./conversation-binding.js";

/** @type {object|null} */
let memoryBag = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setSkillRunStorageForTests(storage) {
  testStorage = storage;
  memoryBag = null;
}

function ls() {
  if (testStorage) return testStorage;
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    /* ignore */
  }
  return null;
}

function emptyBag() {
  return { schemaVersion: SKILL_RUN_SCHEMA_VERSION, runs: {} };
}

function readBag() {
  if (memoryBag) return memoryBag;
  const storage = ls();
  if (!storage) {
    memoryBag = emptyBag();
    return memoryBag;
  }
  try {
    const raw = storage.getItem(SKILL_RUN_STORAGE_KEY);
    if (!raw) {
      memoryBag = emptyBag();
      return memoryBag;
    }
    const parsed = JSON.parse(raw);
    memoryBag = {
      schemaVersion: Number(parsed?.schemaVersion) || SKILL_RUN_SCHEMA_VERSION,
      runs: parsed?.runs && typeof parsed.runs === "object" ? parsed.runs : {},
    };
    return memoryBag;
  } catch {
    memoryBag = emptyBag();
    return memoryBag;
  }
}

function writeBag(bag) {
  memoryBag = bag;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(SKILL_RUN_STORAGE_KEY, JSON.stringify(bag));
  } catch {
    /* quota */
  }
}

function cloneRun(run) {
  return JSON.parse(JSON.stringify(run));
}

export function clearAllSkillRuns() {
  memoryBag = emptyBag();
  const storage = ls();
  try {
    storage?.removeItem?.(SKILL_RUN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ skillId?: string, agentId?: string, characterId?: string, status?: string }} [filter]
 */
export function listSkillRuns(filter = {}) {
  const bag = readBag();
  let runs = Object.values(bag.runs || {});
  if (filter.skillId) {
    runs = runs.filter((r) => r.skillId === filter.skillId);
  }
  if (filter.agentId) {
    runs = runs.filter((r) => r.agentId === filter.agentId);
  }
  if (filter.characterId) {
    runs = runs.filter((r) => r.characterId === filter.characterId);
  }
  if (filter.status) {
    runs = runs.filter((r) => r.status === filter.status);
  }
  return runs
    .map((r) => cloneRun(r))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * @param {string} runId
 */
export function getSkillRun(runId) {
  const id = String(runId || "").trim();
  const run = readBag().runs?.[id];
  return run ? cloneRun(run) : null;
}

/**
 * @param {object} fields
 * @param {{ conversationApi?: object, bindConversation?: boolean }} [opts]
 */
export function createSkillRunRecord(fields, opts = {}) {
  const skillId = String(fields?.skillId || "").trim();
  if (!skillId) return { ok: false, reason: "missing_skill_id" };

  const catalog = getCatalogEntry(skillId);
  const installation = getInstallation(skillId);
  const skillVersion = String(
    fields.skillVersion || installation?.version || catalog?.version || "1.0.0",
  ).trim();

  const mode = fields.mode || "isolated_new";
  const scopesInput =
    fields.scopes && typeof fields.scopes === "object"
      ? { ...defaultScopesForMode(mode), ...fields.scopes }
      : defaultScopesForMode(mode);
  const scopeCheck = validateScopes(scopesInput, {
    mode,
    characterId: fields.characterId,
  });
  if (!scopeCheck.ok) return scopeCheck;

  let run = createSkillRun({
    ...fields,
    skillId,
    skillVersion,
    scopes: scopeCheck.value,
    grantedCapabilities: Array.isArray(fields.grantedCapabilities)
      ? fields.grantedCapabilities
      : installation?.grants?.capabilities || [],
  });

  if (opts.bindConversation !== false) {
    const bound = bindConversationForRun(run, {
      conversationApi: opts.conversationApi,
      title: fields.title || catalog?.name || skillId,
      sourceConversationSessionId: fields.sourceConversationSessionId,
    });
    if (!bound.ok) return bound;
    run = { ...run, conversation: bound.value.conversation };
  }

  const validated = validateSkillRun(run);
  if (!validated.ok) return validated;

  const bag = readBag();
  bag.runs[validated.value.id] = validated.value;
  writeBag(bag);
  return { ok: true, value: cloneRun(validated.value) };
}

/**
 * @param {string} runId
 * @param {Partial<object>} patch
 * @param {{ expectedRevision?: number }} [opts]
 */
export function updateSkillRun(runId, patch, opts = {}) {
  const id = String(runId || "").trim();
  const bag = readBag();
  const existing = bag.runs?.[id];
  if (!existing) return { ok: false, reason: "not_found" };

  const expected = opts.expectedRevision;
  if (expected != null && Number(existing.stateRevision) !== Number(expected)) {
    return { ok: false, reason: "revision_conflict", current: existing.stateRevision };
  }

  const merged = {
    ...existing,
    ...patch,
    id: existing.id,
    skillId: existing.skillId,
    skillVersion: existing.skillVersion,
    conversation: {
      ...existing.conversation,
      ...(patch.conversation && typeof patch.conversation === "object" ? patch.conversation : {}),
    },
    scopes: (() => {
      if (!patch.scopes || typeof patch.scopes !== "object") return existing.scopes;
      const scopeCheck = validateScopes(
        { ...existing.scopes, ...patch.scopes },
        {
          mode: patch.mode || existing.mode,
          characterId: patch.characterId || existing.characterId,
        },
      );
      if (!scopeCheck.ok) return existing.scopes;
      return scopeCheck.value;
    })(),
    stateRevision: Number(existing.stateRevision) + 1,
    updatedAt: new Date().toISOString(),
  };

  const validated = validateSkillRun(merged);
  if (!validated.ok) return validated;

  bag.runs[id] = validated.value;
  writeBag(bag);
  return { ok: true, value: cloneRun(validated.value) };
}

/**
 * @param {string} runId
 * @param {string} status
 * @param {{ expectedRevision?: number }} [opts]
 */
export function updateSkillRunStatus(runId, status, opts = {}) {
  if (!SKILL_RUN_STATUSES.includes(status)) {
    return { ok: false, reason: "invalid_status" };
  }
  const patch = { status };
  if (status === "paused") patch.pausedAt = new Date().toISOString();
  if (status === "completed" || status === "cancelled" || status === "failed") {
    patch.completedAt = new Date().toISOString();
  }
  return updateSkillRun(runId, patch, opts);
}

/**
 * @param {string} runId
 * @param {{ expectedRevision?: number }} [opts]
 */
export function pauseSkillRun(runId, opts = {}) {
  const run = getSkillRun(runId);
  if (!run) return { ok: false, reason: "not_found" };
  if (run.status !== "active") return { ok: false, reason: "not_active" };
  return updateSkillRunStatus(runId, "paused", {
    expectedRevision: opts.expectedRevision ?? run.stateRevision,
  });
}

/**
 * @param {string} runId
 * @param {{ expectedRevision?: number }} [opts]
 */
export function resumeSkillRun(runId, opts = {}) {
  const run = getSkillRun(runId);
  if (!run) return { ok: false, reason: "not_found" };
  if (run.status !== "paused") return { ok: false, reason: "not_paused" };
  return updateSkillRun(
    runId,
    { status: "active", pausedAt: undefined },
    { expectedRevision: opts.expectedRevision ?? run.stateRevision },
  );
}

/**
 * @param {string} runId
 */
export function deleteSkillRun(runId) {
  const id = String(runId || "").trim();
  const bag = readBag();
  if (!bag.runs?.[id]) return { ok: false, reason: "not_found" };
  delete bag.runs[id];
  writeBag(bag);
  return { ok: true };
}

export function exportSkillRunsBag() {
  return JSON.parse(JSON.stringify(readBag()));
}

/**
 * @param {object} bag
 */
export function importSkillRunsBag(bag) {
  if (!bag || typeof bag !== "object") return { ok: false, reason: "invalid_bag" };
  writeBag({
    schemaVersion: Number(bag.schemaVersion) || SKILL_RUN_SCHEMA_VERSION,
    runs: bag.runs && typeof bag.runs === "object" ? bag.runs : {},
  });
  return { ok: true };
}
