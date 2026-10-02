/**
 * Turn F:/yueqi-open into a product tree: drop tests, fixtures, docs,
 * sample/mistake assets, and internal identifiers. Does not rewrite the
 * custom BYOK gateway.
 *
 * Usage: node scripts/sanitize-oss-product.mjs [destDir]
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(process.argv[2] || "F:/yueqi-open");

const SKIP_WALK = new Set(["node_modules", ".git", "dist", "www", "data"]);

const DELETE_RELATIVE = [
  "AGENTS.md",
  "frontend/src/skill-platform/README.md",
  "frontend/vendor/openclaw-agent-mobile/PATCHES.md",
  "frontend/src/phone-ext/sample-fixtures.js",
  "frontend/public/avatar-packs/_fixture",
  "frontend/public/extensions/sample-calendar-token",
  "frontend/public/extensions/sample-calendar-token.yueqi-ext.zip",
  "frontend/public/assets/characters/demo_pet",
  "frontend/src/sidewrite/fixtures",
  "frontend/src/imagegen/fixtures",
  "frontend/src/shop/fixtures",
  "packages/avatar-contract/tests",
  "packages/avatar-runtime/tests",
];

const TEXT_EXTS = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".md"]);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (SKIP_WALK.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile()) acc.push(full);
  }
  return acc;
}

function shouldDeleteFile(file) {
  const rel = relative(dest, file).replaceAll("\\", "/");
  if (/\.test\.mjs$|\.spec\.mjs$|\.test\.js$|\.spec\.js$/.test(rel)) return true;
  if (rel.endsWith("/PATCHES.md") || rel.endsWith("/AGENTS.md")) return true;
  if (/\/tests\//.test(rel) && rel.endsWith(".mjs")) return true;
  return false;
}

function sanitizeSource(text) {
  let next = text;
  next = next.replaceAll("beautiful.companion_world", "yueqi.companion_world");
  next = next.replaceAll("beautiful-companion", "yueqi-companion");
  next = next.replaceAll("beautiful-world-", "yueqi-world-");
  next = next.replaceAll("BEAUTIFUL_CONTENT_SKILLS", "COMPANION_CONTENT_SKILLS");
  next = next.replaceAll("BOTDEN_DEFAULT_BASE_URL", "CHARACTER_WORLD_DEFAULT_BASE_URL");
  next = next.replaceAll("fixture:月栖测试角色", "fixture:character");
  next = next.replaceAll("月栖测试角色", "角色");
  next = next.replaceAll("用于验证助手 Agent", "");
  next = next.replaceAll("用于验证 OpenClaw Agent Runtime", "");
  next = next.replaceAll(
    "CP-6 默认创建新角色，不允许覆盖生产角色",
    "默认创建新角色，不允许覆盖已有角色",
  );
  next = next.replaceAll(
    "BYOK live streamFn not executed in CP-5 gate (IMPLEMENTED_PENDING_EXTERNAL).",
    "Model stream is not available in this adapter mode.",
  );
  next = next.replaceAll("Prefers Beautiful local proxy to avoid CORS.", "Prefers the local gateway proxy.");
  next = next.replaceAll("直连 BOTDEN（公开读不需要 Key）", "直连角色世界（公开读不需要 Key）");
  next = next.replaceAll(
    "始终注册 BOTDEN 适配器（公开读月栖）；预览仅作离线兜底",
    "注册角色世界适配器；预览仅作离线兜底",
  );
  next = next.replaceAll(
    "BOTDEN Character-world adapter (Beautiful 角色世界).",
    "Character-world adapter.",
  );
  next = next.replaceAll("BOTDEN 原帖最多选择 3 个分区", "角色世界原帖最多选择 3 个分区");
  next = next.replaceAll(/BOTDEN 缺少分区「([^」]+)」\(月栖\)。请先在栖地 seed topics。/g, "角色世界缺少分区「$1」");
  next = next.replaceAll("未配置可发帖的 BOTDEN API Key", "未配置可发帖的角色世界 API Key");
  next = next.replaceAll(/已连接 BOTDEN · /g, "已连接角色世界 · ");
  next = next.replaceAll(/已连接 BOTDEN 公开流 · /g, "已连接角色世界公开流 · ");
  next = next.replaceAll("无法连接 BOTDEN", "无法连接角色世界");
  next = next.replaceAll('topicSlug: creds.topicSlug || "yueqi"', 'topicSlug: creds.topicSlug || "local"');
  next = next.replaceAll("matching CogPrism StudioChatPage.", "user then assistant.");
  next = next.replaceAll("CogPrism-style checkbox", "checkbox");
  next = next.replaceAll("like CogPrism", "");
  next = next.replaceAll(/\bCogPrism\b/g, "");
  next = next.replaceAll(/\bPAIOS P\d+\b/g, "");
  next = next.replaceAll(/\bPAIOS\b/g, "");
  next = next.replaceAll(/\bCP-\d+\s*[—–-]\s*/g, "");
  next = next.replaceAll(/\bCP-\d+:\s*/g, "");
  next = next.replaceAll(/\bCP-\d+\b/g, "");
  next = next.replaceAll(/\bW5\/W8\s+/g, "");
  next = next.replaceAll(/\bM6:\s*/g, "");
  next = next.replaceAll("spike-fake-model", "local-fake-model");
  next = next.replaceAll("spike-fake", "local-fake");
  next = next.replaceAll("SPIKE_CAPABILITIES", "TOOL_CAPABILITIES");
  next = next.replaceAll("CP-5 spike fixture — not production character data", "default character file if workspace is empty");
  next = next.replace(/\/\*\* Bump when backup payload adds[^*]+\*\//g, "/** Backup payload version. */");
  next = next.replace(/^(\s*\*)\s+—\s+/gm, "$1 ");
  next = next.replace(/^\s*\*\s*@see docs\/[^\n]*\n/gm, "");
  next = next.replace(/^\s*\*\s*Plan: docs\/[^\n]*\n/gm, "");
  next = next.replace(/^\s*\*\s*Contract: docs\/[^\n]*\n/gm, "");
  next = next.replace(/^\s*\*\s*Real-device matrix is tracked in docs\/[^\n]*\n/gm, "");
  next = next.replace(/[ \t]*See docs\/[A-Za-z0-9_./-]+\.?/g, "");
  next = next.replace(/\/\*\* Documented in docs\/[^*]*\*\//g, "");
  next = next.replace(/aligned with docs\/formats\.?/g, "");
  next = next.replace(/Overlap is documented in docs\/qa\/unified-memory\/\./g, "");
  next = next.replace(/\(documented in docs\/[^)]+\)/g, "");
  next = next.replace(/详见文档 docs\/[A-Za-z0-9_./-]+。?/g, "");
  next = next.replace(/See docs\/[A-Za-z0-9_./-]+\./g, "");
  next = next.replaceAll("Default board: Topic `yueqi`（月栖）+ identity=character.", "Default board: local topic, identity=character.");
  next = next.replaceAll(
    "Character-world board. This open build has no default remote plaza.",
    "Character-world board. Local preview unless a Base URL is set.",
  );
  next = next.replaceAll("Capability gates for  spike tools only.", "Capability gates for workspace tools.");
  next = next.replaceAll("//  spike fixture — not production character data", "// default character file if workspace is empty");
  next = next.replaceAll(" *  spike tools only — character.inspect / workspace.read_text / workspace.write_text", " * character.inspect / workspace.read_text / workspace.write_text");
  next = next.replaceAll("/** Snapshot of defaults for docs/tests. */", "/** Snapshot of sandbox defaults. */");
  next = next.replaceAll("/** Informal aliases used by docs/tests; canonical ids are CARD_COMPAT_FORMATS. */", "/** Informal aliases; canonical ids are CARD_COMPAT_FORMATS. */");
  next = next.replaceAll("Foreground-service checklist ids (see DEVICE_PENDING.md).", "Foreground-service checklist ids.");
  next = next.replaceAll(
    "// Unified memory M0+ (off by default — no behavior change until enabled)",
    "// Unified memory (off by default)",
  );
  next = next.replaceAll("Contract §10.2 / §15.8 — tune in place; do not fork a second gesture system.", "Tune in place; do not fork a second gesture system.");
  next = next.replaceAll("byok: live Yueqi provider — IMPLEMENTED_PENDING_EXTERNAL unless keys present", "byok: live provider when keys are present");
  return next;
}

function writeIfChanged(file, next) {
  const prev = readFileSync(file, "utf8");
  if (next !== prev) writeFileSync(file, next);
}

const stubs = {
  "frontend/src/update/update-public-key.mjs": `export const UPDATE_PUBLIC_KEY_PEM = "";
export const UPDATE_PUBLIC_KEY_ID = "";
`,
  "frontend/src/update/update-signature.mjs": `export function canonicalJson(value) {
  return JSON.stringify(value ?? null);
}

export async function verifySignedUpdateManifest() {
  throw new Error("updates_disabled");
}
`,
  "frontend/src/update/update-policy.mjs": `export function resolveUpdatePolicy() {
  return { kind: "none" };
}
`,
  "frontend/src/update/update-prompt.mjs": `export function readSnoozedOptionalVersion() {
  return "";
}

export function snoozeOptionalUpdate() {}

export function shouldPromptUpdate() {
  return false;
}
`,
  "frontend/src/update/update-dialog.js": `export function showUpdateDialog() {
  return Promise.resolve({ action: "skip" });
}
`,
  "frontend/src/studio-assist/agent/fixtures.js": `/** Fallback payloads when a live character or scenario is not loaded. */

export const CHARACTER_FIX_FIXTURE = {
  name: "角色",
  description: "",
};

export const SCENARIO_AUDIT_FIXTURE = {
  id: "default-scenario-1",
  title: "雨站候车",
  premise: "雨夜车站的短叙",
  beats: [{ id: "b1", title: "开幕" }],
  cast: { leadId: "char-a", memberIds: [] },
};
`,
  "frontend/public/avatar-packs/catalog.json": `{
  "schemaVersion": 1,
  "avatars": []
}
`,
};

console.log(`Sanitizing product tree ${dest}`);

for (const rel of DELETE_RELATIVE) {
  const full = join(dest, rel);
  if (!existsSync(full)) continue;
  rmSync(full, { recursive: true, force: true });
  console.log(`removed ${rel}`);
}

for (const file of walk(dest)) {
  if (!shouldDeleteFile(file)) continue;
  rmSync(file, { force: true });
  console.log(`removed ${relative(dest, file)}`);
}

for (const rel of Object.keys(stubs)) {
  const full = join(dest, rel);
  if (!existsSync(dirname(full))) continue;
  writeFileSync(full, stubs[rel]);
  console.log(`stubbed ${rel}`);
}

let rewritten = 0;
for (const file of walk(dest)) {
  const rel = relative(dest, file).replaceAll("\\", "/");
  if (rel.startsWith("frontend/src/update/")) continue;
  if (rel === "frontend/src/studio-assist/agent/fixtures.js") continue;
  if (rel === "README.md" || rel === "LICENSE" || rel === "package-lock.json" || rel === "package.json") continue;
  if (rel === "frontend/public/avatar-packs/catalog.json") continue;
  const lower = rel.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  if (!TEXT_EXTS.has(ext)) continue;
  const prev = readFileSync(file, "utf8");
  const next = sanitizeSource(prev);
  if (next !== prev) {
    writeFileSync(file, next);
    rewritten += 1;
  }
}

const gitignore = join(dest, ".gitignore");
if (existsSync(gitignore)) {
  const prev = readFileSync(gitignore, "utf8");
  const extras = ["artifacts/", ".tmp/", "coverage/", "*.pem"];
  const lines = prev.split(/\r?\n/);
  let changed = false;
  for (const extra of extras) {
    if (!lines.includes(extra)) {
      lines.push(extra);
      changed = true;
    }
  }
  if (changed) writeFileSync(gitignore, `${lines.filter((line, i, arr) => line !== "" || i < arr.length - 1).join("\n").replace(/\n+$/, "")}\n`);
}

console.log(`rewrote ${rewritten} source files`);
console.log("done");
