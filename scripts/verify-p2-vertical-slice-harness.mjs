/**
 * P2 vertical slice harness verifier — DEL-02 / DEL-03 / DEL-12.
 * Static spine checks + delegates browser proof to e2e/p2-diary-selfie-vertical.spec.mjs.
 *
 * Gate: vertical_slice_harness_green (mocked). Real Provider → external vertical_slice_green.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const cases = [];
function check(id, ok, detail = "") {
  cases.push({ id, pass: Boolean(ok), detail: String(detail || "") });
  if (!ok) console.error(`FAIL ${id}`, detail);
  else console.log(`PASS ${id}`);
}

check("e2e_spec_exists", existsSync(join(root, "e2e/p2-diary-selfie-vertical.spec.mjs")));
check("evidence_dir_script", read("e2e/p2-diary-selfie-vertical.spec.mjs").includes("P2_VERTICAL_SLICE_E2E"));

const recordsJs = read("src/diary/records.js");
check("diary_enqueue_delivery", recordsJs.includes("enqueueDelivery") && recordsJs.includes("diary.created"));
check("diary_artifact_type", recordsJs.includes('type: "diary"'));

const selfieJs = read("src/companion/selfie.js");
check("selfie_honest_provider", selfieJs.includes("PROVIDER_REQUIRED"));
check("selfie_e2e_fake_flag", read("src/panels/chat.js").includes("yueqi.e2e.allowFakeSelfie"));

const extractionJs = read("src/context/extraction.js");
check(
  "diary_correction_no_unconfirmed_fact",
  extractionJs.includes("只有用户亲口陈述、纠正、要求记住或要求忘记的内容才能成为操作证据")
    && extractionJs.includes("inferred=true"),
);

const appJs = read("src/app.js");
check(
  "diary_overwrite_confirm_path",
  appJs.includes("confirmOverwriteDiary") && appJs.includes("if (!overwrite) return"),
);

const routerJs = read("src/artifacts/router.js");
check("router_diary_deeplink", routerJs.includes('artifact.type === "diary"'));
check("router_selfie_gallery", routerJs.includes('artifact.type === "selfie"'));

const phoneJs = read("src/phone-shell/phone-shell.js");
check("phone_today_inbox", phoneJs.includes("data-today-open") && phoneJs.includes("refreshTodayInboxWidget"));
check("phone_pop_artifact_card", phoneJs.includes("data-artifact-open") && phoneJs.includes("flushPopDeliveries"));

let failed = cases.filter((c) => !c.pass);
console.log(`\nstatic ${cases.length - failed.length}/${cases.length}`);
if (failed.length) process.exit(1);

console.log("\nRunning browser harness e2e/p2-diary-selfie-vertical.spec.mjs …");
const e2e = spawnSync(process.execPath, ["e2e/p2-diary-selfie-vertical.spec.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
});
if (e2e.status !== 0) process.exit(e2e.status ?? 1);

console.log("\nverify:p2-vertical-slice-harness — vertical_slice_harness_green");
