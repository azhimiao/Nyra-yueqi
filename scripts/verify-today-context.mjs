/**
 * W2: TodayContext build + flag-gated assemble daily-block path.
 */

import assert from "node:assert/strict";
import { LOCAL_KEYS } from "../src/constants.js";
import { getFeatureFlags, isFeatureEnabled } from "../src/features/flags.js";
import {
  CUTOVER_PROFILE_KEY,
  __resetCutoverProfileCacheForTests,
} from "../src/features/cutover-profile.js";
import {
  createTemporalSnapshotV1,
  createTemporalEventV1,
} from "../src/contracts/index.js";
import {
  createClock,
  setClockForTests,
  resetClockForTests,
  buildTodayContext,
  TODAY_CONTEXT_TOKEN_BUDGET,
} from "../src/temporal/index.js";
import {
  buildCanonicalBlocks,
  assembleCanonical,
  CANONICAL_BLOCK_ORDER,
} from "../src/prompt/assemble.js";

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

function main() {
  memory.clear();
  resetClockForTests();
  const fixedMs = Date.parse("2026-08-07T06:35:00.000Z");
  setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
  const snap = createTemporalSnapshotV1({ locale: "zh-CN" });

  const ctx = buildTodayContext({
    snapshot: snap,
    calendarEvents: [
      { id: "c1", date: "2026-08-07", time: "15:00", title: "答辩" },
      { id: "c2", date: "2026-08-08", time: "10:00", title: "明天的会" },
    ],
    timelineEvents: [
      createTemporalEventV1({
        userId: "usr_a",
        companionId: "cmp_a",
        relationshipId: "rel_a",
        kind: "follow_up",
        title: "答辩结束后询问结果",
        temporalText: "答辩后记得问我",
        status: "confirmed",
        sourceType: "conversation",
        sourceId: "m1",
        evidenceRefs: ["m1"],
        needsFollowUp: true,
      }),
      createTemporalEventV1({
        userId: "usr_a",
        companionId: "cmp_a",
        relationshipId: "rel_a",
        kind: "follow_up",
        title: "过期跟进",
        temporalText: "旧事",
        status: "expired",
        sourceType: "conversation",
        sourceId: "m2",
        evidenceRefs: ["m2"],
        needsFollowUp: true,
        endsAt: "2026-08-01T00:00:00.000Z",
      }),
      {
        eventId: "evt_obs",
        eventType: "observation",
        companionId: "cmp_a",
        kind: "observation",
        status: "active",
        payload: { summary: "昨晚用户说自己有些紧张", kind: "observation" },
      },
      {
        eventId: "evt_prop",
        eventType: "followup_promise",
        companionId: "cmp_a",
        status: "proposed",
        payload: { summary: "未确认候选", needsFollowUp: true },
      },
    ],
  });

  assert.ok(ctx.text.includes("【当前时间】"));
  assert.ok(ctx.text.includes("2026-08-07"));
  assert.ok(ctx.text.includes("15:00 答辩"));
  assert.ok(!ctx.text.includes("明天的会"));
  assert.ok(ctx.text.includes("答辩结束后询问结果"));
  assert.ok(!ctx.text.includes("过期跟进"));
  assert.ok(!ctx.text.includes("未确认候选"));
  assert.ok(ctx.text.includes("昨晚用户说自己有些紧张"));
  assert.ok(ctx.tokens <= TODAY_CONTEXT_TOKEN_BUDGET + 50);
  ok("TodayContext: confirmed calendar today + open follow-ups; expired/proposed excluded");

  // Flag defaults off
  assert.equal(isFeatureEnabled("temporalContextV1"), false);
  ok("temporalContextV1 default off");

  // Flag-off assemble path: daily stays in relationship_state; temporal empty
  const daily = "AI状态：平静；睡眠：清醒；作息：23:00-07:00；用户环境：室内 多云；昨日对话基调：轻松";
  const offBlocks = buildCanonicalBlocks({
    temporalContext: "",
    relationshipContinuity: "",
    relationshipState: daily,
  });
  const offRel = offBlocks.find((b) => b.id === "relationship_state");
  const offTemp = offBlocks.find((b) => b.id === "temporal_context");
  assert.equal(offRel.text, daily);
  assert.equal(offTemp.text, "");
  ok("flag-off path: daily block still in relationship_state; temporal_context empty");

  // Flag-on path: temporal filled; relationship_state cleared of daily
  const onBlocks = buildCanonicalBlocks({
    temporalContext: ctx.text,
    relationshipContinuity: "",
    relationshipState: "",
  });
  assert.ok(onBlocks.find((b) => b.id === "temporal_context").text.includes("【当前时间】"));
  assert.equal(onBlocks.find((b) => b.id === "relationship_state").text, "");
  ok("flag-on path: TodayContext in temporal_context; relationship_state not stuffed");

  assert.ok(CANONICAL_BLOCK_ORDER.indexOf("temporal_context")
    < CANONICAL_BLOCK_ORDER.indexOf("relationship_state"));
  assert.ok(CANONICAL_BLOCK_ORDER.includes("relationship_continuity"));
  ok("canonical order places temporal_context before relationship_state");

  const assembled = assembleCanonical({
    platformSafety: "SAFE",
    temporalContext: ctx.text,
    relationshipState: "",
    userInput: "hi",
    totalBudget: 8000,
  });
  const sys = assembled.messages.find((m) => m.role === "system")?.content || "";
  assert.ok(sys.includes("【当前时间】"));
  assert.ok(sys.includes("答辩"));
  ok("assembleCanonical injects temporal_context into system");

  // Enable flag in storage and confirm merge
  memory.set(CUTOVER_PROFILE_KEY, JSON.stringify("internal_v1"));
  __resetCutoverProfileCacheForTests();
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ temporalContextV1: true }));
  assert.equal(getFeatureFlags().temporalContextV1, true);
  assert.equal(isFeatureEnabled("temporalContextV1"), true);
  memory.clear();
  __resetCutoverProfileCacheForTests();
  assert.equal(isFeatureEnabled("temporalContextV1"), false);
  ok("flag can be enabled via storage; default remains off when cleared");

  resetClockForTests();
  console.log("\nverify-today-context: all checks passed.");
}

try {
  main();
} catch (err) {
  console.error("FAIL", err);
  process.exitCode = 1;
}
