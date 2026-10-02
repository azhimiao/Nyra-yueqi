/**
 * C8 — Product cutover release gate (strict; never fake-green).
 *
 * Fails if:
 * - C6 browser E2E is not green (skipped!=0 or failed>0 or status!=PASS)
 * - C7 Android evidence missing / verify:product-cutover-android would fail
 * - DEFAULT_CUTOVER_PROFILE is wrongly production_v1 before C7/C8 readiness
 *
 * Run: npm run verify:product-cutover-release
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CUTOVER_PROFILE } from "../src/features/cutover-profile.js";
import { CUTOVER_METRIC_PRIVACY } from "../src/observability/product-cutover-metrics.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const c6Path = join(root, "docs/qa/product-cutover/C6_RESULT.json");
const c4StagingPath = join(root, "docs/qa/product-cutover/C4_STAGING_RESULT.json");
const c5RealMigrationPath = join(root, "docs/qa/product-cutover/C5_REAL_MIGRATION_RESULT.json");
const androidDir = join(root, "docs/qa/product-cutover/android");
const outMd = join(root, "docs/qa/product-cutover/C8_RELEASE_GATE.md");

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function checkC6() {
  const issues = [];
  if (!existsSync(c6Path)) {
    return { ok: false, issues: ["C6_RESULT.json missing"], detail: {} };
  }
  const c6 = readJson(c6Path);
  if (!c6) return { ok: false, issues: ["C6_RESULT.json unreadable"], detail: {} };
  if (c6.status !== "PASS") issues.push(`C6 status=${c6.status}`);
  if (Number(c6.skipped) !== 0) issues.push(`C6 skipped=${c6.skipped} (must be 0)`);
  if (Number(c6.failed) !== 0) issues.push(`C6 failed=${c6.failed}`);
  if (Number(c6.passed) !== 12) issues.push(`C6 passed=${c6.passed} (need 12)`);
  const nonUi = Array.isArray(c6.notFullyUiDriven) ? c6.notFullyUiDriven : [];
  const consoleErrors = Array.isArray(c6.consoleErrors) ? c6.consoleErrors : [];
  if (nonUi.length) issues.push(`C6 direct/non-UI fallbacks=${nonUi.length} (must be 0)`);
  if (consoleErrors.length) issues.push(`C6 console errors=${consoleErrors.length} (must be 0)`);
  if (Number(c6.strictViolationCount || 0) !== 0) {
    issues.push(`C6 strict violations=${c6.strictViolationCount}`);
  }
  const ids = new Set((c6.journeys || []).map((j) => j.id));
  if (ids.size !== 12) issues.push(`C6 unique journey ids=${ids.size} (need 12)`);
  return {
    ok: issues.length === 0,
    issues,
    detail: {
      status: c6.status,
      passed: c6.passed,
      failed: c6.failed,
      skipped: c6.skipped,
      nonUiFallbacks: nonUi.length,
      consoleErrors: consoleErrors.length,
    },
  };
}

function checkC4RealProvider() {
  const issues = [];
  if (!existsSync(c4StagingPath)) {
    return {
      ok: false,
      issues: ["C4_STAGING_RESULT.json missing (real provider evidence required)"],
      detail: {},
    };
  }
  const evidence = readJson(c4StagingPath);
  if (!evidence) return { ok: false, issues: ["C4_STAGING_RESULT.json unreadable"], detail: {} };
  if (evidence.status !== "PASS") issues.push(`staging status=${evidence.status}`);
  const provider = String(evidence.provider || "").toLowerCase();
  if (!provider || provider === "stub" || provider === "mock") issues.push(`provider=${provider || "missing"}`);
  const queries = Array.isArray(evidence.queries) ? evidence.queries : [];
  const sourced = queries.filter((query) => {
    const sources = Array.isArray(query.sources) ? query.sources : [];
    return (query.status === "PASS" || query.ok === true)
      && sources.some((source) => /^https?:\/\//i.test(String(source?.url || source)));
  });
  if (sourced.length < 5) issues.push(`sourced staging queries=${sourced.length} (need 5)`);
  return { ok: issues.length === 0, issues, detail: { provider, sourcedQueries: sourced.length } };
}

function checkC7() {
  const issues = [];
  if (!existsSync(androidDir) || !statSync(androidDir).isDirectory()) {
    return { ok: false, issues: ["android evidence dir missing"], detail: {} };
  }
  for (const name of ["DEVICE.json", "APK.json", "JOURNEYS.json"]) {
    if (!existsSync(join(androidDir, name))) issues.push(`missing ${name}`);
  }
  const files = readdirSync(androidDir);
  if (!files.some((f) => /logcat/i.test(f))) issues.push("missing logcat evidence");
  if (!files.some((f) => /\.(png|jpg|webm|mp4)$/i.test(f))) issues.push("missing media evidence");
  const apk = readJson(join(androidDir, "APK.json"));
  if (apk && !(apk.sha256 || apk.hash)) issues.push("APK.json missing hash");
  const journeys = readJson(join(androidDir, "JOURNEYS.json"));
  const list = Array.isArray(journeys) ? journeys : journeys?.journeys || [];
  const passed = list.filter((j) => j.pass === true || j.status === "PASS").length;
  if (passed < 10) issues.push(`Android journeys passed=${passed} (need ≥10)`);
  return { ok: issues.length === 0, issues, detail: { passed, total: list.length } };
}

function checkProfileDefault() {
  const issues = [];
  // production_v1 must not be the install default until C7 evidence exists and C8 flips it.
  const c7 = checkC7();
  if (DEFAULT_CUTOVER_PROFILE === "production_v1" && !c7.ok) {
    issues.push("DEFAULT_CUTOVER_PROFILE is production_v1 but C7 evidence is incomplete");
  }
  if (DEFAULT_CUTOVER_PROFILE === "production_v1") {
    // Even with C7, flipping default requires an explicit future C8 change — warn as fail for now
    // unless env ALLOW_PRODUCTION_DEFAULT=1 is set for the intentional flip.
    if (process.env.ALLOW_PRODUCTION_DEFAULT !== "1") {
      issues.push("DEFAULT_CUTOVER_PROFILE is production_v1 (set ALLOW_PRODUCTION_DEFAULT=1 only when intentionally flipping)");
    }
  }
  return {
    ok: issues.length === 0,
    issues,
    detail: { DEFAULT_CUTOVER_PROFILE },
  };
}

function checkC5Migration() {
  const issues = [];
  const verifyPath = join(root, "docs/qa/product-cutover/C5_VERIFY.json");
  if (!existsSync(verifyPath)) {
    return { ok: false, issues: ["C5_VERIFY.json missing"], detail: {} };
  }
  const v = readJson(verifyPath);
  if (!v) return { ok: false, issues: ["C5_VERIFY.json unreadable"], detail: {} };
  const ok = v.passed === true || v.ok === true || v.status === "PASS";
  if (!ok) issues.push(`C5 not PASS (passed=${v.passed}, status=${v.status})`);
  if (!existsSync(c5RealMigrationPath)) {
    issues.push("C5_REAL_MIGRATION_RESULT.json missing (real browser/Android samples required)");
    return { ok: false, issues, detail: { codeGate: ok, realSamples: 0 } };
  }
  const evidence = readJson(c5RealMigrationPath);
  if (!evidence) {
    issues.push("C5_REAL_MIGRATION_RESULT.json unreadable");
    return { ok: false, issues, detail: { codeGate: ok, realSamples: 0 } };
  }
  if (evidence.status !== "PASS") issues.push(`real migration status=${evidence.status}`);
  const samples = Array.isArray(evidence.samples) ? evidence.samples : [];
  const passedTypes = new Set(
    samples
      .filter((sample) => sample.status === "PASS" || sample.pass === true)
      .map((sample) => String(sample.sourceType || sample.type || "")),
  );
  for (const type of ["browser_indexeddb", "browser_localstorage", "android_webview"]) {
    if (!passedTypes.has(type)) issues.push(`missing passed real sample: ${type}`);
  }
  const runs = Array.isArray(evidence.tripleRunImports) ? evidence.tripleRunImports.map(Number) : [];
  if (runs.length < 3 || runs[1] !== 0 || runs[2] !== 0) {
    issues.push(`triple-run idempotency invalid: ${JSON.stringify(runs)}`);
  }
  if (evidence.interruptionRecovery !== true) issues.push("interruptionRecovery is not true");
  if (evidence.backupRestore !== true) issues.push("backupRestore is not true");
  return {
    ok: issues.length === 0,
    issues,
    detail: { codeGate: ok, realSamples: passedTypes.size, tripleRunImports: runs },
  };
}

function main() {
  const c4 = checkC4RealProvider();
  const c5 = checkC5Migration();
  const c6 = checkC6();
  const c7 = checkC7();
  const profile = checkProfileDefault();
  const observabilityOk = CUTOVER_METRIC_PRIVACY.forbidBodies === true;

  const allIssues = [
    ...c4.issues.map((x) => `C4: ${x}`),
    ...c5.issues.map((x) => `C5: ${x}`),
    ...c6.issues.map((x) => `C6: ${x}`),
    ...c7.issues.map((x) => `C7: ${x}`),
    ...profile.issues.map((x) => `profile: ${x}`),
  ];
  if (!observabilityOk) allIssues.push("observability: privacy stub broken");

  const status = allIssues.length === 0 ? "PASS" : "FAIL";
  const md = `# C8 — Release Gate

> Wave: C8  
> Date: ${new Date().toISOString().slice(0, 10)}  
> Plan: \`docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md\` §14–15  
> Status: **${status}**

## Checks

| Gate | Result | Detail |
|---|---|---|
| C4 real provider staging | ${c4.ok ? "PASS" : "FAIL"} | ${JSON.stringify(c4.detail)} |
| C5 migration evidence | ${c5.ok ? "PASS" : "FAIL"} | ${JSON.stringify(c5.detail)} |
| C6 browser E2E green | ${c6.ok ? "PASS" : "FAIL"} | ${JSON.stringify(c6.detail)} |
| C7 Android evidence | ${c7.ok ? "PASS" : "FAIL"} | ${JSON.stringify(c7.detail)} |
| Default profile safe | ${profile.ok ? "PASS" : "FAIL"} | ${JSON.stringify(profile.detail)} |
| Observability stub | ${observabilityOk ? "PASS" : "FAIL"} | forbidBodies=${CUTOVER_METRIC_PRIVACY.forbidBodies} |

## Issues

${allIssues.length ? allIssues.map((x) => `- ${x}`).join("\n") : "- (none)"}

## Observability module

- \`src/observability/product-cutover-metrics.js\` — counters/timings stub (no message bodies)

## Command

\`\`\`powershell
npm run verify:product-cutover-release
\`\`\`

Any missing gate → non-zero exit (no fake green).
`;

  const sanitizedMd = md
    .replace(/^# C8 .*Release Gate$/m, "# C8 - Release Gate")
    .replace(/^> Plan: .*$/m, "> Plan: `docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md`, sections 14-15  ")
    .replace(/^- `src\/observability\/product-cutover-metrics\.js` .*counters\/timings stub/m,
      "- `src/observability/product-cutover-metrics.js` - counters/timings stub")
    .replace(/^Any missing gate .*non-zero exit \(no fake green\)\.$/m,
      "Any missing gate causes a non-zero exit (no fake green).");
  writeFileSync(outMd, sanitizedMd, "utf8");
  console.log(`C8 ${status}`);
  for (const issue of allIssues) console.log(`  - ${issue}`);
  if (status !== "PASS") process.exit(1);
  console.log("PASS verify:product-cutover-release");
}

main();
