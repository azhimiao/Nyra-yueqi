/**
 * F5 — 创作管线：导入 / 世界书 / 预设 / 正则 / 栖笺 / 资源库.
 * Run: node scripts/verify-align-f5.mjs
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
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
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
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};

const fixture = readFileSync(join(root, "fixtures/character-card-min.json"), "utf8");

const {
  parseJsonCharacterCard,
  mapParsedCardToCharacter,
  validateParsedCard,
} = await import("../src/characters/import.js");
const { matchWorldbookEntries } = await import("../src/worldbook/match.js");
const { applyPresetToPromptTexts } = await import("../src/presets/merge.js");
const { PRESETS_STORE_KEY } = await import("../src/presets/schema.js");
const { REGEX_STORE_KEY, compileRegexRule, BUILTIN_REGEX_RULES } = await import("../src/regex/schema.js");
const { applyRegexPipeline } = await import("../src/regex/pipeline.js");
const {
  SCENE_APP_IDS,
  normalizeSceneAppId,
  filterInjectionOrder,
  shouldInjectCohabit,
} = await import("../src/prompt/scene-tags.js");
const { buildSystemContent } = await import("../src/prompt/assemble.js");
const { DEFAULT_INJECTION_ORDER } = await import("../src/constants.js");
const { listDataModuleIds } = await import("../src/memory/data-modules.js");
const { offlineQijianDraft } = await import("../src/qijian/schema.js");

// 1–2: character card parse + map
const parsed = parseJsonCharacterCard(fixture, { fileName: "character-card-min.json" });
check(
  "parseJsonCharacterCard name+description",
  Boolean(parsed.name) && Boolean(parsed.description) && parsed.description.length > 0,
  parsed.name,
);

const mapped = mapParsedCardToCharacter(parsed);
check(
  "mapParsedCardToCharacter import source",
  mapped.source === "import" && mapped.profile.fields[0] === parsed.name,
  `${mapped.source}/${mapped.profile.fields[0]}`,
);
check(
  "import maps description into Character Prompt when card has no system_prompt",
  String(mapped.profile.promptSystem || "").includes("二十六岁")
    && !String(mapped.profile.promptSystem || "").includes("【月栖运行内核"),
  String(mapped.profile.promptSystem || "").slice(0, 24),
);

// 3: worldbook match
const entries = [
  { id: "a", title: "高优", triggers: ["测试场景词"], content: "A", priority: 90, enabled: true },
  { id: "b", title: "低优", triggers: ["测试场景词"], content: "B", priority: 10, enabled: true },
  { id: "c", title: "情景", triggers: ["测试场景词"], content: "C", priority: 80, enabled: true, scopeApps: ["scenario"] },
  { id: "d", title: "关", triggers: ["测试场景词"], content: "D", priority: 99, enabled: false },
];
const hitPop = matchWorldbookEntries(entries, "这里有测试场景词", { appId: "pop" });
check(
  "matchWorldbookEntries hit+sort+scope+disabled",
  hitPop.length === 2 && hitPop[0].id === "a" && hitPop[1].id === "b" && !hitPop.some((e) => e.id === "c" || e.id === "d"),
  hitPop.map((e) => e.id).join(","),
);
const hitScenario = matchWorldbookEntries(entries, "测试场景词", { appId: "scenario" });
check(
  "matchWorldbookEntries scopeApps scenario",
  hitScenario.some((e) => e.id === "c") && hitScenario.some((e) => e.id === "a"),
);

// 4: preset merge
const merged = applyPresetToPromptTexts(
  { promptSystem: "BASE_SYS", promptDeveloper: "BASE_DEV" },
  { promptSystemPrefix: "PREFIX_BOUNDARY", promptDeveloperAppend: "APPEND" },
);
check(
  "applyPresetToPromptTexts changes system",
  merged.promptSystem.includes("PREFIX_BOUNDARY") && merged.promptSystem.includes("BASE_SYS"),
  merged.promptSystem.slice(0, 40),
);

// 5–6: regex pipeline + validate
const outRule = BUILTIN_REGEX_RULES.find((r) => r.id === "builtin-out-strip-think");
const piped = applyRegexPipeline("前言<think>秘密</think>你好", [outRule]);
check(
  "applyRegexPipeline strip think",
  piped.text.includes("你好") && !piped.text.includes("秘密") && piped.applied.includes("builtin-out-strip-think"),
  JSON.stringify(piped),
);

const badCompile = compileRegexRule({ pattern: "(", flags: "g" });
check("compileRegexRule bad → ok:false", badCompile.ok === false, badCompile.error || "");

const badCard = validateParsedCard(null);
check("validateParsedCard bad → ok:false", badCard.ok === false);

const skipped = applyRegexPipeline("abc", [
  { id: "bad-rule", pattern: "(", replacement: "", flags: "g", enabled: true, order: 1 },
  { id: "ok-rule", pattern: "a", replacement: "A", flags: "g", enabled: true, order: 2 },
]);
check(
  "applyRegexPipeline skips bad rule",
  skipped.skipped.includes("bad-rule") && skipped.text.includes("A") && !skipped.text.startsWith("a"),
  JSON.stringify(skipped),
);

// 7: store keys
check("PRESETS_STORE_KEY", PRESETS_STORE_KEY === "yueqi.presets.v1");
check("REGEX_STORE_KEY", REGEX_STORE_KEY === "yueqi.regex.v1");

// 8: apps-catalog assets
const catalogApps = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
check("apps-catalog assets", catalogApps.includes('id: "assets"'));

// 9: qijian scene tag
check("SCENE_APP_IDS has qijian", SCENE_APP_IDS.includes("qijian"));
check("normalizeSceneAppId qijian", normalizeSceneAppId("qijian") === "qijian");
check(
  "qijian suppresses memory",
  filterInjectionOrder(["character", "worldbook", "memory", "daily", "external"], "qijian").includes("memory") === false,
);
check("qijian suppresses cohabit", shouldInjectCohabit("qijian") === false);

// 10: assemble / buildSystemContent no memory for qijian
const system = buildSystemContent({
  promptSystem: "系统",
  promptDeveloper: "",
  character: { name: "测", alias: "测", identity: "", base: "人设", ranges: [], tokens: [] },
  injectionOrder: DEFAULT_INJECTION_ORDER,
  appId: "qijian",
  worldbook: [],
  memories: [{ wing: "X", room: "Y", source: "test", rawText: "不该出现的记忆" }],
  palaceSkipped: false,
  kgBlock: "",
  wakeUpBlock: "",
  dailyStatus: null,
  externalContext: ["日历"],
  cohabitTimelineBlock: "同栖时间线：不该出现",
  livingTimelineBlock: "",
});
check(
  "qijian buildSystemContent no memory block",
  !system.includes("不该出现的记忆") && !system.includes("同栖时间线：不该出现") && system.includes("人设"),
  system.slice(0, 120),
);

const offline = offlineQijianDraft({ relation: "朋友", keywords: ["雨"], tone: "温柔" });
check("offline qijian draft", Boolean(offline.summary) && offline.offline === true && offline.summary.includes("离线"));

const mods = listDataModuleIds();
check("data modules presets+regex", mods.includes("presets") && mods.includes("regex"));

const hubCss = readFileSync(join(root, "src/ui/assets-hub.css"), "utf8");
check("assets-hub.css exists", hubCss.includes(".assets-hub"));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Failed:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
