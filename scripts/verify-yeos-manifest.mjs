/**
 * YEOS manifest smoke checks against SDK templates.
 * Usage: node scripts/verify-yeos-manifest.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const { validateAnyManifest } = await import(
  pathToFileURL(path.join(root, "src/yeos/manifest-schema.js")).href
);

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

const cases = [
  ["sdk/game-package/template/manifest.json", true],
  ["sdk/pop-plugin/template/manifest.json", true],
  ["sdk/experience-package/template/manifest.json", true],
];

let failed = 0;
for (const [rel, expectOk] of cases) {
  const result = validateAnyManifest(readJson(rel));
  const pass = result.ok === expectOk;
  console.log(`${pass ? "OK" : "FAIL"} ${rel} → ${result.ok ? "valid" : result.code + " " + result.message}`);
  if (!pass) failed += 1;
}

const bad = validateAnyManifest({
  schemaVersion: 1,
  kind: "yueqi-game",
  id: "BAD",
  name: "x",
  version: "1",
  entry: "../evil.html",
  permissions: ["not.a.perm"],
});
if (bad.ok) {
  console.log("FAIL expected bad manifest to reject");
  failed += 1;
} else {
  console.log(`OK bad-manifest rejected (${bad.code})`);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall yeos manifest checks passed");
