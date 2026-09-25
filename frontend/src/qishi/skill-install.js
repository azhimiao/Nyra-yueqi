/**
 * 栖市 ↔ 声明式 Skill 安装桥（权限授予后再安装）。
 * Keeps YEOS zip packages separate; only skill-platform SKILL.md bundles.
 */

export {
  installSkillWithGrants,
  validateInstallGrants,
  normalizeGrantedCapabilities,
  missingInstallGrants,
  setSkillEnabled,
  uninstallSkillFromPlatform,
  listInstalledMarketSkills,
  checkRuntimeCapability,
  capabilityLabel,
  CAPABILITY_LABELS,
} from "../skill-platform/install-flow.js";

import { previewSkillBundle } from "../skill-platform/importer.js";
import { getCatalogEntry, getInstallation } from "../skill-platform/store.js";
import { installSkillWithGrants, missingInstallGrants } from "../skill-platform/install-flow.js";
import { BUILTIN_WORK_AGENT_ID } from "../agents/profile-schema.js";

/** Built-in shelf metadata for declarative skills (not YEOS game zips). */
export const SKILL_SHELF = Object.freeze([
  {
    id: "relationship-intelligence",
    name: "关系探索",
    developer: "月栖 Skill",
    summary: "声明式顾问 Skill · 需授权结构化笔记等能力",
    category: "工具",
    icon: "heart-handshake",
    tone: "sea",
    version: "1.1.0",
    fixtureKey: "relationship-intelligence",
  },
]);

/**
 * @param {string} id
 */
export function getSkillShelfItem(id) {
  return SKILL_SHELF.find((item) => item.id === String(id || "").trim()) || null;
}

/**
 * @param {Record<string, Record<string, string>>} fixtureFilesByKey
 * @param {string} shelfId
 */
export function shelfFilesForInstall(fixtureFilesByKey, shelfId) {
  const item = getSkillShelfItem(shelfId);
  if (!item) return null;
  return fixtureFilesByKey?.[item.fixtureKey] || null;
}

/**
 * Preview shelf skill before grant sheet.
 * @param {Record<string, string>} files
 */
export function previewShelfSkill(files) {
  return previewSkillBundle(files, { sourceLabel: "qishi-shelf" });
}

/**
 * Install shelf skill after user grants declared capabilities.
 * @param {{
 *   files: Record<string, string>,
 *   grantedCapabilities: string[],
 *   shelfId?: string,
 * }} input
 */
export function installShelfSkill(input) {
  return installSkillWithGrants({
    files: input.files,
    sourceLabel: input.shelfId ? `qishi:${input.shelfId}` : "qishi-shelf",
    confirm: true,
    grantedCapabilities: input.grantedCapabilities || [],
    attachToAgentId: BUILTIN_WORK_AGENT_ID,
  });
}

/**
 * Skill row for 栖市「已装」— permission pill + enable state.
 * @param {string} skillId
 */
export function getSkillInstallStatus(skillId) {
  const catalog = getCatalogEntry(skillId);
  const installation = getInstallation(skillId);
  if (!catalog || !installation) return null;
  const missing = missingInstallGrants(catalog, installation);
  return {
    skillId,
    name: catalog.name || skillId,
    version: installation.version || catalog.version,
    enabled: installation.enabled !== false,
    missingGrants: missing,
    pendingAuth: missing.length > 0,
  };
}
