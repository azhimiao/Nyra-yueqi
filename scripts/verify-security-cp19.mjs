#!/usr/bin/env node
/**
 * CP-19 — Threat-oriented security verification (secrets, sandbox, XSS sinks, approval gate).
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

/** High-risk UI files inventoried in CP-19 threat matrix. */
const XSS_SINK_FILES = [
  "src/phone-shell/phone-shell.js",
  "src/skill-platform/ui/explore-ui.js",
  "src/skill-platform/ui/skill-session-ui.js",
  "src/panels/chat.js",
  "src/phone-shell/pop-chat-plugins.js",
];

/** Known-safe innerHTML interpolation patterns (numbers, escaped, static). */
const XSS_ALLOWLIST_RES = [
  /\$\{escapeHtml\(/,
  /\$\{friendCount\}/,
  /\$\{sessions\.length\}/,
  /\$\{rows\.length\}/,
  /\$\{item\.rank\}/,
  /\$\{pinned\}/,
  /\$\{sections\}/,
  /\$\{cells\.join/,
  /\$\{D\$\{sides\}\}/,
  /\$\{renderAgentChipHtml\(\)\}/,
  /\$\{renderChips\(/,
  /\$\{renderCard\(\)/,
  /\$\{momentImagesHtml\(/,
  /\$\{avatarMarkup\(/,
  /\$\{characterAvatarMarkup\(/,
  /\$\{tokenHtml\}/,
  /\$\{locationHtml\}/,
  /\$\{bodyHtml\}/,
  /\$\{speakBtn\}/,
  /\$\{shareHtml\}/,
  /\$\{grantBlock\}/,
  /\$\{card\}/,
  /\$\{history\}/,
  /\$\{soloRows\}/,
  /\$\{socialRows\}/,
  /\$\{pendingPreview \? renderPreviewCard/,
];

function scanInnerHtmlSinks(relPath) {
  const content = readFileSync(join(root, relPath), "utf8");
  const violations = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/\.innerHTML\s*=/.test(line)) continue;
    if (!line.includes("${")) continue;
    const chunk = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
    if (chunk.includes("escapeHtml(")) continue;
    if (XSS_ALLOWLIST_RES.some((re) => re.test(chunk))) continue;
    violations.push(`${relPath}:${i + 1}`);
  }
  return violations;
}

const privacyJs = readFileSync(join(root, "src/memory/privacy.js"), "utf8");
const errorsJs = readFileSync(join(root, "src/onboarding/errors.js"), "utf8");
const permissionsJs = readFileSync(join(root, "src/skills/permissions.js"), "utf8");
const sandboxJs = readFileSync(join(root, "src/skills/sandbox.js"), "utf8");
const grantsJs = readFileSync(join(root, "src/skill-platform/grants.js"), "utf8");
const executorJs = readFileSync(join(root, "src/agent/executor.js"), "utf8");
const lifeStateJs = readFileSync(join(root, "src/companion/life-state.js"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

check("privacy scrubExportPayload + assertNoSecretsInExport", privacyJs.includes("scrubExportPayload") && privacyJs.includes("assertNoSecretsInExport"));
check("errors redactSecrets + safeUserFacingText", errorsJs.includes("redactSecrets") && errorsJs.includes("safeUserFacingText"));
check("permissions default deny", permissionsJs.includes("Default deny") && permissionsJs.includes("undeclared_permission"));
check("sandbox SANDBOX_DEFAULT_DENY", sandboxJs.includes("SANDBOX_DEFAULT_DENY") && sandboxJs.includes("network"));
check("grants validateInstallGrants partial reject", grantsJs.includes("grants_required") && grantsJs.includes("undeclared_grant"));
check("executor awaiting_approval gate", executorJs.includes('task.state === "awaiting_approval"') && executorJs.includes("!opts.approved"));
check("proactive guardrails", lifeStateJs.includes("violatesContentGuardrails") && lifeStateJs.includes("BLOCKED_CONTENT_PATTERNS"));
check("npm verify:security-cp19", packageJson.includes("verify:security-cp19"));
check("docs CP-19 report", existsSync(join(root, "docs/NYRA_CP19_SECURITY_REPORT.md")));

for (const rel of XSS_SINK_FILES) {
  check(`${rel} imports escapeHtml`, readFileSync(join(root, rel), "utf8").includes("escapeHtml"));
}

const xssViolations = XSS_SINK_FILES.flatMap((rel) => scanInnerHtmlSinks(rel));
check("XSS sink static scan (allowlist)", xssViolations.length === 0, xssViolations.join(", ") || "clean");

console.log("\n--- integration ---");
const r = spawnSync(node, ["./tests/integration/security-cp19.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
  },
});

if ((r.status ?? 1) !== 0) {
  failures.push("integration security-cp19.mjs");
}

console.log("");
if (failures.length) {
  console.error(`verify-security-cp19 failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify-security-cp19 PASSED");
