import { ageBoost, cosineSimilarity } from "../../storage/db.js";
import { bm25Scores, hybridRank } from "./hybrid.js";
import { buildClosetIndex, closetBoostMap, searchClosets } from "./closet.js";
import { memoryToDrawer } from "./drawer.js";
import { embedPalaceText } from "./embeddings.js";
import { expandWithNeighbors } from "./neighbor.js";

const OVER_FETCH = 3;

function dedupeCandidates(candidates) {
  const map = new Map();
  candidates.forEach((row) => {
    if (!row?.record?.id) return;
    map.set(row.record.id, { ...map.get(row.record.id), ...row });
  });
  return [...map.values()];
}

/**
 * MemPalace union strategy: vector pool + BM25-only candidates merged before hybrid rerank.
 */
export function buildCandidatePool(records, query, poolSize) {
  if (!records.length) return [];

  const queryVector = embedPalaceText(query);
  const vectorRows = records
    .map((record) => {
      const similarity = cosineSimilarity(queryVector, record.embedding);
      return {
        record,
        text: record.rawText,
        distance: 1 - similarity,
        query,
        matchedVia: "drawer",
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, poolSize);

  const docs = records.map((record) => record.rawText);
  const bm25Raw = bm25Scores(query, docs);
  const bm25Rows = records
    .map((record, index) => ({ record, bm25: bm25Raw[index] }))
    .sort((a, b) => b.bm25 - a.bm25)
    .slice(0, poolSize)
    .map(({ record, bm25 }) => ({
      record,
      text: record.rawText,
      distance: null,
      bm25Seed: bm25,
      query,
      matchedVia: "drawer+bm25",
    }));

  return dedupeCandidates([...vectorRows, ...bm25Rows]);
}

export function rankCandidatePool(pool, query, records, { topK = 5 } = {}) {
  const closets = buildClosetIndex(records);
  const closetHits = searchClosets(closets, query);
  const boosts = closetBoostMap(closetHits);

  let ranked = hybridRank(pool, query);
  ranked = ranked.map((row) => {
    const closet = boosts.get(row.record.id);
    const boost = closet?.boost ?? 0;
    const rawDistance = row.distance ?? 1;
    const effectiveDistance = Math.max(0, Math.min(2, rawDistance - boost));
    const title = String(row.record?.title || "").trim().toLowerCase();
    const titleBoost = title && String(query || "").toLowerCase().includes(title)
      ? (title.length > 1 ? 0.24 : 0.16)
      : 0;
    return {
      ...row,
      closetBoost: boost,
      closetPreview: closet?.preview || "",
      effectiveDistance,
      matchedVia: closet ? "drawer+closet" : row.matchedVia || "drawer",
      hybridScore: (row.hybridScore ?? 0) + boost * 0.15 + titleBoost,
      titleBoost,
    };
  });

  ranked.sort((a, b) => {
    const scoreA =
      (a.hybridScore ?? 0) +
      (a.record.weight || 1) * 0.06 +
      ageBoost(a.record.createdAt) +
      (a.record.pinned ? 0.08 : 0);
    const scoreB =
      (b.hybridScore ?? 0) +
      (b.record.weight || 1) * 0.06 +
      ageBoost(b.record.createdAt) +
      (b.record.pinned ? 0.08 : 0);
    return scoreB - scoreA;
  });

  return expandWithNeighbors(
    ranked.slice(0, topK).map((row) => ({
      ...row.record,
      similarity: row.vecSim ?? (row.distance == null ? 0 : 1 - row.distance),
      keywordScore: row.bm25Norm ?? 0,
      bm25Score: row.bm25Score ?? 0,
      closetBoost: row.closetBoost ?? 0,
      matchedVia: row.matchedVia || "drawer",
      finalScore: row.hybridScore ?? 0,
      drawer: memoryToDrawer(row.record),
    })),
    records,
    { maxTotal: topK + 4 }
  );
}

export function poolSizeFor(topK) {
  return Math.max(topK * OVER_FETCH, topK);
}
