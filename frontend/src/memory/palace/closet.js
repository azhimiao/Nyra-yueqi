import { tokenize } from "../../lib/utils.js";
import { CLOSET_RANK_BOOSTS } from "./hybrid.js";

export function buildClosetIndex(records = []) {
  const closets = new Map();

  records.forEach((record) => {
    const wing = record.wing || "Relationship";
    const room = record.room || "General";
    const key = `${wing}\0${room}`;
    const closet = closets.get(key) || {
      wing,
      room,
      topics: new Set(),
      drawerIds: [],
      preview: "",
    };

    closet.drawerIds.push(record.id);
    tokenize([record.title, ...(record.tags || []), record.room].join(" ")).forEach((term) => {
      closet.topics.add(term);
    });
    if (!closet.preview && record.rawText) {
      closet.preview = record.rawText.slice(0, 120);
    }
    closets.set(key, closet);
  });

  return [...closets.values()].map((closet) => ({
    ...closet,
    topics: [...closet.topics],
  }));
}

export function searchClosets(closets, query, limit = 5) {
  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size) return [];

  return closets
    .map((closet) => {
      let overlap = 0;
      closet.topics.forEach((topic) => {
        if (queryTerms.has(topic)) overlap += 1;
      });
      return { ...closet, overlap };
    })
    .filter((closet) => closet.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit);
}

/** drawerId -> { boost, rank, preview, matchedVia } */
export function closetBoostMap(closetHits) {
  const map = new Map();
  closetHits.forEach((closet, rank) => {
    const boost = CLOSET_RANK_BOOSTS[Math.min(rank, CLOSET_RANK_BOOSTS.length - 1)] || 0;
    closet.drawerIds.forEach((drawerId) => {
      if (!map.has(drawerId)) {
        map.set(drawerId, {
          boost,
          rank,
          preview: closet.preview,
          matchedVia: "drawer+closet",
        });
      }
    });
  });
  return map;
}
