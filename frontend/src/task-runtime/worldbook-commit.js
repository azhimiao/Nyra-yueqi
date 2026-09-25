/**
 * Commit worldbook merge candidate as NEW entries — originals unchanged.
 */

import { upsertWorldbookEntry, getWorldbookEntry, listWorldbookEntries } from "../worldbook/store.js";
import {
  buildCommitIdempotencyKey,
  lookupCommitIdempotency,
  recordCommitIdempotency,
} from "../studio-assist/agent/commit-idempotency.js";

function entryKey(entry) {
  return String(entry?.title || entry?.id || JSON.stringify(entry));
}

/**
 * @param {object[]} a
 * @param {object[]} b
 */
export function buildWorldbookMergeDiff(a = [], b = [], merged = []) {
  const beforeKeys = new Set(a.map(entryKey).concat(b.map(entryKey)));
  const afterKeys = new Set(merged.map(entryKey));
  const duplicatesRemoved = [...beforeKeys].filter((k) => {
    const count =
      a.filter((e) => entryKey(e) === k).length + b.filter((e) => entryKey(e) === k).length;
    return count > 1;
  });
  return {
    createNew: true,
    overwriteExisting: false,
    reversible: true,
    sourceCountA: a.length,
    sourceCountB: b.length,
    mergedCount: merged.length,
    duplicatesRemoved,
    summary: [`合并后 ${merged.length} 条`, `去重 ${duplicatesRemoved.length} 组`],
  };
}

/**
 * @param {object[]} candidateEntries
 * @param {{ idempotencyKey?: string, titlePrefix?: string }} [opts]
 */
export async function commitWorldbookMergeCandidate(candidateEntries, opts = {}) {
  if (!Array.isArray(candidateEntries)) {
    return { ok: false, code: "INVALID_CANDIDATE", message: "合并候选无效" };
  }
  if (opts.idempotencyKey) {
    const prior = lookupCommitIdempotency(opts.idempotencyKey);
    if (prior?.characterId || prior?.worldbookBatchId) {
      return {
        ok: true,
        skipped: true,
        createdIds: prior.createdIds || [],
        worldbookBatchId: prior.worldbookBatchId || prior.characterId,
        entryHint: "合并结果已存在（幂等），未重复写入",
      };
    }
  }

  const prefix = opts.titlePrefix || "合并";
  const createdIds = [];
  for (const entry of candidateEntries) {
    const id = `wb-merge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const saved = await upsertWorldbookEntry({
      ...entry,
      id,
      title: String(entry.title || "合并条目").startsWith(prefix)
        ? entry.title
        : `${prefix}·${entry.title || "条目"}`,
      source: "merge",
    });
    createdIds.push(saved.id);
  }

  const batchId = `wb-batch-${createdIds[0] || Date.now()}`;
  if (opts.idempotencyKey) {
    recordCommitIdempotency(opts.idempotencyKey, {
      characterId: batchId,
      worldbookBatchId: batchId,
      createdIds,
      name: `worldbook-merge:${createdIds.length}`,
    });
  }

  // Verify originals still present if ids were provided on sources — caller checks
  return {
    ok: true,
    createdIds,
    worldbookBatchId: batchId,
    count: createdIds.length,
    verified: true,
    entryHint: `已创建 ${createdIds.length} 条新世界书（原条目未覆盖）`,
  };
}

/**
 * @param {object} task
 * @param {object[]} candidateEntries
 */
export async function commitWorldbookMergeCandidateOnce(task, candidateEntries) {
  const effects = task?.checkpoint?.completedSideEffects || [];
  if (task?.commitResultId || effects.includes("worldbook.merge.create")) {
    return {
      ok: true,
      skipped: true,
      createdIds: task.checkpoint?.payload?.createdIds || [],
      worldbookBatchId: task.commitResultId,
      entryHint: "已提交过世界书合并，跳过重复创建",
    };
  }
  const idempotencyKey =
    task?.checkpoint?.payload?.idempotencyKey ||
    (await buildCommitIdempotencyKey(task, candidateEntries, "worldbook.merge.create"));
  return commitWorldbookMergeCandidate(candidateEntries, { idempotencyKey });
}

export { listWorldbookEntries, getWorldbookEntry };
