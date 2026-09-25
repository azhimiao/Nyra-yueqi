import { cosineSimilarity, searchMemoriesFts } from "../../storage/db.js";
import { embedPalaceText } from "./embeddings.js";
import { filterDrawers } from "./filter.js";
import { buildCandidatePool, poolSizeFor, rankCandidatePool } from "./pool-rank.js";

/**
 * App 端：SQLite FTS 召回 + union hybrid + closet boost。
 */
export async function searchDrawersSqlite(query, options = {}) {
  const topK = options.topK ?? options.limit ?? 5;
  const poolSize = poolSizeFor(topK);

  const allRecords = await filterDrawers(query, options);
  if (!allRecords.length) return [];

  const ftsHits = await searchMemoriesFts(query, {
    wing: options.wing,
    room: options.room,
    limit: poolSize,
  });

  const recordMap = new Map(allRecords.map((record) => [record.id, record]));
  const ftsRecords = ftsHits.map((hit) => recordMap.get(hit.id)).filter(Boolean);

  let seedRecords = ftsRecords.length ? ftsRecords : allRecords;
  if (!ftsRecords.length) {
    const queryVector = embedPalaceText(query);
    seedRecords = allRecords
      .map((record) => ({
        record,
        distance: 1 - cosineSimilarity(queryVector, record.embedding),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, poolSize)
      .map((row) => row.record);
  }

  const pool = buildCandidatePool(seedRecords.length >= poolSize ? seedRecords : allRecords, query, poolSize);
  const ranked = rankCandidatePool(pool, query, allRecords, { topK });
  return ranked.map((row) => ({ ...row, palaceBackend: "sqlite-fts" }));
}
