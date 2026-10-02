/**
 * Unified memory browser E2E — delegates to C6 product-cutover suite.
 *
 * Plan: docs/UNIFIED_MEMORY_FEATURE_CONTEXT_CURSOR_PLAN.md §M10
 *       docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md §12
 *
 * CRITICAL: Never SKIP with exit 0. Missing Playwright/browser/server fails non-zero.
 *
 * Usage: node e2e/unified-memory-journey.spec.mjs
 * Prefer: npm run e2e:product-cutover-browser
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "e2e/product-cutover-browser.spec.mjs");

console.log("NOTE  unified-memory-journey → product-cutover-browser (C6; no SKIP)");

const child = spawn(
  process.execPath,
  ["--import", "./e2e/helpers/product-cutover-env.mjs", TARGET],
  {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`FAIL  unified-memory-journey killed by ${signal}`);
    process.exit(1);
  }
  process.exit(code == null ? 1 : code);
});

child.on("error", (err) => {
  console.error("FAIL  failed to spawn product-cutover-browser", err);
  process.exit(1);
});
