/**
 * W8 / plan §15.4 — Non-destructive feature-flag rollback helper.
 *
 * Prints how to disable all five companion-intelligence flags.
 * Optionally writes false values into a localStorage JSON dump (never deletes data).
 *
 * Usage:
 *   node scripts/companion-intelligence-rollback-flags.mjs
 *   node scripts/companion-intelligence-rollback-flags.mjs --print
 *   node scripts/companion-intelligence-rollback-flags.mjs --apply-storage-json path/to/localStorage.json
 *   node scripts/companion-intelligence-rollback-flags.mjs --dry-run-storage-json path/to/localStorage.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { LOCAL_KEYS, DEFAULT_FEATURES } from "../src/constants.js";

const CI_FLAGS = [
  "temporalContextV1",
  "turnUnderstandingV1",
  "relationshipContinuityV1",
  "palaceProjectionV1",
  "webRetrievalV1",
];

function parseArgs(argv) {
  const out = { applyPath: "", dryRunPath: "", print: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply-storage-json") out.applyPath = argv[++i] || "";
    else if (a === "--dry-run-storage-json") out.dryRunPath = argv[++i] || "";
    else if (a === "--print") out.print = true;
    else if (a === "--quiet") out.print = false;
  }
  return out;
}

function disabledPatch() {
  /** @type {Record<string, boolean>} */
  const patch = {};
  for (const key of CI_FLAGS) patch[key] = false;
  return patch;
}

function printInstructions() {
  const patch = disabledPatch();
  console.log("Companion intelligence W8 — rollback / disable flags (non-destructive)\n");
  console.log("Defaults in src/constants.js DEFAULT_FEATURES (prefer leave false):");
  for (const key of CI_FLAGS) {
    console.log(`  ${key}: ${DEFAULT_FEATURES[key]}`);
  }
  console.log("\nTo disable at runtime (browser console / settings localStorage):");
  console.log(`  key: ${LOCAL_KEYS.featuresKey}`);
  console.log("  merge object:");
  console.log(JSON.stringify(patch, null, 2));
  console.log("\nExample (browser):");
  console.log(`  const k = ${JSON.stringify(LOCAL_KEYS.featuresKey)};`);
  console.log("  const cur = JSON.parse(localStorage.getItem(k) || '{}');");
  console.log(`  localStorage.setItem(k, JSON.stringify({ ...cur, ...${JSON.stringify(patch)} }));`);
  console.log("\nOps notes (§15.4):");
  console.log("  - Chat still uses Conversation V2 + Context Broker + Branch Summary.");
  console.log("  - Do not re-enable ordinary numeric intimacy writes as a 'rollback'.");
  console.log("  - Closing turnUnderstandingV1 stops proposal side-effects; ordinary reply remains.");
  console.log("  - Closing webRetrievalV1 must not return fake web complete results.");
  console.log("\nThis script never deletes timeline, continuity, or palace data.");
}

function mergeFlagsIntoStorageFile(path, { write }) {
  const rawText = readFileSync(path, "utf8");
  const bag = JSON.parse(rawText);
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) {
    throw new Error("storage JSON must be an object of localStorage key→value");
  }
  const key = LOCAL_KEYS.featuresKey;
  let current = {};
  const existing = bag[key];
  if (typeof existing === "string") {
    try {
      current = JSON.parse(existing) || {};
    } catch {
      current = {};
    }
  } else if (existing && typeof existing === "object") {
    current = { ...existing };
  }
  const next = { ...current, ...disabledPatch() };
  const preview = { key, before: current, after: next };
  console.log(JSON.stringify({ dryRun: !write, ...preview }, null, 2));
  if (write) {
    bag[key] = JSON.stringify(next);
    writeFileSync(path, `${JSON.stringify(bag, null, 2)}\n`, "utf8");
    console.log(`\nUpdated flags in ${path} (other keys untouched).`);
  } else {
    console.log("\nDry-run only — no file write.");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.print && !args.applyPath && !args.dryRunPath) {
    printInstructions();
  }
  if (args.dryRunPath) {
    mergeFlagsIntoStorageFile(args.dryRunPath, { write: false });
  }
  if (args.applyPath) {
    mergeFlagsIntoStorageFile(args.applyPath, { write: true });
  }

  // Safe Node localStorage mock demo (does not touch user browser data).
  const mock = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mock.has(k) ? mock.get(k) : null),
    setItem: (k, v) => mock.set(k, String(v)),
    removeItem: (k) => mock.delete(k),
  };
  const patch = disabledPatch();
  globalThis.localStorage.setItem(LOCAL_KEYS.featuresKey, JSON.stringify(patch));
  console.log("\nNode mock localStorage set (in-process only):");
  console.log(globalThis.localStorage.getItem(LOCAL_KEYS.featuresKey));
}

main();
