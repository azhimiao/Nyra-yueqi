/**
 * PAIOS P0 — journeys must be real Playwright UI paths.
 *
 * Legacy behavior (declare steps → mark PASS) is removed.
 * This script only delegates to e2e/core-life-journey.spec.mjs.
 *
 * Requires: `npm run dev` (or DEMO_URL) serving the app.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = join(root, "e2e/core-life-journey.spec.mjs");

console.log("verify:core-journeys → real Playwright golden journey (no declare-PASS)");
console.log(`running: node ${spec}`);

const result = spawnSync(process.execPath, [spec], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("\nverify:core-journeys FAILED — keep assertions; fix product from docs/qa/paios/P0/failures/");
  process.exit(result.status || 1);
}

console.log("\nverify:core-journeys OK (real E2E)");
