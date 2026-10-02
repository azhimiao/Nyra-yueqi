/**
 * W0 baseline: feature flags (default false), injectable clock, deterministic IDs.
 * No product behavior change when flags remain off.
 */

import assert from "node:assert/strict";
import { DEFAULT_FEATURES, LOCAL_KEYS } from "../src/constants.js";
import { getFeatureFlags, isFeatureEnabled } from "../src/features/flags.js";
import {
  createClock,
  getClock,
  setClockForTests,
  resetClockForTests,
  captureTemporalSnapshotBasics,
} from "../src/temporal/index.js";
import {
  mintId,
  setIdFactoryForTests,
  resetIdFactoryForTests,
} from "../src/contracts/ids.js";

const W0_FLAGS = [
  "temporalContextV1",
  "turnUnderstandingV1",
  "relationshipContinuityV1",
  "palaceProjectionV1",
  "webRetrievalV1",
];

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = { localStorage: memStorage };

function ok(name) {
  console.log(`PASS ${name}`);
}

function main() {
  memory.clear();

  // --- Feature flags ---
  for (const key of W0_FLAGS) {
    assert.equal(Object.prototype.hasOwnProperty.call(DEFAULT_FEATURES, key), true, `DEFAULT_FEATURES missing ${key}`);
    assert.equal(DEFAULT_FEATURES[key], false, `DEFAULT_FEATURES.${key} must be false`);
  }
  ok("DEFAULT_FEATURES W0 flags exist and are false");

  const flags = getFeatureFlags();
  for (const key of W0_FLAGS) {
    assert.equal(flags[key], false, `getFeatureFlags().${key} must be false with clean storage`);
    assert.equal(isFeatureEnabled(key), false, `isFeatureEnabled(${key}) must be false`);
  }
  ok("getFeatureFlags / isFeatureEnabled default false");

  // Stored overrides still merge; unset keys stay at DEFAULT false
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ promptAssembly: true }));
  const merged = getFeatureFlags();
  for (const key of W0_FLAGS) {
    assert.equal(merged[key], false, `merged ${key} stays false when not in storage`);
  }
  memory.clear();
  ok("storage merge preserves W0 defaults");

  // --- Clock inject ---
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T15:30:00.000Z");
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const clock = getClock();
  assert.equal(clock.nowMs(), fixedMs);
  assert.equal(clock.nowIso(), "2026-08-07T15:30:00.000Z");
  assert.equal(clock.timezone(), "Asia/Shanghai");
  assert.equal(clock.nowDate().getTime(), fixedMs);
  const basics = captureTemporalSnapshotBasics();
  assert.equal(basics.capturedAt, "2026-08-07T15:30:00.000Z");
  assert.equal(basics.timezone, "Asia/Shanghai");
  assert.equal(basics.nowMs, fixedMs);
  ok("clock inject: fixed nowMs / nowIso / timezone");

  resetClockForTests();
  const live = getClock();
  const before = Date.now();
  const liveMs = live.nowMs();
  const after = Date.now();
  assert.ok(liveMs >= before && liveMs <= after, "reset clock returns wall time");
  ok("resetClockForTests restores wall clock");

  // --- ID factory inject ---
  resetIdFactoryForTests();
  let seq = 0;
  setIdFactoryForTests((kind, seed = "") => {
    seq += 1;
    return `test_${kind}_${seed || "x"}_${seq}`;
  });
  assert.equal(mintId("eventId", "demo"), "test_eventId_demo_1");
  assert.equal(mintId("taskId"), "test_taskId_x_2");
  ok("id factory inject used by mintId");

  resetIdFactoryForTests();
  const prod = mintId("eventId", "demo");
  assert.match(prod, /^evt_demo_/);
  assert.notEqual(prod, "test_eventId_demo_1");
  ok("resetIdFactoryForTests restores default mintId");

  console.log("\nW0 verify: all checks passed.");
}

try {
  main();
} catch (err) {
  console.error("FAIL", err);
  process.exitCode = 1;
}
