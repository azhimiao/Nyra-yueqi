/**
 * W3: TurnUnderstanding — 必测语句, evidence gate, idempotent turnId, shadow only.
 */

import assert from "node:assert/strict";
import {
  createTemporalSnapshotV1,
  createActionProposalV1,
  validateTurnUnderstandingV1,
  validateActionProposalV1,
} from "../src/contracts/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
} from "../src/temporal/index.js";
import {
  understandTurn,
  understandTurnShadow,
  interpretDeterministic,
  validateUnderstanding,
  clearShadowStoreForTests,
  getShadowRecord,
  shadowRecord,
  summarizeUnderstanding,
  assertNoCalendarWriteForObservation,
} from "../src/turn-understanding/index.js";

function ok(name) {
  console.log(`PASS ${name}`);
}

const SCOPE = {
  userId: "usr_local",
  companionId: "cmp_demo",
  relationshipId: "rel:usr_local:cmp_demo",
  conversationId: "cnv_test",
};

async function main() {
  resetClockForTests();
  clearShadowStoreForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z"); // 14:35 Asia/Shanghai
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snapshot = createTemporalSnapshotV1({ locale: "zh-CN" });

  // --- Contract round-trip ---
  {
    const draft = await understandTurn({
      text: "我明天下午答辩",
      turnId: "turn_contract_1",
      snapshot,
      scope: SCOPE,
    });
    const v = validateTurnUnderstandingV1(draft.understanding);
    assert.equal(v.ok, true, v.errors?.join(","));
    assert.equal(draft.understanding.interpreter, "deterministic");
    ok("TurnUnderstandingV1 validates");
  }

  // --- 必测语句 table ---
  {
    const r = await understandTurn({
      text: "我明天下午答辩",
      turnId: "turn_obs",
      snapshot,
      scope: SCOPE,
    });
    const u = r.understanding;
    assert.ok(u.temporalMentions.some((m) => m.kind === "observation"));
    assert.ok(u.eventProposals.some((e) => e.kind === "observation"));
    assert.equal(u.actionProposals.length, 0, "observation must not produce calendar action");
    assert.equal(assertNoCalendarWriteForObservation(u).ok, true);
    ok("我明天下午答辩 → observation; no calendar action");
  }

  {
    const r = await understandTurn({
      text: "答辩后记得问我",
      turnId: "turn_fu",
      snapshot,
      scope: SCOPE,
    });
    const fu = r.understanding.eventProposals.find((e) => e.kind === "follow_up");
    assert.ok(fu, "follow_up event expected");
    assert.equal(fu.status, "confirmed");
    assert.equal(fu.needsFollowUp, true);
    assert.equal(
      r.understanding.actionProposals.filter((a) => a.capabilityId === "calendar").length,
      0,
    );
    ok("答辩后记得问我 → confirmed follow_up; no calendar");
  }

  {
    const r = await understandTurn({
      text: "帮我明天下午三点加答辩提醒",
      turnId: "turn_cal",
      snapshot,
      scope: SCOPE,
    });
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap, "calendar action proposal expected");
    assert.equal(ap.risk, "R2");
    assert.equal(ap.requiresApproval, true);
    assert.equal(ap.explicitness, "explicit_command");
    assert.equal(validateActionProposalV1(ap).ok, true);
    ok("帮我明天下午三点加答辩提醒 → R2 calendar; requiresApproval");
  }

  {
    const r = await understandTurn({
      text: "周末可能想看电影",
      turnId: "turn_movie",
      snapshot,
      scope: SCOPE,
    });
    const mention = r.understanding.temporalMentions.find((m) => m.kind === "mention");
    assert.ok(mention, "proposed mention expected");
    assert.equal(mention.commitment, false);
    assert.equal(mention.proposedOnly, true);
    assert.ok(
      !r.understanding.eventProposals.some((e) => e.kind === "commitment" && e.status === "confirmed"),
      "must not be confirmed shared plan",
    );
    ok("周末可能想看电影 → proposed mention; not commitment");
  }

  {
    const r = await understandTurn({
      text: "查一下明天上海天气",
      turnId: "turn_wx",
      snapshot,
      scope: SCOPE,
    });
    assert.ok(r.understanding.webRequests.some((w) => w.kind === "weather"));
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "web.weather");
    assert.ok(ap);
    assert.equal(ap.risk, "R0");
    assert.equal(ap.requiresApproval, false);
    ok("查一下明天上海天气 → R0 weather / webRequest");
  }

  {
    const r = await understandTurn({
      text: "帮我发消息告诉他我会迟到",
      turnId: "turn_r3",
      snapshot,
      scope: SCOPE,
    });
    const ap = r.understanding.actionProposals.find((a) => a.risk === "R3");
    assert.ok(ap);
    assert.equal(ap.requiresApproval, true);
    assert.equal(ap.capabilityId, "messaging.external");
    ok("帮我发消息告诉他我会迟到 → R3 requiresApproval");
  }

  // --- Idempotent turnId → single proposal set ---
  {
    clearShadowStoreForTests();
    const turnId = "turn_idem_same";
    const text = "我明天下午答辩";
    const a = await understandTurnShadow({ text, turnId, snapshot, scope: SCOPE });
    const b = await understandTurnShadow({ text, turnId, snapshot, scope: SCOPE });
    assert.equal(a.understanding.turnId, turnId);
    assert.equal(b.understanding.turnId, turnId);
    assert.deepEqual(
      a.understanding.eventProposals.map((e) => e.eventId),
      b.understanding.eventProposals.map((e) => e.eventId),
    );
    assert.equal(b.shadow.idempotent, true);
    assert.equal(getShadowRecord(turnId)?.executed, false);
    assert.equal(getShadowRecord(turnId)?.calendarWrite, false);
    ok("same message + turnId → single idempotent proposal set (shadow)");
  }

  // --- No-evidence proposal rejected ---
  {
    const fake = interpretDeterministic({
      text: "我明天下午答辩",
      turnId: "turn_ev",
      snapshot,
      scope: SCOPE,
    });
    fake.actionProposals.push(
      createActionProposalV1({
        proposalId: "ap_no_evidence",
        capabilityId: "calendar",
        operation: "create_reminder",
        title: "ghost",
        exactEffect: "should drop",
        risk: "R2",
        explicitness: "explicit_command",
        requiresApproval: true,
        reversible: true,
        evidenceRefs: ["这段文字完全不在用户原文里"],
        status: "proposed",
      }),
    );
    const validated = validateUnderstanding(
      { ...fake, turnId: "turn_ev", schemaVersion: 1 },
      "我明天下午答辩",
    );
    assert.ok(
      !validated.understanding.actionProposals.some((a) => a.proposalId === "ap_no_evidence"),
    );
    assert.ok(validated.dropped.some((d) => d.kind === "actionProposals"));
    ok("no-evidence proposal rejected by validator");
  }

  // --- Shadow does not execute ---
  {
    clearShadowStoreForTests();
    const r = await understandTurnShadow({
      text: "帮我明天下午三点加答辩提醒",
      turnId: "turn_shadow_exec",
      snapshot,
      scope: SCOPE,
    });
    assert.equal(r.shadow.executed, false);
    assert.equal(r.shadow.record.calendarWrite, false);
    assert.equal(r.shadow.record.openClawInvoked, false);
    const summary = summarizeUnderstanding(r.understanding);
    assert.ok(summary.actions.length >= 1);
    ok("shadow mode records only; no calendar/OpenClaw execution");
  }

  // --- Model stub falls back to deterministic ---
  {
    const r = await understandTurn({
      text: "我明天下午答辩",
      turnId: "turn_model_fb",
      snapshot,
      scope: SCOPE,
      modelInterpreter: async () => null,
    });
    assert.equal(r.understanding.interpreter, "deterministic");
    ok("null model result → deterministic fallback");
  }

  {
    const r = await understandTurn({
      text: "hello",
      turnId: "turn_model_ok",
      snapshot,
      scope: SCOPE,
      modelInterpreter: async () => ({
        conversationalIntent: "chat",
        memoryCandidates: [],
        temporalMentions: [],
        eventProposals: [],
        actionProposals: [],
        relationshipSignals: [],
        webRequests: [],
        evidenceRefs: ["hello"],
      }),
    });
    assert.equal(r.understanding.interpreter, "model");
    ok("model interpreter used when it returns a result");
  }

  // Duplicate shadowRecord without understandTurn
  {
    clearShadowStoreForTests();
    const r = await understandTurn({
      text: "查一下明天上海天气",
      turnId: "turn_dup",
      snapshot,
      scope: SCOPE,
    });
    const s1 = shadowRecord(r.understanding);
    const s2 = shadowRecord(r.understanding);
    assert.equal(s1.ok, true);
    assert.equal(s2.idempotent, true);
    ok("shadowRecord idempotent by turnId");
  }

  // --- W8: from-conversation proposal-only when turnUnderstandingV1 on ---
  {
    const { LOCAL_KEYS } = await import("../src/constants.js");
    const { emitRelationshipEventsFromTurn, produceLegacyTimelineProposalsFromTurn } = await import(
      "../src/timeline/from-conversation.js"
    );
    const { __setTimelineStorageForTests, listTimelineEvents, clearTimelineForTests } = await import(
      "../src/timeline/repository.js"
    );
    const mem = new Map();
    const ls = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    };
    globalThis.localStorage = ls;
    globalThis.window = { ...(globalThis.window || {}), localStorage: ls, dispatchEvent() {} };
    const {
      CUTOVER_PROFILE_KEY,
      __resetCutoverProfileCacheForTests,
    } = await import("../src/features/cutover-profile.js");
    __setTimelineStorageForTests(ls);
    clearTimelineForTests();
    ls.setItem(CUTOVER_PROFILE_KEY, JSON.stringify("internal_v1"));
    __resetCutoverProfileCacheForTests();
    ls.setItem(LOCAL_KEYS.featuresKey, JSON.stringify({ turnUnderstandingV1: true }));
    const produced = produceLegacyTimelineProposalsFromTurn({
      companionId: SCOPE.companionId,
      userId: SCOPE.userId,
      userText: "我明天下午答辩",
      sourceTurnId: "turn_w8_fc",
    });
    assert.equal(produced.ok, true);
    assert.ok(produced.proposals.length >= 1);
    const emitted = emitRelationshipEventsFromTurn({
      companionId: SCOPE.companionId,
      userId: SCOPE.userId,
      userText: "我明天下午答辩",
      sourceTurnId: "turn_w8_fc",
    });
    assert.equal(emitted.skipped, "turnUnderstandingV1_proposal_only");
    assert.equal(emitted.events.length, 0);
    assert.ok((emitted.proposals || []).length >= 1);
    const listed = listTimelineEvents({ companionId: SCOPE.companionId, allowUnscopedScan: true });
    assert.equal(listed.length, 0, "flag on must not append timeline events");
    ls.setItem(CUTOVER_PROFILE_KEY, JSON.stringify("legacy"));
    __resetCutoverProfileCacheForTests();
    ls.setItem(LOCAL_KEYS.featuresKey, JSON.stringify({ turnUnderstandingV1: false }));
    ok("W8 from-conversation proposal-only when turnUnderstandingV1 on");
  }

  resetClockForTests();
  clearShadowStoreForTests();
  console.log("\nverify-turn-understanding: all checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
