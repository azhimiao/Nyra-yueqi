/**
 * Generic host state apply with revision CAS and whitelist patch keys.
 * Relationship exploration action set exported for P5.
 */

import { updateSkillRun, getSkillRun } from "./run-store.js";
import { listSkillFiles } from "./store.js";

/** @see plan §5.2 / §7.2 — relationship exploration nextAction set */
export const RELATIONSHIP_ACTIONS = Object.freeze([
  "CONTAIN",
  "REFLECT",
  "FORMULATE",
  "DISCRIMINATE",
  "SIMULATE",
  "DEBRIEF",
  "SYNTHESIZE",
  "ADVISE",
  "SAFETY_OVERRIDE",
]);

/** Default patch keys when schema files are unavailable. */
export const DEFAULT_STATE_PATCH_KEYS = Object.freeze([
  "phase",
  "questionEndingStreak",
  "safetyFlags",
  "workingFormulation",
  "primaryHypothesis",
  "alternateHypothesis",
]);

/**
 * @param {string} schemaText
 * @returns {string[]}
 */
export function parseSchemaFieldWhitelist(schemaText) {
  const text = String(schemaText || "");
  const fieldsIdx = text.search(/^Fields:\s*$/m);
  if (fieldsIdx < 0) return [];

  const section = text.slice(fieldsIdx);
  /** @type {string[]} */
  const keys = [];
  for (const line of section.split(/\r?\n/).slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) break;
    if (trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^-\s+([a-zA-Z0-9_]+)/);
    if (match) keys.push(match[1]);
  }
  return keys;
}

/**
 * @param {object} manifest
 * @param {string} skillId
 * @param {string} version
 */
export function resolveStatePatchWhitelist(manifest, skillId, version) {
  /** @type {Set<string>} */
  const keys = new Set(DEFAULT_STATE_PATCH_KEYS);

  const schemaPaths = manifest?.resources?.schemas || [];
  for (const path of schemaPaths) {
    const files = listSkillFiles(skillId, version, path);
    const content = files[0]?.content;
    if (!content) continue;
    for (const field of parseSchemaFieldWhitelist(content)) {
      keys.add(field);
    }
  }

  return [...keys];
}

/**
 * @param {object} manifest
 * @param {string[]} [override]
 */
export function resolveAllowedActions(manifest, override) {
  if (Array.isArray(override) && override.length > 0) {
    return [...new Set(override.map(String))];
  }
  if (manifest?.category === "relationship") {
    return [...RELATIONSHIP_ACTIONS];
  }
  const fromManifest = manifest?.allowedActions;
  if (Array.isArray(fromManifest) && fromManifest.length > 0) {
    return fromManifest.map(String);
  }
  return [...RELATIONSHIP_ACTIONS];
}

/**
 * @param {object} run
 */
export function readHostState(run) {
  const hostState = run?.meta?.hostState;
  return hostState && typeof hostState === "object" ? { ...hostState } : {};
}

/**
 * @param {Record<string, unknown>} patch
 * @param {string[]} whitelist
 */
export function validateStatePatchKeys(patch, whitelist) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, reason: "invalid_state_patch" };
  }
  const allowed = new Set(whitelist.map(String));
  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) {
      return { ok: false, reason: "illegal_state_patch_key", key };
    }
  }
  return { ok: true, value: patch };
}

/**
 * Apply whitelisted host state patch with CAS revision.
 * @param {string} runId
 * @param {Record<string, unknown>} patch
 * @param {{ expectedRevision: number, whitelist: string[] }} opts
 */
export function applyHostStatePatch(runId, patch, opts) {
  const run = getSkillRun(runId);
  if (!run) return { ok: false, reason: "run_not_found" };

  const keyCheck = validateStatePatchKeys(patch, opts.whitelist || DEFAULT_STATE_PATCH_KEYS);
  if (!keyCheck.ok) return keyCheck;

  const current = readHostState(run);
  const nextState = { ...current, ...keyCheck.value };

  return updateSkillRun(
    runId,
    {
      meta: {
        ...(run.meta || {}),
        hostState: nextState,
      },
    },
    { expectedRevision: opts.expectedRevision },
  );
}
