/**
 * P2 — Skill scopes, conversation binding, agent selection verify.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P2");

/** @type {{ id: string, name: string, pass: boolean, detail: string }[]} */
const cases = [];

function record(id, name, pass, detail = "") {
  cases.push({ id, name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id} — ${name}${detail ? ` — ${detail}` : ""}`);
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
  };
}

const storage = memoryStorage();

const conversationStore = await import("../src/conversation/store.js");
const conversationRuntime = await import("../src/conversation/runtime.js");
const runStore = await import("../src/skill-platform/run-store.js");
const scopes = await import("../src/skill-platform/scopes.js");
const binding = await import("../src/skill-platform/conversation-binding.js");
const contextRequest = await import("../src/skill-platform/context-request.js");
const profiles = await import("../src/agents/profile-store.js");
const selection = await import("../src/agents/selection.js");
const runSchema = await import("../src/skill-platform/run-schema.js");

conversationStore.__setConversationStorageForTests(storage);
runStore.__setSkillRunStorageForTests(storage);
profiles.__setAgentProfileStorageForTests(storage);
selection.__setAgentSelectionStorageForTests(storage);

runSchema.__resetSkillRunIdSeqForTests();
runStore.clearAllSkillRuns();
profiles.clearAllAgentProfiles();
selection.clearAgentSelection();
profiles.ensureBuiltinProfiles();

const api = binding.createProductionConversationApi();
const characterId = "xingli";
const skillId = "relationship-intelligence";

profiles.installAgentProfile({
  id: "relationship-guide",
  name: "关系探索",
  tagline: "关系梳理",
  icon: "compass-heart",
  kind: "specialist",
  skillIds: [skillId],
  defaultRunMode: "isolated_new",
  defaultScopes: { ...scopes.defaultScopesForMode("isolated_new") },
  enabled: true,
});

// Case 1: isolated_new creates distinct conversationSessionId
{
  const runA = runStore.createSkillRunRecord(
    { skillId, agentId: "relationship-guide", characterId, mode: "isolated_new", title: "关系探索" },
    { conversationApi: api },
  );
  const runB = runStore.createSkillRunRecord(
    { skillId, agentId: "relationship-guide", characterId, mode: "isolated_new", title: "关系探索" },
    { conversationApi: api },
  );
  const idA = runA.value?.conversation?.conversationSessionId;
  const idB = runB.value?.conversation?.conversationSessionId;
  record(
    "case1_isolated_new",
    "isolated_new creates distinct conversationSessionId",
    runA.ok &&
      runB.ok &&
      idA &&
      idB &&
      idA !== idB &&
      String(idA).includes("skill"),
    idA && idB ? `${idA} vs ${idB}` : runA.reason || runB.reason,
  );
}

// Case 2: snapshot_copy freezes IDs/hashes; source append does not change snapshot
{
  conversationStore.__resetSkillRunIdSeqForTests?.();
  const source = api.ensureSession({ characterId, meta: { purpose: "pop" } });
  const sourceId = source.value.id;
  api.sendUser(sourceId, "背景消息一");
  api.sendUser(sourceId, "背景消息二");

  const snapRun = runStore.createSkillRunRecord(
    {
      skillId,
      agentId: "relationship-guide",
      characterId,
      mode: "snapshot_copy",
      sourceConversationSessionId: sourceId,
    },
    { conversationApi: api },
  );

  api.sendUser(sourceId, "启动后不应出现在快照里");

  const snapshot = snapRun.value?.conversation?.sourceSnapshotId;
  const frozen = binding.resolveSnapshotForPrompt(api, snapshot);
  const frozenTexts = frozen.map((r) => r.content || r.text);
  const liveHistory = api.selectVisibleHistory(api.getSession(sourceId)).map((r) => r.content);

  record(
    "case2_snapshot_copy",
    "snapshot_copy freezes message IDs/hashes; later source messages excluded",
    snapRun.ok &&
      snapshot?.messages?.length === 2 &&
      frozen.length === 2 &&
      frozenTexts.includes("背景消息一") &&
      frozenTexts.includes("背景消息二") &&
      !frozenTexts.includes("启动后不应出现在快照里") &&
      liveHistory.includes("启动后不应出现在快照里"),
    `frozen=${frozen.length} live=${liveHistory.length}`,
  );
}

// Case 3: shared_live reuses session; skill meta; user messages not duplicated
{
  const pop = api.getOrCreateActiveSession({ characterId });
  const beforeUsers = binding.countUserMessageNodes(api, pop.id);
  api.sendUser(pop.id, "用户原话");

  const sharedRun = runStore.createSkillRunRecord(
    {
      skillId,
      agentId: "relationship-guide",
      characterId,
      mode: "shared_live",
      sourceConversationSessionId: pop.id,
    },
    { conversationApi: api },
  );

  const sessionId = sharedRun.value?.conversation?.conversationSessionId;
  const skillReply = binding.appendSkillAssistantMessage(sharedRun.value, "Skill 分析", api);
  const afterUsers = binding.countUserMessageNodes(api, pop.id);
  const session = api.getSession(sessionId);
  const skillNodes = Object.values(session.messageNodes || {}).filter((n) => {
    const cand = n.candidates?.find((c) => c.id === n.activeCandidateId);
    const meta = { ...(n.meta || {}), ...(cand?.meta || {}) };
    return meta.origin === "skill" && meta.skillId === skillId && meta.skillRunId === sharedRun.value.id;
  });

  record(
    "case3_shared_live",
    "shared_live reuses session; skill meta tagged; user nodes not duplicated",
    sharedRun.ok &&
      sessionId === pop.id &&
      skillReply.ok &&
      skillNodes.length >= 1 &&
      afterUsers === beforeUsers + 1,
    `session=${sessionId} skillNodes=${skillNodes.length} users=${afterUsers}`,
  );
}

// Case 4: memoryRead none → no global/character memory request
{
  const run = runStore.createSkillRunRecord(
    {
      skillId,
      agentId: "qiji-assistant",
      characterId,
      mode: "isolated_new",
      scopes: scopes.defaultScopesForMode("isolated_new"),
    },
    { conversationApi: api },
  );
  const req = contextRequest.buildContextRequestFromSkillRun(run.value);
  record(
    "case4_memory_read_none",
    "memoryRead none omits global/character memory blocks from context helper",
    run.ok &&
      req.includeContextGraph === false &&
      req.includeCohabit === false &&
      req.skillPlatform.memoryBlockRequests.length === 0 &&
      contextRequest.requestsMemoryBlocks(req) === false,
    `blocks=${JSON.stringify(req.skillPlatform.memoryBlockRequests)}`,
  );
}

// Case 5: characterVisibility private → shouldExposeSkillToCharacter false
{
  const privateScopes = scopes.normalizeScopes({
    ...scopes.defaultScopesForMode("isolated_new"),
    characterVisibility: "private",
    memoryWrite: "propose_character",
  });
  record(
    "case5_character_private",
    "characterVisibility private blocks lover prompt exposure (independent of memoryWrite)",
    scopes.shouldExposeSkillToCharacter(privateScopes) === false &&
      privateScopes.memoryWrite === "propose_character",
    `memoryWrite=${privateScopes.memoryWrite}`,
  );
}

// Case 6: Agent switch preserves both SkillRuns
{
  runStore.clearAllSkillRuns();
  const guideRun = runStore.createSkillRunRecord(
    { skillId, agentId: "relationship-guide", characterId, mode: "isolated_new" },
    { conversationApi: api },
  );
  const qijiRun = runStore.createSkillRunRecord(
    { skillId: "general-chat", agentId: "qiji-assistant", characterId, mode: "isolated_new", skillVersion: "1.0.0" },
    { conversationApi: api, bindConversation: true },
  );

  selection.selectAgent("relationship-guide");
  const activeGuide = selection.getActiveAgent();
  selection.selectAgent("qiji-assistant");
  const activeQiji = selection.getActiveAgent();

  const guideRuns = selection.listAgentSkillRuns("relationship-guide");
  const qijiRuns = selection.listAgentSkillRuns("qiji-assistant");

  record(
    "case6_agent_switch",
    "select relationship-guide then qiji-assistant; both runs remain; active agent changes",
    guideRun.ok &&
      qijiRun.ok &&
      activeGuide?.id === "relationship-guide" &&
      activeQiji?.id === "qiji-assistant" &&
      guideRuns.some((r) => r.id === guideRun.value.id) &&
      qijiRuns.some((r) => r.id === qijiRun.value.id),
    `guideRuns=${guideRuns.length} qijiRuns=${qijiRuns.length}`,
  );
}

// Case 7: Negative — invalid scope combo rejected
{
  const invalid = runStore.createSkillRunRecord(
    {
      skillId,
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
      scopes: {
        conversationRead: "shared_live",
        memoryRead: "none",
        characterVisibility: "private",
        memoryWrite: "off",
      },
    },
    { conversationApi: api },
  );
  const scopeOnly = scopes.validateScopes(
    {
      conversationRead: "shared_live",
      memoryRead: "none",
      characterVisibility: "private",
      memoryWrite: "off",
    },
    { mode: "isolated_new", characterId },
  );
  record(
    "case7_invalid_scopes",
    "invalid scope combo rejected",
    !invalid.ok &&
      invalid.reason?.includes("conversationRead") &&
      scopeOnly.ok === false,
    invalid.reason || scopeOnly.reason,
  );
}

// CAS / pause / resume smoke
{
  const run = runStore.createSkillRunRecord(
    { skillId, agentId: "relationship-guide", characterId, mode: "isolated_new" },
    { conversationApi: api },
  );
  const paused = runStore.pauseSkillRun(run.value.id, { expectedRevision: run.value.stateRevision });
  const resumed = runStore.resumeSkillRun(paused.value.id, { expectedRevision: paused.value.stateRevision });
  const conflict = runStore.updateSkillRun(run.value.id, { meta: { test: true } }, { expectedRevision: 0 });
  record(
    "case8_run_lifecycle",
    "pause/resume bumps revision; stale CAS rejected",
    run.ok &&
      paused.ok &&
      paused.value.status === "paused" &&
      resumed.ok &&
      resumed.value.status === "active" &&
      conflict.reason === "revision_conflict",
    `revision=${resumed.value.stateRevision}`,
  );
}

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "P2",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "VERIFY_SCOPES.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const review = `# P2 Verify — Scopes, SkillRun, Conversation Binding

> Generated: ${payload.generatedAt}  
> Status: **${allPass ? "PASS" : "FAIL"}** (${payload.summary.passed}/${payload.summary.total})

## Scope

Plan \`docs/SKILL_AGENT_EXPLORATION_PLATFORM_PLAN.md\` §P2 / §2 — three conversation modes and four independent authorizations (data model + binding + verify). No explore UI.

## Modules

| Module | Role |
|--------|------|
| \`src/skill-platform/scopes.js\` | Four scope keys, normalize/validate, plain-language summary |
| \`src/skill-platform/run-schema.js\` | SkillRun shape |
| \`src/skill-platform/run-store.js\` | Persist \`yueqi.skills.runs.v1\`, CAS revision |
| \`src/skill-platform/conversation-binding.js\` | isolated_new / snapshot_copy / shared_live |
| \`src/skill-platform/context-request.js\` | ContextRequest helper from run scopes |
| \`src/agents/selection.js\` | Active agent + resolveAgentSkills |

## Cases

${cases.map((c) => `- **${c.id}** (${c.pass ? "PASS" : "FAIL"}): ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}

## Command

\`\`\`bash
npm run verify:skills:scopes
\`\`\`
`;

writeFileSync(join(outDir, "REVIEW.md"), review, "utf8");

console.log(`\nWrote ${join(outDir, "VERIFY_SCOPES.json")}`);
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);
