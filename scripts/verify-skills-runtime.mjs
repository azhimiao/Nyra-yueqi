/**
 * P3 — Skill runtime, router, prompt loader, SkillTurn atomic verify.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P3");
const fixtureDir = join(root, "docs/qa/skill-platform/fixtures/relationship-intelligence");

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

function readFixtureFiles(dir, prefix = "") {
  /** @type {Record<string, string>} */
  const files = {};
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    const rel = prefix ? `${prefix}/${name.name}` : name.name;
    if (name.isDirectory()) {
      Object.assign(files, readFixtureFiles(full, rel));
    } else {
      files[rel.replace(/\\/g, "/")] = readFileSync(full, "utf8");
    }
  }
  return files;
}

const storage = memoryStorage();
const fixtureFiles = readFixtureFiles(fixtureDir);

const conversationStore = await import("../src/conversation/store.js");
const store = await import("../src/skill-platform/store.js");
const audit = await import("../src/skill-platform/audit.js");
const profiles = await import("../src/agents/profile-store.js");
const selection = await import("../src/agents/selection.js");
const runStore = await import("../src/skill-platform/run-store.js");
const runSchema = await import("../src/skill-platform/run-schema.js");
const binding = await import("../src/skill-platform/conversation-binding.js");
const importer = await import("../src/skill-platform/importer.js");
const router = await import("../src/skill-platform/router.js");
const runtime = await import("../src/skill-platform/runtime.js");
const memoryCandidates = await import("../src/skill-platform/memory-candidates.js");
const stateMachine = await import("../src/skill-platform/state-machine.js");

conversationStore.__setConversationStorageForTests(storage);
store.__setSkillPlatformStorageForTests(storage);
audit.__setSkillAuditStorageForTests(storage);
profiles.__setAgentProfileStorageForTests(storage);
selection.__setAgentSelectionStorageForTests(storage);
runStore.__setSkillRunStorageForTests(storage);
memoryCandidates.__setMemoryCandidatesStorageForTests(storage);

runSchema.__resetSkillRunIdSeqForTests();
store.clearAllSkillPlatformData();
audit.clearSkillAuditLog();
profiles.clearAllAgentProfiles();
runStore.clearAllSkillRuns();
memoryCandidates.clearAllMemoryCandidates();
selection.clearAgentSelection();
profiles.ensureBuiltinProfiles();

const api = binding.createProductionConversationApi();
const characterId = "xingli";

importer.importSkillBundle({
  files: fixtureFiles,
  sourceLabel: "fixture:p3",
  confirm: true,
  grantedCapabilities: ["structured-notes", "calendar-draft"],
});

store.upsertCatalogEntry({
  id: "life-coach-lite",
  name: "生活梳理",
  version: "1.0.0",
  triggers: ["关系困惑", "生活整理"],
  resources: { system: ["prompts/system.md"], policies: [], schemas: [], evals: [] },
  requestedCapabilities: [],
  category: "general",
});
store.putSkillFile("life-coach-lite", "1.0.0", "prompts/system.md", "# Life coach\n");
store.upsertInstallation({
  skillId: "life-coach-lite",
  version: "1.0.0",
  enabled: true,
  grants: { capabilities: [] },
});

profiles.installAgentProfile({
  id: "dual-skills-agent",
  name: "双技能测试",
  kind: "specialist",
  skillIds: ["relationship-intelligence", "life-coach-lite"],
  enabled: true,
});

profiles.installAgentProfile({
  id: "relationship-guide",
  name: "关系探索",
  kind: "specialist",
  skillIds: ["relationship-intelligence"],
  enabled: true,
});

function validTurn(overrides = {}) {
  return {
    assistantText: "我先帮你理一理这段关系里的核心张力。",
    nextAction: "REFLECT",
    statePatch: { questionEndingStreak: 0 },
    memoryCandidates: [
      {
        text: "用户确认：冷处理会明显降低其安全感。",
        target: "personal",
        evidenceMessageIds: ["msg_user_1"],
      },
    ],
    taskProposals: [],
    ...overrides,
  };
}

// Case 1: no matching installed skill → ordinary path
{
  const route = router.routeSkillInvocation({
    userText: "今天天气不错",
    characterId,
  });
  const envelope = route.kind === "execute"
    ? await runtime.buildHostEnvelope({ runId: "missing" })
    : null;
  record(
    "case1_no_match_ordinary",
    "No matching installed skill → ordinary path; no skill resources in trace",
    route.kind === "ordinary" &&
      route.trace?.skillResources === false &&
      !envelope?.trace?.skillResourcesLoaded,
    route.reason,
  );
}

// Case 2: explicit agent selection loads skill resources once
{
  selection.selectAgent("relationship-guide");
  const route = router.routeSkillInvocation({
    userText: "随便聊聊",
    characterId,
    explicitAgentSelection: true,
  });
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
    },
    { conversationApi: api },
  );
  const envelope = await runtime.buildHostEnvelope({
    runId: run.value.id,
    userText: "我想理一理关系",
    nextAction: "REFLECT",
  });
  record(
    "case2_explicit_agent_resources",
    "User explicitly selects agent → bound skill resources loaded once",
    route.kind === "execute" &&
      route.skillId === "relationship-intelligence" &&
      envelope.ok &&
      envelope.trace.skillResourcesLoaded &&
      envelope.value.resources.system.length > 0 &&
      envelope.value.resources.trace.skippedEvalCount >= 0 &&
      envelope.value.resources.trace.includedSkillMd === false,
    `loaded=${envelope.value?.resources?.trace?.loadedPaths?.length}`,
  );
}

// Case 3: two matching skills → suggestions, no auto execute
{
  const route = router.routeSkillInvocation({
    userText: "我有关系困惑，怎么办",
    characterId,
    explicitAgentId: "dual-skills-agent",
  });
  record(
    "case3_two_matches_suggestions",
    "Two matching skills → 1–3 suggestions; no auto execute",
    route.kind === "suggestions" &&
      Array.isArray(route.suggestions) &&
      route.suggestions.length >= 2 &&
      route.suggestions.length <= 3,
    `suggestions=${route.suggestions?.length}`,
  );
}

// Case 4: valid SkillTurn → revision++, assistant message, pending candidates
{
  runStore.clearAllSkillRuns();
  memoryCandidates.clearAllMemoryCandidates();
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
      grantedCapabilities: ["structured-notes", "calendar-draft"],
    },
    { conversationApi: api },
  );
  const beforeRev = run.value.stateRevision;
  const result = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: validTurn(),
    deps: { conversationApi: api },
  });
  const after = runStore.getSkillRun(run.value.id);
  const pending = memoryCandidates.countPendingCandidates(run.value.id);
  record(
    "case4_valid_turn_commit",
    "Valid SkillTurn → state revision++, assistant stored, candidates pending",
    result.ok &&
      after.stateRevision === beforeRev + 1 &&
      pending === 1 &&
      after.meta?.hostState?.questionEndingStreak === 0,
    `rev ${beforeRev}->${after.stateRevision} pending=${pending}`,
  );
}

// Case 5: invalid JSON → zero commits
{
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
    },
    { conversationApi: api },
  );
  const beforeRev = run.value.stateRevision;
  const beforePending = memoryCandidates.countPendingCandidates(run.value.id);
  const bad = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: "{ not json",
    deps: { conversationApi: api },
  });
  const after = runStore.getSkillRun(run.value.id);
  record(
    "case5_invalid_json_zero_commit",
    "Invalid JSON → 0 state, 0 memory, 0 tasks",
    !bad.ok &&
      bad.reason === "invalid_json" &&
      after.stateRevision === beforeRev &&
      memoryCandidates.countPendingCandidates(run.value.id) === beforePending,
    bad.reason,
  );
}

// Case 6: illegal state patch / unknown nextAction → zero commits
{
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
    },
    { conversationApi: api },
  );
  const rev = run.value.stateRevision;
  const badAction = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: validTurn({ nextAction: "NOT_A_REAL_ACTION" }),
    deps: { conversationApi: api },
  });
  const badPatch = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: validTurn({ statePatch: { hackerField: true } }),
    deps: { conversationApi: api },
  });
  const after = runStore.getSkillRun(run.value.id);
  record(
    "case6_illegal_patch_or_action",
    "Illegal state patch / unknown nextAction → 0 commits",
    !badAction.ok &&
      badAction.reason === "unknown_next_action" &&
      !badPatch.ok &&
      badPatch.reason === "illegal_state_patch_key" &&
      after.stateRevision === rev,
    `${badAction.reason}/${badPatch.reason}`,
  );
}

// Case 7: over-privileged capability → filtered, no task
{
  const { clearAllAgentTasks, listTasks } = await import("../src/agent/task-store.js");
  const { __setAgentStorageForTests } = await import("../src/agent/task-store.js");
  __setAgentStorageForTests(storage);
  clearAllAgentTasks();

  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
      grantedCapabilities: ["structured-notes"],
    },
    { conversationApi: api },
  );
  const beforeTasks = listTasks().length;
  const result = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: validTurn({
      memoryCandidates: [],
      taskProposals: [
        {
          capabilityId: "calendar-crud",
          title: "非法日历写入",
          input: { title: "x" },
        },
        {
          capabilityId: "structured-notes",
          title: "保存关系探索地图",
          input: { text: "关系探索要点\n- 冷处理降低安全感" },
        },
      ],
    }),
    deps: { conversationApi: api },
  });
  const tasks = listTasks();
  record(
    "case7_over_privileged_capability",
    "Over-privileged capabilityId filtered; granted task may proceed",
    result.ok &&
      result.value.rejectedTaskProposals.length === 1 &&
      result.value.tasks.length === 1 &&
      tasks.length === beforeTasks + 1 &&
      tasks.some((t) => t.intent?.capabilityId === "structured-notes"),
    `rejected=${result.value?.rejectedTaskProposals?.length} tasks=${tasks.length}`,
  );
}

// Case 8: pause/resume revision continuous; stale response cannot overwrite
{
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
    },
    { conversationApi: api },
  );
  const paused = runStore.pauseSkillRun(run.value.id, { expectedRevision: run.value.stateRevision });
  const resumed = runStore.resumeSkillRun(paused.value.id, { expectedRevision: paused.value.stateRevision });
  const stale = runtime.commitSkillTurn({
    runId: run.value.id,
    expectedRevision: run.value.stateRevision,
    modelResponseJson: validTurn({ assistantText: "旧包不应生效" }),
    deps: { conversationApi: api },
  });
  const good = runtime.commitSkillTurn({
    runId: run.value.id,
    expectedRevision: resumed.value.stateRevision,
    modelResponseJson: validTurn({ assistantText: "恢复后正常提交" }),
    deps: { conversationApi: api },
  });
  record(
    "case8_pause_resume_cas",
    "Pause/resume keeps revision continuous; stale revision rejected",
    paused.ok &&
      resumed.ok &&
      !stale.ok &&
      stale.reason === "revision_conflict" &&
      good.ok,
    `stale=${stale.reason} resumedRev=${resumed.value.stateRevision}`,
  );
}

// Module exports
record(
  "module_relationship_actions",
  "RELATIONSHIP_ACTIONS exported for P5",
  Array.isArray(stateMachine.RELATIONSHIP_ACTIONS) &&
    stateMachine.RELATIONSHIP_ACTIONS.includes("FORMULATE"),
);

const requiredModules = [
  "src/skill-platform/prompt-loader.js",
  "src/skill-platform/turn-parser.js",
  "src/skill-platform/state-machine.js",
  "src/skill-platform/router.js",
  "src/skill-platform/runtime.js",
  "src/skill-platform/memory-candidates.js",
];
for (const rel of requiredModules) {
  record(`module_${rel}`, `Module exists ${rel}`, existsSync(join(root, rel)));
}

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "P3",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  command: "npm run verify:skills:runtime",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "VERIFY_RUNTIME.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const review = `# P3 Verify — Skill Runtime, Router, SkillTurn

> Generated: ${payload.generatedAt}  
> Status: **${allPass ? "PASS" : "FAIL"}** (${payload.summary.passed}/${payload.summary.total})

## Scope

Plan \`docs/SKILL_AGENT_EXPLORATION_PLATFORM_PLAN.md\` §P3 / §5 — Host envelope, router, SkillTurn atomic commit. No explore UI.

## Modules

| Module | Role |
|--------|------|
| \`src/skill-platform/prompt-loader.js\` | Minimal skill resources by nextAction/entry |
| \`src/skill-platform/turn-parser.js\` | Parse/validate SkillTurn JSON |
| \`src/skill-platform/state-machine.js\` | CAS host state + action whitelist |
| \`src/skill-platform/router.js\` | Agent→skills routing + suggestions |
| \`src/skill-platform/runtime.js\` | buildHostEnvelope + commitSkillTurn |
| \`src/skill-platform/memory-candidates.js\` | Pending memory store keyed by run |

## Cases

${cases.map((c) => `- **${c.id}** (${c.pass ? "PASS" : "FAIL"}): ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}

## Command

\`\`\`bash
npm run verify:skills:runtime
\`\`\`
`;

writeFileSync(join(outDir, "REVIEW.md"), review, "utf8");

console.log(`\nWrote ${join(outDir, "VERIFY_RUNTIME.json")}`);
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);
