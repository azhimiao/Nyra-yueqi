/**
 * F0 — scene tags + cohabit timeline + backup modules.
 * Run: node scripts/verify-align-f0.mjs
 */
import { readFileSync } from "node:fs";
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
  SCENE_APP_IDS,
  normalizeSceneAppId,
  filterInjectionOrder,
  sceneAppLabel,
} = await import("../src/prompt/scene-tags.js");
const {
  appendCohabitEvent,
  listCohabitEvents,
  formatCohabitTimelineBlock,
  exportCohabitTimeline,
  importCohabitTimeline,
  COHABIT_TIMELINE_KEY,
} = await import("../src/memory/cohabit-timeline.js");
const { DATA_MODULES, listDataModuleIds, requiredDataModuleIds } = await import("../src/memory/data-modules.js");
const { buildSystemContent } = await import("../src/prompt/assemble.js");
const { DEFAULT_INJECTION_ORDER } = await import("../src/constants.js");

check("scene app ids non-empty", SCENE_APP_IDS.length >= 5);
check("normalize unknown → pop", normalizeSceneAppId("nope") === "pop");
check("normalize pop", normalizeSceneAppId("pop") === "pop");
check("diary suppresses external", filterInjectionOrder(["character", "external", "memory"], "diary").includes("external") === false);
check("pop keeps external", filterInjectionOrder(["character", "external"], "pop").includes("external"));
check("scene label 情景剧", sceneAppLabel("scenario").includes("情景"));

appendCohabitEvent({ appId: "scenario", kind: "open", summary: "开幕测试", characterId: "char-a" });
appendCohabitEvent({ appId: "pop", kind: "chat", summary: "用户说：你好", characterId: "char-a" });
const listed = listCohabitEvents({ characterId: "char-a" });
check("timeline has events", listed.length >= 2);
const block = formatCohabitTimelineBlock({ characterId: "char-a" });
check("timeline block mentions 同栖", block.includes("同栖时间线") && block.includes("开幕测试"));

const exported = exportCohabitTimeline();
clearAndImport(exported);
check("timeline roundtrip", listCohabitEvents().some((item) => item.summary.includes("开幕")));

function clearAndImport(payload) {
  window.localStorage.removeItem(COHABIT_TIMELINE_KEY);
  importCohabitTimeline(payload);
}

check("data modules include characters/scenario/cohabit", ["characters", "scenario", "cohabitTimeline"].every((id) => listDataModuleIds().includes(id)));
check("required modules include scenario", requiredDataModuleIds().includes("scenario"));

const system = buildSystemContent({
  promptSystem: "系统",
  character: { name: "测", alias: "测", identity: "", base: "", ranges: [], tokens: [] },
  injectionOrder: DEFAULT_INJECTION_ORDER,
  appId: "diary",
  cohabitTimelineBlock: formatCohabitTimelineBlock({ characterId: "char-a" }),
  worldbook: [],
  memories: [],
  externalContext: [],
});
check("system has 场景标签", system.includes("场景标签") && system.includes("diary"));
check("system has cohabit block", system.includes("同栖时间线"));

const assembleJs = readFileSync(join(root, "src/prompt/assemble.js"), "utf8");
check("assemble imports scene-tags", assembleJs.includes("scene-tags") && assembleJs.includes("formatCohabitTimelineBlock"));
const backupJs = readFileSync(join(root, "src/memory/backup.js"), "utf8");
check("backup exports scenario+cohabit", backupJs.includes("cohabitTimeline") && backupJs.includes("scenario"));
const prefsKey = readFileSync(join(root, "src/phone-shell/os-prefs.js"), "utf8");
check("lock prefs key exists", prefsKey.includes("yueqi.phone.os.v1"));

const failed = checks.filter((item) => !item.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.log("DATA_MODULES", DATA_MODULES.map((item) => item.id).join(","));
  process.exit(1);
}
