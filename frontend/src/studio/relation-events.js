/**
 * Scene may write relation events only after runtime rule validation.
 */

/**
 * @typedef {{
 *   id: string,
 *   characterId: string,
 *   kind: string,
 *   predicate: string,
 *   object: string,
 *   source: string,
 *   sceneId?: string,
 *   createdAt: string,
 * }} RelationEvent
 */

const ALLOWED_KINDS = new Set([
  "milestone",
  "preference",
  "boundary",
  "shared_experience",
  "mood",
  "promise",
]);

const FORBIDDEN_PREDICATES = new Set([
  "steal_credential",
  "exfiltrate",
  "grant_permission",
  "install_skill",
  "overwrite_memory",
]);

/**
 * Validate a proposed relation event from a scene/world script.
 * @param {{
 *   characterId: string,
 *   kind: string,
 *   predicate: string,
 *   object: string,
 *   source?: string,
 *   sceneId?: string,
 *   worldAllowsRelationWrites?: boolean,
 *   memoryPolicy?: { allowRemember: string[], denyRemember: string[] },
 * }} proposed
 * @returns {{ ok: true, value: RelationEvent } | { ok: false, reason: string }}
 */
export function validateRelationEventWrite(proposed) {
  const characterId = String(proposed?.characterId || "").trim();
  if (!characterId) return { ok: false, reason: "character_id_required" };

  if (proposed.worldAllowsRelationWrites === false) {
    return { ok: false, reason: "world_disallows_relation_writes" };
  }

  const kind = String(proposed.kind || "").trim();
  if (!ALLOWED_KINDS.has(kind)) {
    return { ok: false, reason: "invalid_relation_kind" };
  }

  const predicate = String(proposed.predicate || "").trim();
  if (!predicate || predicate.length > 80) {
    return { ok: false, reason: "invalid_predicate" };
  }
  if (FORBIDDEN_PREDICATES.has(predicate)) {
    return { ok: false, reason: "forbidden_predicate" };
  }

  const object = String(proposed.object || "").trim();
  if (!object || object.length > 500) {
    return { ok: false, reason: "invalid_object" };
  }

  const source = String(proposed.source || "scene").trim();
  if (source !== "scene" && source !== "world" && source !== "user") {
    return { ok: false, reason: "invalid_source" };
  }

  // Memory policy gate: relation category must be allowed
  const policy = proposed.memoryPolicy;
  if (policy) {
    const deny = (policy.denyRemember || []).map(String);
    const allow = (policy.allowRemember || []).map(String);
    if (deny.includes("relation") || deny.includes(kind)) {
      return { ok: false, reason: "memory_policy_denies_relation" };
    }
    if (allow.length && !allow.includes("*") && !allow.includes("relation") && !allow.includes(kind)) {
      return { ok: false, reason: "memory_policy_omits_relation" };
    }
  }

  return {
    ok: true,
    value: {
      id: `rel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      characterId,
      kind,
      predicate,
      object,
      source,
      sceneId: proposed.sceneId ? String(proposed.sceneId).trim() : undefined,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Append validated event into relation memory bag (does not touch package assets).
 * @param {Record<string, RelationEvent[]>} bag
 * @param {RelationEvent} event
 */
export function appendRelationMemory(bag, event) {
  const next = { ...(bag || {}) };
  const key = event.characterId;
  const list = Array.isArray(next[key]) ? [...next[key]] : [];
  list.push(event);
  next[key] = list;
  return next;
}
