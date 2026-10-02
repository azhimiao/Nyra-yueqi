/**
 * Skill Router — active Agent → enabled skills; trigger match; suggestions not auto-run.
 */

import { getCatalogEntry, getInstallation, listInstallations } from "./store.js";
import { getSkillRun, listSkillRuns } from "./run-store.js";
import { getActiveAgent, resolveAgentSkills } from "../agents/selection.js";
import { getAgentProfile } from "../agents/profile-store.js";

const MAX_SUGGESTIONS = 3;

/**
 * @param {string} userText
 * @param {string[]} triggers
 */
export function matchSkillTriggers(userText, triggers) {
  const text = String(userText || "").trim().toLowerCase();
  if (!text || !Array.isArray(triggers) || triggers.length === 0) return false;
  return triggers.some((trigger) => {
    const t = String(trigger || "").trim().toLowerCase();
    return t.length >= 2 && text.includes(t);
  });
}

/**
 * @param {string} skillId
 */
function skillSuggestion(skillId) {
  const catalog = getCatalogEntry(skillId);
  const installation = getInstallation(skillId);
  return {
    skillId,
    name: catalog?.name || skillId,
    version: installation?.version || catalog?.version || "1.0.0",
    agentId: catalog?.id === skillId ? skillId : undefined,
  };
}

/**
 * Enabled skills with trigger hits for text.
 * @param {string} userText
 * @param {string[]} [skillIds]
 */
export function findTriggerMatches(userText, skillIds) {
  const installations = listInstallations();
  const pool = skillIds?.length
    ? skillIds.filter((id) => {
        const inst = installations[id];
        return inst && inst.enabled !== false && getCatalogEntry(id);
      })
    : Object.keys(installations).filter((id) => {
        const inst = installations[id];
        return inst && inst.enabled !== false && getCatalogEntry(id);
      });

  /** @type {object[]} */
  const matches = [];
  for (const skillId of pool) {
    const catalog = getCatalogEntry(skillId);
    const triggers = catalog?.triggers || [];
    if (matchSkillTriggers(userText, triggers)) {
      matches.push({
        ...skillSuggestion(skillId),
        agentId: findProfileIdForSkill(skillId),
      });
    }
  }
  return matches.slice(0, MAX_SUGGESTIONS);
}

/**
 * @param {string} skillId
 */
function findProfileIdForSkill(skillId) {
  const profile = getAgentProfile(skillId);
  if (profile?.skillIds?.includes(skillId)) return profile.id;
  return undefined;
}

/**
 * @param {{
 *   userText?: string,
 *   characterId?: string,
 *   conversationSessionId?: string,
 *   fixedRunId?: string,
 *   userConfirmedSkillId?: string,
 *   explicitAgentId?: string,
 *   explicitAgentSelection?: boolean,
 *   userExplicitStart?: boolean,
 * }} input
 */
export function routeSkillInvocation(input = {}) {
  const userText = String(input.userText || "");
  const characterId = String(input.characterId || "").trim();
  const conversationSessionId = String(input.conversationSessionId || "").trim();
  const fixedRunId = String(input.fixedRunId || "").trim();
  const userConfirmedSkillId = String(input.userConfirmedSkillId || "").trim();
  const explicitAgentId = String(input.explicitAgentId || "").trim();
  const explicitAgentSelection = Boolean(input.explicitAgentSelection);
  const userExplicitStart = Boolean(input.userExplicitStart);

  if (fixedRunId) {
    const run = getSkillRun(fixedRunId);
    if (run && (run.status === "active" || run.status === "paused")) {
      return {
        kind: "execute",
        runId: run.id,
        skillId: run.skillId,
        agentId: run.agentId,
        reason: "fixed_run",
      };
    }
  }

  const activeAgent =
    (explicitAgentId ? getAgentProfile(explicitAgentId) : null) ||
    getActiveAgent(conversationSessionId || undefined);

  const agentSkills = activeAgent ? resolveAgentSkills(activeAgent.id) : [];

  if (explicitAgentSelection && activeAgent && agentSkills.length > 0) {
    const skillId = userConfirmedSkillId && agentSkills.includes(userConfirmedSkillId)
      ? userConfirmedSkillId
      : agentSkills[0];
    return {
      kind: "execute",
      skillId,
      agentId: activeAgent.id,
      reason: "explicit_agent",
    };
  }

  if (userConfirmedSkillId || userExplicitStart) {
    const skillId = userConfirmedSkillId || agentSkills[0];
    if (skillId && getInstallation(skillId)?.enabled !== false) {
      return {
        kind: "execute",
        skillId,
        agentId: activeAgent?.id,
        reason: userExplicitStart ? "explicit_start" : "user_confirmed",
      };
    }
  }

  const scopedMatches = findTriggerMatches(userText, agentSkills.length ? agentSkills : undefined);

  if (scopedMatches.length === 0) {
    return {
      kind: "ordinary",
      reason: "no_matching_skill",
      trace: { agentId: activeAgent?.id, agentSkills, skillResources: false },
    };
  }

  if (scopedMatches.length >= 2) {
    return {
      kind: "suggestions",
      suggestions: scopedMatches.slice(0, MAX_SUGGESTIONS),
      reason: "ambiguous_matches",
      trace: { matchCount: scopedMatches.length, skillResources: false },
    };
  }

  return {
    kind: "suggestions",
    suggestions: scopedMatches,
    reason: "needs_confirmation",
    trace: { matchCount: 1, skillResources: false },
  };
}

/**
 * Resolve an active SkillRun for execute routing (reuse paused/active run if present).
 * @param {{ skillId: string, agentId?: string, characterId?: string }} input
 */
export function resolveOrCreateRunHint(input) {
  const skillId = String(input.skillId || "").trim();
  const runs = listSkillRuns({
    skillId,
    agentId: input.agentId,
    characterId: input.characterId,
    status: "active",
  });
  const paused = listSkillRuns({
    skillId,
    agentId: input.agentId,
    characterId: input.characterId,
    status: "paused",
  });
  const existing = runs[0] || paused[0];
  if (existing) {
    return { runId: existing.id, created: false, run: existing };
  }
  return { created: true };
}
