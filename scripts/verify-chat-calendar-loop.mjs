/**
 * W4: chat → ActionProposal → calendar loop (approve / reject / idempotent).
 * Plan §7.3–7.4, §W4, §14.1 calendar cases.
 */

import assert from "node:assert/strict";
import { LOCAL_KEYS } from "../src/constants.js";
import { setCutoverProfile } from "../src/features/cutover-profile.js";
import {
  createTemporalSnapshotV1,
} from "../src/contracts/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
} from "../src/temporal/index.js";
import {
  understandTurn,
  understandTurnDispatch,
  dispatchProposals,
  clearShadowStoreForTests,
  approveProposal,
  rejectProposal,
  listLocalEvents,
  clearExecutorCalendarForTests,
  getProposalRecord,
  onActionProposal,
  assertNoCalendarWriteForObservation,
} from "../src/turn-understanding/index.js";
import { clearUnifiedTasksForTests, __setUnifiedTaskStorageForTests, listTasks } from "../src/tasks/unified-task-repo.js";
import { clearAllAgentTasks, __setAgentStorageForTests } from "../src/agent/task-store.js";

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = { localStorage: memStorage };

// Keep this contract deterministic and offline. The production executor still
// uses the real Open-Meteo endpoints; the fixture only supplies a truthful
// provider-shaped response for the R0 weather path.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input || "");
  if (url.includes("geocoding-api.open-meteo.com")) {
    return new Response(JSON.stringify({
      results: [{ name: "上海", latitude: 31.2304, longitude: 121.4737 }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("api.open-meteo.com")) {
    return new Response(JSON.stringify({
      current: { temperature_2m: 24, relative_humidity_2m: 60, weather_code: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
};

function ok(name) {
  console.log(`PASS ${name}`);
}

function resetAll() {
  memory.clear();
  clearShadowStoreForTests();
  clearExecutorCalendarForTests();
  clearUnifiedTasksForTests();
  clearAllAgentTasks();
  __setUnifiedTaskStorageForTests(memStorage);
  __setAgentStorageForTests(memStorage);
}

const SCOPE = {
  userId: "usr_local",
  companionId: "cmp_demo",
  relationshipId: "rel:usr_local:cmp_demo",
  conversationId: "cnv_w4",
};

async function main() {
  resetAll();
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z"); // 14:35 Asia/Shanghai
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snapshot = createTemporalSnapshotV1({ locale: "zh-CN" });
  const nowIso = new Date(fixedMs).toISOString();

  // --- Explicit legacy rollback: dispatch defaults to shadow; no calendar write ---
  {
    memory.clear();
    setCutoverProfile("legacy");
    assert.equal(
      JSON.parse(memStorage.getItem(LOCAL_KEYS.featuresKey) || "null")?.turnUnderstandingV1,
      undefined,
    );
    const before = listLocalEvents().length;
    const r = await understandTurnDispatch(
      {
        text: "帮我明天下午三点加答辩提醒",
        turnId: "turn_flag_off",
        snapshot,
        scope: SCOPE,
      },
      // no mode — explicit legacy rollback → shadow
    );
    assert.equal(r.dispatch?.mode || "shadow", "shadow");
    assert.equal(listLocalEvents().length, before);
    ok("explicit legacy rollback → shadow dispatch; no calendar write");
  }

  resetAll();
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));

  // Restore the commercial product path for remaining execute tests.
  setCutoverProfile("production_v1");

  // --- Observation: 我明天下午答辩 → no calendar write ---
  {
    const heard = [];
    const unsub = onActionProposal((p) => heard.push(p));
    const r = await understandTurnDispatch(
      {
        text: "我明天下午答辩",
        turnId: "turn_obs_w4",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    unsub();
    assert.ok(r.understanding.temporalMentions.some((m) => m.kind === "observation"));
    assert.equal(r.understanding.actionProposals.length, 0);
    assert.equal(assertNoCalendarWriteForObservation(r.understanding).ok, true);
    assert.equal(r.dispatch.calendarWrite, false);
    assert.equal(listLocalEvents().length, 0);
    assert.equal(heard.length, 0, "observation must not emit action proposal to UI");
    ok("我明天下午答辩 → no calendar write");
  }

  // --- Explicit command: proposal R2; no write until approve ---
  {
    const heard = [];
    const unsub = onActionProposal((p) => heard.push(p));
    const r = await understandTurnDispatch(
      {
        text: "帮我明天下午三点加答辩提醒",
        turnId: "turn_cal_w4",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    unsub();

    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap, "calendar ActionProposal expected");
    assert.equal(ap.risk, "R2");
    assert.equal(ap.requiresApproval, true);
    assert.equal(r.dispatch.calendarWrite, false);
    assert.equal(listLocalEvents().length, 0, "must not write before approve");
    assert.ok(r.dispatch.pendingApproval?.some((p) => p.proposalId === ap.proposalId));
    assert.equal(heard.length, 1);
    assert.equal(heard[0].proposalId, ap.proposalId);

    const tasks = listTasks({ limit: 10 });
    assert.ok(
      tasks.some((t) => t.correlationId === ap.proposalId || t.idempotencyKey.includes(ap.proposalId)),
      "UnifiedTask linked to proposal",
    );
    ok("帮我明天下午三点加答辩提醒 → R2 proposal; pending; UnifiedTask; no write yet");

    // Approve → one calendar event
    const approved = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.equal(approved.executed, true);
    assert.equal(approved.calendarWrite, true);
    assert.ok(approved.eventId);
    const events = listLocalEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].proposalId, ap.proposalId);
    assert.match(events[0].title, /答辩/);
    assert.equal(events[0].time, "15:00", "下午三点 → 15:00");
    ok("approveProposal → one calendar event with proposalId");

    // Double approve → still one event (idempotent)
    const again = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(again.ok, true);
    assert.equal(again.idempotent, true);
    assert.equal(listLocalEvents().length, 1);
    ok("double approveProposal → still one event");
  }

  // --- Reject → no write ---
  {
    clearExecutorCalendarForTests();
    clearShadowStoreForTests();
    const r = await understandTurn({
      text: "帮我明天下午三点加答辩提醒",
      turnId: "turn_cal_reject",
      snapshot,
      scope: SCOPE,
    });
    const dispatched = await dispatchProposals(r.understanding, {
      mode: "execute",
      sourceText: "帮我明天下午三点加答辩提醒",
      nowIso,
    });
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap);
    assert.equal(dispatched.calendarWrite, false);

    const rejected = rejectProposal(ap.proposalId);
    assert.equal(rejected.ok, true);
    assert.equal(rejected.status, "rejected");
    assert.equal(listLocalEvents().length, 0);

    const afterReject = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(afterReject.ok, false);
    assert.equal(afterReject.reason, "already_rejected");
    assert.equal(listLocalEvents().length, 0);
    ok("rejectProposal → no write; approve after reject blocked");
  }

  // --- R0 weather: auto-executes with source ---
  {
    clearShadowStoreForTests();
    const r = await understandTurnDispatch(
      {
        text: "查一下明天上海天气",
        turnId: "turn_weather_w4",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    const weatherResult = r.dispatch.results?.find((x) => x.kind === "weather" || x.risk === "R0");
    assert.ok(weatherResult?.executed, "R0 weather should auto-execute");
    assert.equal(weatherResult.calendarWrite, false);
    assert.ok(weatherResult.weather?.source, "weather result must include source");
    assert.ok(Array.isArray(weatherResult.sources) && weatherResult.sources.length > 0);
    assert.equal(listLocalEvents().length, 0);
    ok("查一下明天上海天气 → R0 sourced result; no calendar write");
  }

  // --- R3: stays proposed; approve without confirmExternal does not send ---
  {
    clearShadowStoreForTests();
    const r = await understandTurnDispatch(
      {
        text: "帮我发消息告诉他我会迟到",
        turnId: "turn_r3_w4",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    const ap = r.understanding.actionProposals.find((a) => a.risk === "R3");
    assert.ok(ap);
    assert.ok(r.dispatch.pendingApproval?.some((p) => p.proposalId === ap.proposalId));
    const approved = await approveProposal(ap.proposalId);
    assert.equal(approved.executed, false);
    assert.ok(
      approved.reason === "not_implemented_requiresApproval"
      || approved.status === "requires_second_confirm"
      || approved.reason === "capability_unavailable",
    );
    const rec = getProposalRecord(ap.proposalId);
    assert.notEqual(rec?.status, "executed");
    ok("R3 external send → not auto-executed; approve stubs requiresApproval");
  }

  resetClockForTests();
  console.log("\nverify-chat-calendar-loop: all checks passed.");
}

try {
  await main();
} catch (err) {
  console.error("FAIL", err);
  process.exitCode = 1;
}
