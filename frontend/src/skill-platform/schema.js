/**
 * Skill×Agent user platform — storage keys, manifest constants, shared types.
 * User-facing SKILL.md bundles (not  developer skill.json SDK).
 */

export const SKILL_PLATFORM_SCHEMA_VERSION = 1;

/** @see plan §3.3 */
export const MANIFEST_SCHEMA_ID = "yueqi-skill-manifest.v1";

/** localStorage / persistence keys (plan §4, P0 layering) */
export const STORAGE_KEYS = Object.freeze({
  catalog: "yueqi.skills.catalog.v1",
  installations: "yueqi.skills.installations.v1",
  runs: "yueqi.skills.runs.v1",
  audit: "yueqi.skills.audit.v1",
  upgradeCandidates: "yueqi.skills.upgradeCandidates.v1",
});

/** IndexedDB store names (browser); in-memory Map in Node verify scripts */
export const IDB_STORES = Object.freeze({
  skillFiles: "skill_files",
  skillState: "skill_state",
});

export const AGENT_PROFILES_KEY = "yueqi.agents.profiles.v1";

export const AGENT_KINDS = Object.freeze(["general", "specialist", "user_created"]);

export const RUN_MODES = Object.freeze(["isolated_new", "snapshot_copy", "shared_live"]);

export const OUTPUT_MODES = Object.freeze(["dialogue", "structured_dialogue", "artifact_draft"]);

export const DEFAULT_SCOPES = Object.freeze({
  conversationRead: "none",
  memoryRead: "none",
  characterVisibility: "private",
  memoryWrite: "off",
});

export const AUDIT_EVENT_TYPES = Object.freeze([
  "import",
  "install",
  "enable",
  "disable",
  "delete",
  "upgrade",
  "upgrade_dismiss",
  "rollback",
  "skill_turn",
  "task_proposal",
  "memory_candidate",
]);

export const RESOURCE_DIRS = Object.freeze({
  system: "prompts",
  policies: "policies",
  schemas: "schemas",
  evals: "evals",
});
