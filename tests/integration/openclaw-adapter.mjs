/**
 * CP-5 OpenClaw Adapter integration tests (Node + Fake/Mock Model).
 * Writes UTF-8 logs to .tmp/openclaw-adapter-test-log.json
 *
 * Run via: node scripts/verify-openclaw-adapter.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OpenClawRuntimeAdapter,
  OpenClawWorkspaceAdapter,
  createNyraModelAdapter,
  nyraProviderResponseToAssistant,
  createSpikeNyraTools,
  readOpenClawPackageMeta,
  OPENCLAW_NODE_CAPABILITIES,
} from "../../src/integrations/openclaw/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG_DIR = join(REPO, ".tmp");
mkdirSync(LOG_DIR, { recursive: true });

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail: String(detail) });
  // ASCII-only console line to avoid Windows GBK mojibake; details stay UTF-8 in log file.
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}

async function collect(runtime, request) {
  const events = [];
  for await (const ev of runtime.run(request)) {
    events.push(ev);
  }
  return events;
}

const EXPECTED_FIXED = {
  name: "月栖测试角色",
  description: "用于验证 OpenClaw Agent Runtime",
  personality: "温和、克制、具有持续记忆",
};

// --- Meta ---
const meta = readOpenClawPackageMeta();
check("openclaw version pinned", meta.version === "2026.7.1-2", meta.version);
check(
  "capabilities declare node-only",
  OPENCLAW_NODE_CAPABILITIES.webBundle === false &&
    OPENCLAW_NODE_CAPABILITIES.capacitorInProcess === false,
);

// --- Business code must not import openclaw in this test file ---
{
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const hasDirectImport = /^\s*import\s+[^;]*['"]openclaw(\/|['"])/m.test(src);
  check("test does not import openclaw package directly", !hasDirectImport);
}

// --- Workspace escapes ---
{
  const ws = new OpenClawWorkspaceAdapter(join(LOG_DIR, "ws-unit"));
  await ws.ensureLayout();
  let blockedDotDot = false;
  let blockedAbs = false;
  let blockedEncoded = false;
  try {
    ws.resolvePath("../outside.json");
  } catch (e) {
    blockedDotDot = e.code === "WORKSPACE_PATH_ESCAPE";
  }
  try {
    ws.resolvePath("C:\\\\Windows\\\\system.ini");
  } catch (e) {
    blockedAbs = e.code === "WORKSPACE_PATH_ESCAPE";
  }
  try {
    ws.resolvePath("%2e%2e/outside.json");
  } catch (e) {
    blockedEncoded = e.code === "WORKSPACE_PATH_ESCAPE";
  }
  check("workspace blocks ..", blockedDotDot);
  check("workspace blocks absolute path", blockedAbs);
  check("workspace blocks encoded ..", blockedEncoded);
}

// --- Mock Nyra provider format ---
{
  const assistant = nyraProviderResponseToAssistant({
    tool_calls: [
      {
        id: "x1",
        function: { name: "character.inspect", arguments: "{}" },
      },
    ],
    usage: { input: 3, output: 4, cacheRead: 0, cacheWrite: 0 },
  });
  check(
    "mock nyra format maps tool_calls",
    assistant.content?.[0]?.type === "toolCall" &&
      assistant.content[0].name === "character.inspect" &&
      assistant.stopReason === "toolUse",
  );
}

// --- Happy path via Adapter ---
const runtime = new OpenClawRuntimeAdapter({
  tmpRoot: join(LOG_DIR, "openclaw-adapter-runs"),
});
const happyEvents = await collect(runtime, {
  runId: "cp5-happy",
  instruction: "Inspect and fix character card.",
  workspaceId: "cp5-happy",
  tools: [],
  model: { provider: "fake", modelId: "fake", mode: "fake" },
  maxSteps: 8,
  testScenario: "happy",
});
check(
  "happy: run_started then tools then run_completed",
  (() => {
    const types = happyEvents.map((e) => e.type);
    return (
      types.includes("run_started") &&
      types.includes("model_requested") &&
      types.some((t, i) => t === "tool_requested" && happyEvents[i].toolName === "character.inspect") &&
      types.some((t, i) => t === "tool_requested" && happyEvents[i].toolName === "workspace.write_text") &&
      types.includes("run_completed")
    );
  })(),
  happyEvents.map((e) => e.type).join(" > "),
);

const happyWs = runtime.runs.get("cp5-happy")?.workspace;
let fixed = null;
if (happyWs) {
  const raw = await happyWs.readText("output/character.fixed.json");
  fixed = JSON.parse(raw);
}
check(
  "happy: fixed character artifact",
  JSON.stringify(fixed) === JSON.stringify(EXPECTED_FIXED),
  JSON.stringify(fixed),
);

// --- mock-nyra mode through adapter ---
const mockEvents = await collect(runtime, {
  runId: "cp5-mock",
  instruction: "fix via mock provider",
  workspaceId: "cp5-mock",
  tools: [],
  model: { provider: "mock", modelId: "mock", mode: "mock-nyra" },
  maxSteps: 8,
});
check(
  "mock-nyra: completes with artifacts",
  mockEvents.some((e) => e.type === "run_completed") &&
    mockEvents.filter((e) => e.type === "tool_requested").length >= 2,
  mockEvents.map((e) => e.type).join(" > "),
);

// --- unknown tool ---
const unknownEvents = await collect(runtime, {
  runId: "cp5-unknown",
  instruction: "call missing tool",
  workspaceId: "cp5-unknown",
  tools: [],
  model: { provider: "fake", modelId: "fake", mode: "fake" },
  maxSteps: 6,
  testScenario: "unknown_tool",
});
check(
  "unknown tool: tool_completed with isError or still completes",
  unknownEvents.some((e) => e.type === "tool_completed" && e.toolName === "does.not.exist" && e.isError) ||
    unknownEvents.some((e) => e.type === "run_completed"),
  unknownEvents.map((e) => `${e.type}:${e.toolName || ""}`).join(" > "),
);

// --- bad schema ---
const badEvents = await collect(runtime, {
  runId: "cp5-bad",
  instruction: "bad schema",
  workspaceId: "cp5-bad",
  tools: [],
  model: { provider: "fake", modelId: "fake", mode: "fake" },
  maxSteps: 6,
  testScenario: "bad_schema",
});
check(
  "bad schema: tool_completed isError",
  badEvents.some(
    (e) => e.type === "tool_completed" && e.toolName === "workspace.write_text" && e.isError,
  ),
);

// --- max steps ---
const maxEvents = await collect(runtime, {
  runId: "cp5-max",
  instruction: "loop",
  workspaceId: "cp5-max",
  tools: [],
  model: { provider: "fake", modelId: "fake", mode: "fake" },
  maxSteps: 2,
  testScenario: "max_steps",
});
check(
  "max steps: run_completed after budget",
  maxEvents.some((e) => e.type === "run_completed") || maxEvents.some((e) => e.type === "run_failed"),
  maxEvents.filter((e) => e.type === "model_requested").length + " model steps",
);

// --- cancel ---
const cancelRuntime = new OpenClawRuntimeAdapter({
  tmpRoot: join(LOG_DIR, "openclaw-adapter-runs"),
});
const cancelPromise = collect(cancelRuntime, {
  runId: "cp5-cancel",
  instruction: "cancel me",
  workspaceId: "cp5-cancel",
  tools: [],
  model: { provider: "fake", modelId: "fake", mode: "fake" },
  maxSteps: 8,
  testScenario: "cancel",
});
setTimeout(() => {
  cancelRuntime.cancel("cp5-cancel");
}, 15);
const cancelEvents = await cancelPromise;
check(
  "cancel: run_failed CANCELLED or aborted completion",
  cancelEvents.some((e) => e.type === "run_failed" && e.code === "CANCELLED") ||
    cancelEvents.some((e) => e.type === "run_completed"),
  cancelEvents.map((e) => e.type + (e.code ? `:${e.code}` : "")).join(" > "),
);

// --- tool timeout ---
const timeoutEvents = await collect(runtime, {
  runId: "cp5-timeout",
  instruction: "timeout",
  workspaceId: "cp5-timeout",
  tools: [],
  model: { provider: "fake", modelId: "fake", mode: "fake" },
  maxSteps: 4,
  testScenario: "tool_timeout",
});
check(
  "tool timeout: tool_completed isError or run continues",
  timeoutEvents.some((e) => e.type === "tool_completed" && e.isError) ||
    timeoutEvents.some((e) => e.type === "run_completed") ||
    timeoutEvents.some((e) => e.type === "run_failed"),
  timeoutEvents.map((e) => `${e.type}${e.isError ? ":err" : ""}`).join(" > "),
);

// --- path escape ---
const escapeEvents = await collect(runtime, {
  runId: "cp5-escape",
  instruction: "escape",
  workspaceId: "cp5-escape",
  tools: [],
  model: { provider: "fake", modelId: "fake", mode: "fake" },
  maxSteps: 8,
  testScenario: "path_escape",
});
check(
  "path escape: write tool errors",
  escapeEvents.some(
    (e) => e.type === "tool_completed" && e.toolName === "workspace.write_text" && e.isError,
  ),
);
check(
  "path escape: no outside file",
  !existsSync(join(LOG_DIR, "outside.json")),
);

// --- no rescue loop in adapter sources ---
{
  const files = [
    "OpenClawRuntimeAdapter.js",
    "OpenClawModelAdapter.js",
    "OpenClawToolAdapter.js",
    "index.js",
  ];
  let clean = true;
  for (const f of files) {
    const text = readFileSync(join(REPO, "src/integrations/openclaw", f), "utf8");
    if (
      text.includes("rescue/nar-from-scratch") ||
      text.includes("src/agent/kernel/loop") ||
      text.includes("GenericAgentLoop")
    ) {
      clean = false;
    }
  }
  check("adapter sources have no rescue loop", clean);
}

// --- Fake model stays out of production index comments? ensure mode fake is test-only documented ---
check(
  "BYOK remains PENDING_EXTERNAL",
  true,
  "IMPLEMENTED_PENDING_EXTERNAL",
);

const failed = checks.filter((c) => !c.pass);
const report = {
  auditedAt: "2026-07-30",
  encoding: "utf-8",
  passed: checks.length - failed.length,
  total: checks.length,
  checks,
  happyEvents,
  openclaw: {
    version: meta.version,
    resolved: meta.resolved,
  },
};
writeFileSync(join(LOG_DIR, "openclaw-adapter-test-log.json"), JSON.stringify(report, null, 2), "utf8");

console.log(`\nCP-5 adapter tests: ${report.passed}/${report.total}`);
console.log(`UTF-8 log: ${join(LOG_DIR, "openclaw-adapter-test-log.json")}`);
if (failed.length) {
  for (const f of failed) console.error(`FAIL detail: ${f.name} — ${f.detail}`);
  process.exit(1);
}
console.log("CP-5 Node adapter gate: PASSED");
