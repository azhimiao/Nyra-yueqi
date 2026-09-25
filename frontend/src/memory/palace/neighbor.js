import { getPalaceSettings } from "../../settings/preferences.js";

function neighborScore(baseScore, factor) {
  return Number(((baseScore ?? 0) * factor).toFixed(4));
}

/**
 * MemPalace neighbor expansion: sibling chunks + same wing/room drawers.
 */
export function expandWithNeighbors(ranked = [], allRecords = [], options = {}) {
  const settings = getPalaceSettings();
  if (settings.neighborExpand === false) return ranked;

  const maxTotal = options.maxTotal ?? Math.max(ranked.length + 4, 12);
  const maxNeighborsPerHit = options.maxNeighborsPerHit ?? 2;
  if (!ranked.length || !allRecords.length) return ranked;

  const seen = new Set(ranked.map((row) => row.id));
  const expanded = [...ranked];

  for (const hit of ranked) {
    let added = 0;
    const drawerId = hit.drawerId || hit.id;
    const parentId = hit.parentDrawerId || drawerId;

    const siblings = allRecords
      .filter((record) => {
        if (record.id === hit.id) return false;
        const sameDrawer = record.drawerId === drawerId || record.parentDrawerId === parentId;
        if (!sameDrawer) return false;
        if (hit.chunkIndex == null || record.chunkIndex == null) return true;
        return Math.abs(record.chunkIndex - hit.chunkIndex) <= 1;
      })
      .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0));

    for (const sibling of siblings) {
      if (seen.has(sibling.id)) continue;
      expanded.push({
        ...sibling,
        matchedVia: "drawer+neighbor",
        finalScore: neighborScore(hit.finalScore, 0.88),
        similarity: hit.similarity ?? 0,
        neighborOf: hit.id,
      });
      seen.add(sibling.id);
      added += 1;
      if (added >= maxNeighborsPerHit) break;
    }

    // Do not add arbitrary records from the same room.  Character history is
    // intentionally stored in one room, so room-level expansion turns a
    // narrow question into a random autobiography dump.  Chunk siblings
    // above remain available because they are part of the same source drawer.
  }

  expanded.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
  return expanded.slice(0, maxTotal);
}
