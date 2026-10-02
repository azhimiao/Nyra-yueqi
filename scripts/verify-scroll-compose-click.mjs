/**
 * Regression: compose view shell must not reuse the open-compose action attr,
 * or submit/input clicks remount the form and feel dead.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/scroll/scroll-app.js"), "utf8");

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

check(
  "open-compose attr is on button action, not view shell",
  src.includes("data-scroll-open-compose") && src.includes("data-scroll-compose-view"),
);
check(
  "compose section does not carry open-compose action",
  !/scroll-hub--compose[^>]*data-scroll-open-compose/.test(src)
    && !/<section[^>]*data-scroll-compose[\s>]/.test(src),
);
check(
  "click handler opens compose via open-compose only",
  src.includes('closest("[data-scroll-open-compose]")')
    && !src.includes('closest("[data-scroll-compose]")'),
);
check(
  "compose form still has submit handler",
  src.includes("data-scroll-compose-form") && src.includes("onSubmit"),
);

const audit = spawnSync(process.execPath, [join(root, "scripts/audit-dead-click-attrs.mjs")], {
  cwd: root,
  encoding: "utf8",
});
check("global remount collision audit", audit.status === 0, (audit.stdout || "").trim().split("\n")[0]);

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nOK  ${checks.length} checks`);
