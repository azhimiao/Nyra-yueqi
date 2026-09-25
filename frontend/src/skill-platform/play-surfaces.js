/**
 * Surface routing for skills-play packs.
 * explore-solo → seed into Explore Agent
 * pop-social → Pop「一起玩」only (DM / group)
 */

/** @type {Record<string, "explore-solo"|"pop-social">} */
export const PLAY_PACK_SURFACES = Object.freeze({
  "midnight-train": "explore-solo",
  "liars-dice": "explore-solo",
  "wangpai-stage": "explore-solo",
  "relationship-intelligence": "explore-solo",
  "office-werewolf": "pop-social",
});

/**
 * @param {string} packId
 * @returns {"explore-solo"|"pop-social"}
 */
export function surfaceForPlayPack(packId) {
  const id = String(packId || "").trim();
  return PLAY_PACK_SURFACES[id] || "explore-solo";
}

/**
 * Catalog of social games shown in Explore「一起玩」and registered in Pop.
 * Keep in sync with POP_GAMES entries that originate from skills-play.
 */
export const EXPLORE_SOCIAL_GAMES = Object.freeze([
  {
    id: "office-werewolf",
    title: "办公室狼人杀",
    blurb: "需要伴侣或群聊一起玩。带到 Pop 发起。",
    tone: "ember",
  },
]);
