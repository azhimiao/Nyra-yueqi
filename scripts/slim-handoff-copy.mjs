/**
 * Remove build artifacts and secrets from handoff copy before zipping.
 * Usage: node scripts/slim-handoff-copy.mjs [targetDir]
 */
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] || "F:/jiaojie-code");

const REMOVE_DIRS = [
  "node_modules",
  "www",
  "dist",
  "coverage",
  ".npm-cache",
  ".cache",
  "server/data",
  join("android", ".gradle"),
  join("android", "app", "build"),
  join("android", "capacitor-cordova-android-plugins", "build"),
  join("android", "app", "src", "main", "assets", "public"),
];

const REMOVE_FILES = [
  ".env",
  ".env.local",
  join("android", "local.properties"),
];

function rmPath(rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return false;
  rmSync(abs, { recursive: true, force: true });
  console.log(`removed: ${rel}`);
  return true;
}

function scanSecrets() {
  const hits = [];
  const secretPatterns = [
    /ARK_API_KEY\s*=\s*\S+/i,
    /VOLC_API_KEY/i,
    /YUEQI_MODEL_API_KEY\s*=\s*\S+/i,
    /sk-[a-zA-Z0-9]{20,}/,
  ];
  const skipDirs = new Set(["node_modules", "www", ".git"]);

  function walk(dir, rel = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(join(dir, entry.name), r);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === ".env") hits.push({ path: r, reason: "env file present" });
      if (/\.(pem|jks|keystore)$/i.test(entry.name)) hits.push({ path: r, reason: "cert/keystore" });
      if (entry.name.endsWith(".json") && r.startsWith("server/data/")) {
        hits.push({ path: r, reason: "server data" });
      }
    }
  }

  walk(root);
  return hits;
}

function dirSizeBytes(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(p);
    else if (entry.isFile()) total += statSync(p).size;
  }
  return total;
}

for (const d of REMOVE_DIRS) rmPath(d);
for (const f of REMOVE_FILES) rmPath(f);

const secrets = scanSecrets();
if (secrets.length) {
  console.error("SECRET SCAN HITS:");
  for (const h of secrets) console.error(`  ${h.path}: ${h.reason}`);
  process.exit(1);
}

const bytes = dirSizeBytes(root);
console.log(`slim complete: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
