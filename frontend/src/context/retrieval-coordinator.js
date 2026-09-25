/**
 * Retrieval Coordinator (M8 / §10) — single broker-side retrieval + sourceRef dedupe.
 *
 * Order (approx): TodayContext/temporal (assemble slot) → Stable → Timeline/shared
 * → Palace (via broker) → branch summary already in broker.
 *
 * When `singleBrokerRetrievalV1` is on, Prompt assemble must not call searchPalace;
 * this module is the palace entry used by the Context Broker.
 */

import { trimMemoriesToBudget } from "../memory/tiers.js";
import { rowMatchesCompanionScope } from "../memory/companion-scope.js";

/** Higher = keep when same sourceRef appears on multiple blocks (§10.2). */
const SOURCE_AUTHORITY = Object.freeze({
  "memory.stable": 100,
  "conversation.branch_summary": 95,
  "context.continuous": 93,
  "companion.life_snapshot": 86,
  "timeline.open_commitments": 85,
  "cohabit.projector": 80,
  "life.permission_filtered": 78,
  "companion.scenario_finale": 76,
  "moments.projector": 70,
  "context.graph": 60,
  "memory.palace": 40,
  "external.authorized": 30,
  "context.additional": 20,
});

export function normalizeSourceRefKey(ref) {
  if (ref == null || ref === "") return "";
  if (typeof ref === "string") return ref.trim();
  if (typeof ref === "object") {
    const sourceId = String(ref.sourceId || ref.id || "").trim();
    const sourceType = String(ref.sourceType || ref.kind || "").trim();
    const contentHash = String(ref.contentHash || "").trim();
    if (sourceType && sourceId) return `${sourceType}:${sourceId}`;
    if (sourceId) return sourceId;
    if (contentHash) return `hash:${contentHash}`;
  }
  return String(ref).trim();
}

export function normalizeContentHashKey(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    return String(value.contentHash || value.hash || "").trim();
  }
  return String(value).trim();
}

function authorityScore(block) {
  const source = String(block?.source || "");
  if (SOURCE_AUTHORITY[source] != null) return SOURCE_AUTHORITY[source];
  if (source.startsWith("timeline.")) return 85;
  if (source.startsWith("memory.")) return 50;
  return Number(block?.priority) || 0;
}

function blockIdentityKeys(block) {
  const keys = new Set();
  const primary = normalizeSourceRefKey(block?.sourceRef);
  if (primary) keys.add(`ref:${primary}`);
  const hash = normalizeContentHashKey(block?.contentHash);
  if (hash) keys.add(`hash:${hash}`);
  for (const p of Array.isArray(block?.provenance) ? block.provenance : []) {
    const ref = normalizeSourceRefKey(p.sourceRef || p.evidenceRef || p.sourceId);
    if (ref) keys.add(`ref:${ref}`);
    const ph = normalizeContentHashKey(p.contentHash);
    if (ph) keys.add(`hash:${ph}`);
  }
  for (const ref of Array.isArray(block?.sourceRefs) ? block.sourceRefs : []) {
    const k = normalizeSourceRefKey(ref);
    if (k) keys.add(`ref:${k}`);
  }
  return [...keys];
}

/**
 * Collapse blocks that share sourceRef / contentHash.
 * Keeps the higher-authority (then higher priority) block.
 */
export function dedupeBlocksBySourceRef(blocks = []) {
  const list = (Array.isArray(blocks) ? blocks : []).filter(Boolean);
  if (list.length <= 1) return list;

  const ranked = [...list].sort((a, b) => {
    const auth = authorityScore(b) - authorityScore(a);
    if (auth) return auth;
    return (Number(b.priority) || 0) - (Number(a.priority) || 0);
  });

  const claimed = new Set();
  const kept = [];
  const dropped = [];

  for (const block of ranked) {
    const keys = blockIdentityKeys(block);
    const clash = keys.some((k) => claimed.has(k));
    if (clash && keys.length) {
      dropped.push({ blockId: block.id, source: block.source, keys });
      continue;
    }
    for (const k of keys) claimed.add(k);
    kept.push(block);
  }

  // Preserve a stable-ish original order among survivors (priority desc).
  kept.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  return kept;
}

export function formatPalaceMemoriesBlock(memories = [], { palaceSkipped = false } = {}) {
  const header = palaceSkipped
    ? "本轮未触发宫殿检索（Recall Protocol）。"
    : "宫殿检索（原文 verbatim）：";
  if (!memories.length) {
    return palaceSkipped
      ? header
      : "本轮没有检索到可核实的过去。若角色被问到经历或共同回忆，必须明确说不知道或没有记录，不得把推测、模型常识或新编内容说成已经发生。";
  }
  const lines = memories.map((memory, index) => {
    const chunkHint =
      memory.chunkTotal > 1
        ? ` · chunk ${(memory.chunkIndex ?? 0) + 1}/${memory.chunkTotal}`
        : "";
    const authoredOrigin = memory.source === "character.history"
      || memory.sourceType === "authored_origin_memory"
      || memory.sourceRef?.truthDomain === "character_canon";
    const truth = authoredOrigin
      ? "character_canon/active"
      : (memory.source === "diary.memory" || memory.source === "chat.memory"
        ? "lived_product_fact/active"
        : "inferred_candidate/candidate");
    return `${index + 1}. [${memory.wing || "?"}.${memory.room || "?"} / ${memory.source}${chunkHint}; truth=${truth}] ${memory.rawText}`;
  });
  return [header, ...lines].join("\n");
}

function memorySourceRefKey(memory) {
  return (
    normalizeSourceRefKey(memory?.sourceRef)
    || normalizeContentHashKey(memory?.contentHash)
    || String(memory?.id || memory?.memoryId || "").trim()
  );
}

/** Dedupe palace hit rows before formatting a single block. */
export function dedupePalaceMemories(memories = []) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(memories) ? memories : []) {
    const key = memorySourceRefKey(row);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(row);
  }
  return out;
}

/**
 * Broker-side palace retrieval (sole Prompt entry when singleBrokerRetrievalV1).
 *
 * @param {{
 *   query: string,
 *   companionId?: string,
 *   searchPalace?: Function,
 *   searchMemories?: Function,
 *   searchOpts?: object,
 *   tokenBudget?: number,
 * }} opts
 */
export async function retrievePalaceForBroker(opts = {}) {
  const query = String(opts.query || "").trim();
  const companionId = String(opts.companionId || opts.characterId || "").trim();
  const searchOpts = {
    topK: 6,
    ...(opts.searchOpts && typeof opts.searchOpts === "object" ? opts.searchOpts : {}),
    characterId: companionId || opts.searchOpts?.characterId,
    companionId: companionId || opts.searchOpts?.companionId,
  };

  let searchPalace = opts.searchPalace;
  if (typeof searchPalace !== "function") {
    try {
      const mod = await import("../memory/palace/search.js");
      searchPalace = mod.searchPalace;
    } catch {
      searchPalace = null;
    }
  }

  let raw = [];
  let palaceSkipped = false;
  let palaceBackend = "none";
  let kgBlock = "";
  let characterHistoryRecall = false;

  if (typeof searchPalace === "function") {
    const palaceResult = await searchPalace(query, searchOpts);
    raw = palaceResult?.results || [];
    palaceSkipped = Boolean(palaceResult?.skipped);
    palaceBackend = palaceResult?.backend || "local";
    kgBlock = companionId ? "" : (palaceResult?.kgBlock || "");
    characterHistoryRecall = palaceResult?.characterHistoryRecall === true;
  } else if (typeof opts.searchMemories === "function") {
    raw = (await opts.searchMemories(query, searchOpts)) || [];
    palaceBackend = "legacy";
  }

  if (companionId) {
    raw = raw.filter((row) => rowMatchesCompanionScope(row, {
      companionId,
      userId: opts.userId || "local",
      allowGlobal: false,
    }));
  } else {
    raw = [];
    palaceSkipped = true;
  }

  // Explicit questions about the character's own past get enough room for a
  // useful set of authored chapters. Ordinary turns keep the smaller broker
  // budget and never receive a history dump.
  const budget = characterHistoryRecall
    ? Math.max(Number(opts.tokenBudget) || 500, 1400)
    : (Number(opts.tokenBudget) || 500);
  const memories = trimMemoriesToBudget(dedupePalaceMemories(raw), budget);
  const sourceRefs = memories
    .map((m) => normalizeSourceRefKey(m.sourceRef) || normalizeContentHashKey(m.contentHash) || String(m.id || ""))
    .filter(Boolean);

  const text = formatPalaceMemoriesBlock(memories, { palaceSkipped });
  const block = text
    ? {
      id: "palace_memory",
      text,
      source: "memory.palace",
      priority: 85,
      companionId,
      sourceRefs,
      sourceRef: sourceRefs[0] || undefined,
      contentHash: memories[0]?.contentHash || undefined,
      provenance: memories.map((m) => ({
        source: "memory.palace",
        sourceId: String(m.id || m.memoryId || ""),
        sourceRef: m.sourceRef || undefined,
        contentHash: m.contentHash || undefined,
        companionId,
        evidenceRef: memorySourceRefKey(m),
      })),
    }
    : null;

  return {
    block,
    memories,
    palaceSkipped,
    palaceBackend,
    kgBlock,
    sourceRefs,
    characterHistoryRecall,
  };
}

/**
 * Attach palace (if policy allows) and dedupe envelope candidate blocks.
 *
 * @returns {{ blocks: object[], palace: object|null, dropped: object[] }}
 */
export async function coordinateBrokerRetrieval(opts = {}) {
  const blocks = Array.isArray(opts.blocks) ? [...opts.blocks] : [];
  const includePalace = opts.includePalace !== false;
  let palace = null;

  if (includePalace && opts.query != null) {
    palace = await retrievePalaceForBroker({
      query: opts.query,
      companionId: opts.companionId || opts.characterId,
      userId: opts.userId,
      searchPalace: opts.searchPalace,
      searchMemories: opts.searchMemories,
      searchOpts: opts.searchOpts,
      tokenBudget: opts.palaceTokenBudget,
    });
    if (palace.block) {
      // Avoid double palace_memory if a caller still passed one as additional.
      const withoutDupPalace = blocks.filter((b) => b?.id !== "palace_memory");
      withoutDupPalace.push(palace.block);
      blocks.length = 0;
      blocks.push(...withoutDupPalace);
    }
  }

  const before = blocks.length;
  const deduped = dedupeBlocksBySourceRef(blocks);
  return {
    blocks: deduped,
    palace,
    droppedCount: Math.max(0, before - deduped.length),
  };
}
