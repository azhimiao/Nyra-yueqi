import assert from "node:assert/strict";
import { createDurableRateLimiter } from "./rate-limit.mjs";
import { openPgliteBillingSql } from "./billing/sql-client.mjs";

{
  let now = 1_000;
  const limiter = createDurableRateLimiter({ now: () => now });
  assert.equal(limiter.backend, "memory");
  await limiter.otpEmail("a@example.com");
  await limiter.otpEmail("a@example.com");
  now += 15 * 60_000;
  await limiter.otpEmail("a@example.com");
}

{
  let now = 2_000;
  const limiter = createDurableRateLimiter({ now: () => now });
  for (let i = 0; i < 8; i += 1) await limiter.registerIp("203.0.113.10");
  await assert.rejects(
    () => limiter.registerIp("203.0.113.10"),
    (error) => error.code === "rate_limited",
  );
  await limiter.registerIp("203.0.113.11");
}

{
  const sql = await openPgliteBillingSql();
  try {
    let now = 5_000;
    const limiter = createDurableRateLimiter({
      sql,
      publicServer: true,
      now: () => now,
    });
    assert.equal(limiter.backend, "sql");
    for (let i = 0; i < 10; i += 1) await limiter.redeem("u1");
    await assert.rejects(() => limiter.redeem("u1"), (error) => error.code === "rate_limited");
    now += 15 * 60_000;
    await limiter.redeem("u1");
  } finally {
    await sql.close();
  }
}

assert.throws(
  () => createDurableRateLimiter({ publicServer: true }),
  (error) => error.code === "rate_limit_backend_missing",
);

console.log("durable rate limiter: ok");
