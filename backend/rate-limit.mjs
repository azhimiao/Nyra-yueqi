import { createHash } from "node:crypto";

function hashBucket(bucket) {
  const digest = createHash("sha256").update(String(bucket)).digest();
  return digest.readInt32BE(0);
}

function memoryBackend() {
  const windows = new Map();
  return {
    async consume(bucket, { max, windowMs, now }) {
      const cutoff = now - windowMs;
      const recent = (windows.get(bucket) || []).filter((timestamp) => timestamp > cutoff);
      if (recent.length >= max) {
        return { allowed: false, count: recent.length, remaining: 0 };
      }
      recent.push(now);
      windows.set(bucket, recent);
      return { allowed: true, count: recent.length, remaining: Math.max(0, max - recent.length) };
    },
  };
}

function sqlBackend(session) {
  return {
    async consume(bucket, { max, windowMs, now }) {
      return session.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock($1)", [hashBucket(`rate:${bucket}`)]);
        const rows = await tx.query(
          "SELECT bucket, window_started_at, count FROM billing_rate_limits WHERE bucket = $1",
          [bucket],
        );
        const startedAt = rows[0]?.window_started_at ? Date.parse(rows[0].window_started_at) : Number.NaN;
        const inWindow = Number.isFinite(startedAt) && now - startedAt < windowMs;
        const count = inWindow ? Math.max(0, Number(rows[0]?.count) || 0) : 0;
        const windowStarted = inWindow ? new Date(startedAt).toISOString() : new Date(now).toISOString();
        if (count >= max) {
          return { allowed: false, count, remaining: 0 };
        }
        const next = count + 1;
        await tx.query(
          `INSERT INTO billing_rate_limits (bucket, window_started_at, count, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (bucket) DO UPDATE SET
             window_started_at = EXCLUDED.window_started_at,
             count = EXCLUDED.count,
             updated_at = EXCLUDED.updated_at`,
          [bucket, windowStarted, next, new Date(now).toISOString()],
        );
        return { allowed: true, count: next, remaining: Math.max(0, max - next) };
      });
    },
  };
}

export const RATE_LIMIT_POLICIES = {
  otpEmail: { max: 5, windowMs: 15 * 60_000 },
  otpIp: { max: 20, windowMs: 15 * 60_000 },
  otpDevice: { max: 8, windowMs: 15 * 60_000 },
  registerIp: { max: 8, windowMs: 15 * 60_000 },
  hostedChat: { max: 60, windowMs: 60_000 },
  hostedImage: { max: 20, windowMs: 60_000 },
  hostedAgent: { max: 10, windowMs: 60_000 },
  hostedVoice: { max: 60, windowMs: 60_000 },
  redeem: { max: 10, windowMs: 15 * 60_000 },
  checkout: { max: 10, windowMs: 60_000 },
};

export function createDurableRateLimiter(options = {}) {
  const nowFn = typeof options.now === "function" ? options.now : Date.now;
  const publicServer = options.publicServer === true;
  const session = options.sql?.session;
  if (publicServer && !session && options.allowMemoryOnPublic !== true) {
    const error = new Error("Public rate limits require the Nyra billing database");
    error.code = "rate_limit_backend_missing";
    throw error;
  }
  const backend = session ? sqlBackend(session) : memoryBackend();
  if (publicServer && !session) {
    // Unreachable when fail-closed; kept for tests.
  }

  async function consume(bucket, policy) {
    const result = await backend.consume(bucket, {
      max: policy.max,
      windowMs: policy.windowMs,
      now: nowFn(),
    });
    if (!result.allowed) {
      const error = new Error("请求过于频繁，请稍后再试。");
      error.code = "rate_limited";
      error.status = 429;
      error.bucket = bucket;
      throw error;
    }
    return result;
  }

  return {
    backend: session ? "sql" : "memory",
    consume,
    otpEmail: (email) => consume(`otp:email:${String(email || "").trim().toLowerCase()}`, RATE_LIMIT_POLICIES.otpEmail),
    otpIp: (ip) => consume(`otp:ip:${String(ip || "unknown")}`, RATE_LIMIT_POLICIES.otpIp),
    otpDevice: (deviceHash) => consume(`otp:device:${String(deviceHash || "unknown")}`, RATE_LIMIT_POLICIES.otpDevice),
    registerIp: (ip) => consume(`register:ip:${String(ip || "unknown")}`, RATE_LIMIT_POLICIES.registerIp),
    hostedChat: (userId) => consume(`hosted:chat:${userId}`, RATE_LIMIT_POLICIES.hostedChat),
    hostedImage: (userId) => consume(`hosted:image:${userId}`, RATE_LIMIT_POLICIES.hostedImage),
    hostedAgent: (userId) => consume(`hosted:agent:${userId}`, RATE_LIMIT_POLICIES.hostedAgent),
    hostedVoice: (userId) => consume(`hosted:voice:${userId}`, RATE_LIMIT_POLICIES.hostedVoice),
    redeem: (userId) => consume(`redeem:${userId}`, RATE_LIMIT_POLICIES.redeem),
    checkout: (userId) => consume(`checkout:${userId}`, RATE_LIMIT_POLICIES.checkout),
  };
}
