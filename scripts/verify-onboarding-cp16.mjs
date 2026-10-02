#!/usr/bin/env node
/**
 * CP-16 — First-launch onboarding + error copy verification.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node =
  process.env.OPENCLAW_NODE ||
  (existsSync("F:\\clawtry\\node-v22.22.3-win-x64\\node.exe")
    ? "F:\\clawtry\\node-v22.22.3-win-x64\\node.exe"
    : process.execPath);

if (process.platform === "win32") spawnSync("chcp", ["65001"], { stdio: "ignore", shell: true });

const failures = [];
function check(name, pass, detail = "") {
  if (!pass) failures.push(name);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const errorsJs = readFileSync(join(root, "src/onboarding/errors.js"), "utf8");
const prefsJs = readFileSync(join(root, "src/onboarding/prefs.js"), "utf8");
const wizardJs = readFileSync(join(root, "src/onboarding/wizard.js"), "utf8");
const zhCn = readFileSync(join(root, "src/i18n/locales/zh-CN.js"), "utf8");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");
const meJs = readFileSync(join(root, "src/panels/me.js"), "utf8");
const appJs = readFileSync(join(root, "src/app.js"), "utf8");
const mainJs = readFileSync(join(root, "src/main.js"), "utf8");
const phoneScreensJs = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");

check("errors module exports formatUserError", errorsJs.includes("export function formatUserError"));
check("errors redacts secrets", errorsJs.includes("redactSecrets") && errorsJs.includes("sk-"));
check("prefs resetOnboarding", prefsJs.includes("export function resetOnboarding"));
check("prefs resetAt blocks auto-migration", prefsJs.includes("resetAt"));
check("wizard reopenWizard + reset button", wizardJs.includes("reopenWizard") && wizardJs.includes("data-reset-onboarding"));
check("settings reset is a full cold start", wizardJs.includes("reopenWizard({ fullReset: true })")
  && prefsJs.includes("clearAccountSession")
  && prefsJs.includes("clearLocaleChoice"));
check("both settings surfaces expose the reset entry", indexHtml.includes("data-reset-onboarding")
  && phoneScreensJs.includes("data-reset-onboarding"));
check("wizard uses formatUserError for auth", wizardJs.includes("formatUserError(error"));
check("wizard enhances phone country picker", wizardJs.includes("enhancePhoneCodeFields"));
const errorsMap = errorsJs.includes('invalid_credentials: "onboard.authWrongCredentials"')
  || errorsJs.includes("invalid_credentials: \"onboard.authWrongCredentials\"");
check("invalid_credentials maps to credential copy", errorsMap);
check("wizard goes from account to shell choice", wizardJs.includes('setStep("account")') && wizardJs.includes('setStep("ui")'));
check("wizard does not choose a commercial mode", !wizardJs.includes("commitProductMode") && !wizardJs.includes("selectProductMode"));
check("wizard has no skip-login path", !wizardJs.includes("skipLogin") && !wizardJs.includes("data-onboard-skip"));
check("onboarding HTML has no product step", !indexHtml.includes('data-onboard-step="product"'));
check("onboarding HTML has one explicit action per step", indexHtml.includes("data-onboard-language-next") && indexHtml.includes("data-onboard-auth-submit") && indexHtml.includes("data-onboard-enter"));
check("App settings have no offline account bypass", !indexHtml.includes('data-set-account-mode="offline"') && !indexHtml.includes("data-account-offline-summary"));
check("phone settings have no offline account bypass", !phoneScreensJs.includes('data-set-account-mode="offline"') && !phoneScreensJs.includes("data-account-offline-summary"));
check("both settings surfaces expose Hosted and BYOK", indexHtml.includes('data-product-mode="hosted"')
  && indexHtml.includes('data-product-mode="byok"')
  && phoneScreensJs.includes('data-product-mode="hosted"')
  && phoneScreensJs.includes('data-product-mode="byok"'));
check("i18n errors.noApiKey", zhCn.includes("errors:") && zhCn.includes("noApiKey"));
check("i18n onboard.resetGuide", zhCn.includes("resetGuide"));
check("UI reset onboarding button", indexHtml.includes("data-reset-onboarding"));
check("me panel uses formatUserError", meJs.includes("formatUserError"));
check(
  "early phone surface does not wait for Capacitor",
  mainJs.includes("function mountImmediatePhone()")
    && !/function mountImmediatePhone\(\)[\s\S]*?Capacitor[\s\S]*?const root =/.test(mainJs),
);
check(
  "small phone mounts before the persisted mode is revealed",
  appJs.includes('import { mountSmallPhone } from "./phone-shell/phone-shell.js";')
    && appJs.includes("smallPhone = mountSmallPhone({")
    && appJs.indexOf("smallPhone = mountSmallPhone({") < appJs.indexOf("wireExperienceModeSwitch();"),
);
check("onboard wizard has email/phone tabs",
  indexHtml.includes('data-onboard-auth-type="email"') && indexHtml.includes('data-onboard-auth-type="phone"'));
check("App me panel has email/phone tabs",
  indexHtml.includes('data-auth-type="email"') && indexHtml.includes('data-auth-type="phone"'));
check("phone settings has email/phone tabs",
  phoneScreensJs.includes('data-phone-auth-type="email"') && phoneScreensJs.includes('data-phone-auth-type="phone"'));
check("wizard exports email/phone field errors",
  wizardJs.includes("onboard.authInvalidEmail") && wizardJs.includes("onboard.authInvalidPhone"));
check("login maps email onto identifier",
  readFileSync(join(root, "src/auth/form-credentials.js"), "utf8").includes("identifier || email || username"));
check("docs report exists", existsSync(join(root, "docs/NYRA_CP16_ONBOARDING_REPORT.md")));

console.log("\n--- integration ---");
const r = spawnSync(node, ["./tests/integration/onboarding-cp16.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--enable-source-maps"].filter(Boolean).join(" "),
  },
});

if ((r.status ?? 1) !== 0) {
  failures.push("integration onboarding-cp16.mjs");
}

console.log("");
if (failures.length) {
  console.error(`verify-onboarding-cp16 failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("verify-onboarding-cp16 PASSED");
