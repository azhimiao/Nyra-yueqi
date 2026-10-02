/**
 * Skill Import Wizard backend — discover, preview, validate, install with rollback.
 */

import { discoverSkillManifests } from "./manifest.js";
import { validateSkillBundleFiles, normalizeRelativePath } from "./integrity.js";
import {
  upsertCatalogEntry,
  getCatalogEntry,
  putSkillFile,
  upsertInstallation,
  removeInstallation,
  removeCatalogEntry,
  deleteSkillFiles,
  setUpgradeCandidate,
  countSkillPlatformResidue,
  getInstallation,
  listCatalogEntries,
  skillFilesMissing,
} from "./store.js";
import { appendSkillAuditEvent } from "./audit.js";
import {
  attachSkillToProfile,
  findProfileBySkillId,
  installAgentProfile,
} from "../agents/profile-store.js";
import { BUILTIN_WORK_AGENT_ID, createAgentProfileFromSkill } from "../agents/profile-schema.js";
import { ensureWorkAgentReady } from "../agents/work-agent.js";
import { normalizeGrantedCapabilities } from "./grants.js";

/**
 * Build plain-language capability card preview.
 * @param {object} manifest
 */
export function buildCapabilityPreview(manifest) {
  const willRead = [];
  if (manifest.resources?.system?.length) {
    willRead.push("专业对话方法与系统指引");
  }
  if (manifest.resources?.policies?.length) {
    willRead.push("安全与对话边界规则");
  }
  if (manifest.resources?.schemas?.length) {
    willRead.push("过程状态与结构化记录模板");
  }
  if ((manifest.requestedDataScopes || []).includes("conversation.snapshot")) {
    willRead.push("你授权的聊天副本");
  }
  if ((manifest.requestedDataScopes || []).includes("memory.personal")) {
    willRead.push("你授权的个人记忆");
  }

  const mayProposeTasks = (manifest.requestedCapabilities || []).map((cap) => {
    const labels = {
      "structured-notes": "保存结构化笔记",
      "calendar-draft": "起草日历提醒",
      "note-from-chat": "从聊天提取笔记",
      "page-summary": "总结页面内容",
    };
    return labels[cap] || `提议任务：${cap}`;
  });

  const risks = [];
  if ((manifest.requestedCapabilities || []).length > 0) {
    risks.push("可能提议本地任务，需你在任务中心逐次批准");
  }
  if ((manifest.requestedDataScopes || []).length > 0) {
    risks.push("可能申请读取聊天或记忆，默认不授权");
  }
  risks.push("不会执行包内代码；模型调用仅由月栖 Host 发起");

  return {
    name: manifest.name,
    description: manifest.description || "",
    willRead,
    mayProposeTasks,
    risks,
  };
}

/**
 * @param {Record<string, string>} files
 */
export function normalizeFilesMap(files) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [rawPath, content] of Object.entries(files || {})) {
    out[normalizeRelativePath(rawPath)] = String(content ?? "");
  }
  return out;
}

/**
 * @param {Record<string, string>} files
 * @param {{ sourceLabel?: string }} [opts]
 */
export function previewSkillBundle(files, opts = {}) {
  const normalized = normalizeFilesMap(files);
  const integrity = validateSkillBundleFiles(normalized);
  if (!integrity.ok) {
    return { ok: false, stage: "validate", reason: integrity.reason, path: integrity.path };
  }

  const { discovered, errors } = discoverSkillManifests(normalized);
  if (discovered.length === 0) {
    return {
      ok: false,
      stage: "parse",
      reason: errors[0]?.reason || "no_skills_found",
      errors,
    };
  }

  const skills = discovered.map((d) => ({
    manifest: d.value,
    skillMdPath: d.skillMdPath,
    preview: buildCapabilityPreview(d.value),
    fileCount: Object.keys(d.files).length,
  }));

  return {
    ok: true,
    stage: "preview",
    sourceLabel: opts.sourceLabel || "import",
    skillCount: skills.length,
    skills,
  };
}

/**
 * @param {string} skillId
 * @param {string} [version]
 */
function rollbackSkillInstall(skillId, version) {
  const entry = getCatalogEntry(skillId);
  const ver = version || entry?.version;
  if (ver) deleteSkillFiles(skillId, ver);
  removeCatalogEntry(skillId);
  removeInstallation(skillId);
  appendSkillAuditEvent({
    type: "rollback",
    skillId,
    version: ver,
    detail: "import rollback",
  });
}

/**
 * @param {object} manifest
 * @param {Record<string, string>} scopedFiles
 * @param {{ sourceLabel?: string, attachToAgentId?: string, createSpecialistAgent?: boolean, repairFiles?: boolean, grantedCapabilities?: string[] }} opts
 */
function installOneSkill(manifest, scopedFiles, opts) {
  const existing = getCatalogEntry(manifest.id);

  if (existing && existing.version !== manifest.version) {
    setUpgradeCandidate(manifest.id, {
      currentVersion: existing.version,
      candidateVersion: manifest.version,
      manifest,
    });
    appendSkillAuditEvent({
      type: "upgrade",
      skillId: manifest.id,
      version: manifest.version,
      detail: "upgrade candidate detected",
    });
    return {
      ok: true,
      action: "upgrade_candidate",
      skillId: manifest.id,
      currentVersion: existing.version,
      candidateVersion: manifest.version,
    };
  }

  if (existing && existing.version === manifest.version) {
    // Old installs kept catalog in localStorage but dropped in-memory files — repair.
    if (skillFilesMissing(manifest.id, manifest.version) || opts.repairFiles) {
      /** @type {string[]} */
      const repaired = [];
      for (const [path, content] of Object.entries(scopedFiles || {})) {
        putSkillFile(manifest.id, manifest.version, path, content);
        repaired.push(path);
      }
      if (repaired.length > 0) {
        upsertInstallation({
          skillId: manifest.id,
          version: manifest.version,
          enabled: getInstallation(manifest.id)?.enabled !== false,
          grants: getInstallation(manifest.id)?.grants || {
            capabilities: normalizeGrantedCapabilities(
              manifest,
              opts.grantedCapabilities || getInstallation(manifest.id)?.grants?.capabilities || [],
            ),
          },
          pinned: Boolean(getInstallation(manifest.id)?.pinned),
        });
        appendSkillAuditEvent({
          type: "install",
          skillId: manifest.id,
          version: manifest.version,
          detail: "repaired_missing_files",
        });
        return {
          ok: true,
          action: "repaired_files",
          skillId: manifest.id,
          version: manifest.version,
          fileCount: repaired.length,
        };
      }
    }
    return {
      ok: true,
      action: "already_installed",
      skillId: manifest.id,
      version: manifest.version,
    };
  }

  /** @type {string[]} */
  const writtenPaths = [];
  try {
    upsertCatalogEntry({
      ...manifest,
      sourceLabel: opts.sourceLabel || manifest.sourceLabel,
      installedAt: new Date().toISOString(),
      status: "installed",
    });

    for (const [path, content] of Object.entries(scopedFiles)) {
      putSkillFile(manifest.id, manifest.version, path, content);
      writtenPaths.push(path);
    }

    upsertInstallation({
      skillId: manifest.id,
      version: manifest.version,
      enabled: true,
      grants: {
        capabilities: normalizeGrantedCapabilities(manifest, opts.grantedCapabilities || []),
      },
      pinned: false,
    });

    appendSkillAuditEvent({
      type: "install",
      skillId: manifest.id,
      version: manifest.version,
      detail: opts.sourceLabel || "import",
    });

    let agentProfile = null;
    // Skills are plugins on the default work agent (Cursor-style), not new specialist agents.
    ensureWorkAgentReady();
    const targetAgentId = String(opts.attachToAgentId || BUILTIN_WORK_AGENT_ID).trim();
    if (opts.createSpecialistAgent === true) {
      const existingProfile = findProfileBySkillId(manifest.id);
      if (existingProfile) {
        agentProfile = existingProfile;
      } else {
        const built = createAgentProfileFromSkill(manifest, {
          id: manifest.id,
          icon: "puzzle",
        });
        if (built.ok) {
          const installed = installAgentProfile(built.value);
          if (installed.ok) agentProfile = installed.value;
        }
      }
    } else {
      const attach = attachSkillToProfile(targetAgentId, manifest.id);
      if (attach.ok) agentProfile = attach.value;
    }

    appendSkillAuditEvent({
      type: "import",
      skillId: manifest.id,
      version: manifest.version,
      detail: agentProfile ? `agent:${agentProfile.id}` : "no_agent",
    });

    return {
      ok: true,
      action: "installed",
      skillId: manifest.id,
      version: manifest.version,
      agentProfile,
      fileCount: writtenPaths.length,
    };
  } catch (err) {
    rollbackSkillInstall(manifest.id, manifest.version);
    return {
      ok: false,
      stage: "write",
      reason: "install_failed",
      detail: String(err?.message || err),
      residue: countSkillPlatformResidue(),
    };
  }
}

/**
 * @param {{
 *   files: Record<string, string>,
 *   sourceLabel?: string,
 *   confirm?: boolean,
 *   attachToAgentId?: string,
 *   selectedSkillIds?: string[],
 *   repairFiles?: boolean,
 *   grantedCapabilities?: string[],
 * }} input
 */
export function importSkillBundle(input) {
  const files = normalizeFilesMap(input?.files || {});
  const sourceLabel = input?.sourceLabel || "import";

  const preview = previewSkillBundle(files, { sourceLabel });
  if (!preview.ok) {
    appendSkillAuditEvent({
      type: "import",
      detail: `rejected:${preview.reason}`,
      meta: { path: preview.path },
    });
    return preview;
  }

  if (!input?.confirm) {
    return preview;
  }

  const selected = input.selectedSkillIds?.length
    ? new Set(input.selectedSkillIds.map(String))
    : null;

  /** @type {object[]} */
  const results = [];
  for (const skill of preview.skills) {
    if (selected && !selected.has(skill.manifest.id)) continue;

    const { discovered } = discoverSkillManifests(files);
    const match = discovered.find((d) => d.value.id === skill.manifest.id);
    if (!match) {
      results.push({ ok: false, skillId: skill.manifest.id, reason: "manifest_lost" });
      continue;
    }

    const result = installOneSkill(match.value, match.files, {
      sourceLabel,
      attachToAgentId: input.attachToAgentId,
      repairFiles: Boolean(input.repairFiles),
      grantedCapabilities: input.grantedCapabilities,
    });
    results.push(result);
    if (result.ok === false) {
      return {
        ok: false,
        stage: result.stage || "activate",
        reason: result.reason,
        results,
        residue: countSkillPlatformResidue(),
      };
    }
  }

  return {
    ok: true,
    stage: "activate",
    sourceLabel,
    results,
    catalogCount: Object.keys(listCatalogEntries()).length,
  };
}
