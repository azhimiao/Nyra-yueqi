/**
 * P3 — Skill×Agent task proposal path verify.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P3");

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
const fixtureDir = join(root, "docs/qa/skill-platform/fixtures/relationship-intelligence");
const fixtureFiles = readFixtureFiles(fixtureDir);

const conversationStore = await import("../src/conversation/store.js");
const store = await import("../src/skill-platform/store.js");
const audit = await import("../src/skill-platform/audit.js");
const profiles = await import("../src/agents/profile-store.js");
const runStore = await import("../src/skill-platform/run-store.js");
const runSchema = await import("../src/skill-platform/run-schema.js");
const binding = await import("../src/skill-platform/conversation-binding.js");
const importer = await import("../src/skill-platform/importer.js");
const runtime = await import("../src/skill-platform/runtime.js");
const { __setAgentStorageForTests, clearAllAgentTasks, listTasks } = await import(
  "../src/agent/task-store.js"
);
const { registerBuiltinCapabilities } = await import("../src/agent/capabilities/index.js");
const { __resetIdSeqForTests } = await import("../src/agent/schema.js");
const { createTaskDraft, proposeTask } = await import("../src/agent/executor.js");

conversationStore.__setConversationStorageForTests(storage);
store.__setSkillPlatformStorageForTests(storage);
audit.__setSkillAuditStorageForTests(storage);
profiles.__setAgentProfileStorageForTests(storage);
runStore.__setSkillRunStorageForTests(storage);
__setAgentStorageForTests(storage);

runSchema.__resetSkillRunIdSeqForTests();
__resetIdSeqForTests();
registerBuiltinCapabilities();
store.clearAllSkillPlatformData();
audit.clearSkillAuditLog();
profiles.clearAllAgentProfiles();
runStore.clearAllSkillRuns();
clearAllAgentTasks();
profiles.ensureBuiltinProfiles();

importer.importSkillBundle({
  files: fixtureFiles,
  sourceLabel: "fixture:p3-agent",
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

const api = binding.createProductionConversationApi();
const characterId = "xingli";

function skillTurnWithTask(capabilityId, input) {
  return {
    assistantText: "我可以帮你保存一份结构化笔记，供你之后在任务中心确认。",
    nextAction: "SYNTHESIZE",
    statePatch: { phase: "SYNTHESIS" },
    memoryCandidates: [],
    taskProposals: [
      {
        capabilityId,
        title: "保存关系探索地图",
        input,
      },
    ],
  };
}

// Case 1: legal R2 proposal with grant → createTaskDraft + proposeTask
{
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

  let createCalls = 0;
  const trackingCreate = (fields) => {
    createCalls += 1;
    return createTaskDraft(fields);
  };

  const result = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: skillTurnWithTask("structured-notes", {
      text: "关系探索要点\n- 冷处理会降低安全感\n- 需要先确认边界",
    }),
    deps: { conversationApi: api, createTaskDraft: trackingCreate, proposeTask },
  });

  const tasks = listTasks();
  const task = tasks.find((t) => t.intent?.title === "保存关系探索地图");
  const auditEvents = audit.listSkillAuditEvents({ type: "task_proposal" });

  record(
    "case1_r2_with_grant",
    "Legal R2-ish proposal with grant → createTaskDraft/proposeTask; task in agent store",
    result.ok &&
      createCalls === 1 &&
      tasks.length === 1 &&
      task?.state === "proposed" &&
      task?.intent?.capabilityId === "structured-notes",
    task ? `task=${task.id} state=${task.state}` : "no task",
  );

  record(
    "case1_audit_link",
    "skillRunId linked in skill-platform audit on task proposal",
    auditEvents.some(
      (e) => e.meta?.skillRunId === run.value.id && e.meta?.taskId === task?.id,
    ),
    `events=${auditEvents.length}`,
  );
}

// Case 2: without grant → no task
{
  clearAllAgentTasks();
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
      grantedCapabilities: [],
    },
    { conversationApi: api },
  );

  const before = listTasks().length;
  const result = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: skillTurnWithTask("structured-notes", {
      text: "不应创建任务",
    }),
    deps: { conversationApi: api, createTaskDraft, proposeTask },
  });

  record(
    "case2_without_grant",
    "Without grant → no task created",
    result.ok &&
      result.value.tasks.length === 0 &&
      result.value.rejectedTaskProposals.length === 1 &&
      listTasks().length === before,
    `rejected=${result.value?.rejectedTaskProposals?.[0]?.reason}`,
  );
}

// Case 3: unknown capability in manifest intersection → rejected
{
  clearAllAgentTasks();
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId,
      mode: "isolated_new",
      grantedCapabilities: ["local-files"],
    },
    { conversationApi: api },
  );

  const result = runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: skillTurnWithTask("local-files", { path: "secret.txt" }),
    deps: { conversationApi: api, createTaskDraft, proposeTask },
  });

  record(
    "case3_not_in_manifest",
    "Capability not requested by manifest → rejected even if run grant present",
    result.ok &&
      result.value.tasks.length === 0 &&
      result.value.rejectedTaskProposals.some((r) => r.capabilityId === "local-files"),
    `tasks=${listTasks().length}`,
  );
}

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "P3-agent",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  command: "npm run verify:skills:agent",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "VERIFY_AGENT.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`\nWrote ${join(outDir, "VERIFY_AGENT.json")}`);
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);
