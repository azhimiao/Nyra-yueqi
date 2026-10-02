/**
 * CP-8 Assistant — worldbook merge wiring, theme/scenario/pack tools.
 */
import { routeAssistantIntent } from "../../src/studio-assist/agent/intent-router.js";
import { createQijiControlledTools } from "../../src/studio-assist/agent/controlled-tools.js";
import {
  clearAssistantTasksForTests,
  getAssistantTask,
  runThemeDraftAgentTask,
  approveThemeDraftTask,
  runScenarioAuditAgentTask,
  SCENARIO_AUDIT_FIXTURE,
} from "../../src/studio-assist/agent/index.js";
import {
  runWorldbookMergeTask,
  approveWorldbookMergeTask,
  rejectWorldbookMergeTask,
} from "../../src/task-runtime/index.js";
import { commitThemeCandidateOnce } from "../../src/studio-assist/agent/theme-commit.js";
import { createAssistChatStore } from "../../src/studio-assist/chat-store.js";
import { OpenClawMobileWorkspace } from "../../src/integrations/openclaw-mobile/OpenClawMobileEnvironment.js";
import { clearCommitIdempotencyForTests } from "../../src/studio-assist/agent/commit-idempotency.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const failures = [];
function assert(c, m) {
  if (!c) failures.push(m);
}

const bookA = [
  { id: "a1", title: "月光港", content: "港", triggers: ["月"] },
  { id: "a2", title: "重复项", content: "A", triggers: ["重"] },
];
const bookB = [
  { id: "b1", title: "潮汐街", content: "街", triggers: ["潮"] },
  { id: "b2", title: "重复项", content: "B", triggers: ["重"] },
];

const wbCreated = new Map();
async function mockWorldbookCommit(task, entries) {
  const effects = task?.checkpoint?.completedSideEffects || [];
  if (task?.commitResultId || effects.includes("worldbook.merge.create")) {
    return { ok: true, skipped: true, createdIds: [], worldbookBatchId: task.commitResultId, entryHint: "skip" };
  }
  const ids = [];
  for (const e of entries) {
    const id = `wb-${wbCreated.size + 1}`;
    wbCreated.set(id, e);
    ids.push(id);
  }
  return { ok: true, createdIds: ids, worldbookBatchId: `batch-${ids[0]}`, entryHint: `已创建 ${ids.length} 条` };
}

const themeApplied = [];
async function mockThemeCommit(task, candidate) {
  themeApplied.push(candidate.id);
  return { ok: true, themeId: candidate.id, entryHint: `applied:${candidate.id}` };
}

console.log("=== CP-8 Intent router ===");
assert(routeAssistantIntent("合并这两个世界书").intent === "worldbook_merge", "worldbook intent");
assert(routeAssistantIntent("打开夜间模式").mode === "direct-action", "night mode direct");
assert(routeAssistantIntent("根据这些颜色设计完整主题").intent === "theme_draft", "theme draft");
assert(routeAssistantIntent("检查情景剧包缺少什么").intent === "scenario_audit", "scenario audit");

console.log("=== CP-8 Controlled tools ===");
{
  const ws = new OpenClawMobileWorkspace("cp8-tools");
  await ws.writeText("input/settings.json", JSON.stringify({ theme: { id: "yueqi" } }));
  await ws.writeText("input/theme.json", JSON.stringify({ currentId: "yueqi", palette: ["#fff"] }));
  await ws.writeText("input/scenario.json", JSON.stringify(SCENARIO_AUDIT_FIXTURE));
  await ws.writeText(
    "input/pack.manifest.json",
    JSON.stringify({ schemaVersion: 1, id: "pack-1", assets: { icon: "assets/icon.png" } }),
  );
  const tools = createQijiControlledTools(ws);
  const themeInspect = tools.find((t) => t.name === "nyra.theme.inspect");
  const themeCreate = tools.find((t) => t.name === "nyra.theme.create_theme_candidate");
  const scenarioInspect = tools.find((t) => t.name === "nyra.scenario.inspect");
  const packValidate = tools.find((t) => t.name === "nyra.resource.validate_references");

  const ti = await themeInspect.execute("1", {});
  assert(ti.details?.currentId === "yueqi", "theme inspect");
  await themeCreate.execute("1", { theme: { id: "mist", label: "青雾" } });
  assert(await ws.exists("output/theme.candidate.json"), "theme candidate workspace only");

  const si = await scenarioInspect.execute("1", {});
  assert(si.details?.title === SCENARIO_AUDIT_FIXTURE.title, "scenario inspect");

  const pv = await packValidate.execute("1", {});
  assert(pv.details?.valid === true, "pack validate refs");
}

console.log("=== CP-8 Worldbook via chat-store ===");
clearAssistantTasksForTests();
wbCreated.clear();
{
  const store = createAssistChatStore({ collectProviderConfig: () => ({}), allowFakeStream: true });
  const agent = await store.send("合并这两个世界书并去重");
  assert(agent.decision?.intent === "worldbook_merge", "chat worldbook intent");
  assert(agent.message?.cards?.[0]?.type === "agent-task", "worldbook task card");
  assert(agent.message?.cards?.[0]?.needConfirm === true, "worldbook needs approval");
  assert(wbCreated.size === 0, "no wb write before approve");

  const cardId = agent.message.cards[0].id;
  await store.cancel(cardId);
  assert(getAssistantTask(agent.agentTaskId)?.status === "CANCELED", "worldbook reject");
}

console.log("=== CP-8 Theme draft + commit ===");
clearAssistantTasksForTests();
clearCommitIdempotencyForTests();
themeApplied.length = 0;
{
  const run = await runThemeDraftAgentTask({ allowFakeStream: true, targetThemeId: "pine", autoApprove: true, commitFn: mockThemeCommit });
  assert(run.ok === true, "theme draft ok");
  assert(run.task?.candidate?.kind === "theme", "theme candidate kind");
  assert(themeApplied.includes("pine"), "theme applied after approve");

  const again = await approveThemeDraftTask(run.task.id, { commitFn: mockThemeCommit });
  assert(again.skipped === true || again.ok === true, "theme idempotent approve");
}

console.log("=== CP-8 Scenario audit (read-only) ===");
{
  const run = await runScenarioAuditAgentTask();
  assert(run.task?.status === "SUCCEEDED", "scenario audit succeeded");
  assert(run.task?.candidate?.kind === "scenario-audit", "scenario audit kind");
  assert(run.report?.validate?.valid === true, "scenario valid");
}

console.log("=== CP-8 Chat store direct action preserved ===");
{
  const store = createAssistChatStore({ collectProviderConfig: () => ({}) });
  const night = await store.send("打开夜间模式");
  assert(night.decision?.mode === "direct-action", "night still direct");
  assert(night.decision?.actionId === "appearance.apply_theme", "apply theme action");
}

console.log("=== CP-8 Source wiring ===");
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const chat = readFileSync(join(root, "src/studio-assist/chat-store.js"), "utf8");
  const tools = readFileSync(join(root, "src/studio-assist/agent/controlled-tools.js"), "utf8");
  assert(chat.includes("runWorldbookMergeTask"), "chat-store uses worldbook runner");
  assert(tools.includes("nyra.theme.inspect"), "theme tools");
  assert(tools.includes("nyra.scenario.inspect"), "scenario tools");
  assert(tools.includes("nyra.resource.inspect_manifest"), "pack tools");
  assert(!tools.includes('name: "appearance.apply_theme"'), "tools do not apply theme directly");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-8 assistant verify PASSED");
