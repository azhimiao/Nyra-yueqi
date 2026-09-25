/**
 * E7 · 落点反应 — pure spawn + score helpers.
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

export const TAP_DURATION_MS = 30_000;

/**
 * @param {number} seed
 * @param {number} index
 * @returns {{ id: string, x: number, y: number, bornAt: number, ttlMs: number }}
 */
export function spawnTapTarget(seed, index, bornAt = 0) {
  const rand = mulberry32((Number(seed) || 1) + index * 997);
  return {
    id: `tap-${index}`,
    x: 12 + rand() * 76,
    y: 14 + rand() * 68,
    bornAt: Number(bornAt) || 0,
    ttlMs: 1400 + Math.floor(rand() * 600),
  };
}

/**
 * @param {{ combo: number, hit: boolean, miss?: boolean }} input
 * @returns {{ scoreDelta: number, nextCombo: number }}
 */
export function scoreTapHit(input = {}) {
  const combo = Math.max(0, Number(input.combo) || 0);
  if (input.miss) {
    return { scoreDelta: 0, nextCombo: 0 };
  }
  if (!input.hit) {
    return { scoreDelta: 0, nextCombo: combo };
  }
  const nextCombo = combo + 1;
  const scoreDelta = 10 + Math.min(40, nextCombo * 2);
  return { scoreDelta, nextCombo };
}

/**
 * Deterministic score for a fixed sequence of hits/misses (verify).
 * @param {Array<"hit"|"miss">} sequence
 */
export function scoreTapSequence(sequence = []) {
  let combo = 0;
  let score = 0;
  for (const step of sequence) {
    const r = scoreTapHit({ combo, hit: step === "hit", miss: step === "miss" });
    score += r.scoreDelta;
    combo = r.nextCombo;
  }
  return score;
}
