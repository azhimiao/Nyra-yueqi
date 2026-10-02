/**
 * Open Experience W2 — Canonical Prompt, World Info, Director honesty.
 * Contract: docs/OPEN_CHARACTER_EXPERIENCE_ONE_SHOT_PLAN.md §6 / §13.3 / §14 W2
 *
 * Assert:
 * - assemble block order
 * - lore activation trace
 * - model failure does NOT produce fake dialogue on production path
 * - inspector reports trims
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const requiredFiles = [
  "src/prompt/budget.js",
  "src/prompt/inspector.js",
  "src/prompt/mode-contributions.js",
  "src/prompt/assemble.js",
  "src/worldbook/activation.js",
  "src/worldbook/trace.js",
  "src/worldbook/match.js",
  "src/experience/schema.js",
  "src/experience/reducer.js",
  "docs/qa/open-experience/W2_PROMPT.md",
  "docs/qa/open-experience/EXECUTION_STATE.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const playerSrc = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check(
  "player production path has no silent offlineDirectorTurn fallback",
  !/offline fallback/i.test(playerSrc)
    && /enterDirectorError|retryable_error|data-scenario-retry/.test(playerSrc)
    && /allowOfflineDirector|forceOfflineFixed|devDemo/.test(playerSrc),
  "honest error + retry UI required",
);
check(
  "player does not call offlineDirectorTurn on model catch",
  !/catch\s*\([^)]*\)\s*\{[^}]*offlineDirectorTurn/s.test(playerSrc),
);

const adapterSrc = readFileSync(join(root, "src/scenario/runtime/director-adapter.js"), "utf8");
check(
  "parseDirectorOutput defaults to no silent offline dialogue",
  /allowSilentOffline/.test(adapterSrc) && /unparseable_model_output/.test(adapterSrc),
);
check(
  "allowOfflineDirector requires explicit flags",
  /devDemo|forceOfflineFixed/.test(adapterSrc) && /allowOfflineDirector/.test(adapterSrc),
);

const {
  CANONICAL_BLOCK_ORDER,
  assembleCanonical,
  buildCanonicalBlocks,
} = await import("../src/prompt/assemble.js");
const { applyBudget } = await import("../src/prompt/budget.js");
const { inspectPromptBlocks, formatInspectorReport } = await import("../src/prompt/inspector.js");
const { buildModeContribution, normalizePromptMode } = await import("../src/prompt/mode-contributions.js");
const { activateWorldInfo, sortLoreEntriesDeterministic } = await import("../src/worldbook/activation.js");
const { formatLoreActivationTrace } = await import("../src/worldbook/trace.js");
const { normalizeWorldbookEntry, entryMatchesQuery, entryInScope } = await import("../src/worldbook/match.js");
const {
  parseDirectorOutput,
  allowOfflineDirector,
  offlineDirectorTurn,
} = await import("../src/scenario/runtime/director-adapter.js");
const {
  validateScenePatch,
  reduceScenePatch,
  parseAndReduceModelOutput,
} = await import("../src/experience/reducer.js");
const { SCENE_PATCH_WHITELIST, EXPERIENCE_OUTPUT_SCHEMA_VERSION } = await import("../src/experience/schema.js");

// --- Block order ---
const expectedOrder = [
  "platform_safety",
  "character_package",
  "user_persona",
  "temporal_context",
  "relationship_continuity",
  "relationship_state",
  "mode_context",
  "experience_package",
  "opening_scene_state",
  "world_info",
  "long_term_memory",
  "branch_summary",
  "branch_history",
  "world_info_after",
  "user_input",
  "post_history_contract",
];
check(
  "CANONICAL_BLOCK_ORDER matches §6.1 + CPE world_info_after",
  Array.isArray(CANONICAL_BLOCK_ORDER)
    && CANONICAL_BLOCK_ORDER.length === expectedOrder.length
    && expectedOrder.every((id, i) => CANONICAL_BLOCK_ORDER[i] === id),
  CANONICAL_BLOCK_ORDER.join(" → "),
);

const blocks = buildCanonicalBlocks({
  platformSafety: "SAFE",
  characterPackage: "CHAR",
  userPersona: "USER",
  relationshipState: "REL",
  modeContext: "MODE",
  experiencePackage: "EXP",
  openingSceneState: "SCENE",
  worldInfo: "LORE",
  longTermMemory: "MEM",
  branchSummary: "SUM",
  branchHistory: "user: hi\nassistant: hello",
  worldInfoAfter: "AFTER",
  userInput: "最新输入",
  postHistoryContract: "CONTRACT",
});
check(
  "buildCanonicalBlocks preserves order",
  blocks.map((b) => b.id).join(",") === expectedOrder.join(","),
);

const assembled = assembleCanonical({
  platformSafety: "平台安全与输出协议",
  characterPackage: "角色身份与人格",
  userPersona: "用户边界",
  relationshipState: "关系摘要",
  modeContext: buildModeContribution("immersive", { experienceTitle: "夜雨车站" }).text,
  experiencePackage: "作品前提",
  openingSceneState: "开场：末班车前",
  worldInfo: "雨夜车站 lore",
  longTermMemory: "长期记忆片段",
  branchSummary: "滚动摘要",
  branchHistory: "user: 你好\nassistant: 嗯",
  userInput: "把伞往ta那边偏一点",
  totalBudget: 500,
  mode: "immersive",
});
check("assembleCanonical returns inspector", Boolean(assembled.inspector?.blocks?.length));
check(
  "assembleCanonical order frozen",
  assembled.order.join(",") === expectedOrder.join(","),
);
check(
  "mode contribution immersive",
  normalizePromptMode("scenario") === "immersive"
    && /沉浸/.test(buildModeContribution("immersive").text),
);
check(
  "first spoken turn does not claim unfinished history",
  /第一句/.test(buildModeContribution("chat", { firstSpokenTurn: true }).text)
    && !/延续真实历史/.test(buildModeContribution("chat", { firstSpokenTurn: true }).text),
);

// --- Budget / inspector trims ---
const fat = applyBudget(
  [
    { id: "platform_safety", text: "SAFE", source: "test" },
    { id: "character_package", text: "CHAR", source: "test" },
    { id: "user_input", text: "KEEP_USER", source: "test" },
    { id: "world_info", text: "L".repeat(4000), source: "lore" },
    { id: "long_term_memory", text: "M".repeat(4000), source: "mem" },
  ],
  { totalBudget: 200 },
);
const insp = inspectPromptBlocks(fat.blocks, { order: fat.blocks.map((b) => b.id) });
check(
  "inspector reports trims",
  insp.trimmedCount > 0 && fat.blocks.some((b) => b.trimReason),
  formatInspectorReport(insp).slice(0, 160),
);
check(
  "budget never drops user_input",
  fat.blocks.find((b) => b.id === "user_input")?.text === "KEEP_USER",
);
check(
  "budget never drops character_package",
  fat.blocks.find((b) => b.id === "character_package")?.text === "CHAR",
);

// --- Lore activation + trace ---
const loreEntries = [
  normalizeWorldbookEntry({
    id: "lore-rain",
    title: "夜雨",
    keys: ["雨", "车站"],
    content: "末班车前的雨声很轻。",
    priority: 80,
    scope: "experience",
    experienceId: "night-rain",
    enabled: true,
  }),
  normalizeWorldbookEntry({
    id: "lore-unrelated",
    title: "咖啡馆",
    keys: ["咖啡", "拿铁"],
    content: "阳光店里放着爵士乐。",
    priority: 90,
    scope: "global",
    enabled: true,
  }),
  normalizeWorldbookEntry({
    id: "lore-constant",
    title: "常驻边界",
    keys: [],
    content: "不越现实边界。",
    priority: 10,
    scope: "global",
    constant: true,
    enabled: true,
  }),
  normalizeWorldbookEntry({
    id: "lore-char",
    title: "角色专属",
    keys: ["雨"],
    content: "只给星梨的雨夜设定。",
    priority: 70,
    scope: "character",
    linkedCharacterIds: ["char-a"],
    enabled: true,
  }),
];

check(
  "scope filters character lore",
  entryInScope(loreEntries[3], { characterId: "char-b" }) === false
    && entryInScope(loreEntries[3], { characterId: "char-a" }) === true,
);
check(
  "combination keys match rain station",
  entryMatchesQuery(loreEntries[0], "今晚车站好大的雨"),
);
check(
  "unrelated cafe lore does not match rain query",
  !entryMatchesQuery(loreEntries[1], "今晚车站好大的雨"),
);

const activation = activateWorldInfo(loreEntries, "今晚车站好大的雨", {
  scopeContext: { characterId: "char-a", experienceId: "night-rain" },
  tokenBudget: 200,
});
check(
  "relevant lore activated",
  activation.activated.some((e) => e.id === "lore-rain")
    && activation.activated.some((e) => e.id === "lore-constant"),
  activation.activated.map((e) => e.id).join(","),
);
check(
  "unrelated lore not activated",
  !activation.activated.some((e) => e.id === "lore-unrelated")
    && activation.trace.records.some((r) => r.entryId === "lore-unrelated" && !r.activated),
);
check(
  "lore activation trace present",
  activation.trace?.activatedIds?.length > 0
    && /lore_trace|ON|OFF|budget=/.test(formatLoreActivationTrace(activation.trace)),
);

const sorted = sortLoreEntriesDeterministic([
  { id: "b", title: "B", priority: 50 },
  { id: "a", title: "A", priority: 50 },
  { id: "c", title: "C", priority: 90 },
]);
check(
  "deterministic lore sort",
  sorted.map((e) => e.id).join(",") === "c,a,b",
);

// --- Director honesty: no fake dialogue on production parse failure ---
const bad = parseDirectorOutput("NOT JSON AT ALL", { allowSilentOffline: false });
check(
  "model failure does not produce fake dialogue",
  bad.ok === false
    && !String(bad.dialogue || "").trim()
    && !String(bad.narration || "").trim(),
  JSON.stringify({ ok: bad.ok, dialogue: bad.dialogue, error: bad.error }),
);

const legacy = parseDirectorOutput("NOT JSON", { allowSilentOffline: true });
check(
  "explicit allowSilentOffline still available for demo/verify",
  Boolean(legacy?.dialogue || legacy?.narration),
);

check(
  "allowOfflineDirector never default true",
  allowOfflineDirector({}) === false
    && allowOfflineDirector({ forceOffline: true }) === false
    && allowOfflineDirector({ forceOfflineFixed: true }) === true
    && allowOfflineDirector({ devDemo: true }) === true,
);

// Production player must not advance with offline_fallback source as success —
// static + behavioral: parse failure empty + player src has enterDirectorError.
check(
  "production path never treats offline_fallback as successful advance",
  /enterDirectorError/.test(playerSrc)
    && !/generationSource\s*=\s*"offline_fallback"[\s\S]{0,80}appendBeats/.test(playerSrc),
);

// offlineDirectorTurn still works for explicit demo (verify scripts)
try {
  // Minimal stub — may throw without full storage; just ensure export exists
  check("offlineDirectorTurn exported", typeof offlineDirectorTurn === "function");
} catch (error) {
  check("offlineDirectorTurn exported", false, String(error));
}

// --- Experience reducer / output contract ---
check(
  "scene patch whitelist exists",
  SCENE_PATCH_WHITELIST.includes("emotionalTone")
    && SCENE_PATCH_WHITELIST.includes("newFacts"),
);
const forbidden = validateScenePatch({ emotionalTone: "tender", beatNodeId: "x", nextByChoice: {} });
check(
  "reducer rejects non-whitelist fields",
  !forbidden.ok
    && forbidden.errors.some((e) => e.includes("beatNodeId") || e.includes("nextByChoice")),
);
const reduced = reduceScenePatch(
  { emotionalTone: "neutral", newFacts: [] },
  { emotionalTone: "tender", newFacts: ["共享一把伞"] },
);
check(
  "reducer applies whitelist patch",
  reduced.state.emotionalTone === "tender"
    && reduced.state.newFacts.includes("共享一把伞"),
);

const v2raw = JSON.stringify({
  schemaVersion: EXPERIENCE_OUTPUT_SCHEMA_VERSION,
  display: { narration: "雨丝斜斜地落。", dialogue: "伞往你这边一点。" },
  performance: { emotion: "warm", expressionId: "soft_smile", actionId: "lean_close", camera: { shot: "medium", transition: "soft" } },
  suggestedActions: [{ text: "把伞往ta那边偏一点", intent: "care" }],
  scenePatch: { emotionalTone: "tender", resolvedThreadIds: [], newFacts: [] },
  memorySignals: [],
  ending: { mayEnd: false, reason: "" },
});
const parsed = parseAndReduceModelOutput(v2raw);
check(
  "unified output contract + reducer",
  parsed.ok
    && parsed.output?.display?.dialogue.includes("伞")
    && parsed.sceneState?.emotionalTone === "tender",
);

const repaired = parseAndReduceModelOutput('prefix {"dialogue":"还在。","narration":"灯光微顿。","emotion":"warm"} trailing');
check(
  "one repair pass lifts flat turn",
  repaired.ok && repaired.repaired && repaired.output?.display?.dialogue === "还在。",
);

const failed = parseAndReduceModelOutput("<<<nope>>>");
check(
  "repair failure does not invent dialogue",
  !failed.ok && !failed.output,
);

// Score
const passed = checks.filter((c) => c.pass).length;
const total = checks.length;
const score = `${passed}/${total}`;
console.log(`\nW2 verify score: ${score}`);
if (passed < total) {
  const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
  console.error("Failed:", failedChecks.join("; "));
  process.exitCode = 1;
} else {
  console.log("W2 Canonical Prompt / World Info / Director honesty: GREEN (implementation)");
}
