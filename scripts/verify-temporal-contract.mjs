/**
 * W2: TemporalSnapshotV1 + TemporalEventV1 contracts; freeze / inject clock.
 */

import assert from "node:assert/strict";
import {
  createTemporalSnapshotV1,
  validateTemporalSnapshotV1,
  createTemporalEventV1,
  validateTemporalEventV1,
  TEMPORAL_EVENT_KINDS,
  TEMPORAL_EVENT_STATUSES,
} from "../src/contracts/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
} from "../src/temporal/index.js";

function ok(name) {
  console.log(`PASS ${name}`);
}

function main() {
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z"); // 14:35 Asia/Shanghai
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));

  const snap = createTemporalSnapshotV1({ locale: "zh-CN" });
  const v = validateTemporalSnapshotV1(snap);
  assert.equal(v.ok, true, v.errors?.join(","));
  assert.equal(snap.schemaVersion, 1);
  assert.equal(snap.timezone, "Asia/Shanghai");
  assert.equal(snap.localDate, "2026-08-07");
  assert.equal(snap.localTime, "14:35");
  assert.equal(snap.weekday, 5); // Friday
  assert.equal(snap.utcOffsetMinutes, 480);
  assert.ok(snap.snapshotId);
  ok("create/validate TemporalSnapshotV1 from injected clock");

  // Freeze: same snapshot fields if clock advances later — caller must reuse object
  const frozen = { ...snap };
  setClockForTests(createClock({ nowMs: fixedMs + 3600_000, timezone: "Asia/Shanghai" }));
  const drifted = createTemporalSnapshotV1({ locale: "zh-CN" });
  assert.notEqual(frozen.localTime, drifted.localTime);
  assert.equal(frozen.localTime, "14:35");
  assert.equal(drifted.localTime, "15:35");
  ok("freeze snapshot: mid-turn must reuse object (new capture drifts)");

  // Inject override fields
  const overridden = createTemporalSnapshotV1({
    locale: "en",
    localDate: "2026-12-31",
    localTime: "23:59",
    weekday: 4,
    utcOffsetMinutes: 480,
    timezone: "Asia/Shanghai",
    capturedAt: "2026-12-31T15:59:00.000Z",
    snapshotId: "snp_test_1",
  });
  assert.equal(validateTemporalSnapshotV1(overridden).ok, true);
  assert.equal(overridden.locale, "en");
  assert.equal(overridden.snapshotId, "snp_test_1");
  ok("snapshot accepts injected fields");

  const bad = validateTemporalSnapshotV1({ schemaVersion: 1 });
  assert.equal(bad.ok, false);
  ok("invalid snapshot rejected");

  const event = createTemporalEventV1({
    userId: "usr_local",
    companionId: "cmp_demo",
    relationshipId: "rel_demo",
    kind: "follow_up",
    title: "答辩后询问结果",
    timezone: "Asia/Shanghai",
    temporalText: "答辩后记得问我",
    status: "confirmed",
    confidence: 0.9,
    sourceType: "conversation",
    sourceId: "msg_1",
    evidenceRefs: ["msg_1"],
    needsFollowUp: true,
    followUpPolicy: "ask_once",
    dueAt: "2026-08-08T10:00:00.000Z",
  });
  const ev = validateTemporalEventV1(event);
  assert.equal(ev.ok, true, ev.errors?.join(","));
  assert.equal(event.kind, "follow_up");
  assert.equal(event.status, "confirmed");
  assert.ok(TEMPORAL_EVENT_KINDS.includes(event.kind));
  assert.ok(TEMPORAL_EVENT_STATUSES.includes(event.status));
  ok("create/validate TemporalEventV1");

  const proposed = createTemporalEventV1({
    userId: "usr_local",
    companionId: "cmp_demo",
    relationshipId: "",
    title: "可能想看电影",
    temporalText: "周末可能想看电影",
    sourceId: "msg_2",
  });
  assert.equal(proposed.status, "proposed");
  assert.equal(validateTemporalEventV1(proposed).ok, true);
  ok("default status proposed");

  const badEvent = validateTemporalEventV1({
    ...event,
    status: "nope",
    kind: "wizard",
  });
  assert.equal(badEvent.ok, false);
  assert.ok(badEvent.errors.includes("status_enum"));
  assert.ok(badEvent.errors.includes("kind_enum"));
  ok("invalid kind/status rejected");

  resetClockForTests();
  console.log("\nverify-temporal-contract: all checks passed.");
}

try {
  main();
} catch (err) {
  console.error("FAIL", err);
  process.exitCode = 1;
}
