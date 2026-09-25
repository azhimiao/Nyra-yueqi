/**
 * Skill adapter registry — optional per-skill validators/normalizers at commit time.
 */

import { relationshipIntelligenceAdapter, SKILL_ID as RELATIONSHIP_SKILL_ID } from "./relationship-intelligence.js";

/** @type {Map<string, object>} */
const ADAPTERS = new Map([[RELATIONSHIP_SKILL_ID, relationshipIntelligenceAdapter]]);

/**
 * @param {string} skillId
 */
export function getSkillAdapter(skillId) {
  const id = String(skillId || "").trim();
  return ADAPTERS.get(id) || null;
}

/**
 * @param {string} skillId
 * @param {object} adapter
 */
export function registerSkillAdapter(skillId, adapter) {
  ADAPTERS.set(String(skillId).trim(), adapter);
}

export { relationshipIntelligenceAdapter };
