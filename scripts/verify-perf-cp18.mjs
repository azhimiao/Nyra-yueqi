#!/usr/bin/env node
/**
 * CP-18 — lazy-load Agent / OpenClaw off cold start and Pop chat path.
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

const failures = [];
function check(name, pass, detail = "") {
  if (!pass) failures.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const lazyAgent = readFileSync(join(root, "src/studio-assist/agent/lazy-agent.js"), "utf8");
const lazyRunners = readFileSync(join(root, "src/task-runtime/lazy-runners.js"), "utf8");
const lazyMobile = readFileSync(join(root, "src/integrations/openclaw-mobile/lazy-load.js"), "utf8");
const chatStore = readFileSync(join(root, "src/studio-assist/chat-store.js"), "utf8");
const viteConfig = readFileSync(join(root, "vite.config.js"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

check("lazy-agent facade", lazyAgent.includes("import(\"./runner.js\")"));
check("lazy-runners facade", lazyRunners.includes("import(\"./worldbook-merge-runner.js\")"));
check("lazy-load mobile runtime", lazyMobile.includes("import(\"./index.js\")"));
check("chat-store uses lazy-agent", chatStore.includes("./agent/lazy-agent.js"));
check("chat-store uses lazy-runners", chatStore.includes("../task-runtime/lazy-runners.js"));
check("vite openclaw-mobile chunk", viteConfig.includes("openclaw-mobile"));
check("vite agent-runtime chunk", viteConfig.includes("agent-runtime"));
check("npm script verify:perf-cp18", packageJson.includes("verify:perf-cp18"));
check("docs report exists", existsSync(join(root, "docs/NYRA_CP18_PERF_REPORT.md")));

console.log("\n--- integration ---");
const r = spawnSync(node, ["./tests/integration/perf-cp18.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
  },
});
if ((r.status ?? 1) !== 0) failures.push("integration perf-cp18.mjs");

console.log("\n--- explore regression ---");
const e = spawnSync(node, ["./scripts/verify-explore-cp7.mjs"], {
  cwd: root,
  stdio: "inherit",
});
if ((e.status ?? 1) !== 0) failures.push("verify-explore-cp7");

console.log("");
if (failures.length) {
  console.error(`verify:perf-cp18 failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify:perf-cp18 passed");
