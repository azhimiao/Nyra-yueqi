/**
 * Declarative skill install with explicit capability grants.
 * Default deny: declared capabilities must be granted at install time.
 */

import { importSkillBundle, previewSkillBundle } from "./importer.js";
import {
  getCatalogEntry,
  getInstallation,
  upsertInstallation,
  deleteSkillCompletely,
  listInstallations,
} from "./store.js";
import { detachSkillFromProfile } from "../agents/profile-store.js";
import { BUILTIN_HOST_SKILL_ID, BUILTIN_WORK_AGENT_ID } from "../agents/profile-schema.js";
import { appendSkillAuditEvent } from "./audit.js";
import { isCapabilityGranted } from "./runtime.js";
import {
  CAPABILITY_LABELS,
  normalizeGrantedCapabilities,
  missingInstallGrants,
  validateInstallGrants,
  capabilityLabel,
} from "./grants.js";
import { assertSkillInstallAllowed } from "../agent/capabilities/prefs.js";
import { appendActivity } from "../companion/activity-log.js";

export {
  CAPABILITY_LABELS,
  normalizeGrantedCapabilities,
  missingInstallGrants,
  validateInstallGrants,
  capabilityLabel,
};

/**
 * Install preview or confirmed bundle with grant validation.
 * @param {{
 *   files: Record<string, string>,
 *   sourceLabel?: string,
 *   confirm?: boolean,
 *   grantedCapabilities?: string[],
 *   attachToAgentId?: string,
 *   selectedSkillIds?: string[],
 *   repairFiles?: boolean,
 *   skipGrantValidation?: boolean,
 * }} input
 */
export function installSkillWithGrants(input) {
  const installGate = assertSkillInstallAllowed();
  if (!installGate.ok) {
    return { ok: false, stage: "prefs", reason: installGate.reason, error: "skill_install_disabled" };
  }
  const preview = previewSkillBundle(input?.files || {}, {
    sourceLabel: input?.sourceLabel || "install-flow",
  });
  if (!preview.ok) return preview;

  if (!input?.confirm) {
    return preview;
  }

  const selected = input.selectedSkillIds?.length
    ? new Set(input.selectedSkillIds.map(String))
    : null;

  for (const skill of preview.skills) {
    if (selected && !selected.has(skill.manifest.id)) continue;
    if (input.skipGrantValidation) continue;
    const check = validateInstallGrants(skill.manifest, input.grantedCapabilities || []);
    if (!check.ok) {
      appendSkillAuditEvent({
        type: "import",
        skillId: skill.manifest.id,
        detail: `rejected:${check.reason}`,
        meta: { missing: check.missing, undeclared: check.undeclared },
      });
      return {
        ok: false,
        stage: "grants",
        reason: check.reason,
        skillId: skill.manifest.id,
        missing: check.missing,
        undeclared: check.undeclared,
      };
    }
  }

  const result = importSkillBundle({
    files: input.files,
    sourceLabel: input.sourceLabel || "install-flow",
    confirm: true,
    grantedCapabilities: input.grantedCapabilities || [],
    attachToAgentId: input.attachToAgentId,
    selectedSkillIds: input.selectedSkillIds,
    repairFiles: Boolean(input.repairFiles),
  });
  if (result?.ok) {
    appendActivity({
      title: "Skill 已安装",
      reason: "用户确认安装并授权能力",
      capability: "Skill",
      resourcesRead: ["Skill 包清单"],
      changes: ["安装声明式 Skill"],
      usedModel: false,
      source: "skill_install",
    });
  }
  return result;
}

/**
 * @param {string} skillId
 * @param {boolean} enabled
 */
export function setSkillEnabled(skillId, enabled) {
  const id = String(skillId || "").trim();
  if (!id) return { ok: false, reason: "missing_skill_id" };
  if (id === BUILTIN_HOST_SKILL_ID) return { ok: false, reason: "host_protected" };
  const inst = getInstallation(id);
  if (!inst) return { ok: false, reason: "not_installed" };
  const next = upsertInstallation({ ...inst, enabled: Boolean(enabled) });
  appendSkillAuditEvent({
    type: enabled ? "enable" : "disable",
    skillId: id,
    version: inst.version,
    detail: "cp14-toggle",
  });
  return next;
}

/**
 * Uninstall skill from platform (catalog, files, grants, agent attach).
 * @param {string} skillId
 */
export function uninstallSkillFromPlatform(skillId) {
  const id = String(skillId || "").trim();
  if (!id) return { ok: false, reason: "missing_skill_id" };
  if (id === BUILTIN_HOST_SKILL_ID) return { ok: false, reason: "host_protected" };
  if (!getInstallation(id) && !getCatalogEntry(id)) {
    return { ok: false, reason: "not_installed" };
  }
  try {
    detachSkillFromProfile(BUILTIN_WORK_AGENT_ID, id);
  } catch {
    /* ignore */
  }
  deleteSkillCompletely(id);
  appendSkillAuditEvent({ type: "delete", skillId: id, detail: "cp14-uninstall" });
  return { ok: true, skillId: id };
}

/**
 * List user-installed skills (excludes host core).
 */
export function listInstalledMarketSkills() {
  return Object.values(listInstallations())
    .filter((inst) => inst.skillId !== BUILTIN_HOST_SKILL_ID)
    .map((inst) => ({
      installation: inst,
      catalog: getCatalogEntry(inst.skillId),
      missingGrants: missingInstallGrants(getCatalogEntry(inst.skillId), inst),
    }));
}

/**
 * Runtime triple-gate helper for tests and docs.
 */
export function checkRuntimeCapability(manifest, installation, run, capabilityId) {
  return isCapabilityGranted(manifest, installation, run, capabilityId);
}
