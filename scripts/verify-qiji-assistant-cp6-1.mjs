#!/usr/bin/env node
/**
 * CP-6.1 gate runner — UTF-8 console + CP-6 / BYOK / Android checks.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node =
  process.env.OPENCLAW_NODE ||
  (existsSync("F:\\clawtry\\node-v22.22.3-win-x64\\node.exe")
    ? "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe"
    : process.execPath);

if (process.platform === "win32") {
  spawnSync("chcp", ["65001"], { stdio: "ignore", shell: true });
}

process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" ");

const scripts = [
  "scripts/verify-qiji-assistant-cp6.mjs",
  "scripts/verify-qiji-assistant-byok.mjs",
  "scripts/verify-qiji-assistant-android-runtime.mjs",
];

let failed = false;
for (const rel of scripts) {
  console.log(`\n>>> ${rel}`);
  const r = spawnSync(node, [rel], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });
  if ((r.status ?? 1) !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
