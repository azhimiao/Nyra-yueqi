/** Verify that every model-bearing product surface enters Context Broker. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/context-enterprise/results");
mkdirSync(outDir, { recursive: true });

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
  };
}
const storage = memoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const { __setConversationStorageForTests, clearAllConversations } = await import("../src/conversation/index.js");
const { __setSessionMapStorageForTests } = await import("../src/context/session-map.js");
const { __setBranchSummaryStorageForTests } = await import("../src/context/branch-summary.js");
const { __setContextStorageForTests } = await import("../src/context/store.js");
const {
  __setContextInspectorStorageForTests,
  clearContextTraces,
  listContextTraces,
} = await import("../src/context/inspector.js");
const { buildContextEnvelope } = await import("../src/context/broker.js");
const { buildDirectorMessages } = await import("../src/scenario/runtime/director-adapter.js");
const { requestDmCandidate } = await import("../src/adventure/dm.js");
const { buildCocreateManagedContext } = await import("../src/cocreate/cocreate-app.js");
const { buildDiaryContext } = await import("../src/diary/generate.js");

__setConversationStorageForTests(storage);
__setSessionMapStorageForTests(storage);
__setBranchSummaryStorageForTests(storage);
__setContextStorageForTests(storage);
__setContextInspectorStorageForTests(storage);
clearAllConversations();
clearContextTraces();

const checks = [];
function check(id, pass, detail = "") {
  checks.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const deskpet = await buildContextEnvelope({
  purpose: "deskpet",
  appId: "deskpet",
  characterId: "char-surface",
  chatSessionId: "char:char-surface",
  currentInput: "看看我的屏幕",
  turnIntent: "user_message",
  includeContextGraph: false,
  includeCohabit: false,
  includeMoments: false,
  includeWorldbook: false,
  reconcileLegacy: false,
});
check("deskpet_context_request", deskpet.request.purpose === "deskpet" && deskpet.trace.withinBudget);

const scenarioMessages = await buildDirectorMessages({
  id: "surface-scene",
  scriptId: "surface-script",
  cast: { leadId: "char-surface", memberIds: [] },
  beats: [{ id: "beat-1", kind: "npc", text: "雨落在站台" }],
  directorState: { tension: 1 },
}, "我把伞向ta倾过去", { loreEntries: [] });
check(
  "scenario_context_request",
  scenarioMessages.some((item) => item.role === "system" && item.content.includes("Context Broker")),
);

const pkg = {
  id: "surface-world",
  version: 1,
  title: "验证世界",
  summary: "一间用于验证的房间",
  rules: { principles: ["行动必须有后果"] },
  openings: [{ id: "open", title: "开始", startLocationId: "room", openingText: "门开了" }],
  locations: [{ id: "room", name: "房间", description: "安静", exits: [] }],
  loreEntries: [],
  quests: [],
  npcs: [],
};
const run = {
  id: "surface-adventure",
  packageId: pkg.id,
  branchId: "branch-surface",
  mode: "model",
  character: { name: "旅人", archetypeLabel: "观察者" },
  state: {
    locationId: "room",
    clock: { day: 1, hour: 9 },
    stats: { 洞察: 4 },
    conditions: [], inventory: [], quests: [], npcs: {}, flags: {}, storySummary: "门开了", suggestions: [],
  },
  turns: [{
    id: "open-turn", sequence: 0, status: "accepted", input: null,
    candidate: { narration: "门开了", checks: [], effects: [], choices: [] }, resolution: { checks: [], appliedEffects: [] },
  }],
};
let capturedAdventureMessages = [];
const adventureCandidate = await requestDmCandidate({
  pkg,
  run,
  input: { mode: "do", text: "检查房间" },
  providerConfig: { baseUrl: "https://local.invalid", apiKey: "test-only", model: "fixture" },
  callModel: async (_config, messages) => {
    capturedAdventureMessages = messages;
    return { content: JSON.stringify({ narration: "你发现墙边有一道新划痕。", choices: [], checks: [], effects: [] }) };
  },
});
check(
  "adventure_context_request",
  adventureCandidate.narration.includes("划痕")
    && capturedAdventureMessages.some((item) => item.role === "user" && item.content.includes("managedConversationHistory")),
);

const cocreateEnvelope = await buildCocreateManagedContext({
  id: "surface-cocreate",
  characterId: "char-surface",
  artifactId: "artifact-surface",
  turns: [
    { id: "cc-u", role: "user", text: "让开场更克制" },
    { id: "cc-a", role: "assistant", text: "我会收住旁白" },
  ],
}, "再改第一段", { text: "旧稿正文" }, { worldbookEntries: [] });
check(
  "cocreate_context_request",
  cocreateEnvelope.request.purpose === "cocreate"
    && cocreateEnvelope.historyMessages.length === 2
    && cocreateEnvelope.blocks.some((item) => item.id === "cocreate_manuscript"),
);

const diaryContext = await buildDiaryContext({
  sessionId: "char:char-surface",
  collectCharacterProfile: () => ({ id: "char-surface", name: "星梨" }),
  currentDailyStatus: { mood: "平静", weather: { label: "小雨" }, asleep: false },
});
check("diary_context_request", diaryContext.characterName === "星梨" && typeof diaryContext.excerpt === "string");

const purposes = new Set(listContextTraces({ limit: 30 }).map((item) => item.request.purpose));
for (const purpose of ["deskpet", "scenario", "adventure", "cocreate", "diary"]) {
  check(`inspector_records_${purpose}`, purposes.has(purpose), [...purposes].join(","));
}

const failed = checks.filter((item) => !item.pass).length;
const report = {
  at: new Date().toISOString(),
  command: "npm run verify:context-surfaces",
  passed: checks.length - failed,
  failed,
  checks,
};
writeFileSync(join(outDir, "SURFACES_LATEST.json"), JSON.stringify(report, null, 2));
console.log(`\ncontext surface integration: ${report.passed}/${checks.length}`);
process.exit(failed ? 1 : 0);
