/**
 * C0 contract check — baseline artifacts & status docs exist.
 * Does not assert product quality (L3/L4 forbidden here).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function countPng(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) n += countPng(p);
    else if (name.endsWith(".png")) n += 1;
  }
  return n;
}

const plan = join(root, "docs/CORE_EXPERIENCE_CORRECTION_PLAN.md");
check("CEV2 plan exists", existsSync(plan));

const upgrade = readFileSync(join(root, "docs/align/UPGRADE_RUN.md"), "utf8");
check(
  "UPGRADE_RUN freeze banner",
  upgrade.includes("冻结") && (upgrade.includes("L1") || upgrade.includes("CEV2") || upgrade.includes("CORE_EXPERIENCE")),
);

const statusPath = join(root, "docs/qa/core-experience/STATUS.md");
check("STATUS.md exists", existsSync(statusPath));
const status = existsSync(statusPath) ? readFileSync(statusPath, "utf8") : "";
check("STATUS marks C0", status.includes("阶段: C0") || status.includes("C0"));
check(
  "STATUS does not claim L3/L4 accepted",
  !/\n结论:\s*L[34]\b/.test(`\n${status}`)
    && !status.includes("L3 接受")
    && !status.includes("L4 接受")
    && !status.includes("产品已完成"),
);

const pathsDoc = join(root, "docs/qa/core-experience/C0/PATHS.md");
check("PATHS.md exists", existsSync(pathsDoc));

const samplesDir = join(root, "docs/qa/core-experience/C0/samples");
check("samples dir exists", existsSync(samplesDir));

const baseline = join(root, "docs/qa/core-experience/C0/baseline");
const pngCount = countPng(baseline);
check("baseline screenshots ≥ 8", pngCount >= 8, `png=${pngCount}`);

const viewports = ["375x812", "390x844", "1440x900"];
const surfaces = ["home", "sidewrite", "cocreate", "scenario"];
for (const vp of viewports) {
  for (const surface of surfaces) {
    const f = join(baseline, vp, `${surface}.png`);
    check(`baseline ${vp}/${surface}.png`, existsSync(f));
  }
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);
