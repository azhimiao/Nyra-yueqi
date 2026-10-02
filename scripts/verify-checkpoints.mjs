/**
 * Checkpoint B/C automated checks for Steps 15–28.
 * Run: node scripts/verify-checkpoints.mjs
 */

import { readFileSync } from "node:fs";
import { readAppBundle } from "./lib/app-sources.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

globalThis.window = {
  localStorage: {
    _data: {},
    getItem(key) {
      return this._data[key] ?? null;
    },
    setItem(key, value) {
      this._data[key] = value;
    },
  },
};

const { trimMemoriesToBudget, BUDGET_PRESETS } = await import("../src/memory/tiers.js");
const {
  CANONICAL_BLOCK_ORDER,
  assembleCanonical,
  flattenCanonicalSystem,
} = await import("../src/prompt/assemble.js");
const { splitBySentence } = await import("../src/chat/segmented-send.js");
const { heartbeatIntervalMs, rollWakeProbability } = await import("../src/proactive/config.js");
const { migrateEvents, eventTriggerAt } = await import("../src/calendar/engine.js");
const { parseIcsEvents } = await import("../src/calendar/ics.js");
const { getPromptSettings, savePromptSettings } = await import("../src/settings/preferences.js");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const appJs = readAppBundle(root);
const indexHtml = readFileSync(join(root, "index.html"), "utf8");

check("Step 15: prompt textarea 绑定", indexHtml.includes("data-prompt-system") && indexHtml.includes("data-prompt-developer"));
check(
  "Step 15: assemble 读取角色 Prompt",
  appJs.includes("assemblePrompt") && appJs.includes("compilePrompt"),
  "formal compiler path",
);

const light = trimMemoriesToBudget(
  Array.from({ length: 10 }, (_, index) => ({ rawText: "x".repeat(200), source: "chat.memory" })),
  BUDGET_PRESETS.light
);
check("Step 16: Memory Budget 裁剪", light.length < 10, `kept ${light.length}`);

const compiled = {
  promptSystem: "自定义 system",
  promptDeveloper: "自定义 developer",
  injectionOrder: ["memory", "character", "worldbook", "daily", "external"],
  character: { name: "测试", alias: "测", identity: "测试", base: "base", tokens: [], ranges: [] },
  worldbook: [],
  memories: [{ source: "chat.memory", wing: "Relationship", room: "Test", weight: 1, rawText: "记忆" }],
  dailyStatus: null,
  externalContext: [],
};
const canonical = assembleCanonical({
  platformSafety: "platform",
  characterPackage: "character identity",
  temporalContext: "today",
  longTermMemory: "retrieved memory",
  postHistoryContract: "reply contract",
});
const systemText = flattenCanonicalSystem(canonical);
check(
  "Step 17: Canonical authority order 生效",
  CANONICAL_BLOCK_ORDER.indexOf("character_package") < CANONICAL_BLOCK_ORDER.indexOf("long_term_memory")
    && systemText.indexOf("character identity") < systemText.indexOf("retrieved memory"),
);

const parts = splitBySentence("第一句。第二句！第三句？");
check("Step 20: 分段发送切句", parts.length >= 3, `parts=${parts.length}`);

check(
  "Step 21: 主动频率映射",
  heartbeatIntervalMs({ checkEveryMin: 10 }) > heartbeatIntervalMs({ checkEveryMin: 2 })
    && rollWakeProbability({ probability: 0 }) === false
    && rollWakeProbability({ probability: 100 }) === true,
);

const event = migrateEvents([{ time: "23:59", title: "测试", mode: "可主动消息" }])[0];
check("Step 23: 日历事件带 date", Boolean(event.date));
check("Step 23: 事件触发时间", Boolean(eventTriggerAt(event, new Date(0))));

const ics = parseIcsEvents("BEGIN:VEVENT\nSUMMARY:测试\nDTSTART:20260710T203000\nEND:VEVENT");
check("Step 32: ICS 解析", ics[0]?.date === "2026-07-10");

savePromptSettings({ budget: 3200, order: ["character", "memory", "worldbook", "daily", "external"] });
const prompt = getPromptSettings();
check("Step 15/16: prompt 设置持久化", prompt.budget === 3200 && prompt.order[1] === "memory");

check("Step 25: ProactiveScheduler 接入", appJs.includes("startProactiveScheduler"));
check("Step 29: MCP registry", appJs.includes("readGrantsFromDom"));
check("Step 30: sync-mcp 不再无脑全开", !appJs.includes('card.classList.add("is-on")'));

const failed = checks.filter((item) => !item.pass);
console.log("");
if (failed.length) {
  console.error(`Checkpoints failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}
console.log(`Checkpoints passed: ${checks.length}/${checks.length}`);
