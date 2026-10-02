/**
 * P6 — Agent assistant wiring, audit linkage, backup roundtrip, inspector.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/skill-platform/P6");

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

const routes = await import("../src/agents/assist-routes.js");
const store = await import("../src/skill-platform/store.js");
const audit = await import("../src/skill-platform/audit.js");
const profiles = await import("../src/agents/profile-store.js");
const selection = await import("../src/agents/selection.js");
const runStore = await import("../src/skill-platform/run-store.js");
const memoryCandidates = await import("../src/skill-platform/memory-candidates.js");
const importer = await import("../src/skill-platform/importer.js");
const backup = await import("../src/skill-platform/backup.js");
const inspector = await import("../src/skill-platform/inspector.js");
const runtime = await import("../src/skill-platform/runtime.js");
const conversationStore = await import("../src/conversation/store.js");
const binding = await import("../src/skill-platform/conversation-binding.js");
const { __setAgentStorageForTests, clearAllAgentTasks } = await import("../src/agent/task-store.js");
const { registerBuiltinCapabilities } = await import("../src/agent/capabilities/index.js");
const { createTaskDraft, proposeTask } = await import("../src/agent/executor.js");

store.__setSkillPlatformStorageForTests(storage);
audit.__setSkillAuditStorageForTests(storage);
profiles.__setAgentProfileStorageForTests(storage);
selection.__setAgentSelectionStorageForTests(storage);
runStore.__setSkillRunStorageForTests(storage);
memoryCandidates.__setMemoryCandidatesStorageForTests(storage);
conversationStore.__setConversationStorageForTests(storage);
__setAgentStorageForTests(storage);

store.clearAllSkillPlatformData();
audit.clearSkillAuditLog();
profiles.clearAllAgentProfiles();
selection.clearAgentSelection();
runStore.clearAllSkillRuns();
memoryCandidates.clearAllMemoryCandidates();
clearAllAgentTasks();
registerBuiltinCapabilities();
profiles.ensureBuiltinProfiles();

importer.importSkillBundle({
  files: fixtureFiles,
  sourceLabel: "fixture:p6",
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

// Case 1–5: assist routes
{
  const r1 = routes.matchAssistRoute("切换到关系探索");
  const e1 = routes.executeAssistRoute(r1);
  record(
    "route_switch_agent",
    "Switch agent route selects named agent",
    r1.matched && r1.route === "switch_agent" && e1.ok && /关系探索/.test(e1.speech),
    r1.matched ? `agent=${r1.payload.agentId}` : "no match",
  );

  const r2 = routes.matchAssistRoute("推荐已安装能力");
  const e2 = routes.executeAssistRoute(r2);
  record(
    "route_recommend_skills",
    "Recommend skills route yields chips from installed catalog",
    r2.matched && r2.route === "recommend_skills" && e2.chips?.length >= 1,
    `chips=${e2.chips?.length || 0}`,
  );

  const r3 = routes.matchAssistRoute("打开探索导入");
  const e3 = routes.executeAssistRoute(r3);
  record(
    "route_open_explore_import",
    "Open explore import route navigates without fake install",
    r3.matched && e3.routeAction?.type === "open_explore" && e3.routeAction.tab === "import",
    e3.routeAction?.type || "none",
  );

  const r4 = routes.matchAssistRoute("创建一个跑团主持人");
  const e4 = routes.executeAssistRoute(r4);
  record(
    "route_create_agent",
    "Create agent route opens composer with seed",
    r4.matched && e4.routeAction?.type === "open_explore" && e4.routeAction.composeSeed,
    String(e4.routeAction?.composeSeed || "").slice(0, 24),
  );

  const r5 = routes.matchAssistRoute("给栖机助手加上关系探索");
  const e5 = routes.executeAssistRoute(r5);
  record(
    "route_attach_skill_preview",
    "Attach skill route shows confirm card with scope summary",
    r5.matched && e5.pending && e5.cards?.[0]?.needConfirm,
    e5.cards?.[0]?.name || "no card",
  );
}

// Case 6: ordinary text does not match routes
{
  const plain = routes.matchAssistRoute("今天天气怎么样");
  record(
    "route_ordinary_unmatched",
    "Ordinary companion text does not match assist routes",
    !plain.matched,
    plain.matched ? plain.route : "no match",
  );
}

// Case 7: backup roundtrip
{
  const api = binding.createProductionConversationApi();
  const run = runStore.createSkillRunRecord(
    {
      skillId: "relationship-intelligence",
      agentId: "relationship-guide",
      characterId: "xingli",
      mode: "isolated_new",
      grantedCapabilities: [],
    },
    { conversationApi: api },
  );

  memoryCandidates.addPendingCandidates(run.value.id, [{
    text: "用户更在意被听见",
    target: "personal",
    evidenceMessageIds: ["m1"],
  }]);

  audit.appendSkillAuditEvent({
    type: "install",
    skillId: "relationship-intelligence",
    detail: "p6-backup-test",
  });

  const exported = backup.exportSkillPlatformBag();
  store.clearAllSkillPlatformData();
  runStore.clearAllSkillRuns();
  memoryCandidates.clearAllMemoryCandidates();
  audit.clearSkillAuditLog();
  profiles.clearAllAgentProfiles();

  const restored = backup.importSkillPlatformBag(exported);
  const compare = backup.compareSkillPlatformBags(exported, backup.exportSkillPlatformBag());

  record(
    "backup_roundtrip",
    "Backup export/import restores catalog, files, runs, candidates",
    restored.ok &&
      compare.catalogMatch &&
      compare.installMatch &&
      compare.fileIndexMatch &&
      compare.runsMatch &&
      Boolean(store.getCatalogEntry("relationship-intelligence")) &&
      runStore.listSkillRuns().length === 1,
    `runs=${runStore.listSkillRuns().length} catalog=${Object.keys(store.listCatalogEntries()).length} cat=${compare.catalogMatch} inst=${compare.installMatch} idx=${compare.fileIndexMatch} runsM=${compare.runsMatch}`,
  );
}

// Case 8: hash mismatch disables skill
{
  const exported = backup.exportSkillPlatformBag();
  const tampered = backup.tamperSkillFileInBag(exported, "relationship-intelligence");
  store.clearAllSkillPlatformData();
  const result = backup.importSkillPlatformBag(tampered);
  const inst = store.getInstallation("relationship-intelligence");
  record(
    "backup_hash_mismatch",
    "Hash mismatch after restore disables skill and flags integrity",
    result.disabledSkills?.includes("relationship-intelligence") &&
      inst?.enabled === false &&
      inst?.integrityFlag === "hash_mismatch",
    `enabled=${inst?.enabled} flag=${inst?.integrityFlag}`,
  );
}

// Re-import clean fixture for inspector / audit cases
store.clearAllSkillPlatformData();
runStore.clearAllSkillRuns();
memoryCandidates.clearAllMemoryCandidates();
audit.clearSkillAuditLog();
clearAllAgentTasks();
importer.importSkillBundle({ files: fixtureFiles, sourceLabel: "fixture:p6-inspector", confirm: true, grantedCapabilities: ["structured-notes", "calendar-draft"] });
profiles.installAgentProfile({
  id: "relationship-guide",
  name: "关系探索",
  kind: "specialist",
  skillIds: ["relationship-intelligence"],
  enabled: true,
});

const api = binding.createProductionConversationApi();
const run = runStore.createSkillRunRecord(
  {
    skillId: "relationship-intelligence",
    agentId: "relationship-guide",
    characterId: "xingli",
    mode: "isolated_new",
    grantedCapabilities: ["structured-notes"],
  },
  { conversationApi: api },
);

// Case 9: inspector shape
{
  const snap = inspector.buildSkillInspectorSnapshot({ runId: run.value.id });
  record(
    "inspector_shape",
    "Inspector exposes skill, resources, scopes, tokens, proposals, candidates, audit",
    snap.ok && inspector.validateInspectorShape(snap) && snap.enabledSkill?.id === "relationship-intelligence",
    `resources=${snap.resources?.length} tokens=${snap.tokenEstimate}`,
  );
}

// Case 10: memory_candidate audit linkage
{
  runtime.commitSkillTurn({
    runId: run.value.id,
    modelResponseJson: {
      assistantText: "我注意到你在意的是被听见。",
      nextAction: "REFLECT",
      statePatch: {},
      memoryCandidates: [{
        text: "用户希望先被听见再谈解决方案",
        target: "personal",
        evidenceMessageIds: ["ev1"],
      }],
      taskProposals: [],
    },
    deps: { conversationApi: api, createTaskDraft, proposeTask },
  });

  const events = audit.listSkillAuditEvents({ type: "memory_candidate", skillRunId: run.value.id });
  record(
    "audit_memory_candidate",
    "memory_candidate audit events link skillRunId",
    events.some((e) => e.meta?.skillRunId === run.value.id && e.meta?.candidateId),
    `events=${events.length}`,
  );
}

// Case 11: data-modules includes skillPlatform
{
  const { listDataModuleIds } = await import("../src/memory/data-modules.js");
  const ids = listDataModuleIds();
  record(
    "data_modules_skill_platform",
    "Backup data-modules registers skillPlatform",
    ids.includes("skillPlatform"),
    ids.filter((id) => id.startsWith("skill") || id.startsWith("agent")).join(","),
  );
}

const allPass = cases.every((c) => c.pass);
const payload = {
  phase: "P6-closeout",
  generatedAt: new Date().toISOString(),
  status: allPass ? "pass" : "fail",
  command: "npm run verify:skills:p6",
  cases,
  summary: {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    failed: cases.filter((c) => !c.pass).length,
  },
};

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "VERIFY_P6.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`\nWrote ${join(outDir, "VERIFY_P6.json")}`);
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);
