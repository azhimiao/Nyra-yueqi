/**
 * C2: ActionProposal persistence + approval loop (product cutover).
 * Node proves repository authority; browser UI screenshots deferred to C6.
 *
 * @see docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md §8
 */

import assert from "node:assert/strict";
import { LOCAL_KEYS } from "../src/constants.js";
import { createTemporalSnapshotV1 } from "../src/contracts/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
} from "../src/temporal/index.js";
import {
  understandTurnDispatch,
  dispatchProposals,
  understandTurn,
  clearShadowStoreForTests,
  approveProposal,
  rejectProposal,
  undoProposal,
  listLocalEvents,
  clearExecutorCalendarForTests,
  onActionProposal,
  assertNoCalendarWriteForObservation,
  ACTION_PROPOSAL_STORE_KEY,
  listPending,
  getProposal,
  expireStale,
  findByCorrelationId,
  __setProposalStorageForTests,
  clearProposalsForTests,
  listPendingProposals,
} from "../src/turn-understanding/index.js";
import {
  clearUnifiedTasksForTests,
  __setUnifiedTaskStorageForTests,
} from "../src/tasks/unified-task-repo.js";
import { clearAllAgentTasks, __setAgentStorageForTests } from "../src/agent/task-store.js";
import {
  formatProposalWhenLine,
  renderActionProposalCardHtml,
} from "../src/ui/action-proposal-card.js";

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = { localStorage: memStorage };

function ok(name) {
  console.log(`PASS ${name}`);
}

function resetAll() {
  memory.clear();
  clearShadowStoreForTests();
  clearExecutorCalendarForTests();
  clearUnifiedTasksForTests();
  clearAllAgentTasks();
  clearProposalsForTests();
  __setUnifiedTaskStorageForTests(memStorage);
  __setAgentStorageForTests(memStorage);
  __setProposalStorageForTests(memStorage);
}

const SCOPE = {
  userId: "usr_local",
  companionId: "cmp_demo",
  relationshipId: "rel:usr_local:cmp_demo",
  conversationId: "cnv_c2",
};

async function main() {
  resetAll();
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z"); // 14:35 Asia/Shanghai
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snapshot = createTemporalSnapshotV1({ locale: "zh-CN" });
  const nowIso = new Date(fixedMs).toISOString();

  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ turnUnderstandingV1: true }));

  // --- Shared storage key (App/phone same module) ---
  {
    assert.equal(ACTION_PROPOSAL_STORE_KEY, "yueqi.action.proposals.v1");
    ok("App/phone share storage key yueqi.action.proposals.v1");
  }

  // --- Observation: no proposal card / no calendar ---
  {
    const heard = [];
    const unsub = onActionProposal((p) => heard.push(p));
    const r = await understandTurnDispatch(
      {
        text: "我明天下午答辩",
        turnId: "turn_obs_c2",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    unsub();
    assert.equal(r.understanding.actionProposals.length, 0);
    assert.equal(assertNoCalendarWriteForObservation(r.understanding).ok, true);
    assert.equal(listLocalEvents().length, 0);
    assert.equal(heard.length, 0);
    assert.equal(listPending({ companionId: SCOPE.companionId }).length, 0);
    ok("observation → no proposal card needed / no calendar");
  }

  // --- R2 calendar: propose → persist → reload → approve / double / undo ---
  {
    resetAll();
    memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ turnUnderstandingV1: true }));
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));

    const heard = [];
    const unsub = onActionProposal((p) => heard.push(p));
    const r = await understandTurnDispatch(
      {
        text: "帮我明天下午三点加答辩提醒",
        turnId: "turn_cal_persist",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    unsub();
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap, "calendar ActionProposal expected");
    assert.equal(ap.risk, "R2");
    assert.equal(listLocalEvents().length, 0);
    assert.equal(heard.length, 1);
    const raw = memStorage.getItem(ACTION_PROPOSAL_STORE_KEY);
    assert.ok(raw, "persisted to localStorage");

    // Simulate refresh: wipe in-memory + LS via clear, then restore LS bag only
    const bag = JSON.parse(raw);
    clearShadowStoreForTests();
    memStorage.setItem(ACTION_PROPOSAL_STORE_KEY, JSON.stringify(bag));

    const reloaded = listPending({ companionId: SCOPE.companionId });
    assert.equal(reloaded.length, 1, "reload restores pending");
    assert.equal(reloaded[0].proposalId, ap.proposalId);
    assert.equal(getProposal(ap.proposalId)?.status, "proposed");
    ok("persist + reload pending");

    // UI helpers: when line uses explicit time; card html has 确认/拒绝
    const storeRec = listPendingProposals({ companionId: SCOPE.companionId })[0];
    const when = formatProposalWhenLine(storeRec);
    assert.match(when, /15:00|三点|下午/);
    const html = renderActionProposalCardHtml(storeRec, { variant: "app" });
    assert.match(html, /确认/);
    assert.match(html, /拒绝/);
    assert.match(html, /data-action-proposal-card/);
    ok("card renders exactEffect / confirm / reject");

    // Approve → one event
    const approved = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    assert.equal(approved.executed, true);
    assert.equal(listLocalEvents().length, 1);
    assert.equal(listLocalEvents()[0].proposalId, ap.proposalId);
    assert.equal(getProposal(ap.proposalId)?.status, "completed");
    ok("R2 calendar proposal → approve → one event");

    // Double approve → still one
    const again = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(again.ok, true);
    assert.equal(again.idempotent, true);
    assert.equal(listLocalEvents().length, 1);
    ok("double approve → one event");

    // Undo removes calendar event
    const undone = await undoProposal(ap.proposalId);
    assert.equal(undone.ok, true, JSON.stringify(undone));
    assert.equal(undone.status, "undone");
    assert.equal(listLocalEvents().length, 0, "undo removes calendar event");
    assert.equal(getProposal(ap.proposalId)?.status, "undone");
    ok("undo removes calendar event when possible");
  }

  // --- Reject → none ---
  {
    resetAll();
    memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ turnUnderstandingV1: true }));
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));

    const r = await understandTurn({
      text: "帮我明天下午三点加答辩提醒",
      turnId: "turn_cal_reject_c2",
      snapshot,
      scope: SCOPE,
    });
    await dispatchProposals(r.understanding, {
      mode: "execute",
      sourceText: "帮我明天下午三点加答辩提醒",
      nowIso,
    });
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap);
    const rejected = rejectProposal(ap.proposalId);
    assert.equal(rejected.ok, true);
    assert.equal(listLocalEvents().length, 0);
    assert.equal(getProposal(ap.proposalId)?.status, "rejected");
    const after = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(after.ok, false);
    assert.equal(listLocalEvents().length, 0);
    ok("reject → no calendar event");
  }

  // --- expire stale ---
  {
    resetAll();
    memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ turnUnderstandingV1: true }));
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));

    const r = await understandTurnDispatch(
      {
        text: "帮我明天下午三点加答辩提醒",
        turnId: "turn_cal_expire",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap);
    const byCorr = findByCorrelationId(ap.proposalId);
    assert.ok(byCorr);

    const expired = expireStale({ nowMs: fixedMs + 80 * 60 * 60 * 1000, ttlMs: 72 * 60 * 60 * 1000 });
    assert.ok(expired.expiredCount >= 1);
    assert.equal(getProposal(ap.proposalId)?.status, "expired");
    assert.equal(listPending({ companionId: SCOPE.companionId }).length, 0);
    assert.equal(listLocalEvents().length, 0, "expire does not execute");
    const approveExpired = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(approveExpired.ok, false);
    assert.equal(listLocalEvents().length, 0);
    ok("expire stale → no auto-exec; approve blocked");
  }

  // --- Coarse period formatting must not invent 15:00 ---
  {
    const line = formatProposalWhenLine({
      parameters: { whenText: "明天下午", period: "afternoon", timezone: "Asia/Shanghai" },
      temporalSnapshot: { timezone: "Asia/Shanghai" },
    });
    assert.match(line, /下午/);
    assert.doesNotMatch(line, /15:00/);
    ok("period line shows 下午 without invented 15:00");
  }

  resetClockForTests();
  console.log("\nverify-product-cutover-proposals: all checks passed.");
}

try {
  await main();
} catch (err) {
  console.error("FAIL", err);
  process.exitCode = 1;
}
