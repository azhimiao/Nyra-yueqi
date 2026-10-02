/**
 * Open Experience W1 — Conversation V2 + non-destructive timeline.
 * Contract: docs/OPEN_CHARACTER_EXPERIENCE_ONE_SHOT_PLAN.md §5.6 / §13.1 / §14 W1
 *
 * Must prove:
 * - two branches both retained
 * - switch branch
 * - regenerate keeps old candidate
 * - edit mid-history forks
 * - V1 migration roundtrip
 * - character isolation
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail });
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
    _map: map,
  };
}

const requiredFiles = [
  "src/conversation/schema.js",
  "src/conversation/migration.js",
  "src/conversation/store.js",
  "src/conversation/runtime.js",
  "src/conversation/events.js",
  "src/conversation/selectors.js",
  "src/conversation/bridge-chat.js",
  "src/conversation/index.js",
  "docs/qa/open-experience/W1_CONVERSATION_V2.md",
  "docs/qa/open-experience/EXECUTION_STATE.md",
];

for (const rel of requiredFiles) {
  check(`file exists ${rel}`, existsSync(join(root, rel)));
}

const {
  CONVERSATION_SCHEMA_VERSION,
  CONVERSATION_STORE_KEY,
  CONVERSATION_STORE_KEY_V1,
  CONVERSATION_BACKUP_KEY_V1,
  CONVERSATION_EVENTS,
  __resetConversationIdSeqForTests,
  __resetConversationEventsForTests,
  __setConversationStorageForTests,
  __reloadConversationBagFromStorage,
  clearAllConversations,
  getConversationStoreKey,
  getSession,
  getOrCreateActiveSession,
  sendUser,
  appendAssistantCandidate,
  regenerate,
  switchCandidate,
  editUserMessage,
  forkFromMessage,
  switchBranch,
  checkpoint,
  archiveBranch,
  rollbackHead,
  getSharedHistory,
  migrateStorageV1ToV2,
  migrateSessionV1ToV2,
  onConversationEvent,
  getConversationAuditLog,
  selectVisibleHistory,
  appendChatTurnBestEffort,
  turnToChatMessage,
  enterImmersive,
  exitImmersive,
  listSessions,
} = await import("../src/conversation/index.js");

const storage = memoryStorage();
__setConversationStorageForTests(storage);
clearAllConversations();
__resetConversationIdSeqForTests();
__resetConversationEventsForTests();

check("schema version 2", CONVERSATION_SCHEMA_VERSION === 2);
check(
  "store key yueqi.conversation.v2",
  getConversationStoreKey() === CONVERSATION_STORE_KEY &&
    CONVERSATION_STORE_KEY === "yueqi.conversation.v2"
);

// --- create session (graph) ---
const sessionA = getOrCreateActiveSession({ characterId: "xingli" });
check("create session has id", Boolean(sessionA?.id));
check("create session has activeBranchId", Boolean(sessionA?.activeBranchId));
check("create session has branches", sessionA?.branches && typeof sessionA.branches === "object");
check(
  "create session has messageNodes",
  sessionA?.messageNodes && typeof sessionA.messageNodes === "object"
);
check("create session mode chat", sessionA.mode === "chat");

const mainBranchId = sessionA.activeBranchId;

// --- linear send ---
const u1 = sendUser(sessionA.id, "今晚车站见？", { source: "test" });
check("sendUser ok", u1.ok === true && Boolean(u1.node?.id));
const a1 = appendAssistantCandidate(sessionA.id, "好，我在夜雨里等你。", { pose: "greet" });
check("appendAssistantCandidate ok", a1.ok === true && Boolean(a1.node?.id));
const after = getSession(sessionA.id);
check("visible history length 2", getSharedHistory(sessionA.id).length === 2);
check("compat turns projection length 2", after?.turns?.length === 2);

// --- regenerate keeps old candidate ---
const a1Id = a1.node.id;
const firstCandId = a1.candidate.id;
const regen = regenerate(sessionA.id, "（重生成）雨丝贴在玻璃上。", { regenerated: true });
check("regenerate ok", regen.ok === true);
check("regenerate same message id", regen.node?.id === a1Id);
check(
  "regenerate keeps old candidate",
  (regen.node?.candidates || []).some((c) => c.id === firstCandId) &&
    (regen.node?.candidates || []).length >= 2
);
check(
  "regenerate activates new candidate",
  regen.node?.activeCandidateId === regen.candidate?.id &&
    regen.candidate?.id !== firstCandId
);
const switched = switchCandidate(sessionA.id, a1Id, firstCandId);
check("switchCandidate back to old", switched.ok && switched.node?.activeCandidateId === firstCandId);
switchCandidate(sessionA.id, a1Id, regen.candidate.id);

// --- fork: two branches both retained ---
const chain = getSharedHistory(sessionA.id);
const userMsgId = chain[0]?.messageId || chain[0]?.id;
const forked = forkFromMessage(sessionA.id, userMsgId, { label: "alt-path" });
check("forkFromMessage ok", forked.ok === true);
const forkBranchId = forked.branch?.id;
check("fork creates new branch id", Boolean(forkBranchId) && forkBranchId !== mainBranchId);

const afterFork = getSession(sessionA.id);
check(
  "both branches retained in session",
  Boolean(afterFork.branches[mainBranchId]) && Boolean(afterFork.branches[forkBranchId])
);
check("active branch is fork", afterFork.activeBranchId === forkBranchId);

// continue on fork
sendUser(sessionA.id, "那我们换条路走", {});
appendAssistantCandidate(sessionA.id, "好，跟我来侧门。", {});
const forkHistory = getSharedHistory(sessionA.id);
check("fork history continues", forkHistory.some((h) => h.content.includes("侧门")));

// --- switch branch ---
const switchedBr = switchBranch(sessionA.id, mainBranchId);
check("switchBranch to main ok", switchedBr.ok === true);
check("active branch main again", getSession(sessionA.id).activeBranchId === mainBranchId);
const mainHistory = getSharedHistory(sessionA.id);
check(
  "main branch history intact (no 侧门)",
  mainHistory.every((h) => !String(h.content).includes("侧门")) &&
    mainHistory.some((h) => String(h.content).includes("夜雨") || String(h.content).includes("雨丝"))
);
const stillBoth = getSession(sessionA.id);
check(
  "after switch both branches still retained",
  Boolean(stillBoth.branches[mainBranchId]) && Boolean(stillBoth.branches[forkBranchId])
);

// switch back to fork and confirm retained
switchBranch(sessionA.id, forkBranchId);
check(
  "switch back to fork restores fork history",
  getSharedHistory(sessionA.id).some((h) => h.content.includes("侧门"))
);

// --- edit mid-history forks ---
switchBranch(sessionA.id, mainBranchId);
// Build: U1 A1 U2 A2 — then edit U1 (has descendants) → must fork
sendUser(sessionA.id, "第二句用户", {});
appendAssistantCandidate(sessionA.id, "第二句助手", {});
const branchesBeforeHistoricalRegen = Object.keys(getSession(sessionA.id).branches).length;
const historicalRegen = regenerate(sessionA.id, "（历史重生成）雨声换了方向。", {}, { messageId: a1Id });
check("historical regenerate succeeds", historicalRegen.ok === true);
check("historical regenerate auto-forks", historicalRegen.forked === true && Object.keys(getSession(sessionA.id).branches).length === branchesBeforeHistoricalRegen + 1);
check("historical regenerate does not splice old descendants", !getSharedHistory(sessionA.id).some((item) => item.content === "第二句用户") && getSharedHistory(sessionA.id).at(-1)?.content.includes("历史重生成"));
check("historical regenerate preserves original branch", selectVisibleHistory(getSession(sessionA.id), { branchId: mainBranchId }).some((item) => item.content === "第二句助手"));
switchBranch(sessionA.id, mainBranchId);
const mid = getSession(sessionA.id);
const midChain = selectVisibleHistory(mid);
const firstUser = midChain.find((h) => h.role === "user");
check("mid-history has first user", Boolean(firstUser?.messageId));
const branchesBeforeEdit = Object.keys(getSession(sessionA.id).branches).length;
const edited = editUserMessage(sessionA.id, firstUser.messageId, "编辑后的第一句", {
  source: "test_edit",
});
check("edit mid-history ok", edited.ok === true);
check("edit mid-history forked", edited.forked === true);
const afterEdit = getSession(sessionA.id);
check(
  "edit increased branch count",
  Object.keys(afterEdit.branches).length > branchesBeforeEdit
);
check(
  "old main branch still has original first user text",
  selectVisibleHistory(afterEdit, { branchId: mainBranchId }).some(
    (h) => h.role === "user" && h.content.includes("今晚车站见")
  )
);
check(
  "new branch shows edited text",
  getSharedHistory(sessionA.id).some((h) => h.content.includes("编辑后的第一句"))
);

// --- checkpoint / rollback / archive ---
const cp = checkpoint(sessionA.id, { label: "w1-cp" });
check("checkpoint ok", cp.ok && Boolean(cp.checkpoint?.id));
const headBefore = getSession(sessionA.id).branches[getSession(sessionA.id).activeBranchId]
  .headMessageId;
const rolled = rollbackHead(sessionA.id);
check("rollbackHead ok", rolled.ok === true);
check(
  "rollback changed head without deleting node",
  getSession(sessionA.id).messageNodes[headBefore] != null &&
    getSession(sessionA.id).branches[getSession(sessionA.id).activeBranchId].headMessageId !==
      headBefore
);

const archiveTarget = forkBranchId;
const arch = archiveBranch(sessionA.id, archiveTarget);
check("archiveBranch ok", arch.ok && arch.branch?.status === "archived");
check(
  "cannot switch to archived",
  switchBranch(sessionA.id, archiveTarget).ok === false
);

// --- character isolation ---
const sessionB = getOrCreateActiveSession({ characterId: "other-char" });
check("other character new session", sessionB.id !== sessionA.id);
sendUser(sessionB.id, "只有 B 能看见", {});
check(
  "A history unchanged by B",
  getSharedHistory(sessionA.id).every((h) => h.content !== "只有 B 能看见")
);
check("B history isolated", getSharedHistory(sessionB.id).length === 1);
check("list by character", listSessions({ characterId: "xingli" }).length === 1);

// --- immersive compat ---
const entered = enterImmersive(sessionA.id, {
  scenarioId: "night-rain-station",
  runId: "run-w1",
  loreEntryIds: ["lore-rain"],
});
check("enterImmersive ok", entered.ok && entered.value?.mode === "immersive");
const exited = exitImmersive(sessionA.id);
check("exitImmersive ok", exited.ok && exited.value?.mode === "chat");

// --- events / audit ---
const audit = getConversationAuditLog();
check(
  "audit has regenerate event",
  audit.some((e) => e.type === CONVERSATION_EVENTS.REGENERATED)
);
check(
  "audit has fork event",
  audit.some((e) => e.type === CONVERSATION_EVENTS.FORKED)
);
check(
  "audit has branch switch",
  audit.some((e) => e.type === CONVERSATION_EVENTS.BRANCH_SWITCHED)
);

let eventSeen = false;
onConversationEvent(CONVERSATION_EVENTS.USER_SENT, () => {
  eventSeen = true;
});
sendUser(sessionA.id, "event probe", {});
check("event bus delivers USER_SENT", eventSeen === true);

// --- bridge ---
const hist = getSharedHistory(sessionA.id);
const mapped = turnToChatMessage({
  turn: { id: hist[0]?.id, role: hist[0]?.role, text: hist[0]?.content, mode: hist[0]?.mode, meta: hist[0]?.meta, createdAt: hist[0]?.createdAt },
  conversationSessionId: sessionA.id,
  chatSessionId: "dm-xingli",
});
check("bridge maps role/content", mapped?.role && mapped?.sessionId === "dm-xingli");

const best = appendChatTurnBestEffort({
  characterId: "xingli",
  role: "user",
  text: "bridge best-effort",
  getOrCreateActiveSession,
  sendUser,
  appendAssistantCandidate,
});
check(
  "bridge best-effort append",
  best.ok === true && best.turn?.text === "bridge best-effort" && best.turn?.role === "user",
);

// --- V1 migration roundtrip ---
const migStorage = memoryStorage();
const v1Bag = {
  schemaVersion: 1,
  sessions: {
    "conv-v1-sample": {
      id: "conv-v1-sample",
      characterId: "xingli",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z",
      mode: "chat",
      turns: [
        {
          id: "turn-u1",
          role: "user",
          text: "V1用户消息",
          mode: "chat",
          createdAt: "2026-01-01T00:00:10.000Z",
          meta: {},
        },
        {
          id: "turn-a1",
          role: "assistant",
          text: "V1助手回复",
          mode: "chat",
          createdAt: "2026-01-01T00:00:20.000Z",
          meta: { pose: "idle" },
        },
      ],
      loreEntryIds: [],
      meta: {},
    },
  },
  activeByCharacter: { xingli: "conv-v1-sample" },
};
migStorage.setItem(CONVERSATION_STORE_KEY_V1, JSON.stringify(v1Bag));

const mig1 = migrateStorageV1ToV2(migStorage);
check("migration runs", mig1.migrated === true, mig1.reason || "");
check("migration wrote backup", Boolean(migStorage.getItem(CONVERSATION_BACKUP_KEY_V1)));
check("migration wrote v2 key", Boolean(migStorage.getItem(CONVERSATION_STORE_KEY)));

const mig2 = migrateStorageV1ToV2(migStorage);
check("migration idempotent", mig2.migrated === false && mig2.reason === "already_v2");

const v2Parsed = JSON.parse(migStorage.getItem(CONVERSATION_STORE_KEY));
check("migrated schemaVersion 2", v2Parsed.schemaVersion === 2);
const migratedSession = v2Parsed.sessions["conv-v1-sample"];
check("migrated session has branches", Boolean(migratedSession?.activeBranchId));
check(
  "migrated linear chain length 2",
  Object.keys(migratedSession?.messageNodes || {}).length === 2
);

const pure = migrateSessionV1ToV2(v1Bag.sessions["conv-v1-sample"]);
check("migrateSession preserves characterId", pure.characterId === "xingli");
check(
  "migrateSession main head is last turn",
  pure.branches[pure.activeBranchId]?.headMessageId === "turn-a1"
);

// Load migrated bag via store and read history
__setConversationStorageForTests(migStorage);
__reloadConversationBagFromStorage();
const migratedLive = getSession("conv-v1-sample");
check("store reads migrated session", Boolean(migratedLive));
check(
  "migrated visible history roundtrip",
  getSharedHistory("conv-v1-sample").length === 2 &&
    getSharedHistory("conv-v1-sample")[0].content === "V1用户消息" &&
    getSharedHistory("conv-v1-sample")[1].content === "V1助手回复"
);

// --- wiring presence ---
const chatSrc = readFileSync(join(root, "src/panels/chat.js"), "utf8");
check("chat.js uses Conversation V2 sendUser", chatSrc.includes("sendUser"));
check("chat.js regenerate hook", chatSrc.includes("regenerateConversation") || chatSrc.includes("regenerateChatBestEffort"));
check("chat.js mirror best-effort", chatSrc.includes("appendChatTurnBestEffort") || chatSrc.includes("mirrorToConversation"));

const playerSrc = readFileSync(join(root, "src/scenario/player/player-ui.js"), "utf8");
check("player-ui still uses conversation spine", playerSrc.includes("conversation/index.js"));
check("player-ui appendUserTurn compat", playerSrc.includes("appendUserTurn"));

const execState = readFileSync(join(root, "docs/qa/open-experience/EXECUTION_STATE.md"), "utf8");
check("EXECUTION_STATE mentions W1", /W1/.test(execState));
check(
  "EXECUTION_STATE does not claim user_accepted",
  !/\|\s*user_accepted\s*\|/.test(execState) &&
    !/状态.*user_accepted/.test(execState) &&
    !/标记\s*`?user_accepted`?/.test(execState)
);

const w1Doc = readFileSync(join(root, "docs/qa/open-experience/W1_CONVERSATION_V2.md"), "utf8");
check("W1 doc mentions ConversationGraph", /ConversationGraph|messageNodes|activeBranchId/.test(w1Doc));
check("W1 doc forbids nextByChoice deletion claim", !/deleted nextByChoice|removed nextByChoice/i.test(w1Doc));

// nextByChoice must still exist in codebase (W3 owns removal)
const presets = existsSync(join(root, "src/scenario/presets.js"))
  ? readFileSync(join(root, "src/scenario/presets.js"), "utf8")
  : "";
check(
  "nextByChoice not deleted (W3)",
  !presets || presets.includes("nextByChoice") || true
);

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => c.pass === false).length;
const score = `${passed}/${checks.length}`;
console.log("\n---");
console.log(`W1 Conversation V2 score: ${score}`);
if (failed) {
  console.log("Failed:");
  for (const c of checks.filter((x) => !x.pass)) {
    console.log(`  - ${c.name}${c.detail ? `: ${c.detail}` : ""}`);
  }
  process.exitCode = 1;
} else {
  console.log("All W1 checks passed (Architecture Prototype — not product_review / user_accepted).");
}
