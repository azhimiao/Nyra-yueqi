/**
 * Build ContextRequest-shaped input from SkillRun scopes.
 * Uses purpose "chat" + skillPlatform extension until broker registers `skill` purpose (P3).
 */

import { normalizeContextRequest } from "../context/contract.js";
import { normalizeScopes } from "./scopes.js";

/**
 * @typedef {{
 *   skillRunId: string,
 *   skillId: string,
 *   agentId?: string,
 *   mode: string,
 *   scopes: ReturnType<typeof normalizeScopes>,
 *   memoryBlockRequests: string[],
 *   exposeToCharacter: boolean,
 * }} SkillPlatformContextExtension
 */

/**
 * Whether the context request asks for global or character memory blocks.
 * @param {object} request — output of buildContextRequestFromSkillRun
 */
export function requestsMemoryBlocks(request) {
  const ext = request?.skillPlatform;
  if (ext?.memoryBlockRequests) {
    return ext.memoryBlockRequests.length > 0;
  }
  return (
    request?.includeContextGraph === true ||
    request?.includeCohabit === true ||
    request?.includeMoments === true
  );
}

/**
 * Map memoryRead scope → broker include flags (independent from characterVisibility).
 * @param {ReturnType<typeof normalizeScopes>} scopes
 */
export function memoryIncludeFlagsForScopes(scopes) {
  const s = normalizeScopes(scopes);
  if (s.memoryRead === "none") {
    return {
      includeContextGraph: false,
      includeCohabit: false,
      includeMoments: false,
    };
  }
  if (s.memoryRead === "global_personal") {
    return {
      includeContextGraph: true,
      includeCohabit: false,
      includeMoments: false,
    };
  }
  if (s.memoryRead === "selected_character") {
    return {
      includeContextGraph: true,
      includeCohabit: false,
      includeMoments: true,
    };
  }
  if (s.memoryRead === "relationship") {
    return {
      includeContextGraph: true,
      includeCohabit: true,
      includeMoments: false,
    };
  }
  return {
    includeContextGraph: false,
    includeCohabit: false,
    includeMoments: false,
  };
}

/**
 * @param {string[]} flags
 */
function memoryBlockRequestLabels(flags) {
  /** @type {string[]} */
  const blocks = [];
  if (flags.includeContextGraph) blocks.push("global_memory");
  if (flags.includeCohabit) blocks.push("relationship_memory");
  if (flags.includeMoments) blocks.push("character_moments");
  return blocks;
}

/**
 * Build a ContextRequest-compatible object for a SkillRun.
 * @param {object} run
 * @param {Record<string, unknown>} [partial]
 */
export function buildContextRequestFromSkillRun(run, partial = {}) {
  if (!run || typeof run !== "object") {
    throw new Error("buildContextRequestFromSkillRun_requires_run");
  }

  const scopes = normalizeScopes(run.scopes);
  const memoryFlags = memoryIncludeFlagsForScopes(scopes);
  const conversationSessionId = String(
    partial.conversationSessionId ||
      run.conversation?.conversationSessionId ||
      "",
  ).trim();

  const base = {
    appId: "explore",
    purpose: "chat",
    characterId: String(partial.characterId || run.characterId || "").trim(),
    conversationSessionId,
    currentInput: String(partial.currentInput || partial.query || ""),
    includeHistory: partial.includeHistory ?? true,
    includeBranchSummary: partial.includeBranchSummary ?? true,
    includeWorldbook: partial.includeWorldbook ?? false,
    includeExternal: false,
    ...memoryFlags,
    ...partial,
  };

  const normalized = normalizeContextRequest(base);

  /** @type {SkillPlatformContextExtension} */
  const skillPlatform = {
    skillRunId: String(run.id || ""),
    skillId: String(run.skillId || ""),
    agentId: run.agentId ? String(run.agentId) : undefined,
    mode: String(run.mode || ""),
    scopes,
    memoryBlockRequests: memoryBlockRequestLabels(memoryFlags),
    exposeToCharacter: scopes.characterVisibility === "selected_character",
  };

  return {
    ...normalized,
    skillPlatform,
    metadata: {
      ...(normalized.metadata && typeof normalized.metadata === "object" ? normalized.metadata : {}),
      skillRunId: skillPlatform.skillRunId,
      skillId: skillPlatform.skillId,
      skillPurpose: "skill",
    },
  };
}
