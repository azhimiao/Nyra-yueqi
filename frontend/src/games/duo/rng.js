/**
 * Seeded RNG for Duo games (mulberry32).
 * Prefer `src/games/platform/rng.js` when the platform lands; this is the local fallback.
 */

/**
 * @param {number} a
 * @returns {() => number}
 */
export function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string|number|undefined|null} seed
 * @returns {number}
 */
export function hashSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const s = String(seed ?? "nyra-duo");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * @typedef {{
 *   next: () => number,
 *   int: (min: number, max: number) => number,
 *   pick: <T>(arr: T[]) => T,
 *   shuffle: <T>(arr: T[]) => T[],
 *   bool: (p?: number) => boolean,
 * }} DuoRng
 */

/**
 * @param {string|number|undefined|null} seed
 * @returns {DuoRng}
 */
export function createRng(seed) {
  const next = mulberry32(hashSeed(seed));
  return {
    next,
    int(min, max) {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (hi < lo) return lo;
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    pick(arr) {
      if (!arr?.length) throw new Error("rng.pick: empty array");
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const out = Array.isArray(arr) ? arr.slice() : [];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    bool(p = 0.5) {
      return next() < p;
    },
  };
}
