#!/usr/bin/env node
/**
 * CP-21 — E2E acceptance harness: orchestrate CP-7…20 verify scripts + bridge smoke.
 * Does NOT require Android emulator, Live BYOK, or iOS.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

/** @type {{ cp: number; label: string; npmScript: string }[]} */
const CP_STEPS = [
  { cp: 7, label: "Explore Task Runtime", npmScript: "verify:explore-cp7" },
  { cp: 8, label: "Assistant worldbook/theme", npmScript: "verify:assistant-cp8" },
  { cp: 9, label: "Companion relationship", npmScript: "verify:companion-cp9" },
  { cp: 10, label: "Proactive life events", npmScript: "verify:companion-cp10" },
  { cp: 11, label: "App event bus", npmScript: "verify:world-cp11" },
  { cp: 12, label: "Scenario memory", npmScript: "verify:companion-cp12" },
  { cp: 13, label: "YEOS install/save", npmScript: "verify:yeos-cp13" },
  { cp: 14, label: "Skill permissions", npmScript: "verify:skill-cp14" },
  { cp: 15, label: "Backup / privacy", npmScript: "verify:backup-cp15" },
  { cp: 16, label: "Onboarding copy", npmScript: "verify:onboarding-cp16" },
  { cp: 17, label: "Pet / life-state", npmScript: "verify:pet-cp17" },
  { cp: 18, label: "Perf lazy-load", npmScript: "verify:perf-cp18" },
  { cp: 19, label: "Security sinks", npmScript: "verify:security-cp19" },
  { cp: 20, label: "Cross build prep", npmScript: "verify:cross-cp20" },
];

/** @type {{ cp: string; label: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string }[]} */
const results = [];

function runNpmScript(npmScript) {
  if (!packageJson.scripts?.[npmScript]) {
    return { ok: false, skipped: true, detail: "script missing" };
  }
  const start = Date.now();
  const r = spawnSync(npmCmd, ["run", npmScript], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CP20_SKIP_BUILD: process.env.CP21_SKIP_BUILD || process.env.CP20_SKIP_BUILD || "1",
      FORCE_COLOR: "0",
    },
    shell: process.platform === "win32",
    timeout: 600_000,
  });
  const elapsedMs = Date.now() - start;
  const ok = (r.status ?? 1) === 0;
  const detail = ok ? `${Math.round(elapsedMs / 1000)}s` : tailOutput(r);
  return { ok, skipped: false, detail };
}

function tailOutput(r) {
  const out = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
  if (!out) return `exit ${r.status ?? 1}`;
  return out.split("\n").slice(-3).join(" | ").slice(0, 200);
}

function printSummaryTable() {
  const cpW = 4;
  const statusW = 6;
  const labelW = Math.max(...results.map((r) => r.label.length), 12);
  console.log("\n=== CP-21 E2E summary ===");
  console.log(`${"CP".padEnd(cpW)}  ${"Status".padEnd(statusW)}  ${"Scope".padEnd(labelW)}  Detail`);
  console.log(`${"-".repeat(cpW)}  ${"-".repeat(statusW)}  ${"-".repeat(labelW)}  ${"-".repeat(24)}`);
  for (const row of results) {
    console.log(
      `${String(row.cp).padEnd(cpW)}  ${row.status.padEnd(statusW)}  ${row.label.padEnd(labelW)}  ${row.detail || ""}`,
    );
  }
}

console.log("CP-21 E2E acceptance harness (CP-7…20 + smoke)");
console.log("External gates excluded: Android runtime, Live BYOK, iOS\n");

for (const step of CP_STEPS) {
  process.stdout.write(`\n>>> CP-${step.cp} ${step.npmScript} …\n`);
  const { ok, skipped, detail } = runNpmScript(step.npmScript);
  if (skipped) {
    results.push({ cp: step.cp, label: step.label, status: "SKIP", detail });
    console.log(`SKIP  CP-${step.cp} (${step.npmScript}) — ${detail}`);
    continue;
  }
  results.push({
    cp: step.cp,
    label: step.label,
    status: ok ? "PASS" : "FAIL",
    detail,
  });
  console.log(`${ok ? "PASS" : "FAIL"}  CP-${step.cp} (${step.npmScript})`);
}

console.log("\n>>> CP-21 bridge smoke integration …");
const smoke = spawnSync(node, ["./tests/integration/e2e-cp21-smoke.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
  },
});
const smokeOk = (smoke.status ?? 1) === 0;
results.push({
  cp: "21",
  label: "Bridge smoke",
  status: smokeOk ? "PASS" : "FAIL",
  detail: smokeOk ? "app-events + life-state" : "integration failed",
});

checkDocs();

function checkDocs() {
  const required = [
    "docs/NYRA_APP_COMPLETION_REPORT.md",
    "docs/NYRA_CP21_E2E_REPORT.md",
    "docs/NYRA_EXTERNAL_VALIDATION_CHECKLIST.md",
    "docs/NYRA_RELEASE_READINESS_REPORT.md",
    "docs/NYRA_KNOWN_LIMITATIONS.md",
  ];
  const missing = required.filter((p) => !existsSync(join(root, p)));
  results.push({
    cp: "21",
    label: "Completion docs",
    status: missing.length ? "FAIL" : "PASS",
    detail: missing.length ? missing.join(", ") : "5 files present",
  });
  if (missing.length) console.error(`FAIL  completion docs missing: ${missing.join(", ")}`);
}

printSummaryTable();

const failed = results.filter((r) => r.status === "FAIL");
console.log("");
if (failed.length) {
  console.error(`verify:e2e-cp21 failed: ${failed.map((r) => `CP-${r.cp}`).join(", ")}`);
  process.exit(1);
}
console.log("verify:e2e-cp21 passed — environment-complete CP-7…21 green");
console.log("External gates remain: IMPLEMENTED_PENDING_ANDROID_RUNTIME | IMPLEMENTED_PENDING_EXTERNAL_BYOK | IMPLEMENTED_PENDING_IOS_BUILD");
