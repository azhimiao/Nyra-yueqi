#!/usr/bin/env node
/**
 * Companion V2 release gate.
 * Fails if production_v2 is the install default, or if required Node artifacts are missing.
 * Device evidence files must contain RESULT: PASS to unlock production_v2.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DEFAULT_CUTOVER_PROFILE } from "../src/features/cutover-profile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowMissingDevice = process.env.COMPANION_V2_ALLOW_MISSING_DEVICE_EVIDENCE === "1";

function mustExist(rel) {
  const abs = join(root, rel);
  assert.equal(existsSync(abs), true, `missing ${rel}`);
  return readFileSync(abs, "utf8");
}

assert.equal(DEFAULT_CUTOVER_PROFILE, "legacy");
console.log("PASS default cutover remains legacy");

const required = [
  "src/characters/prompt-workspace.js",
  "src/prompt/request-inspector.js",
  "src/characters/revision-repository.js",
  "src/first-light/ui-v2.js",
  "src/first-light/preview-v2.js",
  "src/tools/companion-tool-loop.js",
  "src/model/tool-provider-adapter.js",
  "src/portability/png-metadata.js",
  "src/worldbook/import-character-book.js",
  "evals/companion-v2/cases.json",
];
for (const rel of required) mustExist(rel);
console.log("PASS required V2 modules exist");

const nodeScripts = [
  "scripts/verify-companion-v2-rest.mjs",
  "scripts/eval-companion-v2.mjs",
  "scripts/verify-first-light-commit-v2.mjs",
  "scripts/verify-prompt-authority-v2.mjs",
];
for (const rel of nodeScripts) {
  const result = spawnSync(process.execPath, [join(root, rel)], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`${rel} failed`);
  }
  console.log(`PASS ran ${rel}`);
}

const browser = existsSync(join(root, "docs/qa/companion-v2/BROWSER_REPORT.md"))
  ? readFileSync(join(root, "docs/qa/companion-v2/BROWSER_REPORT.md"), "utf8")
  : "";
const android = existsSync(join(root, "docs/qa/companion-v2/ANDROID_REPORT.md"))
  ? readFileSync(join(root, "docs/qa/companion-v2/ANDROID_REPORT.md"), "utf8")
  : "";
const browserPass = /RESULT:\s*PASS/.test(browser);
const androidPass = /RESULT:\s*PASS/.test(android);
if (!browserPass || !androidPass) {
  if (!allowMissingDevice) {
    console.log("FAIL device evidence missing (set COMPANION_V2_ALLOW_MISSING_DEVICE_EVIDENCE=1 for node-only CI)");
    process.exit(2);
  }
  console.log("WARN device evidence missing; node-only gate allowed by env");
} else {
  console.log("PASS device evidence");
}

console.log("PRODUCTION_V2_DEFAULT_BLOCKED");
console.log("verify-companion-v2-release: node complete");
