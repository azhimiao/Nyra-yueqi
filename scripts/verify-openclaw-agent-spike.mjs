#!/usr/bin/env node
/**
 * CP-4 spike runner wrapper — prefers Node 22+ (OpenClaw undici requirement).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testFile = join(root, "tests", "integration", "openclaw-agent-core-spike.mjs");
const candidates = [
  process.env.OPENCLAW_NODE,
  "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe",
  process.execPath,
].filter(Boolean);

let nodeBin = null;
for (const c of candidates) {
  if (c === process.execPath || existsSync(c)) {
    const ver = spawnSync(c, ["-p", "process.versions.node"], { encoding: "utf8" });
    const major = Number.parseInt(String(ver.stdout || "").split(".")[0], 10);
    if (major >= 22) {
      nodeBin = c;
      break;
    }
  }
}

if (!nodeBin) {
  console.error(
    "OpenClaw spike requires Node >= 22 (undici). Set OPENCLAW_NODE or install Node 22+.",
  );
  process.exit(1);
}

const result = spawnSync(nodeBin, [testFile], { stdio: "inherit", cwd: root });
process.exit(result.status ?? 1);
