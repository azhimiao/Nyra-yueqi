/**
 * Commit approved character candidate via existing business Service.
 * Never called from OpenClaw tools directly.
 * Idempotent via taskId + artifactHash + operationType.
 */

import { createCharacter, getCharacter, upsertCharacter } from "../../characters/store.js";
import { buildCharacterDiff } from "./controlled-tools.js";
import {
  buildCommitIdempotencyKey,
  lookupCommitIdempotency,
  recordCommitIdempotency,
} from "./commit-idempotency.js";

/**
 * @param {object} candidate — workspace character JSON
 * @param {{ overwriteId?: string, dryRun?: boolean, idempotencyKey?: string }} [opts]
 */
export async function commitCharacterCandidate(candidate, opts = {}) {
  if (!candidate || typeof candidate !== "object") {
    return { ok: false, code: "INVALID_CANDIDATE", message: "候选角色无效" };
  }
  if (opts.overwriteId) {
    return {
      ok: false,
      code: "OVERWRITE_BLOCKED",
      message: "默认创建新角色，不允许覆盖已有角色",
    };
  }

  if (opts.idempotencyKey) {
    const prior = lookupCommitIdempotency(opts.idempotencyKey);
    if (prior?.characterId) {
      const existing = await getCharacter(prior.characterId).catch(() => null);
      return {
        ok: true,
        skipped: true,
        characterId: prior.characterId,
        name: existing?.name || prior.name,
        verified: Boolean(existing),
        idempotencyKey: opts.idempotencyKey,
        entryHint: existing
          ? `角色「${existing.name}」已存在（幂等），未重复创建`
          : "已提交过（幂等），跳过重复创建",
      };
    }
  }

  const name = String(candidate.name || "未命名").trim() || "未命名";
  const personality = String(candidate.personality || "").trim();
  const description = String(candidate.description || "").trim();

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      diff: buildCharacterDiff(
        { name, description },
        { name, description, personality },
      ),
    };
  }

  const created = await createCharacter({ name });
  const fields = [...(created.profile?.fields || [])];
  fields[0] = name;
  if (description) fields[2] = description;
  if (personality) fields[4] = personality;

  const saved = await upsertCharacter({
    id: created.id,
    name,
    alias: created.alias || name,
    profile: {
      ...(created.profile || {}),
      fields,
      promptDeveloper: personality
        ? `${created.profile?.promptDeveloper || ""}\n性格：${personality}`.trim()
        : created.profile?.promptDeveloper,
    },
    source: "import",
  });

  const verified = await getCharacter(saved.id);
  if (!verified) {
    return { ok: false, code: "VERIFY_FAILED", message: "写入后重新读取失败" };
  }
  const persona = verified.profile?.fields?.[4] || "";
  if (
    personality &&
    !String(persona).includes(personality) &&
    !String(verified.profile?.promptDeveloper || "").includes(personality)
  ) {
    return { ok: false, code: "VERIFY_MISMATCH", message: "校验未找到 personality" };
  }

  if (opts.idempotencyKey) {
    recordCommitIdempotency(opts.idempotencyKey, {
      characterId: verified.id,
      name: verified.name,
    });
  }

  return {
    ok: true,
    characterId: verified.id,
    name: verified.name,
    verified: true,
    idempotencyKey: opts.idempotencyKey,
    entryHint: `角色「${verified.name}」已导入，可在角色列表打开`,
  };
}

/**
 * Idempotent resume guard: checkpoint side-effects + durable idempotency key.
 * @param {{ id?: string, commitResultId?: string, checkpoint?: { completedSideEffects?: string[], payload?: object } }} task
 * @param {object} candidate
 */
export async function commitCharacterCandidateOnce(task, candidate) {
  const effects = task?.checkpoint?.completedSideEffects || [];
  if (task?.commitResultId || effects.includes("character.create")) {
    const existing = task.commitResultId ? await getCharacter(task.commitResultId).catch(() => null) : null;
    return {
      ok: true,
      skipped: true,
      characterId: task.commitResultId,
      name: existing?.name,
      verified: Boolean(existing),
      entryHint: existing ? `角色「${existing.name}」已存在，未重复创建` : "已提交过，跳过重复创建",
    };
  }

  const idempotencyKey =
    task?.checkpoint?.payload?.idempotencyKey ||
    (await buildCommitIdempotencyKey(task, candidate, "character.create"));

  return commitCharacterCandidate(candidate, { idempotencyKey });
}
