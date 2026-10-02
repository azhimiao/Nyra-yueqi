/**
 * C7 — Android device acceptance gate.
 * Fails unless docs/qa/product-cutover/android/ contains device proof.
 *
 * Run: npm run verify:product-cutover-android
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(root, "docs/qa/product-cutover/android");
const reportPath = join(root, "docs/qa/product-cutover/C7_ANDROID.md");

const REQUIRED_FILES = ["DEVICE.json", "APK.json", "JOURNEYS.json"];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const missing = [];
  const notes = [];

  if (!existsSync(evidenceDir) || !statSync(evidenceDir).isDirectory()) {
    missing.push("docs/qa/product-cutover/android/ (directory)");
  } else {
    for (const name of REQUIRED_FILES) {
      if (!existsSync(join(evidenceDir, name))) missing.push(name);
    }
    const files = existsSync(evidenceDir) ? readdirSync(evidenceDir) : [];
    const hasLog = files.some((f) => /logcat/i.test(f));
    const hasMedia = files.some((f) => /\.(png|jpg|webm|mp4)$/i.test(f));
    if (!hasLog) missing.push("logcat.txt (or logcat archive)");
    if (!hasMedia) missing.push("screenshots or screen recordings");

    const device = readJson(join(evidenceDir, "DEVICE.json"));
    const apk = readJson(join(evidenceDir, "APK.json"));
    const journeys = readJson(join(evidenceDir, "JOURNEYS.json"));

    if (device && !(device.model || device.device || device.serial)) {
      missing.push("DEVICE.json must include model/device/serial");
    }
    if (apk && !(apk.sha256 || apk.hash)) {
      missing.push("APK.json must include sha256/hash");
    }
    if (journeys) {
      const list = Array.isArray(journeys) ? journeys : journeys.journeys || journeys.items || [];
      const passed = list.filter((j) => j.pass === true || j.status === "PASS");
      if (!list.length) missing.push("JOURNEYS.json empty");
      else if (passed.length < 10) {
        missing.push(`JOURNEYS.json needs ≥10 PASS (have ${passed.length})`);
      }
      notes.push(`journeys recorded=${list.length} passed=${passed.length}`);
    }
  }

  const blocked = missing.length > 0;
  const status = blocked ? "BLOCKED" : "PASS";

  const md = `# C7 — Android 真机验收

> Wave: C7  
> Date: ${new Date().toISOString().slice(0, 10)}  
> Plan: \`docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md\` §13  
> Status: **${status}**

## Verdict

${blocked
    ? "No complete Android device/APK evidence directory. Gate fails (non-zero)."
    : "Evidence directory present with device, APK hash, journeys, logcat, and media."}

${notes.length ? `Notes: ${notes.join("; ")}\n` : ""}
## Missing / incomplete

${blocked ? missing.map((m) => `- ${m}`).join("\n") : "- (none)"}

## Evidence path

\`docs/qa/product-cutover/android/\`

## Command

\`\`\`powershell
npm run verify:product-cutover-android
\`\`\`
`;

  writeFileSync(reportPath, md, "utf8");
  console.log(`C7 ${status}`);
  if (blocked) {
    for (const m of missing) console.log(`  missing: ${m}`);
    process.exit(1);
  }
  console.log("PASS verify:product-cutover-android");
}

main();
