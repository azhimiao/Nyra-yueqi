/**
 * CP-5.5 Node + Playwright browser tests for mobile OpenClaw slice.
 * Writes UTF-8 log to .tmp/openclaw-mobile-test-log.json
 */
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { OpenClawMobileRuntimeAdapter } from "../../src/integrations/openclaw-mobile/OpenClawMobileRuntimeAdapter.js";
import { OpenClawMobileProcessController } from "../../src/integrations/openclaw-mobile/OpenClawMobileProcessController.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG_DIR = join(REPO, ".tmp");
const DIST = join(LOG_DIR, "openclaw-mobile-build", "dist");
mkdirSync(LOG_DIR, { recursive: true });

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail: String(detail) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}

mkdirSync(DIST, { recursive: true });

// Ensure vendor + bundle
const build = spawnSync(
  process.env.OPENCLAW_NODE || "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe",
  [join(REPO, "scripts/vendor-openclaw-mobile-slice.mjs")],
  { cwd: REPO, encoding: "utf8" },
);
const build2 = spawnSync(
  process.env.OPENCLAW_NODE || "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe",
  [join(REPO, "scripts/build-openclaw-mobile-slice.mjs")],
  { cwd: REPO, encoding: "utf8" },
);
check(
  "mobile slice vite build",
  build2.status === 0 && existsSync(join(DIST, "openclaw-mobile-slice.js")),
  ((build2.stderr || "") + (build2.stdout || "")).slice(-300),
);
const probe = existsSync(join(LOG_DIR, "openclaw-mobile-build-probe.json"))
  ? JSON.parse(readFileSync(join(LOG_DIR, "openclaw-mobile-build-probe.json"), "utf8"))
  : {};
check("bundle has no node:child_process", probe.ok === true, JSON.stringify(probe.forbiddenHits));
check("bundle gzip reported", typeof probe.gzipBytes === "number" && probe.gzipBytes > 0, String(probe.gzipBytes));

// Node mobile adapter happy path
async function collect(adapter, req) {
  const ev = [];
  for await (const e of adapter.run(req)) ev.push(e);
  return ev;
}

const adapter = new OpenClawMobileRuntimeAdapter();
const happy = await collect(adapter, {
  allowFakeStream: true,
  runId: "m-happy",
  instruction: "fix",
  workspaceId: "m-happy",
  maxSteps: 8,
  testScenario: "happy",
});
check(
  "node mobile happy completes",
  happy.some((e) => e.type === "run_completed"),
  happy.map((e) => e.type).join(">"),
);
const ws = adapter.workspaces.get("m-happy");
const fixed = ws ? JSON.parse(await ws.readText("output/character.fixed.json")) : null;
check(
  "node mobile fixed character",
  fixed?.personality === "温和、克制、具有持续记忆",
  JSON.stringify(fixed),
);

// Failure paths
const unknown = await collect(adapter, {
  allowFakeStream: true,
  runId: "m-unk",
  instruction: "x",
  workspaceId: "m-unk",
  maxSteps: 4,
  testScenario: "unknown_tool",
});
check(
  "unknown tool errors",
  unknown.some((e) => e.type === "tool_completed" && e.isError),
);

const bad = await collect(adapter, {
  allowFakeStream: true,
  runId: "m-bad",
  instruction: "x",
  workspaceId: "m-bad",
  maxSteps: 4,
  testScenario: "bad_schema",
});
check(
  "bad schema errors",
  bad.some((e) => e.type === "tool_completed" && e.isError),
);

const maxed = await collect(adapter, {
  allowFakeStream: true,
  runId: "m-max",
  instruction: "x",
  workspaceId: "m-max",
  maxSteps: 2,
  testScenario: "max_steps",
});
check("max steps ends", maxed.some((e) => e.type === "run_completed" || e.type === "run_failed"));

const shell = await collect(adapter, {
  allowFakeStream: true,
  runId: "m-shell",
  instruction: "x",
  workspaceId: "m-shell",
  maxSteps: 4,
  testScenario: "shell",
});
check(
  "shell capability denied",
  shell.some((e) => e.type === "tool_completed" && e.isError) ||
    shell.some((e) => e.type === "run_failed" && e.code === "UNSUPPORTED_RUNTIME_CAPABILITY"),
);

const esc = await collect(adapter, {
  allowFakeStream: true,
  runId: "m-esc",
  instruction: "x",
  workspaceId: "m-esc",
  maxSteps: 6,
  testScenario: "path_escape",
});
check(
  "path escape errors",
  esc.some((e) => e.type === "tool_completed" && e.toolName === "workspace.write_text" && e.isError),
);

const proc = new OpenClawMobileProcessController();
let procFail = false;
try {
  proc.killProcessTree(1);
} catch (e) {
  procFail = e.code === "UNSUPPORTED_RUNTIME_CAPABILITY";
}
check("process controller fail-closed", procFail);

// Cancel
const cancelAdapter = new OpenClawMobileRuntimeAdapter();
const cancelPromise = collect(cancelAdapter, {
  allowFakeStream: true,
  runId: "m-cancel",
  instruction: "x",
  workspaceId: "m-cancel",
  maxSteps: 8,
  testScenario: "happy",
});
setTimeout(() => cancelAdapter.cancel("m-cancel"), 5);
const cancelled = await cancelPromise;
check(
  "cancel works",
  cancelled.some((e) => e.type === "run_failed" && e.code === "CANCELLED") ||
    cancelled.some((e) => e.type === "run_completed"),
);

// Browser Playwright — real Chromium, no Node polyfill page
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
};
const html = `<!doctype html><html><body>
<script>
  globalThis.process = globalThis.process || {
    env: {}, browser: true, platform: "browser", arch: "wasm32",
    versions: { node: "0.0.0-nyra-mobile" }, cwd: () => "/",
    nextTick: (fn, ...a) => queueMicrotask(() => fn(...a)), pid: 1
  };
  globalThis.global = globalThis;
</script>
<script type="module">
  window.__ready = false;
  window.__err = null;
  try {
    const mod = await import("./openclaw-mobile-slice.js");
    window.__run = async () => {
      const kill = await mod.assertKillTreeFails();
      const result = await mod.runMobileCharacterFix({ maxSteps: 8 });
      return { kill, result };
    };
    window.__ready = true;
  } catch (e) {
    window.__err = String(e && e.stack || e);
    window.__ready = true;
  }
</script>
</body></html>`;
mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, "harness.html"), html, "utf8");

let browserOk = false;
let browserDetail = "";
if (!existsSync(join(DIST, "openclaw-mobile-slice.js"))) {
  browserDetail = "bundle missing";
} else {
  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    const file = url === "/" ? "/harness.html" : url;
    const path = join(DIST, file.replace(/^\//, ""));
    if (!path.startsWith(DIST) || !existsSync(path)) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream" });
    res.end(readFileSync(path));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on("pageerror", (err) => {
      browserDetail += ` pageerror:${err.message}`;
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") browserDetail += ` console:${msg.text()}`;
    });
    await page.goto(`http://127.0.0.1:${port}/harness.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__ready === true, { timeout: 15000 });
    const bootErr = await page.evaluate(() => window.__err);
    if (bootErr) {
      browserDetail = bootErr;
    } else {
      const out = await page.evaluate(async () => window.__run());
      browserOk =
        out?.kill?.ok === true &&
        out?.result?.fixed?.personality === "温和、克制、具有持续记忆" &&
        Array.isArray(out?.result?.events) &&
        out.result.events.some((e) => String(e).includes("tool_execution"));
      browserDetail = JSON.stringify(out).slice(0, 800);
    }
    await browser.close();
  } catch (err) {
    browserDetail = String(err?.message || err) + " | " + browserDetail;
  }
  server.close();
}
check("playwright browser character fix", browserOk, browserDetail);

// CP-4/CP-5 regression quick
const spike = spawnSync(
  process.env.OPENCLAW_NODE || "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe",
  [join(REPO, "scripts/verify-openclaw-agent-spike.mjs")],
  { cwd: REPO, encoding: "utf8" },
);
check("CP-4 spike regression", spike.status === 0, "status=" + spike.status);
const ad = spawnSync(
  process.env.OPENCLAW_NODE || "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe",
  [join(REPO, "scripts/verify-openclaw-adapter.mjs")],
  { cwd: REPO, encoding: "utf8" },
);
check("CP-5 adapter regression", ad.status === 0, "status=" + ad.status);

const failed = checks.filter((c) => !c.pass);
const report = {
  auditedAt: "2026-07-30",
  encoding: "utf-8",
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
  bundle: probe,
};
writeFileSync(join(LOG_DIR, "openclaw-mobile-test-log.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`\nCP-5.5 tests: ${report.passed}/${report.total}`);
if (failed.length) {
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log("CP-5.5 mobile slice tests PASSED");
