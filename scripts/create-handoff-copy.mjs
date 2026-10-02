/**
 * Create a filtered no-history handoff copy of the repo.
 * Usage: node scripts/create-handoff-copy.mjs [destDir]
 * Default dest: F:/jiaojie-code
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dest = resolve(process.argv[2] || "F:/jiaojie-code");

/** Root-level files to always include when present. */
const ROOT_FILES = new Set([
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "index.html",
  "capacitor.config.json",
  "manifest.webmanifest",
  "overlay.html",
  "styles.css",
  "script.js",
  "sw.js",
  ".env.example",
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "MOBILE_BUILD.md",
  "HANDOFF_AUDIT_REPORT.md",
  "TECHNICAL_DEBT_AUDIT.md",
]);

/** Top-level directories to walk (relative to repo root). */
const ROOT_DIRS = [
  "src",
  "public",
  "scripts",
  "server",
  "electron",
  "packages",
  "vendor",
  "assets",
  "e2e",
  "tests",
  "fixtures",
  "apps",
  "sdk",
  "skills-play",
  "python",
  "android",
  "ios",
  "docs",
  ".avatar-factory",
  ".github",
];

const SECRET_NAMES = new Set([".env", ".env.local", ".local-token", "local.properties"]);
const SECRET_EXTS = new Set([".pem", ".jks", ".keystore"]);

/** @type {{ included: string[]; excluded: { path: string; reason: string }[]; bytes: number }} */
const audit = { included: [], excluded: [], bytes: 0 };

function shouldExclude(relPosix) {
  const rel = relPosix.replace(/\\/g, "/");
  const base = basename(rel);
  const ext = extname(rel).toLowerCase();

  if (SECRET_NAMES.has(base)) return "secret/local-config";
  if (SECRET_EXTS.has(ext)) return "secret/cert";

  if (rel === ".git" || rel.startsWith(".git/")) return "git-history";
  if (rel === "node_modules" || rel.startsWith("node_modules/")) return "installable-deps";
  if (rel === "www" || rel.startsWith("www/")) return "build-output";
  if (rel === "dist" || rel.startsWith("dist/")) return "build-output";
  if (rel === ".npm-cache" || rel.startsWith(".npm-cache/")) return "cache";
  if (rel === ".cache" || rel.startsWith(".cache/")) return "cache";
  if (rel === "coverage" || rel.startsWith("coverage/")) return "coverage";
  if (rel === "_refs" || rel.startsWith("_refs/")) return "local-refs";
  if (rel === "artifacts" || rel.startsWith("artifacts/")) return "artifacts";
  if (rel === ".codex" || rel.startsWith(".codex")) return "local-tooling";
  if (rel === ".agents" || rel.startsWith(".agents/")) return "local-tooling";
  if (rel === ".cursor" || rel.startsWith(".cursor/")) return "local-tooling";
  if (rel === ".tmp" || rel.startsWith(".tmp/")) return "temp";
  if (base.startsWith(".tmp-")) return "temp-probe";

  if (rel === "server/data" || rel.startsWith("server/data/")) return "local-server-data";

  if (rel.startsWith(".avatar-factory/jobs/") && base !== ".gitkeep") {
    return "avatar-factory-jobs";
  }

  if (rel.startsWith("android/")) {
    if (rel.includes("/build/") || rel.endsWith("/build")) return "android-build";
    if (rel === "android/.gradle" || rel.startsWith("android/.gradle/")) return "android-gradle-cache";
    if (rel === "android/local.properties") return "android-local-sdk";
    if (rel.startsWith("android/app/src/main/assets/public/")) return "cap-sync-output";
  }

  if (rel.startsWith("docs/session/")) return "agent-session-dumps";

  if (rel.startsWith("docs/qa/")) {
    const textOk = [".md", ".json", ".txt", ".html", ".csv"].includes(ext);
    const heavy = [".zip", ".webm", ".mp4", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".har", ".trace"].includes(ext);
    if (heavy) return "qa-media-evidence";
    if (!textOk && ext) return "qa-non-text";
    // allow md/json/txt/html under docs/qa
  }

  if (rel.startsWith("spikes/")) return "spikes";

  return null;
}

function copyFile(src, destPath, rel) {
  mkdirSync(dirname(destPath), { recursive: true });
  cpSync(src, destPath);
  const size = statSync(src).size;
  audit.included.push(rel);
  audit.bytes += size;
}

function walkCopy(srcDir, destDir, relPrefix = "") {
  if (!existsSync(srcDir)) return;
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    const reason = shouldExclude(rel);
    const src = join(srcDir, entry.name);
    const out = join(destDir, entry.name);
    if (reason) {
      audit.excluded.push({ path: rel, reason });
      continue;
    }
    if (entry.isDirectory()) {
      walkCopy(src, out, rel);
    } else if (entry.isFile()) {
      copyFile(src, out, rel);
    }
  }
}

function main() {
  console.log(`Handoff copy: ${root} -> ${dest}`);
  if (existsSync(dest)) {
    console.log(`Removing existing ${dest}`);
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dest, { recursive: true });

  for (const name of ROOT_FILES) {
    const src = join(root, name);
    if (!existsSync(src)) continue;
    const reason = shouldExclude(name);
    if (reason) {
      audit.excluded.push({ path: name, reason });
      continue;
    }
    copyFile(src, join(dest, name), name);
  }

  for (const dir of ROOT_DIRS) {
    const src = join(root, dir);
    if (!existsSync(src)) continue;
    const reason = shouldExclude(dir);
    if (reason) {
      audit.excluded.push({ path: dir, reason });
      continue;
    }
    walkCopy(src, join(dest, dir), dir);
  }

  const manifestPath = join(dest, "INCLUDED_FILES.txt");
  writeFileSync(
    manifestPath,
    [
      `# Included files (${audit.included.length})`,
      `# Total payload bytes: ${audit.bytes}`,
      `# Generated: ${new Date().toISOString()}`,
      "",
      ...audit.included.sort(),
    ].join("\n"),
    "utf8",
  );

  const excludedPath = join(dest, "EXCLUDED_CATEGORIES.txt");
  const byReason = new Map();
  for (const { path, reason } of audit.excluded) {
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason).push(path);
  }
  const excludedLines = [
    `# Excluded paths (${audit.excluded.length})`,
    `# Generated: ${new Date().toISOString()}`,
    "",
  ];
  for (const [reason, paths] of [...byReason.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    excludedLines.push(`## ${reason} (${paths.length})`);
    for (const p of paths.sort()) excludedLines.push(p);
    excludedLines.push("");
  }
  writeFileSync(excludedPath, excludedLines.join("\n"), "utf8");

  console.log(`Included: ${audit.included.length} files, ${(audit.bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Excluded: ${audit.excluded.length} paths`);
  console.log(`Manifest: ${manifestPath}`);
}

main();
