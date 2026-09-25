/**
 * Simple sliding-window rate limiter for retrieval search.
 */

/** @type {Map<string, number[]>} */
const windows = new Map();

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * @param {string} key
 * @param {{ limit?: number, windowMs?: number, nowMs?: number }} [opts]
 * @returns {{ ok: true } | { ok: false, reason: string, retryAfterMs: number }}
 */
export function checkRateLimit(key, opts = {}) {
  const k = String(key || "global");
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : DEFAULT_LIMIT;
  const windowMs = Number(opts.windowMs) > 0 ? Number(opts.windowMs) : DEFAULT_WINDOW_MS;
  const now = Number.isFinite(opts.nowMs) ? Number(opts.nowMs) : Date.now();

  const cutoff = now - windowMs;
  const prev = (windows.get(k) || []).filter((t) => t > cutoff);
  if (prev.length >= limit) {
    const oldest = prev[0] || now;
    windows.set(k, prev);
    return {
      ok: false,
      reason: "rate_limited",
      retryAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }
  prev.push(now);
  windows.set(k, prev);
  return { ok: true };
}

export function clearRateLimits() {
  windows.clear();
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function rateLimitConfigFromEnv(env = process.env) {
  const limit = Number(env.YUEQI_WEB_RATE_LIMIT || DEFAULT_LIMIT);
  const windowMs = Number(env.YUEQI_WEB_RATE_WINDOW_MS || DEFAULT_WINDOW_MS);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS,
  };
}

export { DEFAULT_LIMIT, DEFAULT_WINDOW_MS };
