/**
 * Memory write pipeline: candidate → dedupe → conflict → privacy → policy → store.
 */

import { isFeatureEnabled } from "../features/flags.js";
import {
  isSuppressed,
  isSuppressedContent,
} from "../memory/suppression-ledger.js";
import { buildContextItem, MEMORY_KINDS } from "./schema.js";
import { getItem, listItems, putItem, updateItem } from "./store.js";

/**
 * @typedef {{
 *   stage: string,
 *   ok: boolean,
 *   reason?: string,
 *   itemId?: string,
 *   reused?: boolean,
 *   conflictWith?: string[],
 * }} PipelineResult
 */

/**
 * Normalize text for dedupe fingerprint.
 * @param {string} text
 */
export function normalizeContentKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[，。！？、,.!?;；:："'“”‘’]/g, "")
    .trim()
    .slice(0, 160);
}

/**
 * Detect preference / fact subject key for conflict matching.
 * @param {string} content
 */
export function extractFactSubject(content) {
  const t = String(content || "").trim();
  const m =
    t.match(/(?:喜欢|偏好|讨厌|不喜欢|习惯)\s*([^\s，。,]{1,24})/) ||
    t.match(/([^\s，。,]{1,24})\s*(?:是|为)\s*/);
  if (m) return normalizeContentKey(m[1] || m[0]);
  return normalizeContentKey(t).slice(0, 48);
}

/**
 * Classify privacy from content heuristics + candidate hint.
 * @param {string} content
 * @param {string} [hint]
 */
export function classifyPrivacy(content, hint) {
  if (hint && ["shared", "private", "sensitive", "forbidden"].includes(hint)) return hint;
  const t = String(content || "");
  if (/密码|证件号|银行卡|住址详细|身份证/.test(t)) return "forbidden";
  if (/私密|不要告诉|保密|敏感/.test(t)) return "sensitive";
  if (/私下|仅自己|private/.test(t)) return "private";
  return "shared";
}

/**
 * Apply retention / expiry policy.
 * @param {import("./schema.js").ContextMemoryItem} item
 * @param {{ nowIso?: string }} [opts]
 */
export function applyRetentionPolicy(item, opts = {}) {
  const now = new Date(opts.nowIso || Date.now());
  const next = { ...item };
  if (next.expiresAt) return next;
  if (next.retention === "rolling_30d") {
    next.expiresAt = new Date(now.getTime() + 30 * 864e5).toISOString();
  } else if (next.retention === "rolling_90d") {
    next.expiresAt = new Date(now.getTime() + 90 * 864e5).toISOString();
  } else if (next.retention === "session") {
    next.expiresAt = new Date(now.getTime() + 8 * 3600e3).toISOString();
  }
  return next;
}

/**
 * Find duplicate among same character.
 * @param {import("./schema.js").ContextMemoryItem} item
 */
export function findDuplicate(item) {
  const key = normalizeContentKey(item.content);
  if (!key) return null;
  const peers = listItems({ characterId: item.characterId, limit: 2000 });
  for (const peer of peers) {
    if (peer.id === item.id) continue;
    if (peer.kind !== item.kind) continue;
    if (normalizeContentKey(peer.content) === key) return peer;
    if (
      peer.sourceRef &&
      item.sourceRef &&
      peer.source === item.source &&
      peer.sourceRef === item.sourceRef
    ) {
      return peer;
    }
  }
  return null;
}

/**
 * Find conflicting semantic/relational facts (same subject, opposing content).
 * @param {import("./schema.js").ContextMemoryItem} item
 */
export function findConflicts(item) {
  if (item.kind !== "semantic" && item.kind !== "relational") return [];
  const subject = extractFactSubject(item.content);
  if (!subject) return [];
  const peers = listItems({
    characterId: item.characterId,
    kinds: [item.kind],
    limit: 2000,
  });
  /** @type {string[]} */
  const conflicts = [];
  const negA = /不|讨厌|反对|禁止|不再/.test(item.content);
  for (const peer of peers) {
    if (peer.id === item.id) continue;
    if (extractFactSubject(peer.content) !== subject) continue;
    const negB = /不|讨厌|反对|禁止|不再/.test(peer.content);
    const sameKey = normalizeContentKey(peer.content) === normalizeContentKey(item.content);
    if (sameKey) continue;
    if (negA !== negB || (peer.content !== item.content && subject.length >= 2)) {
      // opposing polarity or different value for same subject
      if (negA !== negB || !peer.content.includes(item.content.slice(0, 8))) {
        conflicts.push(peer.id);
      }
    }
  }
  return conflicts;
}

/**
 * Full write pipeline.
 * @param {import("./schema.js").MemoryCandidate} candidate
 * @param {{ nowIso?: string, forceStore?: boolean }} [opts]
 * @returns {PipelineResult & { item?: object }}
 */
export function ingestCandidate(candidate, opts = {}) {
  if (!candidate || !String(candidate.content || "").trim()) {
    return { stage: "candidate", ok: false, reason: "empty content" };
  }
  if (!String(candidate.characterId || "").trim()) {
    return { stage: "candidate", ok: false, reason: "characterId required" };
  }

  // forgotten facts must not re-enter Context Graph when forget flag is on.
  if (isFeatureEnabled("unifiedMemoryForgetV1") && opts.allowSuppressed !== true) {
    const keys = [
      candidate.id,
      candidate.sourceRef,
      ...(Array.isArray(candidate.evidenceRefs) ? candidate.evidenceRefs : []),
    ];
    if (keys.some((k) => isSuppressed(k)) || isSuppressedContent(candidate.content)) {
      return { stage: "suppressed", ok: false, reason: "suppressed" };
    }
  }

  let working = candidate;
  // Graph is projection-only — never treat chat/scenario/consolidator writes as authority.
  if (isFeatureEnabled("contextGraphProjectionOnlyV1") && opts.forceAuthoritative !== true) {
    const isMirror =
      opts.projectionMirror === true
      || String(candidate.source || "") === "candidate_promotion"
      || candidate.authority === "projection"
      || candidate.meta?.authority === "projection";
    working = {
      ...candidate,
      authority: "projection",
      memoryStatus: isMirror
        ? (candidate.memoryStatus || "accepted")
        : (candidate.memoryStatus === "accepted" ? "accepted" : candidate.memoryStatus || "pending"),
      tags: [...new Set([
        ...(Array.isArray(candidate.tags) ? candidate.tags : []),
        "projection",
        ...(isMirror ? ["stable_mirror"] : ["non_authoritative"]),
      ])],
      meta: {
        ...(candidate.meta && typeof candidate.meta === "object" ? candidate.meta : {}),
        authority: "projection",
      },
    };
  }

  let item = buildContextItem(working, { nowIso: opts.nowIso });
  item.privacyLevel = classifyPrivacy(item.content, working.privacyLevel || candidate.privacyLevel);
  if (working.authority) item.authority = working.authority;

  // dedupe
  if (!working.skipDedupe) {
    const dup = findDuplicate(item);
    if (dup) {
      const bumped = updateItem(dup.id, {
        confidence: Math.max(Number(dup.confidence) || 0, item.confidence),
        lastUsedAt: opts.nowIso || new Date().toISOString(),
        whyRemembered: dup.whyRemembered || item.whyRemembered,
      });
      return {
        stage: "dedupe",
        ok: true,
        reused: true,
        itemId: dup.id,
        item: bumped.value || dup,
        reason: "duplicate",
      };
    }
  }

  // conflict
  const conflictWith = findConflicts(item);
  if (conflictWith.length) {
    item.conflictState = "suspected";
    item.conflictWith = conflictWith;
    for (const cid of conflictWith) {
      const peer = getItem(cid);
      if (peer) {
        updateItem(cid, {
          conflictState: peer.conflictState === "resolved" ? "suspected" : "suspected",
          conflictWith: Array.from(new Set([...(peer.conflictWith || []), item.id])),
        });
      }
    }
  }

  // privacy gate — forbidden never used proactively
  if (item.privacyLevel === "forbidden") {
    item.forbidProactive = true;
    item.frozen = true;
  }

  // policy / retention
  item = applyRetentionPolicy(item, { nowIso: opts.nowIso });
  if (!MEMORY_KINDS.includes(item.kind)) {
    return { stage: "policy", ok: false, reason: "invalid kind" };
  }

  // store
  const saved = putItem(item);
  if (!saved.ok) {
    return { stage: "store", ok: false, reason: (saved.errors || []).join("; ") };
  }
  return {
    stage: "store",
    ok: true,
    itemId: item.id,
    item: saved.value,
    conflictWith: conflictWith.length ? conflictWith : undefined,
  };
}

/**
 * Batch ingest (deterministic order).
 * @param {import("./schema.js").MemoryCandidate[]} candidates
 * @param {{ nowIso?: string }} [opts]
 */
export function ingestMany(candidates, opts = {}) {
  /** @type {PipelineResult[]} */
  const results = [];
  for (const c of candidates || []) {
    results.push(ingestCandidate(c, opts));
  }
  return results;
}
