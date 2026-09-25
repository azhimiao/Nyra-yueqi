import { listEventsFallbackFromCohabit } from "./timeline-bridge.js";

/**
 * Format sidewrite projection events for prompt injection.
 * @param {string} characterId
 * @param {{ limit?: number }} [opts]
 * @returns {string} empty string when no events (E4)
 */
export function formatSidewriteTimelineBlock(characterId, opts = {}) {
  const events = listEventsFallbackFromCohabit({
    characterId: String(characterId || "").trim(),
    limit: Number(opts.limit) || 12,
  }).filter((ev) => ev?.sourceApp === "sidewrite" || ev?.appId === "sidewrite");

  if (!events.length) return "";

  const lines = events.map((ev, index) => {
    const tag = String(ev.sceneTag || "sidewrite.view");
    const when = String(ev.ts || "").slice(11, 16) || "--:--";
    const summary = String(ev.summary || "").trim();
    return `${index + 1}. [${tag} / ${when}] ${summary}`;
  });

  return ["同栖时间线（侧写）：", ...lines].join("\n");
}
