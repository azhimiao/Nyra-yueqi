/**
 * Multi-signal retrieval: character + time + task + relation + source (not vector-only).
 */

import { isFeatureEnabled } from "../features/flags.js";
import { isSuppressed, isSuppressedContent } from "../memory/suppression-ledger.js";
import { listItems, touchLastUsedMany } from "./store.js";

/**
 * @typedef {{
 *   characterId: string,
 *   workspaceId?: string,
 *   nowIso?: string,
 *   timeFrom?: string,
 *   timeTo?: string,
 *   taskHint?: string,
 *   relationHint?: string,
 *   source?: string,
 *   kinds?: string[],
 *   query?: string,
 *   forProactive?: boolean,
 *   includeFrozen?: boolean,
 *   includeExpired?: boolean,
 *   limit?: number,
 *   markUsed?: boolean,
 * }} RetrieveQuery
 */

/**
 * @param {object} item
 * @param {RetrieveQuery} q
 * @param {number} nowMs
 */
function scoreItem(item, q, nowMs) {
  let score = 0;
  const reasons = [];

  // character / workspace isolation — hard filter applied before score
  score += Number(item.confidence) || 0;

  if (q.source && item.source === q.source) {
    score += 2;
    reasons.push("source");
  } else if (q.source && String(item.source).startsWith(q.source)) {
    score += 1;
    reasons.push("source-prefix");
  }

  if (q.kinds?.length && q.kinds.includes(item.kind)) {
    score += 1.2;
    reasons.push("kind");
  }

  if (q.taskHint) {
    const th = q.taskHint.toLowerCase();
    const hit =
      (item.taskHints || []).some((t) => String(t).toLowerCase().includes(th)) ||
      String(item.content).toLowerCase().includes(th) ||
      String(item.summary).toLowerCase().includes(th);
    if (hit) {
      score += 2.5;
      reasons.push("task");
    }
  }

  if (q.relationHint) {
    const rh = q.relationHint.toLowerCase();
    const hit =
      item.kind === "relational" ||
      (item.relationHints || []).some((t) => String(t).toLowerCase().includes(rh)) ||
      String(item.content).toLowerCase().includes(rh);
    if (hit) {
      score += 2.2;
      reasons.push("relation");
    }
  }

  if (q.query) {
    const qq = q.query.toLowerCase();
    const blob = `${item.content} ${item.summary} ${(item.tags || []).join(" ")}`.toLowerCase();
    if (blob.includes(qq)) {
      score += 1.8;
      reasons.push("text");
    } else {
      // light token overlap (deterministic, not embeddings)
      const tokens = qq.split(/\s+/).filter((t) => t.length >= 2);
      let hits = 0;
      for (const tok of tokens) if (blob.includes(tok)) hits += 1;
      if (hits) {
        score += Math.min(1.5, hits * 0.4);
        reasons.push("tokens");
      }
    }
  }

  const occurred = Date.parse(item.occurredAt || item.createdAt || "") || 0;
  if (occurred) {
    const ageDays = Math.max(0, (nowMs - occurred) / 864e5);
    // recency boost; older still usable for semantic
    const recency = item.kind === "semantic" || item.kind === "relational" ? 0.8 : 1.2;
    score += Math.max(0, recency - ageDays / 180);
    reasons.push("time");
  }

  if (item.lastUsedAt) {
    score += 0.15;
    reasons.push("lastUsed");
  }

  if (item.conflictState === "confirmed") score -= 1.5;
  else if (item.conflictState === "suspected") score -= 0.6;

  if (item.frozen) score -= 0.5;

  return { score, reasons };
}

/**
 * @param {object} item
 * @param {RetrieveQuery} q
 * @param {number} nowMs
 */
function passesFilters(item, q, nowMs) {
  if (!q.characterId || item.characterId !== q.characterId) return false;
  if (q.workspaceId && item.workspaceId && item.workspaceId !== q.workspaceId) return false;
  if (item.deleted) return false;
  if (Array.isArray(q.allowedPrivacyLevels) && q.allowedPrivacyLevels.length && !q.allowedPrivacyLevels.includes(item.privacyLevel)) {
    return false;
  }
  if (item.memoryStatus && !["accepted", "confirmed", "projection"].includes(item.memoryStatus)) {
    return false;
  }
  if (isFeatureEnabled("unifiedMemoryForgetV1")) {
    if (
      isSuppressed(item.id)
      || isSuppressed(item.sourceRef)
      || isSuppressedContent(item.content)
    ) {
      return false;
    }
    const refs = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
    if (refs.some((ref) => isSuppressed(ref))) return false;
  }
  if (q.forProactive && (item.forbidProactive || item.privacyLevel === "forbidden")) return false;
  if (item.frozen && q.includeFrozen === false) return false;
  if (item.frozen && q.forProactive) return false;

  if (!q.includeExpired && item.expiresAt) {
    const exp = Date.parse(item.expiresAt);
    if (Number.isFinite(exp) && exp < nowMs) return false;
  }

  if (q.timeFrom) {
    const from = Date.parse(q.timeFrom);
    const at = Date.parse(item.occurredAt || item.createdAt || "");
    if (Number.isFinite(from) && Number.isFinite(at) && at < from) return false;
  }
  if (q.timeTo) {
    const to = Date.parse(q.timeTo);
    const at = Date.parse(item.occurredAt || item.createdAt || "");
    if (Number.isFinite(to) && Number.isFinite(at) && at > to) return false;
  }

  if (q.kinds?.length && !q.kinds.includes(item.kind)) return false;
  if (q.source && item.source !== q.source && !String(item.source).startsWith(q.source)) {
    // soft: allow scoring path only when source filter is prefix-ish — strict filter here
    if (item.source !== q.source) return false;
  }

  return true;
}

/**
 * Retrieve ranked context items with explainable signals.
 * @param {RetrieveQuery} query
 */
export function retrieveContext(query) {
  if (!query?.characterId) {
    return { ok: false, error: "characterId required", items: [], leaks: [] };
  }
  const nowIso = query.nowIso || new Date().toISOString();
  const nowMs = Date.parse(nowIso) || Date.now();
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 20;

  // Isolation: only pull same characterId (and optional workspace)
  const pool = listItems({
    characterId: query.characterId,
    workspaceId: query.workspaceId,
    kinds: query.kinds,
    includeFrozen: true,
    limit: 5000,
  });

  /** @type {{ item: object, score: number, reasons: string[] }[]} */
  const ranked = [];
  /** @type {object[]} */
  const leaks = [];

  for (const item of pool) {
    // belt-and-suspenders isolation check
    if (item.characterId !== query.characterId) {
      leaks.push(item);
      continue;
    }
    if (!passesFilters(item, query, nowMs)) continue;
    ranked.push({ item, ...scoreItem(item, query, nowMs) });
  }

  ranked.sort((a, b) => b.score - a.score || String(b.item.occurredAt).localeCompare(String(a.item.occurredAt)));
  const top = ranked.slice(0, limit);

  if (query.markUsed !== false) {
    touchLastUsedMany(top.map((row) => row.item.id), nowIso);
  }

  return {
    ok: true,
    items: top.map((r) => ({
      ...r.item,
      _score: r.score,
      _matchReasons: r.reasons,
    })),
    leaks,
    totalCandidates: ranked.length,
  };
}

/**
 * Preference recall helper for verify: find semantic preferences matching needle.
 * @param {string} characterId
 * @param {string} needle
 * @param {{ nowIso?: string }} [opts]
 */
export function recallPreference(characterId, needle, opts = {}) {
  const res = retrieveContext({
    characterId,
    kinds: ["semantic"],
    query: needle,
    nowIso: opts.nowIso,
    forProactive: true,
    markUsed: false,
    limit: 5,
  });
  return res.items;
}

/**
 * Count expired items that would incorrectly surface if includeExpired forced.
 * Used by verify for misuse rate.
 * @param {string} characterId
 * @param {string} nowIso
 */
export function countExpiredMisuse(characterId, nowIso) {
  const safe = retrieveContext({
    characterId,
    nowIso,
    includeExpired: false,
    forProactive: true,
    markUsed: false,
    limit: 500,
  });
  const unsafe = retrieveContext({
    characterId,
    nowIso,
    includeExpired: true,
    forProactive: true,
    markUsed: false,
    limit: 500,
  });
  const safeIds = new Set(safe.items.map((i) => i.id));
  const expiredSurfaced = unsafe.items.filter((i) => {
    if (safeIds.has(i.id)) return false;
    if (!i.expiresAt) return false;
    return Date.parse(i.expiresAt) < Date.parse(nowIso);
  });
  // Misuse = expired items appearing in *safe* retrieve (should be 0)
  const misuseInSafe = safe.items.filter(
    (i) => i.expiresAt && Date.parse(i.expiresAt) < Date.parse(nowIso),
  );
  return {
    misuseCount: misuseInSafe.length,
    safeTotal: safe.items.length,
    expiredAvailable: expiredSurfaced.length,
  };
}
