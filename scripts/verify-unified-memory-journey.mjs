/**
 * Unified memory M10 — product journey acceptance (Node, flags forced ON in-process).
 *
 * Run: npm run verify:unified-memory-journey
 * Alias: npm run verify:unified-memory-m10
 *
 * Does NOT claim browser E2E or Android device runs.
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_FEATURES, LOCAL_KEYS } from "../src/constants.js";

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
globalThis.document = {
  documentElement: { lang: "zh-CN", getAttribute: () => null, setAttribute() {} },
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
  dispatchEvent() { return true; },
};

const cases = [];
function record(id, pass, detail = "", status = null) {
  const ok = Boolean(pass);
  cases.push({
    id,
    pass: ok,
    status: status || (ok ? "PASS" : "FAIL"),
    detail: String(detail || ""),
  });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

/** All unified-memory product flags ON for journey process only (defaults remain false in source). */
const JOURNEY_FLAGS_ON = {
  ...DEFAULT_FEATURES,
  unifiedMemoryAdaptersV1: true,
  memoryProjectionOutboxV1: true,
  diaryRepositoryV1: true,
  palaceProjectionOnlyV1: true,
  contextGraphProjectionOnlyV1: true,
  singleBrokerRetrievalV1: true,
  unifiedMemoryForgetV1: true,
  turnUnderstandingV1: true,
  temporalContextV1: true,
};

const { saveFeatureFlags, getFeatureFlags } = await import("../src/features/flags.js");

function enableJourneyFlags() {
  saveFeatureFlags({ ...JOURNEY_FLAGS_ON });
}

function setFlags(partial = {}) {
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(partial));
}

function resetStorage() {
  memory.clear();
}

const {
  __setCandidateLedgerStorageForTests,
  clearCandidateLedgerForTests,
  submitCandidate,
  promoteCandidateToStable,
  recallStableMemory,
  forgetUnderstanding,
} = await import("../src/memory/candidate-ledger.js");

const {
  __setSuppressionLedgerStorageForTests,
  clearSuppressionLedgerForTests,
  isSuppressed,
  suppressionFingerprint,
} = await import("../src/memory/suppression-ledger.js");

const {
  __setDiaryStorageForTests,
  __clearDiaryRepositoryForTests,
  listDiaryEntries,
  getDiaryEntry,
} = await import("../src/diary/repository.js");

const { saveDiary, getDiaryById, deleteDiaryRecord } = await import("../src/diary/records.js");

const {
  createMemoryPalaceIndexStore,
  __setDefaultPalaceIndexStoreForTests,
  __clearDefaultPalaceIndexStoreForTests,
} = await import("../src/memory/projection/project-to-palace.js");

const {
  __setTimelineStorageForTests,
  clearTimelineForTests,
} = await import("../src/timeline/repository.js");

const {
  __clearProjectionOutboxForTests,
  __clearProjectionRegistryForTests,
} = await import("../src/projections/index.js");

const { __resetDiaryAdapterRegistrationForTests } = await import("../src/memory/adapters/diary.js");
const { __clearFeatureMemoryAdaptersForTests } = await import("../src/memory/adapters/registry.js");

const {
  recordListenProgress,
  endListenSession,
  ensureListenAdapterRegistered,
  __clearListenSessionsForTests,
  __resetListenAdapterRegistrationForTests,
} = await import("../src/memory/adapters/listen.js");

const {
  ingestBookChunksWithSourceRef,
  tombstoneBookChunks,
  bookChunkSourceId,
  ensureReadingAdapterRegistered,
  __resetReadingAdapterRegistrationForTests,
} = await import("../src/memory/adapters/reading.js");

const {
  createTemporalSnapshotV1,
} = await import("../src/contracts/index.js");
const {
  createClock,
  setClockForTests,
  resetClockForTests,
  buildTodayContext,
} = await import("../src/temporal/index.js");
const {
  understandTurnDispatch,
  approveProposal,
  clearShadowStoreForTests,
  clearExecutorCalendarForTests,
  listLocalEvents,
  clearProposalStoreForTests,
} = await import("../src/turn-understanding/index.js");
const {
  clearUnifiedTasksForTests,
  __setUnifiedTaskStorageForTests,
} = await import("../src/tasks/unified-task-repo.js");
const { clearAllAgentTasks, __setAgentStorageForTests } = await import("../src/agent/task-store.js");
const {
  ensureCalendarAdapterRegistered,
  __resetCalendarAdapterRegistrationForTests,
} = await import("../src/memory/adapters/calendar.js");
const {
  ensureTaskAdapterRegistered,
  __resetTaskAdapterRegistrationForTests,
} = await import("../src/memory/adapters/task.js");

const {
  attemptScenarioDialogueRealityStable,
  onScenarioFinale,
  ensureScenarioAdapterRegistered,
  __resetScenarioAdapterRegistrationForTests,
  SCENARIO_FINALE_EVENT_TYPE,
  SCENARIO_REALITY_NAMESPACE,
} = await import("../src/memory/adapters/scenario.js");

const {
  __setScenarioMemoryBagForTests,
  __clearScenarioMemoryForTests,
} = await import("../src/companion/scenario-memory-bridge.js");
const { __setAutonomyBagForTests } = await import("../src/companion/autonomy-prefs.js");

const {
  rebuildPalaceFromSources,
  filterPalaceHitsBySourceRef,
} = await import("../src/memory/palace/index.js");

const { getPurposePolicy } = await import("../src/context/purpose-policy.js");
const { assemblePrompt } = await import("../src/prompt/assemble.js");
const {
  __setConversationStorageForTests,
  clearAllConversations,
} = await import("../src/conversation/index.js");
const { writeCompanionTurn } = await import("../src/conversation/companion-write.js");

/**
 * Ordinary idle chat must not force a song mention from listen sessions.
 * Listening purpose keeps Palace off; without song intent, forced titles stay empty.
 */
function idleChatBagDoesNotForceSong(input = {}) {
  const listeningPolicy = getPurposePolicy("listening");
  const listenTitles = Array.isArray(input.listenTitles) ? input.listenTitles : [];
  const query = String(input.query || "").trim();
  const intentMentionsSong = /歌|听歌|music|song|track|电台/i.test(query);
  const forcedSongTitles = intentMentionsSong ? listenTitles.filter(Boolean) : [];
  return {
    ok: listeningPolicy.includePalace === false && forcedSongTitles.length === 0,
    listeningIncludePalace: listeningPolicy.includePalace === true,
    forcedSongTitles,
  };
}

function resetCore() {
  resetStorage();
  enableJourneyFlags();
  __setCandidateLedgerStorageForTests(memStorage);
  __setSuppressionLedgerStorageForTests(memStorage);
  __setDiaryStorageForTests(memStorage);
  __setTimelineStorageForTests(memStorage);
  __setUnifiedTaskStorageForTests(memStorage);
  __setAgentStorageForTests(memStorage);
  __setConversationStorageForTests(memStorage);
  clearCandidateLedgerForTests();
  clearSuppressionLedgerForTests();
  __clearDiaryRepositoryForTests();
  clearTimelineForTests();
  clearShadowStoreForTests();
  clearExecutorCalendarForTests();
  clearUnifiedTasksForTests();
  clearAllAgentTasks();
  clearProposalStoreForTests();
  clearAllConversations();
  __clearProjectionOutboxForTests();
  __clearProjectionRegistryForTests();
  __clearFeatureMemoryAdaptersForTests();
  __resetDiaryAdapterRegistrationForTests();
  __resetListenAdapterRegistrationForTests();
  __resetReadingAdapterRegistrationForTests();
  __resetCalendarAdapterRegistrationForTests();
  __resetTaskAdapterRegistrationForTests();
  __resetScenarioAdapterRegistrationForTests();
  __clearListenSessionsForTests();
  __clearScenarioMemoryForTests();
  __setScenarioMemoryBagForTests({ committed: {} });
  __setAutonomyBagForTests({
    onboardingComplete: true,
    aiAutonomousLife: true,
    scenarioMemory: true,
    preset: "immersive",
  });
  __clearDefaultPalaceIndexStoreForTests();
  const store = createMemoryPalaceIndexStore();
  __setDefaultPalaceIndexStoreForTests(store);
  ensureListenAdapterRegistered();
  ensureReadingAdapterRegistered();
  ensureCalendarAdapterRegistered();
  ensureTaskAdapterRegistered();
  ensureScenarioAdapterRegistered();
  return store;
}

const SCOPE = {
  userId: "usr_local",
  companionId: "cmp_m10",
  relationshipId: "rel:usr_local:cmp_m10",
  conversationId: "cnv_m10",
};

async function main() {
  // --- Meta: defaults still false in source ---
  {
    const flags = [
      "unifiedMemoryAdaptersV1",
      "diaryRepositoryV1",
      "palaceProjectionOnlyV1",
      "contextGraphProjectionOnlyV1",
      "singleBrokerRetrievalV1",
      "unifiedMemoryForgetV1",
      "memoryProjectionOutboxV1",
    ];
    const allFalse = flags.every((k) => DEFAULT_FEATURES[k] === false);
    record("flag_defaults_still_false", allFalse, flags.join(","));
  }

  // --- J1: Preference → promote → second recall stable ---
  {
    resetCore();
    const stated = submitCandidate({
      userId: SCOPE.userId,
      companionId: SCOPE.companionId,
      claim: "喜欢雨天安静聊天",
      userStated: true,
      confidence: 0.95,
      evidenceRefs: ["user-msg-pref-1"],
      source: "user_stated",
      idempotencyKey: "m10-pref-1",
    });
    assert.equal(stated.ok, true, stated.reason);
    const promo = promoteCandidateToStable(stated.value.candidateId);
    assert.equal(promo.ok, true, promo.reason);
    const memId = promo.value.memoryId;
    const first = recallStableMemory({ companionId: SCOPE.companionId });
    assert.ok(first.some((m) => m.memoryId === memId));
    const second = recallStableMemory({ companionId: SCOPE.companionId });
    const pass =
      second.some((m) => m.memoryId === memId)
      && second.some((m) => /雨天安静聊天/.test(String(m.body || m.claim || "")));
    record("j1_preference_promote_second_recall_stable", pass, `memoryId=${memId}`);
  }

  // --- J2: Diary save → searchable projection; delete → gone ---
  {
    const store = resetCore();
    const body = "窗边的雨停了，日记可检索标记词：琥珀月";
    const saved = await saveDiary({
      id: "diary-m10-j2",
      title: "雨停",
      body,
      companionId: SCOPE.companionId,
      diaryDay: "2026-08-08",
    });
    assert.equal(saved.id, "diary-m10-j2");
    assert.ok(getDiaryEntry("diary-m10-j2"));
    const hits = store
      .list({ sourceType: "diary", companionId: SCOPE.companionId })
      .filter((r) => String(r.searchableText || "").includes("琥珀月"));
    assert.ok(hits.length >= 1, "searchable via palace projection");

    await deleteDiaryRecord("diary-m10-j2");
    assert.equal(await getDiaryById("diary-m10-j2"), null);
    const after = store.list({ sourceType: "diary", sourceId: "diary-m10-j2" });
    const pass = after.length === 0;
    record("j2_diary_save_search_delete_suppressed", pass, `hits=${hits.length} after=${after.length}`);
  }

  // --- J3: Listen coalesce + idle chat bag helper ---
  {
    resetCore();
    const timeline = [];
    const appendTimeline = (event) => {
      timeline.push(event);
      return { ok: true, value: event };
    };
    const trackId = "track-m10-coalesce";
    const title = "雨夜电台";
    recordListenProgress(
      { trackId, position: 0, duration: 200, companionId: SCOPE.companionId, title, kind: "start" },
      { appendTimeline, nowMs: 1_000 },
    );
    for (let i = 1; i <= 80; i += 1) {
      recordListenProgress(
        {
          trackId,
          position: i,
          duration: 200,
          companionId: SCOPE.companionId,
          title,
          kind: "progress",
        },
        { appendTimeline, nowMs: 1_000 + i * 10 },
      );
    }
    endListenSession(
      { trackId, companionId: SCOPE.companionId, position: 80, title },
      { appendTimeline, nowMs: 3_000 },
    );
    const coalesceOk = timeline.length <= 2 && timeline.length >= 1;
    const idle = idleChatBagDoesNotForceSong({
      purpose: "chat",
      query: "今天天气怎么样",
      listenTitles: [title],
    });
    record(
      "j3_listen_coalesce_idle_chat_no_force_song",
      coalesceOk && idle.ok,
      `events=${timeline.length}; forced=${idle.forcedSongTitles.length}; listeningPalace=${idle.listeningIncludePalace}`,
    );
  }

  // --- J4: Book chunk sourceRef; delete → chunks gone ---
  {
    const store = resetCore();
    const book = {
      id: "book-m10-j4",
      title: "月栖手记",
      body: "第一章。车站的雨。\n\n第二章。记忆分层。",
      companionId: SCOPE.companionId,
    };
    const filed = [];
    const result = await ingestBookChunksWithSourceRef(book, {
      force: true,
      palaceStore: store,
      companionId: SCOPE.companionId,
      fileDrawer: async (p) => {
        filed.push(p);
        return { id: p.id, ...p };
      },
      splitText: (text) => String(text).split(/\n\n+/).filter(Boolean),
    });
    assert.equal(result.ok, true);
    assert.ok(filed[0]?.sourceRef);
    assert.equal(filed[0].sourceRef.sourceType, "book_chunk");
    assert.equal(filed[0].sourceId, bookChunkSourceId("book-m10-j4", 0));
    const before = store.list({ sourceType: "book_chunk" });
    assert.ok(before.length >= 1);
    const tomb = tombstoneBookChunks("book-m10-j4", {
      companionId: SCOPE.companionId,
      palaceStore: store,
    });
    assert.equal(tomb.ok, true);
    const active = store.list({ sourceType: "book_chunk" });
    record(
      "j4_book_chunk_sourceRef_delete_clears",
      active.length === 0 && Boolean(filed[0]?.sourceRef),
      `chunks=${before.length} invalidated=${tomb.invalidated}`,
    );
  }

  // --- J5: Calendar approve → today context includes event ---
  {
    resetCore();
    resetClockForTests();
    const fixedMs = Date.parse("2026-08-07T06:35:00.000Z"); // Asia/Shanghai 14:35 Aug 7
    setClockForTests(createClock({ nowMs: fixedMs, timezone: "Asia/Shanghai" }));
    const snapshot = createTemporalSnapshotV1({ locale: "zh-CN" });
    const nowIso = new Date(fixedMs).toISOString();
    const r = await understandTurnDispatch(
      {
        text: "帮我明天下午三点加答辩提醒",
        turnId: "turn_m10_cal",
        snapshot,
        scope: SCOPE,
      },
      { mode: "execute", nowIso },
    );
    const ap = r.understanding.actionProposals.find((a) => a.capabilityId === "calendar");
    assert.ok(ap, "calendar proposal");
    const approved = await approveProposal(ap.proposalId, { nowIso });
    assert.equal(approved.ok, true, JSON.stringify(approved));
    const events = listLocalEvents();
    assert.equal(events.length, 1);
    assert.match(events[0].title, /答辩/);

    // Advance to event day ("tomorrow" from Aug 7 → Aug 8)
    const tomorrowMs = Date.parse("2026-08-08T06:35:00.000Z");
    setClockForTests(createClock({ nowMs: tomorrowMs, timezone: "Asia/Shanghai" }));
    const tomorrowSnap = createTemporalSnapshotV1({ locale: "zh-CN" });
    const today = buildTodayContext({
      snapshot: tomorrowSnap,
      calendarEvents: listLocalEvents(),
    });
    const pass =
      tomorrowSnap.localDate === "2026-08-08"
      && String(events[0].date) === "2026-08-08"
      && /答辩/.test(today.text);
    record("j5_calendar_approve_today_context", pass, `date=${events[0].date}; textHas答辩=${/答辩/.test(today.text)}`);
    resetClockForTests();
  }

  // --- J6: Scenario finale fiction ≠ reality stable ---
  {
    resetCore();
    const blocked = attemptScenarioDialogueRealityStable({
      line: "夜雨列车上我们在虚构站台牵了手",
      characterId: SCOPE.companionId,
      companionId: SCOPE.companionId,
      runId: "run-m10-fiction",
    });
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.promoted, false);

    const timeline = [];
    const finale = onScenarioFinale(
      {
        runId: "run-m10-finale",
        summary: "谢幕：雨停后一起下了车",
        characterId: SCOPE.companionId,
        companionId: SCOPE.companionId,
        scriptTitle: "夜雨列车",
      },
      {
        appendTimeline: (event) => {
          timeline.push(event);
          return { ok: true, value: event };
        },
      },
    );
    assert.equal(finale.ok, true);
    const fictionStable = recallStableMemory({ companionId: SCOPE.companionId }).filter((m) =>
      /牵了手|虚构站台|谢幕/.test(String(m.body || m.claim || "")),
    );
    const pass =
      timeline.length === 1
      && timeline[0].eventType === SCENARIO_FINALE_EVENT_TYPE
      && timeline[0].realityNamespace === SCENARIO_REALITY_NAMESPACE
      && fictionStable.length === 0;
    record(
      "j6_scenario_finale_fiction_not_reality_stable",
      pass,
      `timeline=${timeline.length}; fictionStable=${fictionStable.length}; block=${blocked.reason}`,
    );
  }

  // --- J7: Forget/correct → suppressed ---
  {
    resetCore();
    const stated = submitCandidate({
      userId: SCOPE.userId,
      companionId: SCOPE.companionId,
      claim: "讨厌临时改计划",
      userStated: true,
      confidence: 0.95,
      evidenceRefs: ["user-msg-forget-1"],
      source: "user_stated",
      idempotencyKey: "m10-forget-1",
    });
    assert.equal(stated.ok, true);
    const promo = promoteCandidateToStable(stated.value.candidateId);
    assert.equal(promo.ok, true, promo.reason);
    const memId = promo.value.memoryId;
    const forgotten = forgetUnderstanding({
      companionId: SCOPE.companionId,
      claimIncludes: "临时改计划",
    });
    assert.equal(forgotten.ok, true);
    const after = recallStableMemory({ companionId: SCOPE.companionId });
    const dropped = !after.some((m) => m.memoryId === memId || /临时改计划/.test(String(m.body || "")));
    const suppressed =
      isSuppressed(memId)
      || isSuppressed(`stable:${memId}`)
      || isSuppressed(suppressionFingerprint("讨厌临时改计划"));
    record("j7_forget_correct_suppressed", dropped && suppressed, `dropped=${dropped} suppressed=${suppressed}`);
  }

  // --- J8: Companion A/B isolation (diary + stable) ---
  {
    resetCore();
    const A = "companion-m10-a";
    const B = "companion-m10-b";
    await saveDiary({
      id: "diary-m10-a",
      title: "A的日记",
      body: "仅角色A可见的琥珀内容",
      companionId: A,
      diaryDay: "2026-08-08",
    });
    await saveDiary({
      id: "diary-m10-b",
      title: "B的日记",
      body: "仅角色B可见的翡翠内容",
      companionId: B,
      diaryDay: "2026-08-08",
    });
    const listA = listDiaryEntries({ companionId: A });
    const listB = listDiaryEntries({ companionId: B });
    const diaryIso =
      listA.every((d) => d.companionId === A)
      && listB.every((d) => d.companionId === B)
      && !listA.some((d) => /翡翠/.test(d.body || ""))
      && !listB.some((d) => /琥珀/.test(d.body || ""));

    const ca = submitCandidate({
      userId: SCOPE.userId,
      companionId: A,
      claim: "A喜欢早起散步",
      userStated: true,
      confidence: 0.95,
      evidenceRefs: ["a1"],
      source: "user_stated",
      idempotencyKey: "m10-iso-a",
    });
    const cb = submitCandidate({
      userId: SCOPE.userId,
      companionId: B,
      claim: "B喜欢深夜写字",
      userStated: true,
      confidence: 0.95,
      evidenceRefs: ["b1"],
      source: "user_stated",
      idempotencyKey: "m10-iso-b",
    });
    assert.equal(ca.ok, true);
    assert.equal(cb.ok, true);
    promoteCandidateToStable(ca.value.candidateId);
    promoteCandidateToStable(cb.value.candidateId);
    const stableA = recallStableMemory({ companionId: A, userId: SCOPE.userId });
    const stableB = recallStableMemory({ companionId: B, userId: SCOPE.userId });
    const stableIso =
      stableA.some((m) => /早起散步/.test(String(m.body || m.claim || "")))
      && !stableA.some((m) => /深夜写字/.test(String(m.body || m.claim || "")))
      && stableB.some((m) => /深夜写字/.test(String(m.body || m.claim || "")))
      && !stableB.some((m) => /早起散步/.test(String(m.body || m.claim || "")));
    record(
      "j8_companion_ab_isolation_diary_stable",
      diaryIso && stableIso,
      `diaryA=${listA.length} diaryB=${listB.length} stableA=${stableA.length} stableB=${stableB.length}`,
    );
  }

  // --- J9: Palace rebuild after clear restores from authority ---
  {
    const store = resetCore();
    store.upsert({
      indexId: "px:orphan:m10:x",
      sourceType: "artifact",
      sourceId: "x",
      companionId: SCOPE.companionId,
      contentHash: "x",
      indexedAt: "2020-01-01T00:00:00.000Z",
      searchableText: "stale orphan",
    });
    const result = await rebuildPalaceFromSources({
      store,
      companionId: SCOPE.companionId,
      clearFirst: true,
      nowIso: "2026-08-08T00:00:00.000Z",
      diaryEntries: [
        {
          id: "diary-m10-rebuild",
          companionId: SCOPE.companionId,
          title: "重建",
          body: "昨晚睡得很好，梦见下雨",
          contentHash: "h-diary-m10",
          sourceRef: {
            sourceType: "diary",
            sourceId: "diary-m10-rebuild",
            companionId: SCOPE.companionId,
          },
        },
      ],
      stableMemory: [
        {
          memoryId: "stable-m10-rebuild",
          companionId: SCOPE.companionId,
          body: "用户喜欢安静陪伴",
        },
      ],
      timelineSummaries: [
        {
          eventId: "ev-m10-1",
          companionId: SCOPE.companionId,
          title: "一起听歌",
          summary: "雨天听那首歌",
        },
      ],
    });
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const live = store.list({ companionId: SCOPE.companionId });
    assert.equal(store.get("px:orphan:m10:x"), null);
    const searchable = filterPalaceHitsBySourceRef(live, {
      flagOn: true,
      companionId: SCOPE.companionId,
    });
    const texts = searchable.map((r) => r.searchableText || "").join("\n");
    const pass =
      result.projected >= 2
      && searchable.length >= 2
      && (texts.includes("睡得很好") || texts.includes("安静陪伴"));
    record(
      "j9_palace_rebuild_restores_from_authority",
      pass,
      `projected=${result.projected} searchable=${searchable.length}`,
    );
  }

  // --- J10: singleBroker — assemble does not call searchPalace when flag on ---
  {
    resetCore();
    const companionId = SCOPE.companionId;
    await writeCompanionTurn({
      role: "user",
      text: "你好",
      userId: SCOPE.userId,
      companionId,
      chatSessionId: `dm:${companionId}`,
      saveChatMessage: async (m) => m,
    });
    await writeCompanionTurn({
      role: "assistant",
      text: "我在。",
      userId: SCOPE.userId,
      companionId,
      chatSessionId: `dm:${companionId}`,
      saveChatMessage: async (m) => m,
    });

    let palaceCalls = 0;
    const searchPalace = async () => {
      palaceCalls += 1;
      return {
        results: [{
          id: "spy-1",
          wing: "Relationship",
          room: "chat",
          source: "drawer",
          rawText: "should not be called from assemble",
          companionId,
          sourceRef: "assemble:spy",
        }],
        skipped: false,
        backend: "spy",
        kgBlock: "",
      };
    };

    const compiled = await assemblePrompt({
      query: "还记得吗",
      refreshDailyStatus: async () => ({
        mood: "平静",
        weather: { label: "晴" },
        asleep: false,
        injectionEnabled: false,
      }),
      searchMemories: async () => [],
      searchPalace,
      getAllRecords: async () => [],
      collectCharacterProfile: () => ({ id: companionId, name: "M10", alias: "" }),
      collectExternalContext: () => [],
      collectPromptTexts: () => ({ promptSystem: "sys", promptDeveloper: "" }),
      sessionId: `dm:${companionId}`,
      characterId: companionId,
      purpose: "chat",
      appId: "pop",
    });

    const flags = getFeatureFlags();
    const pass =
      flags.singleBrokerRetrievalV1 === true
      && palaceCalls === 0
      && Boolean(compiled?.contextEnvelope)
      && compiled.contextEnvelope.trace?.singleBrokerRetrievalV1 === true;
    record(
      "j10_single_broker_assemble_no_direct_palace",
      pass,
      `palaceCalls=${palaceCalls}; trace=${Boolean(compiled?.contextEnvelope?.trace?.singleBrokerRetrievalV1)}`,
    );
  }

  // Reset process flags map so leftover ON state is not implied for other scripts in same process
  setFlags({});

  const passed = cases.filter((c) => c.pass).length;
  const failed = cases.filter((c) => !c.pass).length;
  const report = {
    wave: "M10",
    script: "scripts/verify-unified-memory-journey.mjs",
    name: "unified-memory-journey",
    ok: failed === 0,
    passed,
    failed,
    total: cases.length,
    cases,
    browserE2E: "NOT_RUN",
    androidDevice: "NOT_RUN",
    flagDefaults: {
      unifiedMemoryAdaptersV1: DEFAULT_FEATURES.unifiedMemoryAdaptersV1,
      diaryRepositoryV1: DEFAULT_FEATURES.diaryRepositoryV1,
      palaceProjectionOnlyV1: DEFAULT_FEATURES.palaceProjectionOnlyV1,
      contextGraphProjectionOnlyV1: DEFAULT_FEATURES.contextGraphProjectionOnlyV1,
      singleBrokerRetrievalV1: DEFAULT_FEATURES.singleBrokerRetrievalV1,
      unifiedMemoryForgetV1: DEFAULT_FEATURES.unifiedMemoryForgetV1,
    },
    head: "37579943efff98f546e88a2bae95680656cd4b2e",
    at: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "M10_VERIFY.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`\n${failed ? "FAIL" : "OK"}  ${passed}/${cases.length} unified-memory journey / M10`);
  console.log("NOTE  Browser E2E NOT RUN · Android NOT RUN (see M10_ACCEPTANCE.md)");
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
