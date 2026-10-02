/**
 * Extract a domain-free, BYOK-only open-source slice of Yueqi into a sibling folder.
 * Usage: node scripts/extract-oss.mjs [destDir]
 * Default dest: F:/yueqi-open
 *
 * This replaces the destination tree. After a copy, run
 * `node scripts/sanitize-oss-product.mjs` so tests, docs, fixtures, and
 * internal identifiers are not published. Keep the custom BYOK gateway.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(process.argv[2] || "F:/yueqi-open");

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "data",
  "billing",
  "tests",
  "_fixture",
  "demo_pet",
  "sample-calendar-token",
  "artifacts",
  "docs",
  "official-open",
  ".official-open-build",
]);

const SKIP_FILE_NAMES = new Set([
  "notices.mjs",
  "notices.test.mjs",
  "notices.example.json",
  "update-manifest.mjs",
  "update-manifest.test.mjs",
  "update-manifest.example.json",
  "hosted-speech.mjs",
  "sample-fixtures.js",
  "AGENTS.md",
  "PATCHES.md",
  "sample-calendar-token.yueqi-ext.zip",
  ".local-token",
  ".env",
]);

function shouldSkip(name, isDir) {
  if (SKIP_DIR_NAMES.has(name) && isDir) return true;
  if (SKIP_FILE_NAMES.has(name) && !isDir) return true;
  if (!isDir && /\.test\.mjs$|\.spec\.mjs$|\.test\.js$|\.spec\.js$/.test(name)) return true;
  return false;
}

function copyTree(src, out) {
  mkdirSync(out, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name, entry.isDirectory())) continue;
    const from = join(src, entry.name);
    const to = join(out, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    }
  }
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

function rewriteFrontendImports(file) {
  if (!/\.(js|mjs|css|html)$/.test(file)) return;
  let text = readFileSync(file, "utf8");
  const next = text
    .replaceAll('from "../../shared/', 'from "../../../shared/')
    .replaceAll('from "../../packages/', 'from "../../../packages/')
    .replaceAll('from "../../../vendor/openclaw-agent-mobile/', 'from "../../vendor/openclaw-agent-mobile/');
  if (next !== text) writeFileSync(file, next);
}

function rewriteBackendImports(file) {
  if (!/\.(js|mjs)$/.test(file)) return;
  let text = readFileSync(file, "utf8");
  const next = text.replaceAll('from "../shared/', 'from "../../shared/');
  if (next !== text) writeFileSync(file, next);
}

if (existsSync(dest)) {
  console.log(`Removing existing ${dest}`);
  rmSync(dest, { recursive: true, force: true });
}
mkdirSync(dest, { recursive: true });

copyTree(join(root, "src"), join(dest, "frontend", "src"));
copyTree(join(root, "public"), join(dest, "frontend", "public"));
copyTree(join(root, "vendor"), join(dest, "frontend", "vendor"));
copyTree(join(root, "packages"), join(dest, "packages"));
copyTree(join(root, "shared"), join(dest, "shared"));
copyTree(join(root, "server"), join(dest, "backend"));

for (const name of ["index.html", "overlay.html", "styles.css", "script.js", "sw.js", "manifest.webmanifest"]) {
  const src = join(root, name);
  if (existsSync(src)) cpSync(src, join(dest, "frontend", name));
}

for (const file of walkFiles(join(dest, "frontend", "src"))) rewriteFrontendImports(file);
for (const file of walkFiles(join(dest, "backend"))) rewriteBackendImports(file);

console.log(`Copied into ${dest}`);
console.log(`frontend src files: ${walkFiles(join(dest, "frontend", "src")).length}`);
console.log(`backend files: ${walkFiles(join(dest, "backend")).length}`);
