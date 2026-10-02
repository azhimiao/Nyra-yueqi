/**
 * C1 — Product cutover profile resolver.
 * Run: npm run verify:product-cutover-profile
 *
 * Default remains `legacy` until C8 + ALLOW_PRODUCTION_DEFAULT.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FEATURES, LOCAL_KEYS } from "../src/constants.js";
import {
  CUTOVER_NEW_PATH_FLAGS,
  CUTOVER_PROFILE_KEY,
  CUTOVER_PROFILES,
  DEFAULT_CUTOVER_PROFILE,
  __resetCutoverProfileCacheForTests,
  ensureCutoverProfileResolved,
  getCutoverProfile,
  resolveEffectiveFlags,
  setCutoverProfile,
} from "../src/features/cutover-profile.js";
import { getFeatureFlags, isFeatureEnabled } from "../src/features/flags.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED_ON = [
  "temporalContextV1",
  "turnUnderstandingV1",
  "relationshipContinuityV1",
  "palaceProjectionV1",
  "webRetrievalV1",
  "unifiedMemoryAdaptersV1",
  "diaryRepositoryV1",
  "palaceProjectionOnlyV1",
  "contextGraphProjectionOnlyV1",
  "singleBrokerRetrievalV1",
  "unifiedMemoryForgetV1",
  "memoryProjectionOutboxV1",
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

function reset() {
  memory.clear();
  __resetCutoverProfileCacheForTests();
}

function main() {
  reset();

  assert.equal(DEFAULT_CUTOVER_PROFILE, "legacy", "release default must stay legacy until C8");
  assert.equal(CUTOVER_PROFILES.includes("production_v1"), true);
  ok("default profile is legacy");

  assert.equal(LOCAL_KEYS.cutoverProfileKey, "yueqi.cutover.profile.v1");
  assert.equal(CUTOVER_PROFILE_KEY, "yueqi.cutover.profile.v1");
  ok("storage key yueqi.cutover.profile.v1");

  for (const key of EXPECTED_ON) {
    assert.equal(CUTOVER_NEW_PATH_FLAGS.includes(key), true, `missing new-path flag ${key}`);
    assert.equal(DEFAULT_FEATURES[key], false, `DEFAULT_FEATURES.${key} must stay false`);
  }
  ok("DEFAULT_FEATURES new-path flags remain false (resolver is the switch)");

  const ensured = ensureCutoverProfileResolved();
  assert.equal(ensured, "legacy");
  assert.equal(getCutoverProfile(), "legacy");
  ok("ensureCutoverProfileResolved defaults to legacy");

  for (const key of EXPECTED_ON) {
    assert.equal(isFeatureEnabled(key), false, `legacy must disable ${key}`);
  }
  ok("legacy keeps governed new-path flags off");

  const internalFlags = resolveEffectiveFlags("internal_v1");
  for (const key of EXPECTED_ON) {
    assert.equal(internalFlags[key], true, `internal_v1 resolveEffectiveFlags.${key}`);
  }
  setCutoverProfile("internal_v1");
  assert.equal(getCutoverProfile(), "internal_v1");
  assert.equal(JSON.parse(memory.get(CUTOVER_PROFILE_KEY)), "internal_v1");
  for (const key of EXPECTED_ON) {
    assert.equal(isFeatureEnabled(key), true, `internal_v1 must enable ${key}`);
    assert.equal(getFeatureFlags()[key], true);
  }
  ok("internal_v1 enables all W/M new-path flags + persists");

  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ temporalContextV1: false }));
  __resetCutoverProfileCacheForTests();
  assert.equal(getCutoverProfile(), "internal_v1");
  assert.equal(isFeatureEnabled("temporalContextV1"), false, "internal allows storage override");
  assert.equal(isFeatureEnabled("turnUnderstandingV1"), true);
  ok("internal_v1 allows developer storage override for diagnosis");

  memory.delete(LOCAL_KEYS.featuresKey);
  __resetCutoverProfileCacheForTests();
  setCutoverProfile("production_v1");
  assert.equal(getCutoverProfile(), "production_v1");
  for (const key of EXPECTED_ON) {
    assert.equal(isFeatureEnabled(key), true, `production_v1 must enable ${key}`);
  }
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ temporalContextV1: false }));
  __resetCutoverProfileCacheForTests();
  assert.equal(isFeatureEnabled("temporalContextV1"), true, "production_v1 profile wins over storage");
  ok("production_v1 selectable, same flag set, not storage-overridable on new-path keys");

  setCutoverProfile("legacy");
  assert.equal(getCutoverProfile(), "legacy");
  for (const key of EXPECTED_ON) {
    assert.equal(isFeatureEnabled(key), false);
  }
  ok("rollback to legacy clears new-path flags");

  reset();
  assert.equal(getCutoverProfile(), "legacy");
  ok("fresh install profile is legacy");

  reset();
  memory.set(CUTOVER_PROFILE_KEY, JSON.stringify("legacy"));
  assert.equal(ensureCutoverProfileResolved(), "legacy");
  ok("historical legacy profile is not auto-upgraded to production");

  setCutoverProfile("legacy");
  assert.equal(ensureCutoverProfileResolved(), "legacy");
  ok("explicit legacy rollback remains available");

  assert.equal(isFeatureEnabled("totallyUnknownFlagXyz"), false, "unknown flags stay off");
  ok("unknown feature keys are opt-in false");

  const evidence = join(root, "docs/qa/product-cutover/C1_CUTOVER_PROFILE.md");
  assert.equal(existsSync(evidence), true);
  const text = readFileSync(evidence, "utf8");
  assert.match(text, /legacy|must not/i);
  ok("C1 evidence doc present with rollback notes");

  console.log("\nAll product-cutover-profile checks passed.");
}

main();
