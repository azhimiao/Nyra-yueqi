/**
 * CP-7 Explore — shared OpenClaw task runtime + worldbook merge.
 */
import { routeExploreIntent } from "../../src/task-runtime/explore-intent.js";
import {
  runWorldbookMergeTask,
  approveWorldbookMergeTask,
  rejectWorldbookMergeTask,
} from "../../src/task-runtime/worldbook-merge-runner.js";
import { clearAssistantTasksForTests, getAssistantTask } from "../../src/task-runtime/index.js";
import { clearCommitIdempotencyForTests } from "../../src/studio-assist/agent/commit-idempotency.js";
import { EXTERNAL_REQUIRED_USER_MESSAGE } from "../../src/task-runtime/external-required.js";
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

const created = new Map();
async function mockCommit(task, entries) {
  const effects = task?.checkpoint?.completedSideEffects || [];
  if (task?.commitResultId || effects.includes("worldbook.merge.create")) {
    return {
      ok: true,
      skipped: true,
      createdIds: task.checkpoint?.payload?.createdIds || [...created.keys()],
      worldbookBatchId: task.commitResultId || "batch-skip",
      entryHint: "跳过重复",
    };
  }
  const ids = [];
  for (const e of entries) {
    const id = `new-${created.size + 1}`;
    created.set(id, e);
    ids.push(id);
  }
  return {
    ok: true,
    createdIds: ids,
    worldbookBatchId: `batch-${ids[0]}`,
    entryHint: `已创建 ${ids.length} 条`,
  };
}

console.log("=== Explore intent ===");
assert(routeExploreIntent("合并这两个世界书").mode === "local-agent", "merge → local");
assert(routeExploreIntent("运行 Python 分析文件").mode === "external-required", "python → external");
assert(EXTERNAL_REQUIRED_USER_MESSAGE.includes("外部执行环境"), "external copy");

console.log("=== Worldbook merge closed loop ===");
clearAssistantTasksForTests();
clearCommitIdempotencyForTests();
created.clear();

{
  const run = await runWorldbookMergeTask({ allowFakeStream: true,
    instruction: "合并这两个世界书并去掉重复",
    bookA,
    bookB,
    sourceIds: [],
  });
  assert(run.awaitingApproval === true, "awaiting approval");
  assert(run.task?.candidate?.entries?.length === 3, `merged 3 got ${run.task?.candidate?.entries?.length}`);
  assert(run.task?.diff?.overwriteExisting === false, "no overwrite");
  assert(created.size === 0, "no write before approve");

  const rejected = rejectWorldbookMergeTask(run.task.id);
  assert(rejected.productionUnchanged === true, "reject unchanged");
  assert(getAssistantTask(run.task.id)?.status === "CANCELED", "canceled");
}

clearAssistantTasksForTests();
created.clear();
{
  const run = await runWorldbookMergeTask({ allowFakeStream: true,
    bookA,
    bookB,
    autoApprove: true,
    commitFn: mockCommit,
  });
  assert(run.ok === true, "approve ok");
  assert(created.size === 3, `created 3 got ${created.size}`);
  const again = await approveWorldbookMergeTask(run.task.id, { commitFn: mockCommit });
  assert(again.skipped === true || again.ok === true, "idempotent approve");
  assert(created.size === 3, "still 3 after re-approve");
}

console.log("=== Explore UI wires shared runtime ===");
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const ui = readFileSync(join(root, "src/skill-platform/ui/explore-ui.js"), "utf8");
  assert(ui.includes("task-runtime"), "explore imports task-runtime");
  assert(ui.includes('data-explore-tab="tasks"'), "tasks tab");
  assert(ui.includes("runWorldbookMergeTask"), "merge runner wired");
}

if (failures.length) {
  console.error("FAILED", failures);
  process.exit(1);
}
console.log("CP-7 explore verify PASSED");
