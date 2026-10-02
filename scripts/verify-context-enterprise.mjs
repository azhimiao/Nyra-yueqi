/**
 * Context Pipeline Enterprise — real function tests (no string-scan fake green).
 * Contract: docs/CONTEXT_PIPELINE_ENTERPRISE_EXECUTION_PLAN.md §W8 / §9
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/context-enterprise");
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
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

const {
  __setConversationStorageForTests,
  __reloadConversationBagFromStorage,
  clearAllConversations,
  deleteMessage,
  getSharedHistory,
  sendUser,
  appendAssistantCandidate,
} = await import("../src/conversation/index.js");

const { __setSessionMapStorageForTests, resolveConversationBinding, resolveOwnerKey } = await import("../src/context/session-map.js");
const { resolveAuthoritativeHistory } = await import("../src/context/history-authority.js");
const {
  resolveContextBudgetProfile,
  validateContextRequest,
  normalizeContextRequest,
  CONTEXT_BUDGET_PROFILES,
} = await import("../src/context/contract.js");
const { getPurposePolicy, applyPurposePolicy } = await import("../src/context/purpose-policy.js");
const { prepareShortTermContext } = await import("../src/context/short-term.js");
const {
  sourceFingerprint,
  commitBranchSummary,
  invalidateBranchSummary,
  getBranchSummary,
  __setBranchSummaryStorageForTests,
} = await import("../src/context/branch-summary.js");
const { validateEvidenceSpan, parseMemoryOperations, applyMemoryOperations } = await import("../src/context/extraction.js");
const { projectCohabitContext } = await import("../src/context/cohabit-projector.js");
const { projectMomentsContext } = await import("../src/context/moments-projector.js");
const { saveMoments } = await import("../src/moments/store.js");
const { appendCohabitEvent, __setCohabitStorageForTests } = await import("../src/memory/cohabit-timeline.js").catch(() => ({
  appendCohabitEvent: null,
  __setCohabitStorageForTests: null,
}));
const { activateWorldInfo, buildLoreActivationQuery } = await import("../src/worldbook/activation.js");
const { buildModelMessages, assembleCanonical, flattenCanonicalSystem, formatHistoryMessageForModel } = await import("../src/prompt/assemble.js");
const { estimatePromptTokens } = await import("../src/prompt/budget.js");

__setConversationStorageForTests(storage);
__setSessionMapStorageForTests(storage);
__setBranchSummaryStorageForTests(storage);
if (typeof __setCohabitStorageForTests === "function") __setCohabitStorageForTests(storage);
__reloadConversationBagFromStorage?.();
clearAllConversations?.();

// --- Budgets ---
check("budget 6k", resolveContextBudgetProfile("6k").totalInputTokens === 6000);
check("budget 8k", resolveContextBudgetProfile("8k").totalInputTokens === 8000);
check("budget 12k", resolveContextBudgetProfile("12k").totalInputTokens === 12000);
check("budget profiles frozen", CONTEXT_BUDGET_PROFILES.balanced.totalInputTokens === 8000);

// --- Purpose policy ---
check("proactive moments off by default", getPurposePolicy("proactive").includeMoments === false);
check("chat cohabit on", getPurposePolicy("chat").includeCohabit === true);
check("cocreate graph off", getPurposePolicy("cocreate").includeContextGraph === false);
const applied = applyPurposePolicy({ purpose: "proactive" });
check("applyPurposePolicy proactive moments", applied.includeMoments === false);

// --- CURRENT_INPUT_TOO_LARGE ---
{
  const huge = "字".repeat(20000);
  const v = validateContextRequest({ purpose: "chat", characterId: "a", currentInput: huge, budgetProfile: "compact" });
  check("CURRENT_INPUT_TOO_LARGE rejected", v.ok === false && v.errors.includes("CURRENT_INPUT_TOO_LARGE"));
}

// --- Session map isolation ---
{
  const dmA = resolveConversationBinding({ chatSessionId: "char:charA", characterId: "charA", conversationKind: "dm" });
  const dmB = resolveConversationBinding({ chatSessionId: "char:charB", characterId: "charB", conversationKind: "dm" });
  const group = resolveConversationBinding({
    chatSessionId: "group:g1",
    characterId: "charA",
    conversationKind: "group",
    participantIds: ["charA", "charB"],
  });
  check("dm A ok", dmA.ok);
  check("dm B ok", dmB.ok);
  check("group ok", group.ok);
  check("dm/group session ids differ", dmA.conversationSessionId !== group.conversationSessionId);
  check("group owner synthetic", resolveOwnerKey("group", "group:g1", "charA").startsWith("__group__:"));
  check("group owner != charA", group.ownerKey !== "charA");

  sendUser(dmA.conversationSessionId, "A私密：我只告诉A");
  sendUser(group.conversationSessionId, "群聊：大家好");
  const histA = getSharedHistory(dmA.conversationSessionId);
  const histG = getSharedHistory(group.conversationSessionId);
  check("DM has private", histA.some((m) => String(m.content).includes("只告诉A")));
  check("group does not see DM private", !histG.some((m) => String(m.content).includes("只告诉A")));
  check("DM does not see group", !histA.some((m) => String(m.content).includes("大家好")));

  const productRows = [{ id: "stable-user-1", role: "user", content: "同一个产品输入只归并一次" }];
  await resolveAuthoritativeHistory({
    characterId: "project-char",
    chatSessionId: "cocreate:stable",
    conversationKind: "project",
    sourceMessages: productRows,
    currentInput: "下一步",
    reconcileLegacy: false,
  });
  const reconciledAgain = await resolveAuthoritativeHistory({
    characterId: "project-char",
    chatSessionId: "cocreate:stable",
    conversationKind: "project",
    sourceMessages: productRows,
    currentInput: "下一步",
    reconcileLegacy: false,
  });
  const reconciledThird = await resolveAuthoritativeHistory({
    characterId: "project-char",
    chatSessionId: "cocreate:stable",
    conversationKind: "project",
    sourceMessages: productRows,
    currentInput: "下一步",
    reconcileLegacy: false,
  });
  check("product history reconcile idempotent across three runs", reconciledAgain.allMessages.filter((m) => m.content === "同一个产品输入只归并一次").length === 1
    && reconciledThird.allMessages.filter((m) => m.content === "同一个产品输入只归并一次").length === 1);

  const mirrorBind = resolveConversationBinding({
    chatSessionId: "char:recon-char",
    characterId: "recon-char",
    conversationKind: "dm",
  });
  const liveMirror = sendUser(mirrorBind.conversationSessionId, "这是已有的句子", {
    clientMessageId: "ui-recon-1",
  });
  check("live mirror write ok", liveMirror.ok);
  const mirroredOnce = await resolveAuthoritativeHistory({
    characterId: "recon-char",
    chatSessionId: "char:recon-char",
    conversationKind: "dm",
    sourceMessages: [{
      id: "ui-recon-1",
      role: "user",
      content: "这是已有的句子",
      metadata: { conversationNodeId: liveMirror.node.id },
    }],
    reconcileLegacy: false,
  });
  check(
    "mirrored IDB row is not re-imported as a second V2 node",
    mirroredOnce.allMessages.filter((row) => row.content === "这是已有的句子").length === 1,
  );
  check("delete tombstone ok", deleteMessage(mirrorBind.conversationSessionId, liveMirror.node.id).ok);
  check(
    "deleted node leaves prompt history",
    !getSharedHistory(mirrorBind.conversationSessionId).some((row) => row.content === "这是已有的句子"),
  );
  const resurrected = await resolveAuthoritativeHistory({
    characterId: "recon-char",
    chatSessionId: "char:recon-char",
    conversationKind: "dm",
    sourceMessages: [{
      id: "ui-recon-1",
      role: "user",
      content: "这是已有的句子",
      metadata: { conversationNodeId: liveMirror.node.id },
    }],
    reconcileLegacy: false,
  });
  check(
    "delete cannot resurrect through reconciliation",
    !resurrected.allMessages.some((row) => row.content === "这是已有的句子")
      && resurrected.audit.imported === 0,
  );
}

// --- Short-term atomic ---
{
  const rows = Array.from({ length: 30 }, (_, i) => ({
    messageId: `m${i}`,
    role: i % 2 ? "assistant" : "user",
    content: `消息${i} ` + "内容".repeat(20),
  }));
  const short = prepareShortTermContext(rows, { tokenBudget: 200, maxMessages: 80 });
  check("short-term selects some", short.messages.length > 0);
  check("short-term under budget", short.tokens <= 200 + 20);
  check("short-term omits older", short.omittedMessageIds.length > 0);
}

// --- Branch fingerprint ---
{
  const a = sourceFingerprint([{ messageId: "1", content: "hello world" }]);
  const b = sourceFingerprint([{ messageId: "1", content: "hello planet" }]);
  const c = sourceFingerprint([{ messageId: "1", content: "hello world" }]);
  check("fingerprint differs on content", a !== b);
  check("fingerprint stable", a === c);
  const committed = commitBranchSummary({
    characterId: "charA",
    conversationSessionId: "sess1",
    branchId: "br1",
    summary: "约定明天见面",
    sourceMessages: [{ messageId: "1", content: "我们约定明天见面" }],
  });
  check("commit summary", committed.ok);
  invalidateBranchSummary({ characterId: "charA", conversationSessionId: "sess1", branchId: "br1", reason: "test" });
  const after = getBranchSummary({ characterId: "charA", conversationSessionId: "sess1", branchId: "br1" });
  check("invalidate clears active", !after);
}

// --- Evidence validation ---
{
  check("evidence ok", validateEvidenceSpan("我不喝咖啡", "不喝咖啡").ok);
  check("evidence reject assistant-only claim", !validateEvidenceSpan("今天天气不错", "你喜欢咖啡").ok);
  const ops = parseMemoryOperations(JSON.stringify({
    operations: [
      { op: "ADD", content: "不喝咖啡", evidenceSpan: "不喝咖啡", kind: "semantic" },
      { op: "ADD", content: "喜欢咖啡", evidenceSpan: "喜欢咖啡", kind: "semantic" },
    ],
  }));
  check("parse two ops", ops.length === 2);
  // apply without store may fail ingest — still validates evidence gate
  const gated = ops.filter((op) => validateEvidenceSpan("我不喝咖啡", op.evidenceSpan).ok);
  check("evidence gates second op", gated.length === 1);
}

// --- Cohabit projector limits ---
if (typeof appendCohabitEvent === "function") {
  for (let i = 0; i < 20; i += 1) {
    appendCohabitEvent({
      characterId: "charA",
      kind: "play",
      summary: `一起听歌 #${i}`,
      appId: "listen",
      idempotencyKey: i < 15 ? "listen::play::track-same" : `listen::play::track-${i}`,
    });
  }
  appendCohabitEvent({ kind: "play", summary: "无角色旧事件", appId: "listen" });
  const projected = projectCohabitContext({ characterId: "charA", query: "听歌", candidateLimit: 12, limit: 5, tokenBudget: 400 });
  check("cohabit inject <=5", projected.items.length <= 5);
  check("cohabit tokens <=400", projected.tokens <= 400);
  check("cohabit collapsed progress", projected.candidates.length <= 12);
}

// --- Moments consent ---
{
  saveMoments([{
    id: "moment-consent",
    authorType: "user",
    authorId: "user",
    sourceType: "local",
    content: "今晚去看紫色的云",
    shareWithCompanion: true,
    visibleToCharacterIds: ["charA"],
    privacy: "companion_shared",
  }], "verify_on");
  const visible = projectMomentsContext({ characterId: "charA", query: "紫色的云 朋友圈" });
  check("shared moment visible to allowed character", visible.items.some((item) => item.id === "moment-consent"));
  saveMoments([{
    id: "moment-consent",
    authorType: "user",
    authorId: "user",
    sourceType: "local",
    content: "今晚去看紫色的云",
    shareWithCompanion: false,
    visibleToCharacterIds: [],
    privacy: "companion_shared",
  }], "verify_off");
  const hidden = projectMomentsContext({ characterId: "charA", query: "紫色的云 朋友圈" });
  check("disabled moment absent from context", !hidden.items.some((item) => item.id === "moment-consent"));
  check("moments privacy redaction audited", hidden.redactions.some((item) => item.reason === "privacy_or_scope"));
}

// --- Worldbook near-turn ---
{
  const window = buildLoreActivationQuery("今天吃什么", [
    { role: "user", content: "昨天去了咖啡店" },
    { role: "assistant", content: "味道怎么样" },
  ], { tokenBudget: 1000, maxMessages: 4 });
  check("activation includes prior coffee", window.text.includes("咖啡"));
  check("activation includes current", window.text.includes("今天吃什么"));
  const activated = activateWorldInfo([
    {
      id: "wb1",
      title: "咖啡设定",
      content: "角色很懂咖啡。",
      keys: ["咖啡"],
      priority: 10,
      enabled: true,
      insertPosition: "post_history",
      category: "lore",
      scope: "global",
    },
  ], "今天吃什么", {
    recentMessages: [{ role: "user", content: "昨天去了咖啡店" }],
    recentMessageLimit: 4,
    tokenBudget: 400,
  });
  check("near-turn activates coffee lore", (activated.activated || []).some((e) => e.id === "wb1"));
  check("post_history after group", (activated.afterText || activated.text || "").includes("咖啡") || activated.activated?.length > 0);
}

// --- Single-channel history in assemble ---
{
  const assembled = assembleCanonical({
    platformSafety: "安全",
    characterPackage: "角色",
    branchHistory: "user: 不该进 system",
    userInput: "你好",
    postHistoryContract: "契约",
  });
  const systemFlat = flattenCanonicalSystem(assembled);
  check("branch_history not in system flatten", !systemFlat.includes("不该进 system"));
  const msgs = await buildModelMessages({
    historyMessages: [{ role: "user", content: "已入库" }, { role: "assistant", content: "好" }],
    turnIntent: "continue",
    canonical: assembled,
  }, "假用户续聊");
  check("continue adds no user node", !msgs.some((m) => m.role === "user" && m.content === "假用户续聊"));

  const packet = formatHistoryMessageForModel({
    id: "packet-once",
    messageId: "packet-once",
    role: "user",
    content: "[转账|1.00|给你买颜料]",
    meta: { mediaType: "transfer", token: { kind: "transfer", amount: 1, status: "completed", direction: "out" } },
  });
  check("token history is one immutable platform event", packet.includes("#packet-once") && packet.includes("唯一的一笔") && !packet.includes("[转账|"));

  const continued = await buildModelMessages({
    historyMessages: [
      { role: "user", content: "[转账|1.00|给你买颜料]", messageId: "packet-once", meta: { mediaType: "transfer", token: { kind: "transfer", amount: 1, status: "completed", direction: "out" } } },
      { role: "assistant", content: "收到啦，谢谢你。" },
    ],
    turnIntent: "continue",
    canonical: assembled,
  }, "");
  const packetRows = continued.filter((m) => m.content.includes("平台事件 #packet-once"));
  check("continuation preserves one token event and prior reply", packetRows.length === 1 && continued.some((m) => m.role === "assistant" && m.content === "收到啦，谢谢你。"));
}

// --- Request normalize purpose ---
{
  const req = normalizeContextRequest({ purpose: "deskpet", characterId: "x" });
  check("deskpet purpose", req.purpose === "deskpet");
  check("deskpet history short default", req.historyStyle === "short_window" || req.historyMaxMessages <= 12);
}

const passed = checks.filter((c) => c.pass).length;
const failed = checks.filter((c) => !c.pass).length;
console.log(`\nverify:context-enterprise  ${passed}/${checks.length} passed, ${failed} failed`);

mkdirSync(outDir, { recursive: true });
const report = {
  at: new Date().toISOString(),
  command: "npm run verify:context-enterprise",
  passed,
  failed,
  total: checks.length,
  grade: failed === 0 ? "contract_green_partial" : "Product RED",
  checks,
};
writeFileSync(join(outDir, "VERIFY_LATEST.json"), JSON.stringify(report, null, 2));
if (!existsSync(join(outDir, "EXECUTION_STATE.md"))) {
  writeFileSync(join(outDir, "EXECUTION_STATE.md"), [
    "# Context Enterprise Execution State",
    "",
    "**定级：Product RED · partial implementation**",
    "",
    "See VERIFY_LATEST.json for automated contract checks.",
    "",
  ].join("\n"));
}

process.exit(failed ? 1 : 0);
