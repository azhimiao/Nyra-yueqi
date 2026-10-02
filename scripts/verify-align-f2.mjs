/**
 * F2a — sidewrite schema + projection + degrade.
 * Run: node scripts/verify-align-f2.mjs
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

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = String(value);
    },
    removeItem(key) {
      delete this._data[key];
    },
  },
};

const {
  validateSidewritePayload,
  degradePayload,
  validateManifest,
} = await import("../src/sidewrite/schema/validate.js");
const { formatSidewriteTimelineBlock } = await import("../src/sidewrite/projection-format.js");
const { appendLivingTimelineEvent, listRecentEvents } = await import("../src/sidewrite/timeline-bridge.js");
const { recordSidewriteEvent } = await import("../src/sidewrite/projection.js");
const { APP_KEYS, SOURCE_APP, SCENE_TAGS } = await import("../src/sidewrite/constants.js");
const { listDataModuleIds } = await import("../src/memory/data-modules.js");
const { buildSystemContent } = await import("../src/prompt/assemble.js");
const { DEFAULT_INJECTION_ORDER } = await import("../src/constants.js");

function readFixture(name) {
  const path = join(root, "src/sidewrite/fixtures", name);
  return JSON.parse(readFileSync(path, "utf8"));
}

for (const key of APP_KEYS) {
  const file = `mvp-${key === "c5" ? "c5" : key === "c4" ? "c4" : key === "c8" ? "c8" : "c2"}.json`;
  const raw = readFixture(file);
  const result = validateSidewritePayload(key, raw);
  check(`fixture ${file} validates`, result.ok === true && result.value?.schemaVersion === 1, result.reason || "");
}

const bad = degradePayload("c5", { nope: true, threads: "bad" });
check("degrade c5 keeps schemaVersion 1", bad?.schemaVersion === 1 && bad.appKey === "c5" && Array.isArray(bad.threads));

let threw = false;
try {
  degradePayload("c5", "<<<not-json>>>");
  validateSidewritePayload("c4", null);
  validateSidewritePayload("unknown", { foo: 1 });
} catch {
  threw = true;
}
check("bad JSON does not throw", threw === false);

const unknown = validateSidewritePayload("c99", {});
check("unknown appKey rejected", unknown.ok === false && unknown.reason === "unknown_app");

const manifest = validateManifest({ characterId: "char-test", generationStatus: "idle" }, "char-test");
check("manifest validates", manifest.ok === true && manifest.value.desktop.iconOrder.length >= 2 && manifest.value.desktop.dockOrder.length === 4);

const event = appendLivingTimelineEvent({
  id: "sw-test-1",
  ts: new Date().toISOString(),
  characterId: "char-xingli",
  sourceApp: SOURCE_APP,
  appId: SOURCE_APP,
  sceneTag: SCENE_TAGS.c5,
  action: "view_thread",
  summary: "用户查看了讯息「妈妈」中最后一条：「记得吃饭」",
  payload: {
    subApp: "c5",
    targetId: "thread-mom",
    targetTitle: "妈妈",
    excerpt: "记得吃饭",
    dwellMs: null,
  },
  ttlHours: 48,
});
check(
  "projection event shape",
  event?.sourceApp === "sidewrite"
    && event?.sceneTag === "sidewrite.im"
    && String(event?.summary || "").length > 0,
);

recordSidewriteEvent({
  characterId: "char-xingli",
  action: "open_app",
  subApp: "c4",
  summary: "用户打开了相册",
});
const listed = listRecentEvents({ characterId: "char-xingli", limit: 10 });
check("sidewrite events listed", listed.length >= 1 && listed.every((e) => e.sourceApp === "sidewrite"));

const block = formatSidewriteTimelineBlock("char-xingli");
check(
  "timeline block prefix",
  block.includes("同栖时间线（侧写）") && block.includes("sidewrite"),
);

const emptyBlock = formatSidewriteTimelineBlock("char-nobody-xyz");
check("empty timeline returns empty string", emptyBlock === "");

const system = buildSystemContent({
  promptSystem: "系统",
  character: { name: "测", alias: "测", identity: "", base: "", ranges: [], tokens: [] },
  injectionOrder: DEFAULT_INJECTION_ORDER,
  appId: "pop",
  memories: [],
  worldbook: [],
  externalContext: [],
  livingTimelineBlock: block,
  cohabitTimelineBlock: "",
  dailyStatus: null,
});
check(
  "assemble injects livingTimeline after memory path",
  system.includes("同栖时间线（侧写）"),
);

check("data module sidewrite", listDataModuleIds().includes("sidewrite"));

const catalog = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
check("catalog no longer lists 查手机", !catalog.includes('id: "sidewrite"') && !catalog.includes("查手机"));

const homeLayout = readFileSync(join(root, "src/phone-shell/home-layout.js"), "utf8");
check("home freezes sidewrite", homeLayout.includes('"sidewrite"') && homeLayout.includes("c14-scenario-icon"));

const shell = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
check("phone-shell does not mount sidewrite", !shell.includes("mountSidewriteApp") && !shell.includes("buildSidewriteScreenHtml()"));
check("phone-shell starts moments auto-post", shell.includes("startMomentsAutoPost"));

const css = readFileSync(join(root, "src/ui/phone-shell.css"), "utf8");
check("css still has legacy ta styles (unused)", css.includes(".ta-status-bar") && css.includes(".ta-dock") && css.includes(".ta-icon-grid"));

const requiredFiles = [
  "src/sidewrite/ui/ta-screen.js",
  "src/sidewrite/ui/ta-navigation.js",
  "src/sidewrite/ui/sidewrite-app.js",
  "src/sidewrite/ui/apps/c5-im.js",
  "src/sidewrite/ui/apps/c4-album.js",
  "src/sidewrite/ui/apps/c8-memo.js",
  "src/sidewrite/ui/apps/c2-sms.js",
  "src/sidewrite/fixtures/mvp-c5.json",
  "src/sidewrite/fixtures/mvp-c4.json",
  "src/sidewrite/fixtures/mvp-c8.json",
  "src/sidewrite/fixtures/mvp-c2.json",
  "src/moments/auto-post.js",
];
for (const rel of requiredFiles) {
  check(`file ${rel}`, existsSync(join(root, rel)));
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
