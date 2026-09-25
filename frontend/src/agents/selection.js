/**
 * Agent selection — active agent per session with global fallback.
 * Switching agents must not wipe other agents' SkillRun state.
 */

import { AGENT_PROFILES_KEY } from "../skill-platform/schema.js";
import { getInstallation, listInstallations } from "../skill-platform/store.js";
import { listSkillRuns } from "../skill-platform/run-store.js";
import {
  ensureBuiltinProfiles,
  getAgentProfile,
  listAgentProfiles,
} from "./profile-store.js";
import { BUILTIN_QIJI_ASSISTANT } from "./profile-schema.js";

export const AGENT_SELECTION_KEY = "yueqi.agents.selection.v1";

/** @type {object|null} */
let memorySelection = null;

/** @type {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} */
let testStorage = null;

/**
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem?(k:string):void }|null} storage
 */
export function __setAgentSelectionStorageForTests(storage) {
  testStorage = storage;
  memorySelection = null;
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

function emptySelection() {
  return {
    activeAgentId: BUILTIN_QIJI_ASSISTANT.id,
    sessionBindings: {},
  };
}

function readSelection() {
  if (memorySelection) return memorySelection;
  const storage = ls();
  if (!storage) {
    memorySelection = emptySelection();
    return memorySelection;
  }
  try {
    const raw = storage.getItem(AGENT_SELECTION_KEY);
    if (!raw) {
      memorySelection = emptySelection();
      return memorySelection;
    }
    const parsed = JSON.parse(raw);
    memorySelection = {
      activeAgentId: String(parsed?.activeAgentId || BUILTIN_QIJI_ASSISTANT.id),
      sessionBindings:
        parsed?.sessionBindings && typeof parsed.sessionBindings === "object"
          ? { ...parsed.sessionBindings }
          : {},
    };
    return memorySelection;
  } catch {
    memorySelection = emptySelection();
    return memorySelection;
  }
}

function writeSelection(sel) {
  memorySelection = sel;
  const storage = ls();
  if (!storage) return;
  try {
    storage.setItem(AGENT_SELECTION_KEY, JSON.stringify(sel));
  } catch {
    /* quota */
  }
}

export function clearAgentSelection() {
  memorySelection = emptySelection();
  const storage = ls();
  try {
    storage?.removeItem?.(AGENT_SELECTION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @returns {object[]}
 */
export function listSelectableAgents() {
  ensureBuiltinProfiles();
  return listAgentProfiles().filter((p) => p.enabled !== false);
}

/**
 * @param {string} [conversationSessionId]
 */
export function getActiveAgent(conversationSessionId) {
  ensureBuiltinProfiles();
  const sel = readSelection();
  const sessionId = String(conversationSessionId || "").trim();
  const agentId = sessionId
    ? sel.sessionBindings[sessionId] || sel.activeAgentId
    : sel.activeAgentId;
  return getAgentProfile(agentId) || getAgentProfile(BUILTIN_QIJI_ASSISTANT.id);
}

/**
 * @param {string} agentId
 * @param {{ conversationSessionId?: string }} [opts]
 */
export function selectAgent(agentId, opts = {}) {
  ensureBuiltinProfiles();
  const id = String(agentId || "").trim();
  const profile = getAgentProfile(id);
  if (!profile) return { ok: false, reason: "agent_not_found" };
  if (profile.enabled === false) return { ok: false, reason: "agent_disabled" };

  const sel = readSelection();
  const sessionId = String(opts.conversationSessionId || "").trim();
  if (sessionId) {
    sel.sessionBindings[sessionId] = id;
  } else {
    sel.activeAgentId = id;
  }
  writeSelection(sel);
  return { ok: true, value: profile, selection: { ...sel } };
}

/**
 * Enabled skill ids = profile.skillIds ∩ installed + enabled installations.
 * @param {string} agentId
 */
export function resolveAgentSkills(agentId) {
  const profile = getAgentProfile(agentId);
  if (!profile) return [];

  const installations = listInstallations();
  const wanted = new Set(profile.skillIds || []);
  return [...wanted].filter((skillId) => {
    const inst = installations[skillId];
    return inst && inst.enabled !== false;
  });
}

/**
 * List SkillRuns for an agent — switching agents does not delete runs.
 * @param {string} agentId
 */
export function listAgentSkillRuns(agentId) {
  return listSkillRuns({ agentId: String(agentId || "").trim() });
}

/**
 * Export selection snapshot (backup / verify).
 */
export function exportAgentSelectionSnapshot() {
  return { ...readSelection(), profilesKey: AGENT_PROFILES_KEY };
}

/**
 * @param {object} snapshot
 */
export function importAgentSelectionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return { ok: false, reason: "invalid_snapshot" };
  writeSelection({
    activeAgentId: String(snapshot.activeAgentId || BUILTIN_QIJI_ASSISTANT.id),
    sessionBindings:
      snapshot.sessionBindings && typeof snapshot.sessionBindings === "object"
        ? { ...snapshot.sessionBindings }
        : {},
  });
  return { ok: true };
}
