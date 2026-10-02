/**
 * Unified memory M4 — Calendar / Task adapters + chat ActionProposal loop.
 *
 * Run: npm run verify:unified-memory-calendar
 * Alias: npm run verify:unified-memory-m4
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";
import {
  CUTOVER_PROFILE_KEY,
  __resetCutoverProfileCacheForTests,
} from "../src/features/cutover-profile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(root, "docs/qa/unified-memory");
mkdirSync(evidenceDir, { recursive: true });

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = {
  localStorage: memStorage,
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};

function setFlags(partial = {}) {
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(partial));
  const usesNewPath = Object.entries(partial).some(([, value]) => value === true);
  memory.set(CUTOVER_PROFILE_KEY, JSON.stringify(usesNewPath ? "internal_v1" : "legacy"));
  __resetCutoverProfileCacheForTests();
}

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const {
  createTemporalSnapshotV1,
} = await import("../src/contracts/index.js");
const {
  createClock,
  setClockForTests,
  resetClockForTests,
} = await import("../src/temporal/index.js");
const {
  understandTurn,
  understandTurnDispatch,
  approveProposal,
  clearShadowStoreForTests,
  clearExecutorCalendarForTests,
  listLocalEvents,
  assertNoCalendarWriteForObservation,
  clearProposalStoreForTests,
} = await import("../src/turn-understanding/index.js");
const {
  __setTimelineStorageForTests,
  clearTimelineForTests,
  listTimelineEvents,
} = await import("../src/timeline/repository.js");
const {
  clearUnifiedTasksForTests,
  __setUnifiedTaskStorageForTests,
  transitionTask,
  createTask,
  listTasks,
} = await import("../src/tasks/unified-task-repo.js");
const { clearAllAgentTasks, __setAgentStorageForTests } = await import("../src/agent/task-store.js");
const {
  onCalendarCommitted,
  submitReminderPreferenceCandidate,
  __resetCalendarAdapterRegistrationForTests,
  ensureCalendarAdapterRegistered,
} = await import("../src/memory/adapters/calendar.js");
const {
  __resetTaskAdapterRegistrationForTests,
  ensureTaskAdapterRegistered,
} = await import("../src/memory/adapters/task.js");
const { __clearFeatureMemoryAdaptersForTests } = await import("../src/memory/adapters/registry.js");
const { updateLocalEvent, removeLocalEvent } = await import(
  "../src/agent/capabilities/local-calendar-store.js"
);

const SCOPE = {
  userId: "usr_local",
  companionId: "cmp_demo",
  relationshipId: "rel:usr_local:cmp_demo",
  conversationId: "cnv_m4",
};

function resetAll() {
  memory.clear();
  clearShadowStoreForTests();
  clearExecutorCalendarForTests();
  clearUnifiedTasksForTests();
  clearAllAgentTasks();
  clearTimelineForTests();
  clearProposalStoreForTests();
  __setUnifiedTaskStorageForTests(memStorage);
  __setAgentStorageForTests(memStorage);
  __setTimelineStorageForTests(memStorage);
  __clearFeatureMemoryAdaptersForTests();
  __resetCalendarAdapterRegistrationForTests();
  __resetTaskAdapterRegistrationForTests();
  ensureCalendarAdapterRegistered();
  ensureTaskAdapterRegistered();
}

function calendarLifecycleEvents() {
  return listTimelineEvents({ companionId: SCOPE.companionId, limit: 100 }).filter((e) =>
    String(e.eventType || "").startsWith("calendar."),
  );
}

async function main() {
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z"); // 14:35 Asia/Shanghai
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snapshot = createTemporalSnapshotV1({ locale: "zh-CN" });
  const nowIso = new Date(fixedMs).toISOString();

  // --- 1. Observation / “明天可能答辩” → no calendar ---
  {
    resetAll();
    setFlags({ turnUnderstandingV1: true, unifiedMemoryAdaptersV1: true });
    const r = await understandTurn({
      text: "明天可能答辩",
      turnId: "turn_m4_maybe",
      snapshot,
      scope: SCOPE,
    });
    assert.ok(r.understanding.temporalMentions.some((m) => m.kind === "observation"));
    assert.equal(r.understanding.actionProposals.length, 0);
    assert.equal(assertNoCalendarWriteForObservation(r.understanding).ok, true);

    const dispatched = await understandTurnDispatch(
      {
        text: "明天可能答辩",
        turnId: "turn_m4_maybe_exec",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    assert.equal(dispatched.dispatch.calendarWrite, false);
    assert.equal(listLocalEvents().length, 0);
    assert.equal(calendarLifecycleEvents().length, 0);
    record("observation_no_calendar", true, "明天可能答辩");
  }

  // --- 2. Flag off: approve calendar → event exists, no adapter Timeline ---
  {
    resetAll();
    setFlags({ turnUnderstandingV1: true, unifiedMemoryAdaptersV1: false });
    const r = await understandTurnDispatch(
      {
        text: "帮我明天下午三点加答辩提醒",
        turnId: "turn_m4_flag_off",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap);
    const approved = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(approved.calendarWrite, true);
    assert.equal(listLocalEvents().length, 1);
    assert.equal(calendarLifecycleEvents().length, 0, "flag off → no adapter timeline");
    record("flag_off_no_adapter_timeline", true);
  }

  // --- 3. Approve → one calendar + one Timeline lifecycle with sourceRef ---
  {
    resetAll();
    setFlags({ turnUnderstandingV1: true, unifiedMemoryAdaptersV1: true });
    const r = await understandTurnDispatch(
      {
        text: "帮我明天下午三点加答辩提醒",
        turnId: "turn_m4_approve",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap);
    assert.equal(listLocalEvents().length, 0, "no write before approve");

    const approved = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.equal(approved.calendarWrite, true);
    const events = listLocalEvents();
    assert.equal(events.length, 1);
    assert.ok(events[0].id);

    const lifecycle = calendarLifecycleEvents().filter((e) => e.eventType === "calendar.created");
    assert.equal(lifecycle.length, 1, `expected 1 created, got ${lifecycle.length}`);
    const ev = lifecycle[0];
    assert.equal(ev.payload?.sourceRef?.sourceType, "calendar_event");
    assert.equal(ev.payload?.sourceRef?.sourceId, events[0].id);
    assert.equal(ev.sourceId, events[0].id);
    record(
      "approve_one_calendar_one_lifecycle_sourceRef",
      true,
      `eventId=${events[0].id}`,
    );
  }

  // --- 4. Update / cancel supersedes prior lifecycle ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const created = {
      id: "calev_m4_lifecycle",
      title: "答辩",
      date: "2026-08-08",
      time: "15:00",
      companionId: SCOPE.companionId,
      userId: SCOPE.userId,
    };
    // Seed local store via approve path's store: inject by updateLocalEvent after add via onCalendarCommitted only
    const { addLocalEvent } = await import("../src/agent/capabilities/local-calendar-store.js");
    const row = addLocalEvent(created);
    const c1 = onCalendarCommitted(row, { op: "create", scope: SCOPE });
    assert.equal(c1.ok, true);
    assert.equal(c1.eventType, "calendar.created");

    const updated = updateLocalEvent(row.id, { time: "16:00", title: "答辩（改期）" });
    const c2 = onCalendarCommitted(updated, {
      op: "update",
      scope: SCOPE,
      sourceVersion: 2,
    });
    assert.equal(c2.ok, true);
    assert.equal(c2.eventType, "calendar.updated");

    let rows = calendarLifecycleEvents();
    const createdRow = rows.find((e) => e.eventType === "calendar.created");
    const updatedRow = rows.find((e) => e.eventType === "calendar.updated");
    assert.ok(updatedRow);
    assert.ok(createdRow);
    assert.equal(createdRow.status, "superseded");
    assert.equal(updatedRow.payload?.sourceRef?.sourceId, row.id);

    removeLocalEvent(row.id);
    const c3 = onCalendarCommitted(updated || row, { op: "cancel", scope: SCOPE, sourceVersion: 3 });
    assert.equal(c3.ok, true);
    assert.equal(c3.eventType, "calendar.cancelled");
    rows = calendarLifecycleEvents();
    const cancelled = rows.find((e) => e.eventType === "calendar.cancelled");
    assert.ok(cancelled);
    assert.equal(cancelled.status, "cancelled");
    const activeNonTerminal = rows.filter(
      (e) => e.status !== "superseded" && e.status !== "cancelled" && e.eventType !== "calendar.cancelled",
    );
    assert.equal(activeNonTerminal.length, 0, "prior lifecycle superseded");
    record("cancel_update_supersedes_prior", true);
  }

  // --- 5. Reminder preference → candidate stub, not calendar ---
  {
    resetAll();
    setFlags({ turnUnderstandingV1: true, unifiedMemoryAdaptersV1: true });
    const r = await understandTurn({
      text: "重要事件提前一天提醒",
      turnId: "turn_m4_pref",
      snapshot,
      scope: SCOPE,
    });
    assert.equal(
      r.understanding.actionProposals.filter((a) => a.capabilityId === "calendar").length,
      0,
    );
    assert.ok(
      r.understanding.memoryCandidates.some((c) => c.category === "reminder_preference"),
      "memoryCandidates reminder_preference",
    );
    assert.equal(listLocalEvents().length, 0);

    const stub = submitReminderPreferenceCandidate(
      { claim: "重要事件提前一天提醒", evidenceRefs: ["重要事件提前一天提醒"] },
      SCOPE,
    );
    assert.equal(stub.stub, true);
    assert.equal(stub.candidates.length, 1);
    assert.equal(stub.candidates[0].category, "reminder_preference");
    assert.equal(stub.candidates[0].promoteToStable, false);
    record("reminder_preference_candidate_not_calendar", true);
  }

  // --- 6. Task status change → Timeline lifecycle with sourceRef ---
  {
    resetAll();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const created = createTask({
      userId: SCOPE.userId,
      companionId: SCOPE.companionId,
      relationshipId: SCOPE.relationshipId,
      title: "M4 task lifecycle",
      kind: "action_proposal",
      state: "awaiting_approval",
      executor: "local",
      idempotencyKey: "m4-task-lifecycle-1",
    });
    assert.equal(created.ok, true);
    const taskId = created.value.taskId;
    let taskLife = listTimelineEvents({ companionId: SCOPE.companionId, limit: 50 }).filter((e) =>
      String(e.eventType || "").startsWith("task."),
    );
    assert.ok(taskLife.some((e) => e.eventType === "task.created"));
    assert.equal(
      taskLife.find((e) => e.eventType === "task.created")?.payload?.sourceRef?.sourceId,
      taskId,
    );

    transitionTask(taskId, "succeeded", { resultSummary: "done" });
    taskLife = listTimelineEvents({ companionId: SCOPE.companionId, limit: 50 }).filter((e) =>
      String(e.eventType || "").startsWith("task."),
    );
    assert.ok(taskLife.some((e) => e.eventType === "task.completed"));
    assert.ok(listTasks().some((t) => t.taskId === taskId && t.state === "succeeded"));
    record("task_status_lifecycle_sourceRef", true, `taskId=${taskId}`);
  }

  resetClockForTests();

  const passed = cases.filter((c) => c.pass).length;
  const failed = cases.filter((c) => !c.pass).length;
  const report = {
    wave: "M4",
    ok: failed === 0,
    passed,
    failed,
    total: cases.length,
    cases,
    head: "37579943efff98f546e88a2bae95680656cd4b2e",
    at: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "M4_VERIFY.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nOK  ${passed}/${cases.length} unified-memory calendar / M4`);
  if (failed) {
    process.exitCode = 1;
    console.error(`FAIL  ${failed} case(s)`);
  }
}

try {
  await main();
} catch (err) {
  console.error("FAIL", err);
  process.exitCode = 1;
}
