/**
 * Agent Profile schema — user-visible agents (关系探索, 栖机助手, …).
 */

import {
  AGENT_KINDS,
  DEFAULT_SCOPES,
  RUN_MODES,
} from "../skill-platform/schema.js";

export const AGENT_PROFILE_SCHEMA_VERSION = 1;

/** Built-in system console agent — settings/ops (not Explore work agent). */
export const BUILTIN_QIJI_ASSISTANT = Object.freeze({
  id: "qiji-assistant",
  name: "栖机助手",
  tagline: "系统操作台：解释功能、改设置、受控执行（需确认）。",
  icon: "sparkles",
  kind: "general",
  skillIds: [],
  defaultRunMode: "isolated_new",
  defaultScopes: { ...DEFAULT_SCOPES },
  enabled: true,
  builtin: true,
});

/** Default Explore work agent — Cursor/Codex-class; Skills are plugins. */
export const BUILTIN_WORK_AGENT_ID = "yueqi-agent";
export const BUILTIN_HOST_SKILL_ID = "yueqi-agent-core";

export const BUILTIN_WORK_AGENT = Object.freeze({
  id: BUILTIN_WORK_AGENT_ID,
  name: "月栖 Agent",
  tagline: "全能工作 Agent。Skill 像插件一样后期导入扩展能力。",
  icon: "bot",
  kind: "general",
  skillIds: [BUILTIN_HOST_SKILL_ID],
  defaultRunMode: "isolated_new",
  defaultScopes: { ...DEFAULT_SCOPES },
  enabled: true,
  builtin: true,
});

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function validateAgentProfile(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "invalid_profile" };
  }
  const p = /** @type {Record<string, unknown>} */ (raw);
  const id = String(p.id || "").trim();
  const name = String(p.name || "").trim();
  if (!id) return { ok: false, reason: "missing_id" };
  if (!name) return { ok: false, reason: "missing_name" };

  const kind = String(p.kind || "specialist");
  if (!AGENT_KINDS.includes(kind)) {
    return { ok: false, reason: "invalid_kind" };
  }

  const skillIds = Array.isArray(p.skillIds)
    ? p.skillIds.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const defaultRunMode = String(p.defaultRunMode || "isolated_new");
  if (!RUN_MODES.includes(defaultRunMode)) {
    return { ok: false, reason: "invalid_run_mode" };
  }

  const defaultScopes =
    p.defaultScopes && typeof p.defaultScopes === "object"
      ? { ...DEFAULT_SCOPES, .../** @type {object} */ (p.defaultScopes) }
      : { ...DEFAULT_SCOPES };

  return {
    ok: true,
    value: {
      id,
      name,
      tagline: String(p.tagline || "").trim(),
      icon: String(p.icon || "bot").trim(),
      kind,
      skillIds,
      defaultRunMode,
      defaultScopes,
      enabled: p.enabled !== false,
      builtin: Boolean(p.builtin),
      installedAt: p.installedAt ? String(p.installedAt) : undefined,
      updatedAt: p.updatedAt ? String(p.updatedAt) : undefined,
    },
  };
}

/**
 * @param {Partial<object>} overrides
 */
export function createAgentProfileFromSkill(manifest, overrides = {}) {
  const id = String(overrides.id || manifest.id || "").trim();
  const validated = validateAgentProfile({
    id: id || `agent-${manifest.id}`,
    name: overrides.name || manifest.name,
    tagline: overrides.tagline || manifest.description || "",
    icon: overrides.icon || "compass-heart",
    kind: "specialist",
    skillIds: [manifest.id],
    defaultRunMode: "isolated_new",
    defaultScopes: { ...DEFAULT_SCOPES },
    enabled: true,
    ...overrides,
  });
  return validated;
}
