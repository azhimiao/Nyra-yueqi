import { readFileSync, readdirSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import enPack from "../src/i18n/locales/en.js";
import zhPack from "../src/i18n/locales/zh-CN.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function flattenKeys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? flattenKeys(child, path) : [path];
  });
}

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const i18nJs = readFileSync(join(root, "src/i18n/index.js"), "utf8");
const zh = readFileSync(join(root, "src/i18n/locales/zh-CN.js"), "utf8");
const en = readFileSync(join(root, "src/i18n/locales/en.js"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");
const mainJs = readFileSync(join(root, "src/main.js"), "utf8");
const prefsJs = readFileSync(join(root, "src/i18n/language-prefs.js"), "utf8");
const ctxJs = readFileSync(join(root, "src/i18n/language-context.js"), "utf8");
const registryJs = readFileSync(join(root, "src/prompts/registry.js"), "utf8");
const assembleJs = readFileSync(join(root, "src/prompt/assemble.js"), "utf8");
const proactiveJs = readFileSync(join(root, "src/proactive/pipeline.js"), "utf8");
const flEn = readFileSync(join(root, "src/first-light/locales/en.js"), "utf8");
const flZh = readFileSync(join(root, "src/first-light/locales/zh-CN.js"), "utf8");

check("语言门禁 UI", indexHtml.includes("data-lang-gate") && indexHtml.includes('data-set-locale="zh-CN"'));
check("我的页语言切换", indexHtml.includes("data-locale-select") && indexHtml.includes("data-language-panel"));
check("应用/对话语言分区", indexHtml.includes("data-set-conversation-mode") && zh.includes("conversationTitle") && en.includes("conversationTitle"));
check("导航 i18n", indexHtml.includes('data-i18n="nav.chat"') && indexHtml.includes('data-i18n="nav.me"'));
check("中文品牌月栖", zh.includes('name: "月栖"'));
check("英文品牌 Nyra", en.includes('name: "Nyra"') && /gateLine:\s*"Nyra"/.test(en) && !/gateLine:\s*"[^"]*[\u4e00-\u9fff]/.test(en));
check("英文 onboarding 密码占位", en.includes('passwordPlaceholder: "At least 6 characters"'));
check("onboard 密码占位已挂 i18n", indexHtml.includes('data-i18n-attr="placeholder:onboard.passwordPlaceholder"'));
check("i18n 核心 API", i18nJs.includes("export function setLocale") && i18nJs.includes("export function wireLanguageUi"));
check("bootstrap 接入", appJs.includes("wireLanguageUi") && appJs.includes("ensureLanguagePrefsMigrated"));
check(
  "main 品牌感知",
  mainJs.includes("getEarlyBrandName")
    && mainJs.includes('return getEarlyLocale() === "en" ? "Nyra"')
    && mainJs.includes('"\\u6708\\u6816"'),
);
check("语言门禁样式", css.includes(".lang-gate") && css.includes(".lang-choice"));
check("主导航与设定 i18n", indexHtml.includes('data-i18n="nav.library"') && indexHtml.includes('data-i18n="sections.behavior"'));
check("运行时 t() API", i18nJs.includes("export function t(") && i18nJs.includes("interpolate"));
check("语言包对称 alerts", zh.includes("invalidBackup:") && en.includes("invalidBackup:"));
check("错误码双语", zh.includes("modelTimeout:") && en.includes("modelTimeout:") && zh.includes("notificationDenied:"));
check("备份元数据 locale", readFileSync(join(root, "src/memory/backup.js"), "utf8").includes("locale: getLocale()"));
check("LanguagePreferences", prefsJs.includes("conversationLanguageMode") && prefsJs.includes("follow-user"));
check("LanguageContext directive", ctxJs.includes("formatLanguageDirective") && ctxJs.includes("Respond to the user in"));
check("Prompt registry", registryJs.includes("proactive.heartbeat") && registryJs.includes("agent.user_facing"));
check("Assemble language suffix", assembleJs.includes("languageSystemSuffix") && assembleJs.includes("chatPostHistoryContract"));
check("Proactive language context", proactiveJs.includes("buildLanguageContext") && proactiveJs.includes("proactive.heartbeat"));
check("First Light EN pack", flEn.includes("Quick Start") && flEn.includes("Romantic Partner"));
check("First Light ZH pack", flZh.includes("快速开始") && flZh.includes("恋人"));
const enKeys = flattenKeys(enPack);
const zhKeys = flattenKeys(zhPack);
const localeKeyDiff = [
  ...enKeys.filter((key) => !zhKeys.includes(key)).map((key) => `en:${key}`),
  ...zhKeys.filter((key) => !enKeys.includes(key)).map((key) => `zh:${key}`),
];
check(
  "中英文 locale key parity",
  localeKeyDiff.length === 0,
  localeKeyDiff.slice(0, 5).join(", "),
);
check(
  "共享 App+Pop 动态文案",
  [
    "shared.overlay.diaryExistsMessage",
    "shared.actionProposal.statusProposed",
    "shared.sticker.myStickers",
    "shared.location.permissionDenied",
    "shared.token.confirmPayment",
    "shared.voice.playAria",
    "shared.call.ended",
    "shared.game.round",
    "shared.task.awaitingConfirmation",
  ].every((key) => enKeys.includes(key) && zhKeys.includes(key)),
);
check("Architecture docs", [
  "NYRA_I18N_PROMPT_AUDIT.md",
  "NYRA_BILINGUAL_ARCHITECTURE.md",
  "NYRA_PROMPT_LOCALIZATION_SPEC.md",
  "NYRA_ENGLISH_COPY_GUIDE.md",
  "NYRA_CHINESE_COPY_GUIDE.md",
  "NYRA_BILINGUAL_COMPLETION_REPORT.md",
].every((name) => {
  try {
    return readFileSync(join(root, "docs", name), "utf8").length > 100;
  } catch {
    return false;
  }
}));

// Locale persistence contract: the product picker is the only entry point, and
// its persisted choice is what every boot path reads.
const earlyLocaleJs = readFileSync(join(root, "src/i18n/early-locale.js"), "utf8");
check(
  "早期 locale 读取持久化选择",
  earlyLocaleJs.includes("LOCAL_KEYS.settingsKey") && earlyLocaleJs.includes("export function resolveEarlyLocale"),
);
check("main 冷启动应用 locale", mainJs.includes("applyEarlyLocale()"));
check(
  "getLocale 以持久化为准",
  /export function getLocale\(\) \{\s*return resolveEarlyLocale\(\);\s*\}/.test(i18nJs)
    && /import \{[^}]*resolveEarlyLocale[^}]*\} from "\.\/early-locale\.js"/.test(i18nJs),
);
check(
  "语言偏好不反向覆盖 UI 选择",
  prefsJs.includes("changesAppLocale") && prefsJs.includes("changesAppLocale && getLocale() !== pack"),
);
const deadLocaleSeeds = ["scripts", "e2e", "tests"].flatMap((dir) => {
  const files = readdirSync(join(root, dir), { recursive: true, encoding: "utf8" });
  return files
    .filter((name) => /\.(mjs|js)$/.test(name) && !name.endsWith("verify-i18n.mjs"))
    .filter((name) => readFileSync(join(root, dir, name), "utf8").includes('"yueqi.locale"'))
    .map((name) => `${dir}/${name}`);
});
check(
  "测试不使用失效的 yueqi.locale 种子",
  deadLocaleSeeds.length === 0,
  deadLocaleSeeds.slice(0, 5).join(", "),
);

// Every i18n key wired in index.html must resolve, or the raw key text ships as UI copy.
{
  const declared = new Set();
  for (const [, key] of indexHtml.matchAll(/data-i18n="([^"]+)"/g)) declared.add(key);
  for (const [, spec] of indexHtml.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of spec.split("|")) {
      const key = pair.split(":")[1];
      if (key) declared.add(key.trim());
    }
  }
  const resolve = (pack, key) => key.split(".").reduce((node, part) => (
    node && typeof node === "object" ? node[part] : undefined
  ), pack);
  const missing = [...declared].filter((key) => (
    typeof resolve(zhPack, key) !== "string" || typeof resolve(enPack, key) !== "string"
  ));
  check(
    "index.html i18n 键全部可解析",
    missing.length === 0,
    missing.length ? `${missing.length} missing: ${missing.slice(0, 6).join(", ")}` : `${declared.size} keys`,
  );
}

// Runtime smoke: language detection + prefs normalize
const prefsUrl = pathToFileURL(join(root, "src/i18n/language-prefs.js")).href;
const { detectMessageLanguage, normalizeLanguagePrefs, toSupportedLocale } = await import(prefsUrl);
check("detect Chinese message", detectMessageLanguage("我不喜欢别人一直追问我。") === "zh-CN");
check("detect English message", detectMessageLanguage("I would rather talk about something else today.") === "en-US");
check("toSupportedLocale en alias", toSupportedLocale("en") === "en-US");
check("normalize prefs modes", normalizeLanguagePrefs({ conversationLanguageMode: "fixed-en-US" }).conversationLanguageMode === "fixed-en-US");

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`i18n failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`i18n passed: ${checks.length}/${checks.length}`);
