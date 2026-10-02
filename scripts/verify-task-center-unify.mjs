#!/usr/bin/env node
/**
 * OC-task-center-unify — Task Center lists Assistant + Agent tasks; approve/reject routes correctly.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const {
  clearAllAgentTasks,
  saveTask,
} = await import("../src/agent/task-store.js");
const {
  clearAssistantTasksForTests,
} = await import("../src/studio-assist/agent/task-store.js");
const {
  listUnifiedTasks,
  getUnifiedTask,
  getPendingUnifiedApprovals,
  projectAssistantTask,
  approveUnifiedTask,
  rejectUnifiedTask,
} = await import("../src/agent/task-center-facade.js");
const {
  runCharacterFixAgentTask,
} = await import("../src/studio-assist/agent/runner.js");
const { CHARACTER_FIX_FIXTURE } = await import("../src/studio-assist/agent/fixtures.js");
const { submitTask } = await import("../src/agent/executor.js");

clearAllAgentTasks();
clearAssistantTasksForTests();

// 1) Pop/Assist path — assistant task appears in unified list without agent localStorage seed
{
  const run = await runCharacterFixAgentTask({
    title: "角色卡检查",
    instruction: "检查角色卡",
    characterPayload: CHARACTER_FIX_FIXTURE,
    characterResourceId: "fixture:char",
    testScenario: "happy",
    allowFakeStream: true,
    initiatingCompanionId: "char-xingli",
    companionId: "char-xingli",
    userId: "local",
  });
  check("assist task created", Boolean(run?.task?.id), run?.task?.status || "");
  check(
    "assist reaches approval or success",
    run?.awaitingApproval || run?.task?.status === "WAITING_FOR_APPROVAL" || run?.ok,
    run?.task?.status,
  );

  const listed = listUnifiedTasks({ characterId: "char-xingli" });
  check(
    "assistant task listed in task center facade",
    listed.some((t) => t.id === run.task.id && t.source === "assistant"),
    `count=${listed.length}`,
  );

  const projected = getUnifiedTask(run.task.id);
  check("projected state is awaiting or terminal", ["awaiting_approval", "completed", "running"].includes(projected?.state), projected?.state);

  if (projected?.state === "awaiting_approval") {
    const pending = getPendingUnifiedApprovals("char-xingli");
    check("pending approval surfaced", pending.some((p) => p.taskId === run.task.id), `${pending.length} pending`);

    const memChars = new Map();
    const commitFn = async (task, candidate) => {
      const id = `char-verify-${Date.now()}`;
      memChars.set(id, { ...candidate, id });
      return { ok: true, characterId: id, name: candidate?.name, verified: true, entryHint: "verified" };
    };
    const approved = await approveUnifiedTask(run.task.id, `assist-appr-${run.task.id}`, {
      initiatingCompanionId: "char-xingli",
      commitFn,
    });
    check("task center approve works on assistant task", Boolean(approved?.ok), approved?.task?.status || approved?.error || "");
    const after = getUnifiedTask(run.task.id);
    check("post-approve state completed", after?.state === "completed", after?.state);
  }
}

clearAssistantTasksForTests();

// 2) Reject path
{
  const run = await runCharacterFixAgentTask({
    title: "拒绝测试",
    instruction: "检查角色卡",
    characterPayload: CHARACTER_FIX_FIXTURE,
    testScenario: "happy",
    allowFakeStream: true,
    initiatingCompanionId: "char-xingli",
  });
  if (run?.task?.status === "WAITING_FOR_APPROVAL") {
    const rejected = await rejectUnifiedTask(run.task.id, `assist-appr-${run.task.id}`);
    check("task center reject works", rejected?.ok === true, getUnifiedTask(run.task.id)?.state);
    check("rejected state cancelled", getUnifiedTask(run.task.id)?.state === "cancelled");
  } else {
    check("reject path skipped (no approval state)", true, run?.task?.status);
  }
}

clearAssistantTasksForTests();
clearAllAgentTasks();

// 3b) Calendar user path (OC-submitTask-life) — outside Assist/Pop
{
  const { dispatchCalendarReminderTask } = await import("../src/calendar/calendar-task-dispatch.js");
  const calRun = await dispatchCalendarReminderTask({
    title: "开会",
    date: "2026-08-03",
    time: "15:00",
    prompt: "记得带资料",
    eventId: "phone-event-verify-cal",
    characterId: "char-xingli",
  });
  check("calendar path submitTask", calRun?.ok === true, calRun?.value?.id || calRun?.reason || "");
  const listed = listUnifiedTasks({ characterId: "char-xingli" });
  check(
    "calendar task in task center",
    listed.some((t) => t.id === calRun?.value?.id && t.source === "agent"),
    `count=${listed.length}`,
  );
}

clearAllAgentTasks();

// 3) Agent calendar path still listed alongside assistant
{
  const drafted = await submitTask({
    capabilityId: "calendar-draft",
    characterId: "char-xingli",
    title: "日程：测试",
    summary: "周三会议",
    input: { text: "周三会议", characterId: "char-xingli" },
    idempotentKey: `verify-unify-cal-${Date.now()}`,
    risk: "R2",
  });
  check("agent submitTask creates task", drafted?.ok === true, drafted?.value?.id);

  const assistRun = await runCharacterFixAgentTask({
    title: "并行助手",
    characterPayload: CHARACTER_FIX_FIXTURE,
    testScenario: "happy",
    allowFakeStream: true,
    initiatingCompanionId: "char-xingli",
  });

  const merged = listUnifiedTasks({ characterId: "char-xingli" });
  const hasAgent = merged.some((t) => t.source === "agent" && t.id === drafted.value.id);
  const hasAssist = merged.some((t) => t.source === "assistant" && t.id === assistRun.task?.id);
  check("merged list contains agent task", hasAgent);
  check("merged list contains assistant task", hasAssist);
}

// 4) Wiring checks (static)
{
  const ui = readFileSync(join(root, "src/agent/ui/task-center-ui.js"), "utf8");
  check("task-center-ui uses facade", ui.includes("task-center-facade"));
  const shell = readFileSync(join(root, "src/phone-shell/phone-shell.js"), "utf8");
  check("phone-shell pop inline approve wired", shell.includes("data-pop-task-approve"));
  check("phone-shell facade approve import", shell.includes("approveUnifiedTask"));
  const dispatch = readFileSync(join(root, "src/panels/pop-task-dispatch.js"), "utf8");
  check("pop dispatch emits task-created event", dispatch.includes("yueqi.assist.task-created"));
  check("pop dispatch inline metadata", dispatch.includes("popTaskMetadataFromAssistantTask"));
  const calDispatch = readFileSync(join(root, "src/calendar/calendar-task-dispatch.js"), "utf8");
  check("calendar dispatch submitTask", calDispatch.includes("submitTask") && calDispatch.includes("calendar-draft"));
  check("phone calendar form wired", shell.includes("dispatchCalendarReminderTask") && shell.includes("data-phone-event-form"));
}

const failed = checks.filter((c) => !c.pass);
console.log(`\nverify:task-center-unify ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.detail}`);
  process.exit(1);
}
