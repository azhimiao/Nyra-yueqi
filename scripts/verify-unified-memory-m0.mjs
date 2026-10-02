/**
 * Unified memory M0 gate — flags default false + evidence docs present.
 * Does NOT require regression suites green (those are recorded in M0_TEST_BASELINE.md).
 *
 * Run: npm run verify:unified-memory-m0
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FEATURES, LOCAL_KEYS } from "../src/constants.js";
import { getFeatureFlags, isFeatureEnabled } from "../src/features/flags.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const M0_FLAGS = [
  "unifiedMemoryAdaptersV1",
  "memoryProjectionOutboxV1",
  "diaryRepositoryV1",
  "palaceProjectionOnlyV1",
  "contextGraphProjectionOnlyV1",
  "singleBrokerRetrievalV1",
  "unifiedMemoryForgetV1",
];

const COMPANION_FLAGS = [
  "temporalContextV1",
  "turnUnderstandingV1",
  "relationshipContinuityV1",
  "palaceProjectionV1",
  "webRetrievalV1",
];

const EVIDENCE_DOCS = [
  "docs/qa/unified-memory/README.md",
  "docs/qa/unified-memory/M0_BASELINE.md",
  "docs/qa/unified-memory/M0_DIRECT_WRITERS.md",
  "docs/qa/unified-memory/M0_LEGACY_CENSUS.md",
  "docs/qa/unified-memory/M0_TEST_BASELINE.md",
  "docs/qa/unified-memory/M0_ENVELOPE_DUP_SOURCES.md",
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

  for (const key of M0_FLAGS) {
    assert.equal(Object.prototype.hasOwnProperty.call(DEFAULT_FEATURES, key), true, `DEFAULT_FEATURES missing ${key}`);
    assert.equal(DEFAULT_FEATURES[key], false, `DEFAULT_FEATURES.${key} must be false`);
  }
  ok("DEFAULT_FEATURES M0 flags exist and are false");

  for (const key of COMPANION_FLAGS) {
    assert.equal(Object.prototype.hasOwnProperty.call(DEFAULT_FEATURES, key), true, `companion flag missing ${key}`);
    assert.equal(DEFAULT_FEATURES[key], false, `companion flag ${key} must remain false default`);
  }
  ok("companion-intelligence flags still present (defaults false)");

  assert.notEqual(
    "palaceProjectionV1",
    "palaceProjectionOnlyV1",
    "flags must remain distinct names",
  );
  assert.equal(DEFAULT_FEATURES.palaceProjectionV1, false);
  assert.equal(DEFAULT_FEATURES.palaceProjectionOnlyV1, false);
  ok("palaceProjectionV1 and palaceProjectionOnlyV1 both exist, not aliased");

  const flagsJs = readFileSync(join(root, "src/features/flags.js"), "utf8");
  for (const key of M0_FLAGS) {
    assert.match(flagsJs, new RegExp(`${key}\\s*:`), `FEATURE_ATTR missing ${key}`);
  }
  ok("FEATURE_ATTR includes all M0 flags");

  const flags = getFeatureFlags();
  for (const key of M0_FLAGS) {
    assert.equal(flags[key], false, `getFeatureFlags().${key} must be false with clean storage`);
    assert.equal(isFeatureEnabled(key), false, `isFeatureEnabled(${key}) must be false`);
  }
  ok("getFeatureFlags / isFeatureEnabled default false for M0 flags");

  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ promptAssembly: true }));
  const merged = getFeatureFlags();
  for (const key of M0_FLAGS) {
    assert.equal(merged[key], false, `merged ${key} stays false when not in storage`);
  }
  memory.clear();
  ok("storage merge preserves M0 defaults");

  for (const rel of EVIDENCE_DOCS) {
    const abs = join(root, rel);
    assert.equal(existsSync(abs), true, `missing evidence doc ${rel}`);
    const body = readFileSync(abs, "utf8");
    assert.ok(body.trim().length > 40, `evidence doc too short: ${rel}`);
  }
  ok("all M0 evidence docs exist");

  assert.equal(existsSync(join(root, "scripts/unified-memory-m0-census.mjs")), true);
  ok("optional census helper present");

  console.log("\nM0 gate OK — flags frozen false; evidence present; regressions not required green.");
}

main();
