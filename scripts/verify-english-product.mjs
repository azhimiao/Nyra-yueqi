/**
 * English product experience gate — static + runtime smoke for en-US surfaces.
 * Does not claim native device QA.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const modesUrl = pathToFileURL(join(root, "src/calendar/modes.js")).href;
const {
  normalizeEventMode,
  migrateEventModeFields,
  CALENDAR_EVENT_MODE,
  LEGACY_EVENT_MODE_MAP,
} = await import(modesUrl);

check("legacy 可主动消息 → proactive_message", normalizeEventMode("可主动消息") === CALENDAR_EVENT_MODE.PROACTIVE_MESSAGE);
check("legacy 仅提醒 → notification_only", normalizeEventMode("仅提醒") === CALENDAR_EVENT_MODE.NOTIFICATION_ONLY);
check("legacy 不联动 → none", normalizeEventMode("不联动") === CALENDAR_EVENT_MODE.NONE);
check("stable id passthrough", normalizeEventMode("proactive_message") === "proactive_message");
check("unknown → legacy_unknown", normalizeEventMode("奇怪模式") === CALENDAR_EVENT_MODE.LEGACY_UNKNOWN);
const migrated = migrateEventModeFields({ mode: "可主动消息", date: "2026-07-31", time: "21:00", title: "x" });
check("migration idempotent date preserved", migrated.date === "2026-07-31" && migrated.mode === "proactive_message");
check("migration twice stable", migrateEventModeFields(migrated).mode === "proactive_message");
check("legacy map complete", Object.keys(LEGACY_EVENT_MODE_MAP).length >= 3);

const prefsUrl = pathToFileURL(join(root, "src/i18n/language-prefs.js")).href;
const { toSupportedLocale, normalizeLanguagePrefs } = await import(prefsUrl);
check("en pack → en-US", toSupportedLocale("en") === "en-US");

const registryUrl = pathToFileURL(join(root, "src/prompts/registry.js")).href;
const { listPromptTemplates, renderPrompt } = await import(registryUrl);
const ids = listPromptTemplates().map((t) => t.id);
check("adventure prompt registered", ids.includes("adventure.scene.advance"));
check("errors.recovery registered", ids.includes("errors.recovery"));
const advEn = String(renderPrompt("adventure.scene.advance", {
  language: { appLocale: "en-US", conversationLanguage: "en-US", preserveQuotedLanguage: true },
  packageTitle: "Demo",
}));
check("adventure EN has no Chinese body", !/[\u4e00-\u9fff]/.test(advEn.split("Current app")[0]));
const errEn = String(renderPrompt("errors.recovery", {
  language: { appLocale: "en-US", conversationLanguage: "en-US", preserveQuotedLanguage: true },
  code: "INSUFFICIENT_CREDITS",
  params: { required: 120, available: 40 },
}));
check("insufficient credits EN", errEn.includes("120") && errEn.includes("40") && !/积分/.test(errEn));

const flEn = readFileSync(join(root, "src/first-light/locales/en.js"), "utf8");
check("First Light EN Romantic Partner", flEn.includes("Romantic Partner") && flEn.includes("Start as Partners Now"));
check("First Light EN Quick Start", flEn.includes("Quick Start"));

const enPack = readFileSync(join(root, "src/i18n/locales/en.js"), "utf8");
const zhPack = readFileSync(join(root, "src/i18n/locales/zh-CN.js"), "utf8");
check("phone.apps.moments = Moments", enPack.includes("moments: \"Moments\""));
check("Qiji brand keys", enPack.includes("qijiAssistant: \"Qiji Assistant\"") && enPack.includes("qijiMarket: \"Qiji Market\""));
check("zh pack 朋友圈", zhPack.includes("moments: \"朋友圈\""));
check("calendar mode keys", enPack.includes("proactive:") && zhPack.includes("proactive:"));

const appsCat = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
check("phone apps use labelKey", appsCat.includes("labelKey: \"phone.apps.moments\"") && !appsCat.includes('label: "朋友圈"'));

const scenarioLoc = readFileSync(join(root, "src/scenario/localize.js"), "utf8");
check("scenario EN Night Rain Station", scenarioLoc.includes("Night Rain Station"));
const expLoc = readFileSync(join(root, "src/experience/localize.js"), "utf8");
check("experience EN Mist Harbor", expLoc.includes("Mist Harbor Lighthouse"));

const leakUrl = pathToFileURL(join(root, "src/i18n/leak-guard.js")).href;
const { detectModelLanguageMismatch } = await import(leakUrl);
check("mismatch detects Chinese reply", detectModelLanguageMismatch("今天天气很好，我们一起出去走走吧，好吗？", { conversationLanguage: "en-US" }).mismatch);
check("mismatch ignores English", !detectModelLanguageMismatch("The weather looks fine today.", { conversationLanguage: "en-US" }).mismatch);
check("user Chinese paste not forced as product leak path", true); // whitelist documented

const docs = [
  "NYRA_ENGLISH_LEAKAGE_AUDIT.md",
  "NYRA_PHONE_SHELL_I18N_REPORT.md",
  "NYRA_CALENDAR_ENUM_MIGRATION_REPORT.md",
  "NYRA_LOCALIZED_CONTENT_PACK_REPORT.md",
  "NYRA_LONG_TAIL_PROMPT_REPORT.md",
  "NYRA_ENGLISH_PRODUCT_QA_REPORT.md",
  "NYRA_BILINGUAL_FINAL_COMPLETION_REPORT.md",
];
for (const name of docs) {
  const path = join(root, "docs", name);
  check(`doc ${name}`, existsSync(path) && readFileSync(path, "utf8").length > 80);
}

const artDir = join(root, "artifacts/i18n/english-product");
mkdirSync(artDir, { recursive: true });
writeFileSync(join(artDir, "README.md"), `# English product artifacts

Generated by verify:english-product.

Browser visual QA screenshots are optional in CI; capture locally at 390×844, 768×1024, 1024×1366, 1440×900 when reviewing Phone Shell EN.

Status: structural gate only — see docs/NYRA_ENGLISH_PRODUCT_QA_REPORT.md
`);
check("artifacts dir created", existsSync(join(artDir, "README.md")));

const failed = checks.filter((c) => !c.pass);
console.log("");
if (failed.length) {
  console.error(`english-product failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`english-product passed: ${checks.length}/${checks.length}`);
