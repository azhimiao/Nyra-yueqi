/**
 * SkillRun authorization scopes — four independent grants (plan §2.2).
 * Hard rule: never derive memoryWrite from characterVisibility or vice versa.
 */

import { DEFAULT_SCOPES, RUN_MODES } from "./schema.js";

export const CONVERSATION_READ_SCOPES = Object.freeze(["none", "snapshot", "shared_live"]);

export const MEMORY_READ_SCOPES = Object.freeze([
  "none",
  "global_personal",
  "selected_character",
  "relationship",
]);

export const CHARACTER_VISIBILITY_SCOPES = Object.freeze(["private", "selected_character"]);

export const MEMORY_WRITE_SCOPES = Object.freeze([
  "off",
  "propose_personal",
  "propose_character",
  "propose_both",
]);

/** Expected conversationRead for each run mode (plan §2.1). */
export const MODE_CONVERSATION_READ = Object.freeze({
  isolated_new: "none",
  snapshot_copy: "snapshot",
  shared_live: "shared_live",
});

/**
 * @param {unknown} raw
 * @returns {typeof DEFAULT_SCOPES}
 */
export function normalizeScopes(raw) {
  const input = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    conversationRead: CONVERSATION_READ_SCOPES.includes(String(input.conversationRead))
      ? String(input.conversationRead)
      : DEFAULT_SCOPES.conversationRead,
    memoryRead: MEMORY_READ_SCOPES.includes(String(input.memoryRead))
      ? String(input.memoryRead)
      : DEFAULT_SCOPES.memoryRead,
    characterVisibility: CHARACTER_VISIBILITY_SCOPES.includes(String(input.characterVisibility))
      ? String(input.characterVisibility)
      : DEFAULT_SCOPES.characterVisibility,
    memoryWrite: MEMORY_WRITE_SCOPES.includes(String(input.memoryWrite))
      ? String(input.memoryWrite)
      : DEFAULT_SCOPES.memoryWrite,
  };
}

/**
 * @param {unknown} scopes
 * @param {{ mode?: string, characterId?: string }} [opts]
 * @returns {{ ok: true, value: ReturnType<typeof normalizeScopes> } | { ok: false, reason: string }}
 */
export function validateScopes(scopes, opts = {}) {
  const normalized = normalizeScopes(scopes);
  const mode = opts.mode ? String(opts.mode) : null;

  if (mode && RUN_MODES.includes(mode)) {
    const expected = MODE_CONVERSATION_READ[mode];
    if (normalized.conversationRead !== expected) {
      return {
        ok: false,
        reason: `conversationRead_must_be_${expected}_for_mode_${mode}`,
      };
    }
  }

  if (
    normalized.characterVisibility === "selected_character" &&
    !String(opts.characterId || "").trim()
  ) {
    return { ok: false, reason: "character_visibility_requires_character_id" };
  }

  if (
    (normalized.memoryRead === "selected_character" ||
      normalized.memoryRead === "relationship") &&
    !String(opts.characterId || "").trim()
  ) {
    return { ok: false, reason: "memory_read_character_scope_requires_character_id" };
  }

  return { ok: true, value: normalized };
}

/**
 * Plain-language summary for Capability / Scope cards (plan §2.3).
 * @param {unknown} scopes
 */
export function scopesSummaryPlainLanguage(scopes) {
  const s = normalizeScopes(scopes);
  const lines = [];

  switch (s.conversationRead) {
    case "none":
      lines.push("不读取现有聊天，仅使用本次 Skill 会话。");
      break;
    case "snapshot":
      lines.push("读取启动时的聊天副本；之后不会继续同步原会话。");
      break;
    case "shared_live":
      lines.push("与当前聊天共用同一条时间线；Skill 发言带来源标识。");
      break;
    default:
      lines.push(`会话读取：${s.conversationRead}`);
  }

  switch (s.memoryRead) {
    case "none":
      lines.push("不读取长期记忆。");
      break;
    case "global_personal":
      lines.push("可检索你的个人长期记忆。");
      break;
    case "selected_character":
      lines.push("可检索指定角色的相关记忆。");
      break;
    case "relationship":
      lines.push("可检索你们的关系与同栖记忆。");
      break;
    default:
      lines.push(`记忆读取：${s.memoryRead}`);
  }

  switch (s.characterVisibility) {
    case "private":
      lines.push("本次 Skill 结论仅 Skill 可见，不会注入恋人聊天。");
      break;
    case "selected_character":
      lines.push("经你确认后，结论可成为指定角色的可见上下文。");
      break;
    default:
      lines.push(`角色可见性：${s.characterVisibility}`);
  }

  switch (s.memoryWrite) {
    case "off":
      lines.push("默认不写记忆；结束时逐条请你确认。");
      break;
    case "propose_personal":
      lines.push("可提议写入你的个人记忆（需你确认）。");
      break;
    case "propose_character":
      lines.push("可提议写入角色记忆（需你确认）。");
      break;
    case "propose_both":
      lines.push("可提议写入个人或角色记忆（需你确认）。");
      break;
    default:
      lines.push(`记忆写入：${s.memoryWrite}`);
  }

  return lines.join("\n");
}

/**
 * Whether SkillRun state / private conclusions may appear in lover character prompt.
 * Independent from memoryWrite — characterVisibility alone controls exposure.
 * @param {unknown} scopes
 */
export function shouldExposeSkillToCharacter(scopes) {
  const s = normalizeScopes(scopes);
  return s.characterVisibility === "selected_character";
}

/**
 * Build default scopes for a run mode (does not cross-derive memoryWrite / visibility).
 * @param {string} mode
 */
export function defaultScopesForMode(mode) {
  const conversationRead = MODE_CONVERSATION_READ[mode] || DEFAULT_SCOPES.conversationRead;
  return normalizeScopes({
    ...DEFAULT_SCOPES,
    conversationRead,
  });
}
