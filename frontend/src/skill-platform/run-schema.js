/**
 * SkillRun schema — session-level authorization, conversation binding, pinned version.
 * @see plan §4.1
 */

import { RUN_MODES, STORAGE_KEYS } from "./schema.js";
import { defaultScopesForMode, normalizeScopes, validateScopes } from "./scopes.js";

export const SKILL_RUN_SCHEMA_VERSION = 1;

export const SKILL_RUN_STORAGE_KEY = STORAGE_KEYS.runs;

export const SKILL_RUN_STATUSES = Object.freeze([
  "active",
  "paused",
  "completed",
  "cancelled",
  "failed",
]);

let runIdSeq = 0;

/** @param {string} [prefix] */
export function createSkillRunId(prefix = "skillrun") {
  runIdSeq += 1;
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${runIdSeq.toString(16)}_${rand}`;
}

/** Test helper */
export function __resetSkillRunIdSeqForTests() {
  runIdSeq = 0;
}

/**
 * @param {object} [partial]
 */
export function createSkillRun(partial = {}) {
  const now = new Date().toISOString();
  const skillId = String(partial.skillId || "").trim();
  const skillVersion = String(partial.skillVersion || "1.0.0").trim();
  const characterId = String(partial.characterId || "").trim();
  const mode = RUN_MODES.includes(partial.mode) ? partial.mode : "isolated_new";
  const scopes = normalizeScopes(
    partial.scopes && typeof partial.scopes === "object"
      ? { ...defaultScopesForMode(mode), ...partial.scopes }
      : defaultScopesForMode(mode),
  );
  const scopeCheck = validateScopes(scopes, { mode, characterId });
  if (!scopeCheck.ok) {
    throw new Error(scopeCheck.reason || "invalid_scopes");
  }

  const status = SKILL_RUN_STATUSES.includes(partial.status) ? partial.status : "active";
  const conversation =
    partial.conversation && typeof partial.conversation === "object"
      ? { ...partial.conversation }
      : {};

  return {
    id: String(partial.id || createSkillRunId()),
    skillId,
    skillVersion,
    agentId: partial.agentId ? String(partial.agentId) : undefined,
    characterId: characterId || undefined,
    mode,
    conversation: {
      conversationSessionId: conversation.conversationSessionId
        ? String(conversation.conversationSessionId)
        : undefined,
      sourceConversationSessionId: conversation.sourceConversationSessionId
        ? String(conversation.sourceConversationSessionId)
        : undefined,
      sourceSnapshotId:
        conversation.sourceSnapshotId && typeof conversation.sourceSnapshotId === "object"
          ? { ...conversation.sourceSnapshotId }
          : undefined,
    },
    scopes: scopeCheck.value,
    grantedCapabilities: Array.isArray(partial.grantedCapabilities)
      ? [...new Set(partial.grantedCapabilities.map((c) => String(c).trim()).filter(Boolean))]
      : [],
    stateRevision: Number(partial.stateRevision) || 0,
    status,
    createdAt: String(partial.createdAt || now),
    updatedAt: String(partial.updatedAt || now),
    pausedAt: partial.pausedAt ? String(partial.pausedAt) : undefined,
    completedAt: partial.completedAt ? String(partial.completedAt) : undefined,
    meta:
      partial.meta && typeof partial.meta === "object" ? { ...partial.meta } : {},
  };
}

/**
 * @param {unknown} run
 * @returns {{ ok: true, value: ReturnType<typeof createSkillRun> } | { ok: false, reason: string }}
 */
export function validateSkillRun(run) {
  if (!run || typeof run !== "object") {
    return { ok: false, reason: "invalid_run" };
  }
  const r = /** @type {Record<string, unknown>} */ (run);
  const id = String(r.id || "").trim();
  const skillId = String(r.skillId || "").trim();
  if (!id) return { ok: false, reason: "missing_id" };
  if (!skillId) return { ok: false, reason: "missing_skill_id" };

  const mode = String(r.mode || "");
  if (!RUN_MODES.includes(mode)) {
    return { ok: false, reason: "invalid_mode" };
  }

  const status = String(r.status || "active");
  if (!SKILL_RUN_STATUSES.includes(status)) {
    return { ok: false, reason: "invalid_status" };
  }

  const scopeCheck = validateScopes(r.scopes, {
    mode,
    characterId: r.characterId,
  });
  if (!scopeCheck.ok) return scopeCheck;

  const revision = Number(r.stateRevision);
  if (!Number.isFinite(revision) || revision < 0) {
    return { ok: false, reason: "invalid_state_revision" };
  }

  return {
    ok: true,
    value: createSkillRun({
      ...r,
      id,
      skillId,
      mode,
      status,
      scopes: scopeCheck.value,
      stateRevision: revision,
    }),
  };
}
