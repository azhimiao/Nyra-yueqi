import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appJs = readAppBundle(root);
const backupJs = readFileSync(join(root, "src/memory/backup.js"), "utf8");
const dbJs = readFileSync(join(root, "src/storage/db.js"), "utf8");
const worldJs = readFileSync(join(root, "src/world/world-page.js"), "utf8");
const i18nJs = readFileSync(join(root, "src/i18n/index.js"), "utf8");
const zh = readFileSync(join(root, "src/i18n/locales/zh-CN.js"), "utf8");
const en = readFileSync(join(root, "src/i18n/locales/en.js"), "utf8");
const constantsJs = readFileSync(join(root, "src/constants.js"), "utf8");

check(
  "X2-1 设置主入口 i18n",
  indexHtml.includes('data-settings-route="identity"')
    && indexHtml.includes('data-i18n="pages.meSettings.routes.identity.label"')
    && indexHtml.includes('data-settings-route="behavior"')
    && indexHtml.includes('data-i18n="pages.meSettings.routes.behavior.label"'),
);
check(
  "X2-1 界面/接口 i18n",
  indexHtml.includes('data-settings-route="interface"')
    && indexHtml.includes('data-i18n="pages.meSettings.routes.interface.label"')
    && zh.includes("modelApi:")
    && en.includes("modelApi:"),
);
check("X2-1 语言包 alerts", zh.includes("deleteDiary:") && en.includes("deleteDiary:"));
check("X2-1 行为提示去角色名", indexHtml.includes('data-i18n="settings.behaviorHint"') && !indexHtml.includes("沈既白"));

check("X2-2 app 使用 t(alerts)", appJs.includes('t("alerts.deleteDiary")') && appJs.includes('t("alerts.sttNeedKey")'));
check("X2-2 共听提示 i18n", appJs.includes('t("listen.playFirst")') && appJs.includes('t("listen.notPlaying")'));
check("X2-2 t 插值", i18nJs.includes("interpolate") && zh.includes("{error}"));

check("X2-3 导出 locale+brand", backupJs.includes("locale: getLocale()") && backupJs.includes("brand: getBrandName()"));
check("X2-3 导入恢复 locale", backupJs.includes("setLocale(payload.locale"));
check("X2-3 品牌映射", zh.includes('name: "月栖"') && en.includes('name: "Nyra"') && i18nJs.includes('locale === "en" ? "Nyra"'));

check("X2-4 app 无写死沈既白", !appJs.includes("沈既白") && !appJs.includes('"既白"'));
check("X2-4 db 无写死沈既白", !dbJs.includes("沈既白"));
check("X2-4 朋友圈共享存储", !worldJs.includes("既白") && worldJs.includes("loadMoments") && worldJs.includes("saveMoments"));
check("X2-4 侧栏角色名动态", appJs.includes("syncRoleNameChrome") && indexHtml.includes("data-role-name"));
check("X2-4 新角色种子", constantsJs.includes("林星梨") && !constantsJs.includes("沈既白"));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`X2 failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`X2 passed: ${checks.length}/${checks.length}`);
