#!/usr/bin/env node
/**
 * CP-15 — Backup migration + privacy controls verification.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node =
  process.env.OPENCLAW_NODE ||
  (existsSync("F:\\clawtry\\node-v22.22.3-win-x64\\node.exe")
    ? "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe"
    : process.execPath);

if (process.platform === "win32") spawnSync("chcp", ["65001"], { stdio: "ignore", shell: true });

const failures = [];
function check(name, pass, detail = "") {
  if (!pass) failures.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const backupJs = readFileSync(join(root, "src/memory/backup.js"), "utf8");
const dataModulesJs = readFileSync(join(root, "src/memory/data-modules.js"), "utf8");
const privacyJs = readFileSync(join(root, "src/memory/privacy.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const constantsJs = readFileSync(join(root, "src/constants.js"), "utf8");

check("SYNC_PAYLOAD_VERSION >= 2", /SYNC_PAYLOAD_VERSION = 2/.test(constantsJs));
check("backup exports companionLife", backupJs.includes("companionLife: exportCompanionLifeBag"));
check("backup exports yeosGames/yeosSaves", backupJs.includes("yeosGames:") && backupJs.includes("yeosSaves:"));
check("backup imports artifact bag", backupJs.includes("exportArtifactBag") && backupJs.includes('from "../cocreate/artifact-store.js"'));
check("backup scrubs on export", backupJs.includes("scrubExportPayload"));
check("data-modules CP-15 keys", dataModulesJs.includes("companionLife") && dataModulesJs.includes("yeosSaves"));
check("privacy scrub module", privacyJs.includes("scrubExportPayload") && privacyJs.includes("clearLocalModules"));
check("UI export no-media button", indexHtml.includes("data-export-backup-no-media"));
check("UI clear app events button", indexHtml.includes("data-clear-local-app-events"));
check("docs report exists", existsSync(join(root, "docs/NYRA_CP15_BACKUP_PRIVACY_REPORT.md")));

console.log("\n--- integration ---");
const r = spawnSync(node, ["./tests/integration/backup-cp15.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
  },
});

if ((r.status ?? 1) !== 0) {
  failures.push("integration backup-cp15.mjs");
}

console.log("");
if (failures.length) {
  console.error(`verify-backup-cp15 failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify-backup-cp15 PASSED");
