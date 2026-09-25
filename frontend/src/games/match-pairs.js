/**
 * E7 · 星灯配对 — pure board + score helpers.
 */

const SYMBOLS = ["✦", "✧", "⋆", "☀", "☾", "☁", "❀", "◆"];

/**
 * @param {number} seed
 * @returns {number}
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} [seed]
 * @returns {{ id: number, symbol: string, faceUp: boolean, matched: boolean }[]}
 */
export function createMatchBoard(seed = 1) {
  const rand = mulberry32(Number(seed) || 1);
  const pairs = SYMBOLS.flatMap((symbol, i) => [
    { id: i * 2, symbol, faceUp: false, matched: false },
    { id: i * 2 + 1, symbol, faceUp: false, matched: false },
  ]);
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

/**
 * Score: fewer moves + faster = higher. Caps at 0.
 * @param {{ moves: number, elapsedMs: number, matchedPairs: number }} stats
 */
export function scoreMatchPairs(stats = {}) {
  const moves = Math.max(0, Number(stats.moves) || 0);
  const elapsedMs = Math.max(0, Number(stats.elapsedMs) || 0);
  const matched = Math.max(0, Number(stats.matchedPairs) || 0);
  const base = matched * 120;
  const movePenalty = Math.max(0, moves - 8) * 8;
  const timePenalty = Math.floor(elapsedMs / 1000) * 2;
  return Math.max(0, base - movePenalty - timePenalty);
}

/**
 * Apply a flip; returns next board + derived state.
 * @param {ReturnType<typeof createMatchBoard>} board
 * @param {number} cardId
 * @param {number[]} openIds currently face-up unmatched (0–2)
 */
export function flipMatchCard(board, cardId, openIds = []) {
  const next = board.map((c) => ({ ...c }));
  const card = next.find((c) => c.id === cardId);
  if (!card || card.matched || card.faceUp) {
    return { board: next, openIds: [...openIds], matchedPair: false, movesDelta: 0 };
  }
  if (openIds.length >= 2) {
    return { board: next, openIds: [...openIds], matchedPair: false, movesDelta: 0 };
  }
  card.faceUp = true;
  const opens = [...openIds, cardId];
  if (opens.length < 2) {
    return { board: next, openIds: opens, matchedPair: false, movesDelta: 0 };
  }
  const [aId, bId] = opens;
  const a = next.find((c) => c.id === aId);
  const b = next.find((c) => c.id === bId);
  if (a && b && a.symbol === b.symbol) {
    a.matched = true;
    b.matched = true;
    a.faceUp = true;
    b.faceUp = true;
    return { board: next, openIds: [], matchedPair: true, movesDelta: 1 };
  }
  return { board: next, openIds: opens, matchedPair: false, movesDelta: 1, needFlipBack: true };
}

export function flipBackMismatched(board, openIds = []) {
  const ban = new Set(openIds);
  return board.map((c) => (
    ban.has(c.id) && !c.matched ? { ...c, faceUp: false } : { ...c }
  ));
}

export function isMatchComplete(board) {
  return board.length > 0 && board.every((c) => c.matched);
}
