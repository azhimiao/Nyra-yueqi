/**
 * Skill platform + Agent profile backup / restore (P1/P6).
 * Hash mismatch after restore → disable skill and flag integrity.
 */

import { appendSkillAuditEvent, importSkillAuditBag, listSkillAuditEvents } from "./audit.js";
import { exportSkillPlatformSnapshot, importSkillPlatformSnapshot } from "./store.js";
import { exportSkillRunsBag, importSkillRunsBag } from "./run-store.js";
import {
  exportMemoryCandidatesBag,
  importMemoryCandidatesBag,
} from "./memory-candidates.js";
import { exportAgentProfilesBag, importAgentProfilesBag } from "../agents/profile-store.js";
import {
  exportAgentSelectionSnapshot,
  importAgentSelectionSnapshot,
} from "../agents/selection.js";
import { sha256Text } from "./integrity.js";
import { SKILL_PLATFORM_SCHEMA_VERSION } from "./schema.js";

export const SKILL_PLATFORM_BACKUP_SCHEMA = "yueqi-skill-platform-backup.v1";

/**
 * Full export for companion backup payload.
 */
export function exportSkillPlatformBag() {
  return {
    schema: SKILL_PLATFORM_BACKUP_SCHEMA,
    schemaVersion: SKILL_PLATFORM_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    platform: exportSkillPlatformSnapshot(),
    runs: exportSkillRunsBag(),
    audit: { events: listSkillAuditEvents() },
    memoryCandidates: exportMemoryCandidatesBag(),
    agentProfiles: exportAgentProfilesBag(),
    agentSelection: exportAgentSelectionSnapshot(),
  };
}

/**
 * @param {object} bag
 */
export function importSkillPlatformBag(bag) {
  if (!bag || typeof bag !== "object") {
    return { ok: false, reason: "invalid_bag" };
  }

  /** @type {{ skillId: string, reason: string, path?: string }[]} */
  const integrityFlags = [];

  const platformResult = importSkillPlatformSnapshot(bag.platform || {}, {
    onHashMismatch(skillId, path, expected, actual) {
      integrityFlags.push({ skillId, reason: "hash_mismatch", path, expected, actual });
    },
  });

  if (bag.runs) importSkillRunsBag(bag.runs);
  if (bag.audit?.events) importSkillAuditBag(bag.audit);
  if (bag.memoryCandidates) importMemoryCandidatesBag(bag.memoryCandidates);
  if (bag.agentProfiles) importAgentProfilesBag(bag.agentProfiles);
  if (bag.agentSelection) importAgentSelectionSnapshot(bag.agentSelection);

  for (const flag of integrityFlags) {
    appendSkillAuditEvent({
      type: "rollback",
      skillId: flag.skillId,
      detail: "integrity_hash_mismatch",
      meta: { path: flag.path, expected: flag.expected, actual: flag.actual },
    });
  }

  return {
    ok: platformResult.ok !== false,
    integrityFlags,
    disabledSkills: platformResult.disabledSkills || [],
    counts: {
      catalog: Object.keys(bag.platform?.catalog || {}).length,
      runs: Object.keys(bag.runs?.runs || {}).length,
      auditEvents: (bag.audit?.events || []).length,
    },
  };
}

/**
 * Verify exported bag matches live state (verify scripts).
 * @param {object} exported
 * @param {object} live
 */
export function compareSkillPlatformBags(exported, live) {
  const exp = exported?.platform || {};
  const cur = live?.platform || {};
  const catalogMatch = JSON.stringify(exp.catalog) === JSON.stringify(cur.catalog);
  const installMatch = JSON.stringify(exp.installations) === JSON.stringify(cur.installations);
  const fileIndexMatch = JSON.stringify(exp.fileIndex) === JSON.stringify(cur.fileIndex);
  const runsMatch = JSON.stringify(exported?.runs) === JSON.stringify(live?.runs);
  return {
    ok: catalogMatch && installMatch && fileIndexMatch && runsMatch,
    catalogMatch,
    installMatch,
    fileIndexMatch,
    runsMatch,
  };
}

/**
 * Tamper helper for negative tests — mutate one file body in bag.
 * @param {object} bag
 * @param {string} skillId
 */
export function tamperSkillFileInBag(bag, skillId) {
  const clone = JSON.parse(JSON.stringify(bag));
  const files = clone.platform?.fileContents?.[skillId];
  if (!files) return clone;
  const version = Object.keys(files)[0];
  const path = Object.keys(files[version] || {})[0];
  if (path && files[version][path]) {
    files[version][path] = `${files[version][path]}\n/* tampered */`;
    const idx = clone.platform?.fileIndex?.[skillId];
    if (Array.isArray(idx) && idx[0]) {
      idx[0].hash = sha256Text("wrong-content");
    }
  }
  return clone;
}
