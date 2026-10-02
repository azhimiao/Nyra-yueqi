/**
 * Pop-first companion games catalog — Launch v1 Duo list.
 * Legacy prompt-only invites replaced by Duo Runtime packages.
 */

import { listDuoGames } from "./duo/games/index.js";

const TONES = ["mint", "coral", "ember", "lilac", "sky", "gold"];

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   blurb: string,
 *   tone: string,
 *   invite: string,
 *   systemBanner: string,
 *   runtime?: string,
 *   kind?: string,
 * }} PopGame
 */

/**
 * @returns {PopGame[]}
 */
export function listPopGames() {
  return listDuoGames().map((def, index) => ({
    id: def.id,
    title: def.title,
    blurb: def.description || "",
    tone: TONES[index % TONES.length],
    invite: buildInvite(def),
    systemBanner: `已发起一起玩：${def.title}`,
    runtime: "duo",
    kind: def.kind || "nyra.duo-game.v1",
  }));
}

/**
 * @param {string} gameId
 * @returns {PopGame|null}
 */
export function getPopGame(gameId) {
  const id = String(gameId || "").trim();
  return listPopGames().find((game) => game.id === id) || null;
}

/**
 * @param {string} gameId
 * @returns {{ ok: true, game: PopGame } | { ok: false, error: string }}
 */
export function buildPopGameStart(gameId) {
  const game = getPopGame(gameId);
  if (!game) return { ok: false, error: "未知玩法" };
  return { ok: true, game };
}

function buildInvite(def) {
  const blurb = String(def.description || "").trim();
  return (
    `我们来玩「${def.title}」吧。`
    + (blurb ? `这是一局规则游戏：${blurb}` : "")
    + "请按当前游戏规则行动：保持你平时的人格与关系，不要变成主持人、客服或规则说明书。"
    + "只根据系统给出的游戏观察行动；不要编造未公开的秘密信息。"
    + "不要只凭游戏名字做无关的情景扮演。"
  );
}
