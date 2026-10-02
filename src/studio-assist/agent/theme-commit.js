/**
 * Commit approved theme candidate via existing Direct Action gateway.
 * Never called from OpenClaw tools directly.
 */

import { THEMES } from "../../ui/theme.js";
import { executeAssistTool } from "../tools.js";
import {
  buildCommitIdempotencyKey,
  lookupCommitIdempotency,
  recordCommitIdempotency,
} from "./commit-idempotency.js";

/**
 * @param {{ id?: string, label?: string }} candidate
 * @param {{ idempotencyKey?: string, dryRun?: boolean }} [opts]
 */
export async function commitThemeCandidate(candidate, opts = {}) {
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, code: "INVALID_CANDIDATE", message: "主题候选无效" };
  }
  const id = String(candidate.id || "").trim();
  if (!id || !THEMES.some((theme) => theme.id === id)) {
    return { ok: false, code: "UNKNOWN_THEME", message: "仅可应用内置主题 id（月栖纸/青雾/松烟/墨夜）" };
  }

  if (opts.idempotencyKey) {
    const prior = lookupCommitIdempotency(opts.idempotencyKey);
    if (prior?.themeId) {
      return {
        ok: true,
        skipped: true,
        themeId: prior.themeId,
        entryHint: `主题「${THEMES.find((t) => t.id === prior.themeId)?.label || prior.themeId}」已应用（幂等）`,
      };
    }
  }

  if (opts.dryRun) {
    return { ok: true, dryRun: true, themeId: id };
  }

  const applied = await executeAssistTool("appearance.apply_theme", { id }, { confirmed: true });
  if (!applied.ok) {
    return { ok: false, code: "APPLY_FAILED", message: applied.summary || "应用主题失败" };
  }

  if (opts.idempotencyKey) {
    recordCommitIdempotency(opts.idempotencyKey, { characterId: id, themeId: id, name: id });
  }

  const label = THEMES.find((theme) => theme.id === id)?.label || id;
  return {
    ok: true,
    themeId: id,
    entryHint: applied.summary || `已应用主题「${label}」`,
  };
}

/**
 * @param {object} task
 * @param {{ id?: string }} candidate
 */
export async function commitThemeCandidateOnce(task, candidate) {
  const effects = task?.checkpoint?.completedSideEffects || [];
  if (task?.commitResultId || effects.includes("theme.apply")) {
    return {
      ok: true,
      skipped: true,
      themeId: task.commitResultId,
      entryHint: "主题已应用，跳过重复提交",
    };
  }
  const idempotencyKey =
    task?.checkpoint?.payload?.idempotencyKey ||
    (await buildCommitIdempotencyKey(task, candidate, "theme.apply"));
  return commitThemeCandidate(candidate, { idempotencyKey });
}

export function buildThemeDiff(beforeId, candidate) {
  const afterId = String(candidate?.id || "");
  return {
    createNew: false,
    overwriteExisting: false,
    reversible: true,
    fields: [{ field: "theme.id", before: beforeId || null, after: afterId, changed: beforeId !== afterId }],
    summary: beforeId !== afterId ? ["theme.id"] : [],
  };
}
