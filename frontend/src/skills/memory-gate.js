/**
 * Gate third-party skills away from unauthorized Character Package private memory.
 */

import { PRIVACY_LEVELS } from "../context/schema.js";
import { checkPermission } from "./permissions.js";

/**
 * @typedef {{
 *   id: string,
 *   characterId: string,
 *   privacyLevel: string,
 *   content?: string,
 *   summary?: string,
 * }} MemoryItemLike
 */

/**
 * Whether a skill may read a memory item.
 * @param {{
 *   skillId: string,
 *   declared: string[],
 *   granted: string[],
 *   characterMemoryAccess?: "none"|"shared"|"private",
 *   skillCharacterId?: string,
 * }} skillCtx
 * @param {MemoryItemLike} item
 */
export function canReadCharacterMemory(skillCtx, item) {
  if (!item || !item.characterId) {
    return { ok: false, reason: "invalid_item" };
  }

  if (skillCtx.skillCharacterId
    && String(skillCtx.skillCharacterId) !== String(item.characterId)) {
    return { ok: false, reason: "character_isolation", characterId: item.characterId };
  }

  const level = String(item.privacyLevel || "shared");
  if (!PRIVACY_LEVELS.includes(/** @type {any} */ (level))) {
    return { ok: false, reason: "unknown_privacy_level", level };
  }
  if (level === "forbidden") {
    return { ok: false, reason: "forbidden_memory" };
  }

  const access = skillCtx.characterMemoryAccess || "none";
  if (access === "none") {
    return { ok: false, reason: "memory_access_none" };
  }

  const permCtx = {
    skillId: skillCtx.skillId,
    declared: skillCtx.declared || [],
    granted: skillCtx.granted || [],
  };

  if (level === "shared") {
    if (access !== "shared" && access !== "private") {
      return { ok: false, reason: "unauthorized_shared_memory" };
    }
    const shared = checkPermission(permCtx, "character_memory_shared");
    const priv = checkPermission(permCtx, "character_memory_private");
    if (!shared.ok && !priv.ok) {
      return { ok: false, reason: "unauthorized_shared_memory" };
    }
    return { ok: true, level: "shared" };
  }

  if (level === "private" || level === "sensitive") {
    if (access !== "private") {
      return { ok: false, reason: "private_memory_denied", level };
    }
    const priv = checkPermission(permCtx, "character_memory_private");
    if (!priv.ok) {
      return { ok: false, reason: "unauthorized_private_memory", level };
    }
    return { ok: true, level };
  }

  return { ok: false, reason: "unauthorized_memory", level };
}

/**
 * Filter a list; denied items are leak attempts (must stay inaccessible).
 * @param {object} skillCtx
 * @param {MemoryItemLike[]} items
 */
export function filterMemoryForSkill(skillCtx, items) {
  /** @type {MemoryItemLike[]} */
  const allowed = [];
  /** @type {{ item: MemoryItemLike, reason: string }[]} */
  const denied = [];
  for (const item of items || []) {
    const r = canReadCharacterMemory(skillCtx, item);
    if (r.ok) allowed.push(item);
    else denied.push({ item, reason: r.reason || "denied" });
  }
  return { allowed, denied, leakCount: denied.length };
}

/**
 * Third-party default: no private memory even if items exist.
 * @param {string} skillId
 */
export function thirdPartyMemoryContext(skillId) {
  return {
    skillId: String(skillId),
    declared: [],
    granted: [],
    characterMemoryAccess: /** @type {"none"} */ ("none"),
  };
}
