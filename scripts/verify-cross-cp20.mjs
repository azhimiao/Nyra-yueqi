#!/usr/bin/env node
/**
 * CP-20 — Cross-platform build prep: Capacitor structure, scripts, external checklist, no false PASSED gates.
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

if (process.platform === "win32") spawnSync("chcp", ["65001"], { stdio: "ignore", shell: true });

const failures = [];
function check(name, pass, detail = "") {
  if (!pass) failures.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const packageJson = readFileSync(join(root, "package.json"), "utf8");
const capacitorConfig = readFileSync(join(root, "capacitor.config.json"), "utf8");
const checklistPath = join(root, "docs/NYRA_EXTERNAL_VALIDATION_CHECKLIST.md");
const limitationsPath = join(root, "docs/NYRA_KNOWN_LIMITATIONS.md");
const readinessPath = join(root, "docs/NYRA_RELEASE_READINESS_REPORT.md");
const reportPath = join(root, "docs/NYRA_CP20_CROSS_BUILD_REPORT.md");
const viteConfig = readFileSync(join(root, "vite.config.js"), "utf8");
const shimsModule = readFileSync(
  join(root, "src/integrations/openclaw-mobile/vite-node-shims.js"),
  "utf8",
);

check("android/ directory", existsSync(join(root, "android")));
check("android/app/build.gradle", existsSync(join(root, "android/app/build.gradle")));
check("ios/ directory", existsSync(join(root, "ios")));
check("capacitor.config.json", existsSync(join(root, "capacitor.config.json")));
check("capacitor webDir www", capacitorConfig.includes('"webDir": "www"'));

check("npm script build:android", packageJson.includes('"build:android"'));
check("npm script android", packageJson.includes('"android"'));
check("npm script ios", packageJson.includes('"ios"'));
check("npm script cap:sync", packageJson.includes('"cap:sync"'));
check("npm script verify:cross-cp20", packageJson.includes("verify:cross-cp20"));

check("vite openclaw node shims", viteConfig.includes("vite-node-shims.js"));
check("shims export openclawNodeShimAliases", shimsModule.includes("openclawNodeShimAliases"));
check("shims include node:url", shimsModule.includes('"node:url"'));

check("checklist doc exists", existsSync(checklistPath));
check("limitations doc exists", existsSync(limitationsPath));
check("readiness report exists", existsSync(readinessPath));
check("CP-20 report exists", existsSync(reportPath));

const checklist = existsSync(checklistPath) ? readFileSync(checklistPath, "utf8") : "";
const requiredSections = [
  "## 1. Android App Runtime / APK",
  "## 2. Live BYOK chat FC endpoint",
  "## 3. iOS Capacitor sync / build",
  "## 4. Store / Play 合规",
  "PENDING_EXTERNAL",
  "IMPLEMENTED_PENDING_ANDROID_RUNTIME",
  "IMPLEMENTED_PENDING_EXTERNAL_BYOK",
];
for (const section of requiredSections) {
  check(`checklist section: ${section}`, checklist.includes(section));
}

const forbiddenClaimPatterns = [
  { label: "PASSED_ANDROID_ASSISTANT claim", re: /(?<!禁止.*)(?<![\u4e00-\u9fff])PASSED_ANDROID_ASSISTANT/ },
  { label: "PASSED_ANDROID status claim", re: /(?:状态|判定|gate)[：:\s]*PASSED_ANDROID(?!_ASSISTANT)/i },
  { label: "PASSED_LIVE_BYOK claim", re: /PASSED_LIVE_BYOK/i },
  { label: "store-ready claim", re: /\bstore-ready\b/i },
  { label: "商店已上架 claim", re: /商店已上架/ },
];

function scanFalseClaims(text) {
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/禁止|不得|虚假|未实测|non-|not claim|false claim/i.test(line)) continue;
    for (const { label, re } of forbiddenClaimPatterns) {
      re.lastIndex = 0;
      if (re.test(line)) hits.push(`${label} @ line ${i + 1}: ${line.trim().slice(0, 80)}`);
    }
  }
  return hits;
}

const docsToScan = [checklistPath, limitationsPath, readinessPath, reportPath]
  .filter((p) => existsSync(p))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");
const falseClaims = scanFalseClaims(docsToScan);
check("no false external PASSED claims", falseClaims.length === 0, falseClaims.join("; ") || "clean");

const limitations = existsSync(limitationsPath) ? readFileSync(limitationsPath, "utf8") : "";
check(
  "limitations document build block/workaround",
  limitations.includes("node:url") || limitations.includes("vite-node-shims"),
);

console.log("\n--- optional web build probe ---");
const skipBuild = process.env.CP20_SKIP_BUILD === "1";
let buildStatus = "skipped";
if (skipBuild) {
  console.log("SKIP  web build (CP20_SKIP_BUILD=1)");
} else {
  const build = spawnSync(node, ["./node_modules/vite/bin/vite.js", "build"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 180_000,
  });
  const out = `${build.stdout || ""}\n${build.stderr || ""}`;
  const buildOk = (build.status ?? 1) === 0 && out.includes("built in");
  buildStatus = buildOk ? "pass" : "fail";
  check("vite production build", buildOk, buildOk ? "built" : out.split("\n").slice(-5).join(" | "));
  if (buildOk) {
    check("www/index.html output", existsSync(join(root, "www/index.html")));
  }
}
console.log(`build_status=${buildStatus}`);

console.log("");
if (failures.length) {
  console.error(`verify:cross-cp20 failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify:cross-cp20 passed");
