/**
 * Shared seeded RNG for Games platform (mulberry32).
 */

export function hashSeed(input) {
  const s = String(input ?? "");
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let t = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function shuffle(rng, list) {
  const out = [...(list || [])];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
