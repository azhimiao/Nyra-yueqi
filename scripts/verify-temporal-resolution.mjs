/**
 * W2: relative temporal resolution against frozen snapshot + injected clock.
 */

import assert from "node:assert/strict";
import {
  createTemporalSnapshotV1,
} from "../src/contracts/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
  resolveRelativeTemporal,
  parseExplicitHour,
  nextWeekWeekday,
  addLocalDays,
  evaluateEventLifecycle,
  applyExpiry,
} from "../src/temporal/index.js";

function ok(name) {
  console.log(`PASS ${name}`);
}

function main() {
  resetClockForTests();
  // Friday 2026-08-07 14:35 Asia/Shanghai
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z");
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snap = createTemporalSnapshotV1({ locale: "zh-CN" });
  assert.equal(snap.localDate, "2026-08-07");
  assert.equal(snap.weekday, 5);

  const tomorrow = resolveRelativeTemporal("明天", snap);
  assert.equal(tomorrow.ok, true);
  assert.equal(tomorrow.localDate, "2026-08-08");
  assert.equal(tomorrow.precision, "day");
  ok("明天 → next local date");

  const aft = resolveRelativeTemporal("明天下午", snap);
  assert.equal(aft.ok, true);
  assert.equal(aft.localDate, "2026-08-08");
  assert.equal(aft.precision, "period");
  // Must NOT invent a single HH:mm midpoint — interval spans afternoon
  assert.ok(aft.startsAt && aft.endsAt);
  assert.notEqual(aft.startsAt, aft.endsAt);
  const startHour = new Date(aft.startsAt).toLocaleString("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hourCycle: "h23",
  });
  assert.ok(Number(startHour) === 12 || startHour === "12", `afternoon start hour got ${startHour}`);
  ok("明天下午 → period interval, no invented exact HH:mm");

  const dayAfter = resolveRelativeTemporal("后天", snap);
  assert.equal(dayAfter.localDate, "2026-08-09");
  ok("后天");

  // 下周一 from Friday Aug 7 → Aug 10
  assert.equal(nextWeekWeekday("2026-08-07", 5, 1), "2026-08-10");
  const nextMon = resolveRelativeTemporal("下周一", snap);
  assert.equal(nextMon.ok, true);
  assert.equal(nextMon.localDate, "2026-08-10");
  ok("下周一 relative to injected Friday snapshot");

  const tonight = resolveRelativeTemporal("今晚", snap);
  assert.equal(tonight.localDate, "2026-08-07");
  assert.equal(tonight.precision, "period");
  ok("今晚 → today evening period");

  const en = resolveRelativeTemporal("tomorrow afternoon", snap);
  assert.equal(en.ok, true);
  assert.equal(en.localDate, "2026-08-08");
  assert.equal(en.precision, "period");
  ok("en: tomorrow afternoon");

  const explicit = resolveRelativeTemporal("明天下午三点", snap);
  assert.equal(explicit.ok, true);
  assert.equal(explicit.precision, "time");
  assert.equal(explicit.startsAt, explicit.endsAt);
  ok("明天下午三点 → exact time when stated");

  assert.equal(parseExplicitHour("下午"), null);
  ok("bare 下午 has no explicit hour");

  // Expiry
  const past = {
    status: "confirmed",
    endsAt: "2026-08-06T12:00:00.000Z",
    title: "昨天的事",
  };
  assert.equal(evaluateEventLifecycle(past, snap), "expired");
  const applied = applyExpiry(past, snap);
  assert.equal(applied.changed, true);
  assert.equal(applied.event.status, "expired");
  ok("past endsAt → expired against snapshot");

  const future = {
    status: "confirmed",
    dueAt: "2026-08-08T12:00:00.000Z",
  };
  assert.equal(evaluateEventLifecycle(future, snap), "confirmed");
  ok("future due stays confirmed");

  // Mid-turn freeze: resolve against frozen snap even if clock moves
  setClockForTests(createClock({ nowMs: Date.parse("2026-08-08T06:35:00.000Z"), timezone: "Asia/Shanghai" }));
  const still = resolveRelativeTemporal("明天", snap);
  assert.equal(still.localDate, "2026-08-08"); // relative to frozen Fri, not new Sat
  ok("resolution uses frozen snapshot, not live clock");

  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  ok("cross-year addLocalDays");

  resetClockForTests();
  console.log("\nverify-temporal-resolution: all checks passed.");
}

try {
  main();
} catch (err) {
  console.error("FAIL", err);
  process.exitCode = 1;
}
