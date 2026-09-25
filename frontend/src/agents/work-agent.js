/**
 * Default Explore work agent — Cursor/Codex-class general agent.
 * Skills are optional plugins attached later (not specialist personas).
 */

import {
  ensureBuiltinProfiles,
  getAgentProfile,
  attachSkillToProfile,
  installAgentProfile,
} from "./profile-store.js";
import { BUILTIN_WORK_AGENT, BUILTIN_WORK_AGENT_ID, BUILTIN_HOST_SKILL_ID } from "./profile-schema.js";
import {
  getCatalogEntry,
  upsertCatalogEntry,
  upsertInstallation,
  putSkillFile,
  getInstallation,
} from "../skill-platform/store.js";

export { BUILTIN_WORK_AGENT, BUILTIN_WORK_AGENT_ID, BUILTIN_HOST_SKILL_ID };

const HOST_SKILL_VERSION = "1.0.0";

const HOST_SKILL_MD = `---
name: 月栖 Agent 核心
description: 全能工作 Agent 的宿主能力。已安装的 Skill 作为插件按需加载。
id: yueqi-agent-core
version: 1.0.0
---

# 月栖 Agent

你是月栖探索里的默认全能工作 Agent（类似 Cursor Agent / Codex）：用对话理解目标、规划步骤、调用已授权能力。

规则：
- 你不是恋人角色，也不替代 Pop 陪伴。
- 已安装的 Skill 是插件：需要时按任务选用，不要假装用户必须先「选专家」。
- 需要写入文件、解压、安装 Skill、创建任务时，只提出受控提议，等待宿主审批。
- 默认独立会话；未经用户确认，不读写恋人记忆。
`;

const HOST_SYSTEM = `# 月栖 Agent Host

你是全能工作 Agent。用户直接跟你对话完成任务。
已挂载的 Skill 插件会由宿主按需注入；没有插件时你仍可对话、规划、说明限制。
`;

/**
 * Ensure work agent + host core skill (always available plugin base).
 */
export function ensureWorkAgentReady() {
  ensureBuiltinProfiles();
  let profile = getAgentProfile(BUILTIN_WORK_AGENT_ID);
  if (!profile) {
    installAgentProfile({
      ...BUILTIN_WORK_AGENT,
      installedAt: new Date().toISOString(),
    });
    profile = getAgentProfile(BUILTIN_WORK_AGENT_ID);
  }

  if (!getCatalogEntry(BUILTIN_HOST_SKILL_ID)) {
    upsertCatalogEntry({
      schemaVersion: 1,
      id: BUILTIN_HOST_SKILL_ID,
      name: "月栖 Agent 核心",
      version: HOST_SKILL_VERSION,
      description: "全能工作 Agent 宿主能力；其他 Skill 作为插件扩展。",
      category: "system",
      entry: "SKILL.md",
      resources: { system: ["prompts/system.md"], policies: [], schemas: [], evals: [] },
      triggers: ["帮我", "写一个", "解压", "安装", "创建 skill"],
      outputMode: "structured_dialogue",
      allowedActions: ["REPLY", "REFLECT", "SYNTHESIZE"],
      requestedCapabilities: ["structured-notes", "local-files"],
      requestedDataScopes: [],
      execution: { kind: "prompt_policy", modelInvocation: "host_only" },
      integrity: { sha256: "builtin-host" },
      sourceLabel: "builtin",
      status: "installed",
      installedAt: new Date().toISOString(),
    });
    putSkillFile(BUILTIN_HOST_SKILL_ID, HOST_SKILL_VERSION, "SKILL.md", HOST_SKILL_MD);
    putSkillFile(BUILTIN_HOST_SKILL_ID, HOST_SKILL_VERSION, "prompts/system.md", HOST_SYSTEM);
  } else {
    const host = getCatalogEntry(BUILTIN_HOST_SKILL_ID);
    if (host && !(Array.isArray(host.allowedActions) && host.allowedActions.includes("REPLY"))) {
      upsertCatalogEntry({
        ...host,
        allowedActions: ["REPLY", "REFLECT", "SYNTHESIZE"],
      });
    }
  }

  if (!getInstallation(BUILTIN_HOST_SKILL_ID)) {
    upsertInstallation({
      skillId: BUILTIN_HOST_SKILL_ID,
      version: HOST_SKILL_VERSION,
      enabled: true,
      grants: { capabilities: ["structured-notes", "local-files"] },
      pinned: true,
    });
  }

  attachSkillToProfile(BUILTIN_WORK_AGENT_ID, BUILTIN_HOST_SKILL_ID);
  return getAgentProfile(BUILTIN_WORK_AGENT_ID);
}

/**
 * @returns {object|null}
 */
export function getDefaultWorkAgent() {
  ensureWorkAgentReady();
  return getAgentProfile(BUILTIN_WORK_AGENT_ID);
}

/**
 * Plugin skill ids on the work agent (excludes host core when wantPluginsOnly).
 * @param {{ includeHost?: boolean }} [opts]
 */
export function listWorkAgentPlugins(opts = {}) {
  const agent = getDefaultWorkAgent();
  const ids = agent?.skillIds || [];
  return ids.filter((id) => {
    if (!opts.includeHost && id === BUILTIN_HOST_SKILL_ID) return false;
    return Boolean(getCatalogEntry(id) && getInstallation(id)?.enabled !== false);
  });
}

/**
 * Primary skill for starting an Explore session: host core (always).
 */
export function getWorkAgentSessionSkillId() {
  ensureWorkAgentReady();
  return BUILTIN_HOST_SKILL_ID;
}
