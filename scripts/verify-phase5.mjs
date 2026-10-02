/**
 * Phase 5 — small phone and shared moments, while retaining direct-contact compatibility.
 * Run: node scripts/verify-phase5.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const { CUSTOM_CONTACT, getCustomContactCopy, hasCustomContact } = await import("../src/commerce/custom-contact.js");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readFileSync(join(root, "src/app.js"), "utf8");
const navJs = readFileSync(join(root, "src/panels/nav.js"), "utf8");
const wireJs = readFileSync(join(root, "src/ui/custom-contact-wire.js"), "utf8");
const phoneShellJs = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
const phoneScreensJs = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
const serverJs = readFileSync(join(root, "server/index.mjs"), "utf8");
const momentsStoreJs = readFileSync(join(root, "src/moments/store.js"), "utf8");
const plan = readFileSync(join(root, "docs/FLOATING_COMPANION_PLATFORM_PLAN.md"), "utf8");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

check("config module exists", existsSync(join(root, "src/commerce/custom-contact.js")));
check("custom contact copy has title", Boolean(getCustomContactCopy("zh-CN").title));
check("global contact channels are configured", (
  CUSTOM_CONTACT.github === "https://github.com/azhimiao/Nyra-yueqi"
  && CUSTOM_CONTACT.discord === "CogPrism"
  && CUSTOM_CONTACT.wechat === "azhimiaoo"
  && CUSTOM_CONTACT.qqGroup === "1034044082"
  && CUSTOM_CONTACT.email === "3804762525@qq.com"
  && CUSTOM_CONTACT.qq === "3804762525"
));
check("unconfigured contact stays hidden", hasCustomContact({
  github: "", discord: "", wechat: "", qqGroup: "", email: "", qq: "",
}) === false);
check("placeholder is not treated as a contact", hasCustomContact({
  github: "", discord: "", wechat: "在此填写微信号", qqGroup: "", email: "在此填写邮箱", qq: "",
}) === false);
check("hasCustomContact helper", hasCustomContact({ email: "owner@example.com" }) === true);
check("UI block present", indexHtml.includes("data-custom-contact") && indexHtml.includes("data-custom-contact-copy-wechat"));
check("email row optional", indexHtml.includes("data-custom-contact-email-row"));
check("GitHub project is linked in shared contact surfaces", (
  indexHtml.includes("data-custom-contact-github")
  && indexHtml.includes("https://github.com/azhimiao/Nyra-yueqi")
  && wireJs.includes("data-custom-contact-github")
));
check("all contact channels are rendered", [
  "discord", "wechat", "qq-group", "email", "qq",
].every((channel) => indexHtml.includes(`data-custom-contact-copy-${channel}`)));
check("sidebars expose a More contact shortcut", (
  (indexHtml.match(/data-contact-menu/g) || []).length >= 2
  && indexHtml.includes('data-i18n="nav.more"')
));
// A fourth dock button wraps the fixed bottom bar and covers the composer.
check("the bottom dock keeps its three core entries", (
  !(indexHtml.match(/class="bottom-tabs[\s\S]*?<\/nav>/) || [""])[0].includes("data-contact-menu")
));
check("More shortcut opens the shared contact route", (
  navJs.includes('route: "community"')
  && navJs.includes("yueqi:open-settings-route")
));
check("mini-phone renders every contact channel", [
  "discord", "wechat", "qq-group", "email", "qq",
].every((channel) => phoneScreensJs.includes(`data-beautify-copy-${channel}`)));
check("mini-phone links the GitHub project", phoneScreensJs.includes("data-beautify-contact-github"));
check("wire module copies every channel", (
  wireJs.includes("navigator.clipboard")
  && wireJs.includes('"qqGroup", "qq-group", "qqGroupCopied"')
  && wireJs.includes("data-custom-contact-copy-${attr}")
));
check("community API uses the same public defaults", (
  serverJs.includes('"CogPrism"')
  && serverJs.includes('"azhimiaoo"')
  && serverJs.includes('"1034044082"')
  && serverJs.includes('"3804762525@qq.com"')
));
check("app wires custom contact", appJs.includes("wireCustomContact"));
check("plan Phase 5 is small phone + moments", plan.includes("### Phase 5：小手机模式和朋友圈"));
check("Phase 5 implementation present", phoneShellJs.includes("mountSmallPhone") && momentsStoreJs.includes("saveMoments"));
check("no payment SDK in package.json", !packageJson.dependencies?.stripe && !packageJson.dependencies?.["@paypal/checkout-server-sdk"]);
check("verify:phase5 script listed", Boolean(packageJson.scripts?.["verify:phase5"]));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:", failed.map((item) => item.name).join(", "));
  process.exit(1);
}
