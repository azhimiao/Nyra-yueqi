/**
 * P5 — Relationship Intelligence adapter verify.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P5");
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
const runStore = await import("../src/skill-platform/run-store.js");
const binding = await import("../src/skill-platform/conversation-binding.js");
const importer = await import("../src/skill-platform/importer.js");
const runtime = await import("../src/skill-platform/runtime.js");
const memoryCandidates = await import("../src/skill-platform/memory-candidates.js");
const adapter = await import("../src/skill-platform/adapters/relationship-intelligence.js");
const explorationMap = await import("../src/skill-platform/ui/exploration-map.js");

conversationStore.__setConversationStorageForTests(storage);
store.__setSkillPlatformStorageForTests(storage);
audit.__setSkillAuditStorageForTests(storage);
profiles.__setAgentProfileStorageForTests(storage);
runStore.__setSkillRunStorageForTests(storage);
memoryCandidates.__setMemoryCandidatesStorageForTests(storage);

store.clearAllSkillPlatformData();
audit.clearSkillAuditLog();
profiles.clearAllAgentProfiles();
runStore.clearAllSkillRuns();
memoryCandidates.clearAllMemoryCandidates();
profiles.ensureBuiltinProfiles();

const api = binding.createProductionConversationApi();
const characterId = "xingli";

importer.importSkillBundle({
  files: fixtureFiles,
  sourceLabel: "fixture:p5",
  confirm: true,
  grantedCapabilities: ["structured-notes", "calendar-draft"],
});

profiles.installAgentProfile({
  id: "relationship-guide",
  name: "关系探索",
  kind: "specialist",
  skillIds: ["relationship-intelligence"],
  enabled: true,
});

function makeRun(hostState = {}) {
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
    },
    { conversationApi: api },
  );
  if (Object.keys(hostState).length > 0) {
    runStore.updateSkillRun(
      run.value.id,
      { meta: { hostState } },
      { expectedRevision: run.value.stateRevision },
    );
  }
  return runStore.getSkillRun(run.value.id);
}

function turn(overrides = {}) {
  return {
    assistantText: "我先帮你理一理这段关系里的核心张力。",
    nextAction: "REFLECT",
    statePatch: {},
    memoryCandidates: [],
    taskProposals: [],
    ...overrides,
  };
}

// Case 1: adapter module + validateRelationshipTurn export
record(
  "case1_adapter_exports",
  "Adapter exports validateRelationshipTurn + applyRelationshipPatch",
  typeof adapter.validateRelationshipTurn === "function" &&
    typeof adapter.applyRelationshipPatch === "function" &&
    adapter.SKILL_ID === "relationship-intelligence",
);

// Case 2: two question endings → third acquisition question rejected
{
  const run = makeRun({ questionEndingStreak: 2, phase: "OPEN_NARRATIVE" });
  const bad = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "你们平时因为什么会吵架？",
      nextAction: "REFLECT",
      statePatch: {},
    }),
    deps: { conversationApi: api },
  });
  const good = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "听起来你在关系里常感到被忽视，我会先停在这里帮你整理。",
      nextAction: "FORMULATE",
      statePatch: {
        workingFormulation: {
          primaryHypothesis: {
            text: "用户更需要被稳定回应，而非更多信息采集",
            confidence: 0.55,
            testable: true,
          },
        },
        questionEndingStreak: 0,
      },
    }),
    deps: { conversationApi: api },
  });
  record(
    "case2_question_budget",
    "After streak=2, acquisition question rejected; reflect/formulate allowed",
    !bad.ok &&
      bad.reason === "question_budget_exceeded" &&
      good.ok,
    `${bad.reason}`,
  );
}

// Case 3: hypothesis cap violations rejected
{
  const run = makeRun();
  const tooMany = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      nextAction: "FORMULATE",
      statePatch: {
        workingFormulation: {
          primaryHypothesis: { text: "假设A", confidence: 0.4, testable: false },
          alternateHypothesis: { text: "假设B", confidence: 0.35, testable: false },
          tertiaryHypothesis: { text: "假设C", confidence: 0.3, testable: false },
        },
      },
    }),
    deps: { conversationApi: api },
  });
  const okCap = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      nextAction: "FORMULATE",
      statePatch: {
        workingFormulation: {
          primaryHypothesis: { text: "用户更怕失去自主感", confidence: 0.45, testable: false },
          alternateHypothesis: { text: "用户其实在试探对方投入", confidence: 0.35, testable: false },
        },
      },
    }),
    deps: { conversationApi: api },
  });
  record(
    "case3_hypothesis_cap",
    "At most 1 primary + 1 alternate; tertiary rejected",
    !tooMany.ok &&
      tooMany.reason === "hypothesis_cap_exceeded" &&
      okCap.ok,
    tooMany.reason,
  );
}

// Case 4: prefer SIMULATE when executable hypothesis
{
  const run = makeRun({
    workingFormulation: {
      primaryHypothesis: { text: "冷处理会放大不安全感", confidence: 0.6, testable: true },
    },
    questionEndingStreak: 0,
  });
  const bad = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "他最近一次冷处理时你是什么感受？",
      nextAction: "REFLECT",
    }),
    deps: { conversationApi: api },
  });
  const good = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "我们来模拟一次他再次冷处理时，你可以怎么回应。",
      nextAction: "SIMULATE",
      statePatch: { phase: "PERSONALIZED_SIMULATION" },
    }),
    deps: { conversationApi: api },
  });
  record(
    "case4_prefer_simulate",
    "Executable hypothesis blocks more acquisition; SIMULATE passes",
    !bad.ok &&
      bad.reason === "prefer_simulate" &&
      good.ok,
    bad.reason,
  );
}

// Case 5: blocked diagnosis / manipulation content
{
  const run = makeRun();
  const diagnosis = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "你患有回避型依恋障碍，需要找安全型的人。",
      nextAction: "ADVISE",
    }),
    deps: { conversationApi: api },
  });
  const manipulation = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "可以试试精神控制技巧，让他离不开你。",
      nextAction: "ADVISE",
    }),
    deps: { conversationApi: api },
  });
  record(
    "case5_blocked_content",
    "Diagnosis and manipulation language rejected",
    !diagnosis.ok &&
      diagnosis.reason === "blocked_content" &&
      !manipulation.ok &&
      manipulation.reason === "blocked_content",
    diagnosis.reason,
  );
}

// Case 6: SAFETY_OVERRIDE blocks romance advice overlay
{
  const run = makeRun({ safetyFlags: ["coercion_or_abuse_indicators"] });
  const bad = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "先别急着复合，我们先确认你现在是否安全。",
      nextAction: "SAFETY_OVERRIDE",
      statePatch: { safetyFlags: ["coercion_or_abuse_indicators"] },
    }),
    deps: { conversationApi: api },
  });
  const good = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      assistantText: "我听到你在描述控制和威胁。你现在身边有人能联系吗？",
      nextAction: "SAFETY_OVERRIDE",
      statePatch: { safetyFlags: ["coercion_or_abuse_indicators"], phase: "ABUSE_RESPONSE" },
    }),
    deps: { conversationApi: api },
  });
  record(
    "case6_safety_override",
    "SAFETY_OVERRIDE rejects romance overlay; safety response passes",
    !bad.ok &&
      bad.reason === "safety_override_romance_blocked" &&
      good.ok,
    bad.reason,
  );
}

// Case 7: unconfirmed candidates excluded from global memory projection
{
  const run = makeRun();
  const commit = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      memoryCandidates: [
        {
          text: "用户确认：冷处理会明显降低其安全感。",
          target: "personal",
          evidenceMessageIds: ["msg_1"],
        },
      ],
    }),
    deps: { conversationApi: api },
  });
  const pending = memoryCandidates.listPendingCandidates(run.id);
  const globalBefore = memoryCandidates.projectGlobalMemory(run.id);
  const leakCheck = memoryCandidates.assertPendingExcludedFromGlobal(run.id);
  record(
    "case7_pending_not_global",
    "Unconfirmed candidates not in global memory projection",
    commit.ok &&
      pending.length === 1 &&
      pending[0].status === "pending" &&
      globalBefore.length === 0 &&
      leakCheck.ok,
    `pending=${pending.length} global=${globalBefore.length}`,
  );
}

// Case 8: confirm sync_character produces short fact only
{
  const run = makeRun();
  const commit = runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      memoryCandidates: [
        {
          text: `${"用户偏好被及时回应。".repeat(30)} 不应把整段咨询原文同步给角色。`,
          target: "character",
          evidenceMessageIds: ["msg_2"],
        },
      ],
    }),
    deps: { conversationApi: api },
  });
  const pending = memoryCandidates.listPendingCandidates(run.id);
  const confirmed = memoryCandidates.confirmCandidate(pending[0].id, {
    decision: "sync_character",
    characterId,
  });
  const charFacts = memoryCandidates.projectCharacterMemory(characterId);
  const factText = charFacts[0]?.text || "";
  record(
    "case8_sync_character_short_fact",
    "sync_character stores truncated short fact for character visibility",
    commit.ok &&
      confirmed.ok &&
      charFacts.length === 1 &&
      factText.length <= memoryCandidates.SYNC_CHARACTER_FACT_MAX_LEN &&
      !factText.includes("不应把整段咨询原文"),
    `len=${factText.length}`,
  );
}

// Case 9: write_personal confirm → global projection
{
  const run = makeRun();
  runtime.commitSkillTurn({
    runId: run.id,
    modelResponseJson: turn({
      memoryCandidates: [
        {
          text: "用户更重视稳定回应而非频繁承诺。",
          target: "personal",
          evidenceMessageIds: ["msg_3"],
        },
      ],
    }),
    deps: { conversationApi: api },
  });
  const pending = memoryCandidates.listPendingCandidates(run.id);
  const confirmed = memoryCandidates.confirmCandidate(pending[0].id, "write_personal");
  const global = memoryCandidates.projectGlobalMemory(run.id);
  record(
    "case9_write_personal_global",
    "write_personal confirm appears in global memory projection",
    confirmed.ok && global.length === 1 && global[0].text.includes("稳定回应"),
    `global=${global.length}`,
  );
}

// Case 10: exploration map model from run state
{
  const run = makeRun({
    phase: "WORKING_FORMULATION",
    workingFormulation: {
      primaryHypothesis: { text: "边界感不足导致反复拉扯", confidence: 0.52, testable: true },
      alternateHypothesis: { text: "其实在测试对方投入", confidence: 0.38, testable: false },
    },
    questionEndingStreak: 0,
  });
  const model = explorationMap.buildExplorationMapModel(run);
  const text = explorationMap.explorationMapModelToPlainText(model);
  record(
    "case10_exploration_map",
    "Exploration map model exposes phase + hypotheses",
    model.phase === "WORKING_FORMULATION" &&
      model.hypotheses.length === 2 &&
      model.hypotheses[0].role === "primary" &&
      text.includes("探索地图") &&
      text.includes("边界感不足"),
    `hypotheses=${model.hypotheses.length}`,
  );
}

// Case 11: generic skill (life-coach-lite) bypasses adapter validators
{
  store.upsertCatalogEntry({
    id: "life-coach-lite",
    name: "生活梳理",
    version: "1.0.0",
    triggers: ["生活整理"],
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
  const run = runStore.createSkillRunRecord(
    {
      skillId: "life-coach-lite",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
    },
    { conversationApi: api },
  );
  const result = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: {
      assistantText: "你患有拖延症。",
      nextAction: "REFLECT",
      statePatch: { phase: "ENTRY" },
      memoryCandidates: [],
      taskProposals: [],
    },
    deps: { conversationApi: api },
  });
  record(
    "case11_generic_skill_no_adapter",
    "Non-relationship skill commits without relationship adapter blocking",
    result.ok,
    result.reason || "ok",
  );
}

const requiredModules = [
  "src/skill-platform/adapters/relationship-intelligence.js",
  "src/skill-platform/adapters/index.js",
  "src/skill-platform/ui/exploration-map.js",
];
for (const rel of requiredModules) {
  record(`module_${rel.replace(/\//g, "_")}`, `Module exists ${rel}`, existsSync(join(root, rel)));
}

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "P5",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  command: "npm run verify:skills:relationship",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "VERIFY_RELATIONSHIP.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const review = `# P5 Verify — Relationship Intelligence Adapter

> Generated: ${payload.generatedAt}  
> Status: **${allPass ? "PASS" : "FAIL"}** (${payload.summary.passed}/${payload.summary.total})

## Scope

Plan \`docs/SKILL_AGENT_EXPLORATION_PLATFORM_PLAN.md\` §P5 — Relationship Intelligence adapter, exploration map, memory confirm path.

## Modules

| Module | Role |
|--------|------|
| \`src/skill-platform/adapters/relationship-intelligence.js\` | Host validators + patch normalization |
| \`src/skill-platform/adapters/index.js\` | Adapter registry |
| \`src/skill-platform/ui/exploration-map.js\` | 探索地图 side panel model + render |
| \`src/skill-platform/memory-candidates.js\` | \`confirmCandidate\` + memory projections |

## Cases

${cases.map((c) => `- **${c.id}** (${c.pass ? "PASS" : "FAIL"}): ${c.name}${c.detail ? ` — ${c.detail}` : ""}`).join("\n")}

## Command

\`\`\`bash
npm run verify:skills:relationship
\`\`\`
`;

writeFileSync(join(outDir, "REVIEW.md"), review, "utf8");

console.log(`\nWrote ${join(outDir, "VERIFY_RELATIONSHIP.json")}`);
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);
