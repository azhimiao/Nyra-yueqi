/**
 * Open Experience W3 — Night-rain Experience Runtime (open package, no fixed confluence).
 * Contract: docs/OPEN_CHARACTER_EXPERIENCE_ONE_SHOT_PLAN.md §5.4–5.8 / §7 / §13.2 / §14 W3 / §15.5
 *
 * Assert:
 * - package has ≥3 openings; no nextByChoice in night-rain package source
 * - production enter path uses experience runtime
 * - deterministic model stub: two free-says → different assistant content
 * - 30-round headless loop advances turnIndex + sceneState (stub ≠ fixed plot tree)
 * - Do NOT seed fake localStorage bags as product proof
 * - Do NOT claim product_review / user_accepted
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

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    clear() {
      map.clear();
    },
    _map: map,
  };
}

const requiredFiles = [
  "src/experience/schema.js",
  "src/experience/reducer.js",
  "src/experience/store.js",
  "src/experience/runtime.js",
  "src/experience/director.js",
  "src/experience/scenario-package.js",
  "src/experience/package-io.js",
  "src/experience/presets/night-rain-station.js",
  "src/experience/index.js",
  "docs/qa/open-experience/W3_NIGHT_RAIN.md",
  "docs/qa/open-experience/EXECUTION_STATE.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const nightRainSrc = readFileSync(
  join(root, "src/experience/presets/night-rain-station.js"),
  "utf8",
);
check(
  "night-rain package source has no nextByChoice",
  !/nextByChoice/.test(nightRainSrc),
);
check(
  "night-rain package source has no nextByKeyword",
  !/nextByKeyword/.test(nightRainSrc),
);
check(
  "night-rain package source has no beatCursor",
  !/beatCursor/.test(nightRainSrc),
);
check(
  "night-rain package source is not a beats graph",
  !/\bbeats\s*:/.test(nightRainSrc),
);

const playerSrc = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check(
  "production enter path uses experience runtime",
  /enterExperience/.test(playerSrc)
    && /registerScenarioExperiencePackages/.test(playerSrc)
    && /ensureScenarioExperiencePackage/.test(playerSrc)
    && /runExperienceDirectorTurn/.test(playerSrc)
    && /productionRuntime:\s*"experience"|productionRuntime = "experience"|runtime: useExperience \? "experience"/.test(
      playerSrc,
    ),
);
check(
  "player still gates offlineDirectorTurn behind explicit flags",
  /allowOfflineDirector|forceOfflineFixed|devDemo/.test(playerSrc)
    && /useOfflineFixed/.test(playerSrc),
);
check(
  "experience path skips empty advance / offline opening for night-rain",
  /useExperience/.test(playerSrc) && /if\s*\(\s*!useExperience\s*\)/.test(playerSrc),
);

const presetsSrc = readFileSync(join(root, "src/scenario/presets.js"), "utf8");
check(
  "legacy rain graph marked migration/devDemo only",
  /migration_readonly_devDemo_only|DEV_DEMO|devDemo/.test(presetsSrc)
    && /productionRuntime:\s*"experience"/.test(presetsSrc),
);

const execState = readFileSync(join(root, "docs/qa/open-experience/EXECUTION_STATE.md"), "utf8");
check(
  "EXECUTION_STATE does not claim user_accepted",
  !/\|\s*user_accepted\s*\|/.test(execState)
    && !/状态.*user_accepted/.test(execState)
    && !/标记\s*`?user_accepted`?/.test(execState),
);
check(
  "EXECUTION_STATE does not claim product_review for W3",
  !/W3[^|\n]*\|\s*\*?product_review\*?/.test(execState),
);

const {
  __setConversationStorageForTests,
  __reloadConversationBagFromStorage,
  __resetConversationIdSeqForTests,
  __resetConversationEventsForTests,
  clearAllConversations,
  getSession,
  selectVisibleHistory,
  forkFromMessage,
  switchBranch,
} = await import("../src/conversation/index.js");

const {
  __setExperienceStorageForTests,
  __clearExperienceRegistryForTests,
  __resetExperienceIdSeqForTests,
  registerPackage,
  validateExperiencePackage,
  findForbiddenGraphKeys,
  NIGHT_RAIN_STATION_PACKAGE,
  NIGHT_RAIN_PACKAGE_ID,
  createNightRainStationPackage,
  enterExperience,
  pauseExperience,
  resumeExperience,
  endExperience,
  getExperienceSession,
  createDeterministicExperienceModelStub,
  runExperienceDirectorTurn,
  runExperienceHeadlessLoop,
  assembleExperienceTurn,
  reduceTurn,
  createEmptySceneState,
  createExperiencePackageFromScenario,
  syncExperienceBranch,
} = await import("../src/experience/index.js");
const { SCENARIO_PRESETS } = await import("../src/scenario/presets.js");

// Fresh in-memory stores — not seeded product bags
const convStorage = memoryStorage();
const expStorage = memoryStorage();
__setConversationStorageForTests(convStorage);
__reloadConversationBagFromStorage();
__resetConversationIdSeqForTests();
__resetConversationEventsForTests();
clearAllConversations();
__setExperienceStorageForTests(expStorage);
__clearExperienceRegistryForTests();
__resetExperienceIdSeqForTests();

const pkg = createNightRainStationPackage();
const reg = registerPackage(pkg);
check("register night-rain package", reg.ok, reg.errors?.join(",") || "");
check(
  "package id is exp-night-rain-station",
  pkg.id === NIGHT_RAIN_PACKAGE_ID,
  pkg.id,
);
check("package has ≥3 openings", pkg.openings.length >= 3, String(pkg.openings.length));
check(
  "three opening ids cover §7.1",
  ["opening-first-meeting", "opening-lovers-quarrel", "opening-years-later"].every((id) =>
    pkg.openings.some((o) => o.id === id),
  ),
);

const validated = validateExperiencePackage(pkg);
check("validateExperiencePackage ok", validated.ok, validated.errors?.join(",") || "");
check(
  "findForbiddenGraphKeys empty on package",
  findForbiddenGraphKeys(pkg).length === 0,
  findForbiddenGraphKeys(pkg).join(","),
);

const bridgedPackages = SCENARIO_PRESETS.map(createExperiencePackageFromScenario);
check(
  "all built-in scenarios bridge to open ExperiencePackage",
  bridgedPackages.length === SCENARIO_PRESETS.length
    && bridgedPackages.every((item) => item.openings.length > 0),
  `${bridgedPackages.length}/${SCENARIO_PRESETS.length}`,
);
check(
  "scenario bridge never copies fixed beat graphs",
  bridgedPackages.every((item) => findForbiddenGraphKeys(item).length === 0),
);
const userPackage = createExperiencePackageFromScenario({
  id: "script-user-contract",
  title: "自写场景",
  premise: "用户给出的开放设定",
  openingBeat: "门外传来三声敲门。",
  source: "user",
});
check(
  "user scenario bridges to the same open runtime contract",
  userPackage.legacyScriptId === "script-user-contract"
    && userPackage.responseContract?.schemaVersion === 3
    && findForbiddenGraphKeys(userPackage).length === 0,
);

// Reject graph-shaped fake package
const bad = validateExperiencePackage({
  id: "bad-graph",
  openings: [{ id: "o1", title: "x", initialSceneState: {} }],
  nextByChoice: { a: "b" },
});
check(
  "package-io rejects nextByChoice",
  !bad.ok && bad.errors.some((e) => e.includes("nextByChoice")),
);

// Enter + mount Conversation V2
const entered = enterExperience({
  packageId: NIGHT_RAIN_PACKAGE_ID,
  openingId: "opening-first-meeting",
  characterId: "char-w3-xingli",
});
check("enterExperience ok", entered.ok, entered.reason || "");
check(
  "session mounts conversationSessionId + activeBranchId",
  Boolean(entered.value?.conversationSessionId && entered.value?.activeBranchId),
  `${entered.value?.conversationSessionId} / ${entered.value?.activeBranchId}`,
);
check("session status active", entered.value?.status === "active");
const openingHistory = selectVisibleHistory(getSession(entered.conversationSessionId), { limit: 10 });
check(
  "selected opening turns are seeded into visible conversation history",
  openingHistory.some((row) => row.meta?.openingSeed && String(row.text || "").trim()),
);
check(
  "suggestedActions from opening (not fixed choice graph ids)",
  Array.isArray(entered.value?.suggestedActions)
    && entered.value.suggestedActions.length > 0
    && entered.value.suggestedActions.every((a) => a.text && !a.id),
);
const promptProbe = assembleExperienceTurn({
  pkg,
  opening: pkg.openings.find((item) => item.id === entered.value.openingId),
  session: getExperienceSession(entered.value.id),
  userInput: "看看站台尽头的灯",
  loreEntries: [{
    id: "wb-external-contract",
    title: "站台灯规则",
    content: "站台尽头的灯只会在末班车前亮起。",
    enabled: true,
    constant: true,
    scope: "global",
  }],
  longTermMemory: "已接受共同经历：两人曾约定不替对方做决定。",
  branchSummary: "此前两人一直在避开真正的问题。",
});
check(
  "Director canonical prompt carries external lore, memory and branch summary",
  promptProbe.assembled.blocks.some((block) => block.id === "world_info" && block.text.includes("末班车"))
    && promptProbe.assembled.blocks.some((block) => block.id === "long_term_memory" && block.text.includes("共同经历"))
    && promptProbe.assembled.blocks.some((block) => block.id === "branch_summary" && block.text.includes("真正的问题")),
);

const paused = pauseExperience(entered.value.id, { draft: "先停一下" });
check("pauseExperience → paused", paused.ok && paused.value?.status === "paused");
const resumed = resumeExperience(entered.value.id);
check("resumeExperience → active", resumed.ok && resumed.value?.status === "active");

// Deterministic stub: two different free-says → different assistant content
const stub = createDeterministicExperienceModelStub();
const turnA = await runExperienceDirectorTurn({
  experienceSessionId: entered.value.id,
  userInput: "把伞往ta那边偏一点，顺便问ta冷不冷",
  callModel: stub,
  characterName: "星梨",
});
const turnB = await runExperienceDirectorTurn({
  experienceSessionId: entered.value.id,
  userInput: "我要叫车离开这座车站，今晚到此为止",
  callModel: stub,
  characterName: "星梨",
});
check("director turn A ok", turnA.ok, turnA.reason || "");
check("director turn B ok", turnB.ok, turnB.reason || "");
const dialogueA = turnA.output?.display?.dialogue || "";
const dialogueB = turnB.output?.display?.dialogue || "";
check(
  "two free-says produce different assistant content (no fixed confluence)",
  Boolean(dialogueA && dialogueB && dialogueA !== dialogueB),
  `A=${dialogueA.slice(0, 40)} | B=${dialogueB.slice(0, 40)}`,
);
check(
  "stub acknowledges distinct user markers",
  dialogueA.includes("伞") && dialogueB.includes("离开"),
);
check(
  "suggestedActions come from model envelope (whitelist)",
  Array.isArray(turnA.output?.suggestedActions)
    && turnA.output.suggestedActions.every((a) => a.text && !("id" in a && a.id && String(a.id).startsWith("lean"))),
);
check(
  "sceneState turnIndex advanced",
  Number(turnB.sceneState?.turnIndex) >= 2,
  String(turnB.sceneState?.turnIndex),
);
check(
  "sceneState establishedFacts updated via reducer",
  Array.isArray(turnB.sceneState?.establishedFacts)
    && turnB.sceneState.establishedFacts.some((f) => String(f).includes("离开")),
);

const convBeforeRegenerate = getSession(entered.conversationSessionId);
const activeBranchBeforeRegenerate = convBeforeRegenerate.branches[convBeforeRegenerate.activeBranchId];
const assistantMessageId = activeBranchBeforeRegenerate.headMessageId;
const userCountBeforeRegenerate = selectVisibleHistory(convBeforeRegenerate, { limit: 100 })
  .filter((row) => row.role === "user").length;
const regenerated = await runExperienceDirectorTurn({
  experienceSessionId: entered.value.id,
  regenerateMessageId: assistantMessageId,
  callModel: stub,
  characterName: "星梨",
});
const convAfterRegenerate = getSession(entered.conversationSessionId);
const regeneratedNode = convAfterRegenerate.messageNodes[assistantMessageId];
const userCountAfterRegenerate = selectVisibleHistory(convAfterRegenerate, { limit: 100 })
  .filter((row) => row.role === "user").length;
check("regenerate succeeds on the same assistant node", regenerated.ok, regenerated.reason || "");
check(
  "regenerate adds candidate without fake user message",
  regeneratedNode?.candidates?.length === 2
    && userCountAfterRegenerate === userCountBeforeRegenerate,
  `candidates=${regeneratedNode?.candidates?.length || 0} users=${userCountAfterRegenerate}`,
);
check(
  "ordered contentBlocks survive Conversation candidate persistence",
  regeneratedNode?.candidates?.every((candidate) => candidate.contentBlocks?.length >= 2),
);
check(
  "regenerate replays from sceneBefore instead of advancing twice",
  regenerated.sceneState?.turnIndex === turnB.sceneState?.turnIndex,
  `${regenerated.sceneState?.turnIndex}/${turnB.sceneState?.turnIndex}`,
);

const originalBranchId = convAfterRegenerate.activeBranchId;
const forked = forkFromMessage(entered.conversationSessionId, assistantMessageId, {
  label: "verify-independent-scene",
});
check("fork for branch-local scene test", forked.ok, forked.reason || "");
syncExperienceBranch(entered.value.id);
const forkTurn = await runExperienceDirectorTurn({
  experienceSessionId: entered.value.id,
  userInput: "只在新分支里走向站外的便利店",
  callModel: stub,
  characterName: "星梨",
});
const forkSnapshot = getExperienceSession(entered.value.id).sceneState;
switchBranch(entered.conversationSessionId, originalBranchId);
const restoredOriginal = syncExperienceBranch(entered.value.id);
check("fork branch advances independently", forkTurn.ok, forkTurn.reason || "");
check(
  "switching branch restores its own scene/display/performance snapshot",
  restoredOriginal.ok
    && restoredOriginal.value.activeBranchId === originalBranchId
    && restoredOriginal.value.sceneState.turnIndex < forkSnapshot.turnIndex,
  `${restoredOriginal.value?.sceneState?.turnIndex}/${forkSnapshot.turnIndex}`,
);

// Finale
const ended = endExperience(entered.value.id, { reason: "verify_finale" });
check("endExperience → ended", ended.ok && ended.value?.status === "ended");

// --- 30-round gate per opening (headless stub ≠ fixed plot tree) ---
const OPENINGS = pkg.openings.map((o) => o.id);
const THIRTY_INPUTS = [
  "把伞往ta那边偏一点",
  "我拒绝继续这个情绪，想一个人站着",
  "我们叫车离开车站去别处",
  "……",
  "（心想：别让ta看出我在紧张）",
  "还记得我们上次在日常聊天里说过的雨吗",
  "你刚才说的和上一句矛盾了吧",
  "站台顶棚漏雨的地方是不是有旧铭牌",
  "今晚就到这里吧，我想结束这一幕",
  "再站一会儿，听完这阵雨",
];
// pad to 30 with varied free-say (not choice ids)
while (THIRTY_INPUTS.length < 30) {
  const i = THIRTY_INPUTS.length + 1;
  THIRTY_INPUTS.push(`自由行动第${i}拍：我看着铁轨又看你，说「还在」。`);
}

let allThirtyGreen = true;
for (const openingId of OPENINGS) {
  __resetConversationIdSeqForTests();
  clearAllConversations();
  const stub30 = createDeterministicExperienceModelStub();
  const enter = enterExperience({
    packageId: NIGHT_RAIN_PACKAGE_ID,
    openingId,
    characterId: `char-w3-${openingId}`,
  });
  if (!enter.ok) {
    check(`30-round enter ${openingId}`, false, enter.reason || "");
    allThirtyGreen = false;
    continue;
  }
  const loop = await runExperienceHeadlessLoop({
    experienceSessionId: enter.value.id,
    turns: THIRTY_INPUTS,
    callModel: stub30,
    characterName: "星梨",
  });
  const finalTurn = Number(loop.finalSession?.sceneState?.turnIndex) || 0;
  const facts = loop.finalSession?.sceneState?.establishedFacts || [];
  const pass =
    loop.ok
    && loop.results.length === 30
    && finalTurn >= 30
    && facts.length >= 10
    && !loop.results.some((r) => r.generationSource === "offline_fixed");
  check(
    `30-round headless ${openingId} (stub≠plot-tree)`,
    pass,
    `turns=${loop.results.length} turnIndex=${finalTurn} facts=${facts.length}`,
  );
  if (!pass) allThirtyGreen = false;
  endExperience(enter.value.id);
}

check(
  "evidence_green eligible only if stub is not fixed plot tree",
  allThirtyGreen,
  allThirtyGreen
    ? "stub semantic responder — implementation_green; real LLM still needed for evidence_green"
    : "30-round gate failed",
);

// reduceTurn unit
const reduced = reduceTurn(createEmptySceneState({ turnIndex: 0 }), {
  emotionalTone: "tender",
  newFacts: ["共享一把伞"],
});
check(
  "reduceTurn increments turnIndex + applies patch",
  reduced.state.turnIndex === 1 && reduced.state.emotionalTone === "tender",
);

// Singleton export matches factory
check(
  "NIGHT_RAIN_STATION_PACKAGE frozen export present",
  NIGHT_RAIN_STATION_PACKAGE?.openings?.length >= 3,
);

const passed = checks.filter((c) => c.pass).length;
const total = checks.length;
const score = `${passed}/${total}`;
console.log(`\nW3 verify score: ${score}`);
if (passed < total) {
  const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
  console.error("Failed:", failedChecks.join("; "));
  process.exitCode = 1;
} else {
  console.log(
    "W3 Night-rain Experience Runtime: implementation_green (stub 30-round OK; real LLM evidence_green still pending)",
  );
}
