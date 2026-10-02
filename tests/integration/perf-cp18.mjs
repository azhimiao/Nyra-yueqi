/**
 * CP-18 — lazy-load boundaries: critical path must not statically pull OpenClaw.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

/** @param {string} rel */
function readSrc(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const HEAVY_STATIC_PATTERNS = [
  /from\s+['"][^'"]*openclaw-mobile\/index\.js['"]/,
  /from\s+['"][^'"]*openclaw-mobile-entry\.js['"]/,
  /from\s+['"][^'"]*OpenClawMobileRuntimeAdapter\.js['"]/,
  /from\s+['"][^'"]*generated-chunk-bindings\.js['"]/,
  /from\s+['"][^'"]*vendor\/openclaw-agent-mobile/,
  /from\s+['"][^'"]*studio-assist\/agent\/runner\.js['"]/,
  /from\s+['"][^'"]*studio-assist\/agent\/theme-draft-runner\.js['"]/,
  /from\s+['"][^'"]*studio-assist\/agent\/byok-stream\.js['"]/,
  /from\s+['"][^'"]*task-runtime\/worldbook-merge-runner\.js['"]/,
  /\brunAgentLoop\b/,
];

const CRITICAL_FILES = [
  "src/app.js",
  "src/studio-assist/chat-store.js",
  "src/studio-assist/assist-ui.js",
  "src/studio-assist/index.js",
  "src/panels/chat.js",
  "src/skill-platform/ui/explore-ui.js",
];

console.log("=== CP-18 critical path static import audit ===");
for (const rel of CRITICAL_FILES) {
  const src = readSrc(rel);
  for (const pattern of HEAVY_STATIC_PATTERNS) {
    assert(!pattern.test(src), `${rel} must not match heavy static import ${pattern}`);
  }
}

console.log("=== CP-18 lazy facades ===");
const lazyAgent = readSrc("src/studio-assist/agent/lazy-agent.js");
const lazyRunners = readSrc("src/task-runtime/lazy-runners.js");
const lazyMobile = readSrc("src/integrations/openclaw-mobile/lazy-load.js");

assert(/import\s*\(\s*['"]\.\/runner\.js['"]\s*\)/.test(lazyAgent), "lazy-agent dynamic-imports runner");
assert(/import\s*\(\s*['"]\.\/worldbook-merge-runner\.js['"]\s*\)/.test(lazyRunners), "lazy-runners dynamic-imports merge runner");
assert(/import\s*\(\s*['"]\.\/index\.js['"]\s*\)/.test(lazyMobile), "lazy-load dynamic-imports mobile runtime");

console.log("=== CP-18 chat-store wiring ===");
const chatStore = readSrc("src/studio-assist/chat-store.js");
assert(chatStore.includes("./agent/lazy-agent.js"), "chat-store uses lazy-agent");
assert(chatStore.includes("../task-runtime/lazy-runners.js"), "chat-store uses lazy-runners");
assert(!chatStore.includes("./agent/index.js"), "chat-store avoids agent/index barrel");

console.log("=== CP-18 Pop path ===");
const chatPanel = readSrc("src/panels/chat.js");
assert(!chatPanel.includes("OpenClawMobileRuntimeAdapter"), "chat panel does not wire openclaw");
assert(!chatPanel.includes("runAgentLoop"), "chat panel does not reference runAgentLoop");

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-18 perf verify PASSED");
