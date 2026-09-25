import { tokenize } from "../../lib/utils.js";

/** Port of MemPalace searcher.py — Okapi-BM25 over candidate set. */
export function bm25Scores(query, documents, { k1 = 1.5, b = 0.75 } = {}) {
  const nDocs = documents.length;
  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size || !nDocs) return documents.map(() => 0);

  const tokenized = documents.map((doc) => tokenize(doc || ""));
  const docLens = tokenized.map((tokens) => tokens.length);
  if (!docLens.some((len) => len > 0)) return documents.map(() => 0);

  const avgdl = docLens.reduce((sum, len) => sum + len, 0) / nDocs || 1;
  const df = Object.fromEntries([...queryTerms].map((term) => [term, 0]));

  tokenized.forEach((tokens) => {
    const seen = new Set(tokens.filter((token) => queryTerms.has(token)));
    seen.forEach((term) => {
      df[term] += 1;
    });
  });

  const idf = Object.fromEntries(
    [...queryTerms].map((term) => [
      term,
      Math.log((nDocs - df[term] + 0.5) / (df[term] + 0.5) + 1),
    ])
  );

  return tokenized.map((tokens, index) => {
    const dl = docLens[index];
    if (!dl) return 0;

    const tf = {};
    tokens.forEach((token) => {
      if (queryTerms.has(token)) tf[token] = (tf[token] || 0) + 1;
    });

    let score = 0;
    Object.entries(tf).forEach(([term, freq]) => {
      const num = freq * (k1 + 1);
      const den = freq + k1 * (1 - b + (b * dl) / avgdl);
      score += idf[term] * (num / den);
    });
    return score;
  });
}

/**
 * MemPalace _hybrid_rank — vector similarity 0.6 + normalized BM25 0.4.
 * Mutates and returns results sorted by hybrid score descending.
 */
export function hybridRank(results, query, { vectorWeight = 0.6, bm25Weight = 0.4 } = {}) {
  if (!results.length) return results;

  const docs = results.map((row) => row.text || "");
  const bm25Raw = bm25Scores(query, docs);
  const maxBm25 = Math.max(...bm25Raw, 0);
  const bm25Norm = maxBm25 > 0 ? bm25Raw.map((score) => score / maxBm25) : bm25Raw.map(() => 0);

  const scored = results.map((row, index) => {
    const distance = row.distance;
    const vecSim = distance == null ? 0 : Math.max(0, 1 - distance);
    const hybridScore = vectorWeight * vecSim + bm25Weight * bm25Norm[index];
    return {
      ...row,
      bm25Score: Number(bm25Raw[index].toFixed(3)),
      bm25Norm: bm25Norm[index],
      vecSim,
      hybridScore,
      matchedVia: row.matchedVia || "drawer",
    };
  });

  scored.sort((a, b) => b.hybridScore - a.hybridScore);
  return scored;
}

/** MemPalace closet rank boosts when topic metadata agrees with query. */
export const CLOSET_RANK_BOOSTS = [0.4, 0.25, 0.15, 0.08, 0.04];
export const CLOSET_DISTANCE_CAP = 1.5;

export function closetBoostForQuery(record, query) {
  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size) return 0;

  const closetText = [record.wing, record.room, record.title, ...(record.tags || [])].join(" ");
  const closetTokens = tokenize(closetText);
  let overlap = 0;
  closetTokens.forEach((token) => {
    if (queryTerms.has(token)) overlap += 1;
  });

  if (!overlap) return 0;
  return CLOSET_RANK_BOOSTS[Math.min(overlap, CLOSET_RANK_BOOSTS.length) - 1] || 0;
}

export function applyClosetBoost(candidates) {
  return candidates.map((row) => {
    const boost = closetBoostForQuery(row.record, row.query || "");
    const rawDistance = row.distance ?? 1;
    const effectiveDistance = Math.max(0, Math.min(2, rawDistance - boost));
    return {
      ...row,
      closetBoost: boost,
      distance: rawDistance,
      effectiveDistance,
      matchedVia: boost > 0 ? "drawer+closet" : row.matchedVia || "drawer",
      hybridScore: row.hybridScore != null
        ? row.hybridScore + boost * 0.15
        : Math.max(0, 1 - effectiveDistance),
    };
  });
}
