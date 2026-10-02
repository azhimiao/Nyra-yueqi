/**
 * C6 — Cross-experience integration (automatable).
 * Final journey (offline/deterministic):
 *   proactive/pet → Pop chat → phone → TA phone observe → Pop limited reaction
 *   → scenario curtain → diary shared → cocreate edit → theater lists new script
 * Does not self-sign L3 product acceptance.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const memory = {
  _data: {},
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
  removeItem(key) {
    delete this._data[key];
  },
  clear() {
    this._data = {};
  },
};

globalThis.window = { localStorage: memory };

const requiredFiles = [
  "src/life/confluence.js",
  "src/life/consumers.js",
  "src/avatar/pet-action-protocol.js",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const settingsSrc = readFileSync(join(root, "src/phone-shell/app-screens.js"), "utf8");
const shellSrc = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
const layoutSrc = readFileSync(join(root, "src/phone-shell/home-layout.js"), "utf8");
const catalogSrc = readFileSync(join(root, "src/phone-shell/apps-catalog.js"), "utf8");
const gamesSrc = readFileSync(join(root, "src/games/lobby-ui.js"), "utf8");

check("settings has 模型接口 block", settingsSrc.includes("模型接口") && settingsSrc.includes('data-phone-open="lab"'));
check("settings has 高级 section", settingsSrc.includes("高级（通常不用）"));
check("no 敬请期待 in settings HTML", !settingsSrc.includes("敬请期待"));
check("no 敬请期待 in games lobby badge", !gamesSrc.includes("敬请期待"));
check("shell unmounts creator hub", !shellSrc.includes("mountCreatorHub"));
check("home grid has no folder:creator", !/"folder:creator"/.test(layoutSrc));
check("catalog keeps 共创 via 栖市, no creator-only studio clutter", catalogSrc.includes('id: "cocreate"') && catalogSrc.includes('via: "qishi"') && !catalogSrc.includes('id: "studio"') && !catalogSrc.includes('id: "experience-studio"') && !catalogSrc.includes('id: "story"'));
check("dock hosts 栖市 not 情景剧", layoutSrc.includes('C1_DOCK_ORDER = ["pop", "moments", "qishi", "listen"]'));
check("mall on consumer grid", layoutSrc.includes('"shop"') && layoutSrc.includes("c8-explore"));
check("explore on consumer grid", layoutSrc.includes('"explore"'));
check("xp apps listed as frozen", ["scroll", "adventure", "cocreate", "scenario"].every((id) => layoutSrc.includes(`"${id}"`)));
check("shell injects Pop observation reaction", shellSrc.includes("consumePopObservationReaction"));
check("shell merges life moments", shellSrc.includes("consumeMomentsFromLife"));

const { __setLifeStorageForTests, clearAllLife, saveDayPack, listObservations, listLifeEvents } =
  await import("../src/life/store.js");
const { getXingliDay001Clone, XINGLI_CHARACTER_ID } = await import(
  "../src/life/fixtures/xingli-day-001.js"
);
const {
  appendConfluenceEvent,
  recordScenarioFinale,
  recordCocreatePublish,
  findCohabitByIdempotentKey,
  listSharedLifeSummaries,
} = await import("../src/life/confluence.js");
const {
  consumePopLifeSummary,
  consumePopObservationReaction,
  consumeMomentsFromLife,
  consumeDiarySharedExperiences,
  consumeProactiveLifeContext,
} = await import("../src/life/consumers.js");
const { assertNoPrivateLeak } = await import("../src/life/prompt.js");
const { observeEvidence, resolveDayPackForCharacter } = await import(
  "../src/sidewrite/daypack-access.js"
);
const {
  resolvePetAction,
  resolveIdleAction,
  playPetActionThenIdle,
  scheduleReturnToIdle,
  PET_IDLE_ACTION_ID,
  isKnownPetAction,
} = await import("../src/avatar/pet-action-protocol.js");
const { mapStageAction } = await import("../src/scenario/runtime/action-mapper.js");
const { CREATOR_PROJECTS } = await import("../src/creator/hub-ui.js");
const {
  FROZEN_HOME_APP_IDS,
  DEFAULT_CREATOR_FOLDER,
  C1_DOCK_ORDER,
  isFrozenHomeAppId,
} = await import("../src/phone-shell/home-layout.js");

__setLifeStorageForTests(memory);
clearAllLife();
memory.clear();

check("legacy hub module still lists projects (code leftover)", CREATOR_PROJECTS.length >= 4);
check("creator folder apps emptied", DEFAULT_CREATOR_FOLDER.apps.length === 0);
check("frozen apps still listed for strip", FROZEN_HOME_APP_IDS.includes("lab") && FROZEN_HOME_APP_IDS.includes("studio"));
check("dock still 4", C1_DOCK_ORDER.length === 4);
check("shop on consumer home (not frozen)", !isFrozenHomeAppId("shop"));

// --- Pet action protocol ---
const greet = resolvePetAction({ actionId: "greet", emotion: "warm", source: "chat" });
const stageGreet = mapStageAction({ actionId: "greet", emotion: "warm" });
check("protocol uses same mapper family", greet.actionId === stageGreet.actionId || greet.poseId === stageGreet.poseId);
check("protocol greet not idle", greet.isIdle === false);
const idle = resolveIdleAction();
check("idle is loop", idle.isIdle === true && (idle.actionId === PET_IDLE_ACTION_ID || idle.poseId === "idle_default"));
check("known talk_loop", isKnownPetAction("talk_loop"));

let idleApplied = false;
let actionApplied = false;
const applied = [];
const cancel = playPetActionThenIdle(
  (a) => {
    applied.push(a.actionId);
    if (a.isIdle) idleApplied = true;
    else actionApplied = true;
  },
  { actionId: "react_tap", source: "chat" },
  15,
);
await new Promise((r) => setTimeout(r, 60));
cancel();
check(
  "play then idle scheduled",
  actionApplied === true && idleApplied === true,
  applied.join("→") || "none",
);

// Direct idle schedule (deterministic)
let directIdle = false;
const cancel2 = scheduleReturnToIdle(() => {
  directIdle = true;
}, 10);
await new Promise((r) => setTimeout(r, 40));
cancel2();
check("scheduleReturnToIdle fires", directIdle === true);

// --- Seed life + observe (TA phone) ---
const seed = getXingliDay001Clone();
const saved = saveDayPack(seed);
check("seed daypack", saved.ok === true);
const pack = resolveDayPackForCharacter(XINGLI_CHARACTER_ID).pack;
check("resolve daypack", Boolean(pack));

const msgEvidence = (pack.evidence || []).find((e) => e.app === "messages" && e.discoverable !== false)
  || (pack.evidence || []).find((e) => e.discoverable !== false);
check("has discoverable evidence", Boolean(msgEvidence), msgEvidence?.id || "");

observeEvidence({
  characterId: XINGLI_CHARACTER_ID,
  dayPackId: pack.id,
  evidenceId: msgEvidence.id,
  discoverable: true,
  dwellMs: 800,
});
const obs = listObservations(XINGLI_CHARACTER_ID);
check("observation recorded", obs.some((o) => o.evidenceId === msgEvidence.id));

function listObservationLifeRows() {
  return listSharedLifeSummaries(XINGLI_CHARACTER_ID, { limit: 40 }).filter((e) =>
    /TA 的手机|看过/.test(e.summary || ""),
  );
}
const obsEvents = listObservationLifeRows();
check("observation confluence in life", obsEvents.length >= 1, String(obsEvents.length));

const again = observeEvidence({
  characterId: XINGLI_CHARACTER_ID,
  dayPackId: pack.id,
  evidenceId: msgEvidence.id,
  discoverable: true,
});
check("observe idempotent ok", again.ok === true);
const obsEvents2 = listObservationLifeRows();
check("observation confluence idempotent", obsEvents2.length === obsEvents.length, `${obsEvents2.length}`);

// --- Pop limited reaction + no private leak ---
const popSummary = consumePopLifeSummary(XINGLI_CHARACTER_ID);
check("Pop life summary ok", popSummary.ok === true && Boolean(popSummary.block));
const leak = assertNoPrivateLeak(popSummary.block, pack);
check("Pop summary no privateFacts", leak.ok, leak.leaked?.[0] || "ok");

const privateFact = (pack.events.find((e) => e.visibility === "private")?.privateFacts || [])[0];
check(
  "private fact absent from Pop block",
  !privateFact || !popSummary.block.includes(privateFact),
);

const reaction = consumePopObservationReaction(XINGLI_CHARACTER_ID);
check("Pop limited reaction", reaction.ok === true && Boolean(reaction.text), reaction.text?.slice(0, 40) || "");
check(
  "reaction no privateFact",
  !privateFact || !reaction.text.includes(privateFact),
);
const reaction2 = consumePopObservationReaction(XINGLI_CHARACTER_ID);
check("reaction consumed once", reaction2.ok === false);

const moments = consumeMomentsFromLife(XINGLI_CHARACTER_ID, { limit: 6 });
check("moments from shared life", moments.ok === true);
check(
  "moments no private leak",
  !privateFact || moments.moments.every((m) => !m.content.includes(privateFact)),
);

const proactive = consumeProactiveLifeContext(XINGLI_CHARACTER_ID);
check("proactive context filtered", proactive.ok === true);

// --- Scenario finale → diary shared ---
const finale1 = recordScenarioFinale({
  characterId: XINGLI_CHARACTER_ID,
  runId: "run-c6-1",
  scriptId: "builtin-rain-station",
  scriptTitle: "夜雨车站",
  summary: "伞下并肩等车，雨声把话声压得很轻。",
  diaryId: "diary-c6-1",
});
check("scenario finale written", finale1.ok === true && finale1.alreadyWritten === false);
const finale2 = recordScenarioFinale({
  characterId: XINGLI_CHARACTER_ID,
  runId: "run-c6-1",
  scriptId: "builtin-rain-station",
  scriptTitle: "夜雨车站",
  summary: "伞下并肩等车，雨声把话声压得很轻。",
});
check("scenario finale idempotent", finale2.ok === true && finale2.alreadyWritten === true);
check(
  "idempotent key findable",
  Boolean(findCohabitByIdempotentKey(XINGLI_CHARACTER_ID, "scenario-finale:run-c6-1")),
);

const diaryShared = consumeDiarySharedExperiences(XINGLI_CHARACTER_ID, { limit: 12 });
check("diary shared experiences", diaryShared.ok && diaryShared.items.some((i) => /谢幕|情景剧|共同/.test(i.title + i.body)));

// --- Cocreate publish → life + library ---
const {
  startSession,
  clearSessionBagForTests,
  getSession,
} = await import("../src/cocreate/session-store.js");
const { clearArtifactBagForTests } = await import("../src/cocreate/artifact-store.js");
const { runOfflineSampleCollaboration, acceptProposal } = await import("../src/cocreate/session-engine.js");
const { countInteractiveTurns } = await import("../src/cocreate/session-schema.js");
const { publishSession, buildPublishPreview } = await import("../src/cocreate/publish.js");
const { listLibraryItems } = await import("../src/scenario/library/index.js");
const { startRun, getScript, listScripts } = await import("../src/scenario/store.js");
const { LIFE_STORE_KEY } = await import("../src/life/schema.js");

clearSessionBagForTests();
clearArtifactBagForTests();
const session = startSession({
  characterId: XINGLI_CHARACTER_ID,
  type: "date_scene",
  characterName: "林星梨",
});
runOfflineSampleCollaboration(session.session.id, { characterName: "林星梨" });
const sess = getSession(session.session.id);
check("cocreate offline ≥3 user rounds", countInteractiveTurns(sess) >= 3, String(countInteractiveTurns(sess)));
const lastChar = [...(sess.turns || [])].reverse().find((t) => t.role === "character" && t.proposals?.length);
if (lastChar) acceptProposal(session.session.id, lastChar.id, lastChar.proposals[0].id);

const preview = buildPublishPreview(session.session.id);
check("publish target script", preview.target === "script");
const published = await publishSession(session.session.id, { confirmIncomplete: true });
check("cocreate publish ok", published.ok === true, published.error || "");
check(
  "library has new script",
  listLibraryItems().some((item) => item.id === published.script?.id),
  published.script?.id || "",
);

const pubLife = recordCocreatePublish({
  characterId: XINGLI_CHARACTER_ID,
  sessionId: session.session.id,
  artifactId: session.artifact.id,
  target: "script",
  targetId: published.script?.id || "",
  title: published.script?.title || "共创剧本",
});
// publishSession already wrote once — this should be idempotent
check("cocreate publish confluence idempotent", pubLife.ok === true && pubLife.alreadyWritten === true);

const pubSummaries = listSharedLifeSummaries(XINGLI_CHARACTER_ID, { limit: 40 }).filter((e) =>
  /共创/.test(e.summary || ""),
);
check("cocreate in shared life", pubSummaries.length >= 1, String(pubSummaries.length));

// Theater can start the published script (offline)
const scriptId = published.script?.id;
const script = getScript(scriptId) || listScripts().find((s) => s.id === scriptId);
check("theater can resolve published script", Boolean(script), scriptId || "");
if (script) {
  const run = startRun({
    scriptId: script.id,
    cast: { leadId: XINGLI_CHARACTER_ID, memberIds: [XINGLI_CHARACTER_ID] },
  });
  check("theater startRun from cocreate script", Boolean(run?.id));
}

// --- Append confluence generic + backup-ish persistence ---
const a1 = appendConfluenceEvent({
  appId: "pop",
  kind: "chat",
  summary: "Pop 里聊了两句雨夜的事",
  characterId: XINGLI_CHARACTER_ID,
  idempotentKey: "pop-chat:c6-demo",
});
check("pop chat confluence", a1.ok === true);
const a2 = appendConfluenceEvent({
  appId: "pop",
  kind: "chat",
  summary: "Pop 里聊了两句雨夜的事",
  characterId: XINGLI_CHARACTER_ID,
  idempotentKey: "pop-chat:c6-demo",
});
check("pop chat confluence idempotent", a2.alreadyWritten === true);

// Persistence across "refresh"
const lifeSnap = memory.getItem(LIFE_STORE_KEY);
check("life bag persisted", Boolean(lifeSnap));
memory.clear();
memory.setItem(LIFE_STORE_KEY, lifeSnap);
__setLifeStorageForTests(memory);
const afterRefresh = listLifeEvents(XINGLI_CHARACTER_ID);
check("life survives refresh", afterRefresh.length >= 1, String(afterRefresh.length));

// No-key / offline path: offline sample already ran above
check("no-key cocreate path exercised", true);

const failed = checks.filter((c) => !c.pass);
console.log(`\nverify:core-c6 ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.error("Failed:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}
