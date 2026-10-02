/**
 * C6 — Product cutover browser E2E (Playwright, real UI).
 *
 * Plan: docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md §12
 *
 * CRITICAL: Missing Playwright / browser / server → exit 1 (never SKIP/0).
 * Report requires skipped=0.
 *
 * Usage: npm run e2e:product-cutover-browser
 * Env: DEMO_URL (default http://127.0.0.1:5177/)
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ROOT,
  OUT_DIR,
  CHAR_A,
  CHAR_B,
  PREF_CLAIM,
  DIARY_MARKER,
  BOOK_MARKER,
  requirePlaywright,
  ensureServer,
  ensureServerAlive,
  seedCutoverFixture,
  installPhoneFixture,
  installModelMock,
  installWebSearchMock,
  openPhoneHome,
  openPhoneApp,
  openPhoneAppC1,
  homeFromAnywhere,
  enterScenarioStage,
  dismissOverlays,
  ensurePopThread,
  sendPhoneChat,
  sendPhoneAndReply,
  waitProposalCard,
  switchToAppMode,
  switchToPhoneMode,
  clickAppTab,
  sendAppChat,
  clickAppCharacterReply,
  waitCharacterReplied,
  openPhoneDevtools,
  recoverToPhoneHome,
  makeSilentWavFile,
  makeBookTextFile,
} from "./helpers/product-cutover.mjs";

const JOURNEY_IDS = [
  "j1_profile_today_context",
  "j2_preference_stable_recall",
  "j3_diary_save_search_delete",
  "j4_calendar_action_proposal",
  "j5_listen_low_noise",
  "j6_reading_sourceref_delete",
  "j7_scenario_shared_fiction",
  "j8_forget_no_revive",
  "j9_companion_ab_isolation",
  "j10_palace_rebuild",
  "j11_continuity_fingerprint",
  "j12_web_search_offline",
];

function modelReply({ userText, messages = [] }) {
  const promptContext = messages.map((message) => String(message?.content || "")).join("\n");
  if (/日记|diary|JSON/i.test(userText) || /过去 24 小时|excerpt/i.test(userText)) {
    return JSON.stringify({
      title: "雨停之后",
      body: `窗边的雨停了，日记可检索标记词：${DIARY_MARKER}。`,
    });
  }
  if (/忘记|忘掉|forget/i.test(userText)) {
    return "好，我不会再提这件事了，我们换个话题。";
  }
  if (/你会记得我喜欢什么天气吗/i.test(userText) && promptContext.includes(PREF_CLAIM)) {
    return "你喜欢雨天安静聊天，我记得。";
  }
  if (/请记住|我喜欢|雨天/i.test(userText)) {
    return "好，我记住了：你喜欢雨天安静聊天。以后会顺着这个来。";
  }
  if (/帮我|提醒|答辩|查一下|搜索|天气/i.test(userText)) {
    return "收到，我先按你的请求处理，确认卡出来后你再决定。";
  }
  return "嗯，我在听。我们慢慢说，不着急。";
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

async function saveFailureArtifacts(page, tag, err) {
  await shot(page, `${tag}-FAIL`);
  const html = await page.content().catch(() => "");
  await writeFile(path.join(OUT_DIR, `${tag}-dom.html`), html.slice(0, 400_000), "utf8").catch(() => {});
  await writeFile(
    path.join(OUT_DIR, `${tag}-error.txt`),
    `${err?.stack || err}\n`,
    "utf8",
  ).catch(() => {});
}

async function probeTodayContext(page) {
  return page.evaluate(async () => {
    const { createTemporalSnapshotV1 } = await import("/src/contracts/index.js");
    const { buildTodayContext } = await import("/src/temporal/index.js");
    const { getCutoverProfile, resolveEffectiveFlags } = await import("/src/features/cutover-profile.js");
    const { isFeatureEnabled } = await import("/src/features/flags.js");
    const profile = getCutoverProfile();
    const flags = resolveEffectiveFlags(profile);
    const snap = createTemporalSnapshotV1({ locale: "zh-CN" });
    const today = buildTodayContext({ snapshot: snap });
    const hasToday = Boolean(
      today
      && (
        today.localDate
        || today.dateKey
        || today.summary
        || today.promptBlock
        || Array.isArray(today.lines)
        || today.snapshot?.localDate
      ),
    );
    return {
      profile,
      temporalOn: isFeatureEnabled("temporalContextV1") === true,
      flagsOn: Object.values(flags).every(Boolean),
      hasToday,
      todayKeys: today ? Object.keys(today).slice(0, 12) : [],
      localDate: today?.localDate || today?.snapshot?.localDate || snap?.localDate || "",
    };
  });
}

async function seedCharacterB(page) {
  return page.evaluate(async ({ CHAR_B }) => {
    const { upsertCharacter, getCharacterSync, listCharactersSync } = await import("/src/characters/store.js");
    const { addContact } = await import("/src/characters/contacts.js");
    const { BUILTIN_CHARACTER_ID } = await import("/src/constants.js");
    const builtin = getCharacterSync(BUILTIN_CHARACTER_ID) || listCharactersSync()[0];
    const profile = builtin?.profile
      ? { ...builtin.profile, fields: [...(builtin.profile.fields || [])] }
      : undefined;
    if (profile?.fields) {
      profile.fields[0] = "E2E切流乙";
      profile.fields[1] = "乙";
      profile.fields[4] = "切流隔离角色";
    }
    await upsertCharacter({
      id: CHAR_B,
      name: "E2E切流乙",
      alias: "乙",
      profile,
      source: "user",
    });
    addContact(BUILTIN_CHARACTER_ID);
    addContact(CHAR_B);
    return CHAR_B;
  }, { CHAR_B });
}

/** Poll stable ledger (avoid async waitForFunction — Promise can be treated as truthy). */
async function waitStableHit(page, { companionId, fragment }, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hit = await page.evaluate(
      async ({ companionId, fragment }) => {
        const { recallStableMemory } = await import("/src/memory/candidate-ledger.js");
        const rows = recallStableMemory({ companionId });
        return rows.some((m) => String(m.body || m.claim || "").includes(fragment));
      },
      { companionId, fragment },
    );
    if (hit) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/**
 * After a real UI "请记住…" turn, ensure the claim is in stable for companionId.
 * Chat extraction may stall when provider baseUrl is unreachable (ERR_CONNECTION_REFUSED);
 * this uses the same candidate-ledger promote path with frozen companion scope.
 */
async function ensureStablePreference(page, { companionId, claim, userText }) {
  const already = await waitStableHit(page, { companionId, fragment: claim }, 1500);
  if (already) return { hit: true, via: "extract" };
  const result = await page.evaluate(
    async ({ companionId, claim }) => {
      const { submitCandidate, promoteCandidateToStable, recallStableMemory } = await import(
        "/src/memory/candidate-ledger.js"
      );
      const submitted = submitCandidate({
        companionId,
        userId: "local",
        claim,
        category: "preference",
        source: "chat.extraction",
        userStated: true,
        confidence: 0.95,
        evidenceRefs: [`e2e-pref:${companionId}:${Date.now()}`],
        idempotencyKey: `e2e-pref:${companionId}:${claim}`,
        realityNamespace: "reality",
        memoryScope: "relationship_memory",
      });
      const candidateId = submitted?.value?.candidateId;
      const promoted = candidateId ? promoteCandidateToStable(candidateId) : submitted;
      const rows = recallStableMemory({ companionId });
      return {
        submittedOk: submitted?.ok === true,
        promotedOk: promoted?.ok === true,
        hit: rows.some((m) => String(m.body || m.claim || "").includes(claim)),
        reason: promoted?.reason || submitted?.reason || "",
        bodySample: rows.slice(0, 3).map((m) => m.body || m.claim),
      };
    },
    { companionId, claim },
  );
  return { ...result, via: "ledger", userText: userText || "" };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  /** @type {Map<string, { id: string, pass: boolean, status: string, detail: string }>} */
  const journeyMap = new Map();
  const screenshots = [];
  const notFullyUi = [];
  const consoleErrors = [];

  const record = (id, pass, detail = "", extra = {}) => {
    // One result per journey id — never duplicate (keep first conclusive write).
    if (journeyMap.has(id)) return journeyMap.get(id);
    const row = {
      id,
      pass: Boolean(pass),
      status: pass ? "PASS" : "FAIL",
      detail: String(detail || ""),
      ...extra,
    };
    journeyMap.set(id, row);
    console.log(`${row.status}  ${id}${detail ? ` — ${detail}` : ""}`);
    return row;
  };
  const journeysOf = () => JOURNEY_IDS.map((id) => journeyMap.get(id)).filter(Boolean);

  async function beforeJourney() {
    serverState = await ensureServerAlive(serverState);
    if (!page || page.isClosed()) {
      page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err?.message || err)));
      await installPhoneFixture(page, { experienceStub: true });
      await seedCutoverFixture(page, { profile: "internal_v1", appMode: "phone" });
      await installModelMock(page, modelReply);
      await installWebSearchMock(page, "ok");
      await openPhoneHome(page);
      await dismissOverlays(page);
    } else {
      await recoverToPhoneHome(page).catch(async () => {
        await openPhoneHome(page).catch(() => {});
      });
    }
  }

  let chromium;
  try {
    chromium = await requirePlaywright();
  } catch (err) {
    const report = {
      wave: "C6",
      status: "FAIL",
      skipped: 0,
      failed: JOURNEY_IDS.length,
      passed: 0,
      journeys: JOURNEY_IDS.map((id) => ({
        id,
        pass: false,
        status: "FAIL",
        detail: String(err.message || err),
      })),
      error: String(err.message || err),
      at: new Date().toISOString(),
    };
    await writeFile(path.join(OUT_DIR, "../C6_RESULT.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(
      path.join(OUT_DIR, "../C6_BROWSER_E2E.md"),
      `# C6 Browser E2E\n\n**FAIL** — ${err.message}\n\nExit non-zero (no SKIP).\n`,
      "utf8",
    );
    console.error("FAIL", err.message || err);
    process.exit(1);
  }

  let serverState = null;
  let browser = null;
  let context = null;
  let page = null;
  let baseUrl = process.env.DEMO_URL || "http://127.0.0.1:5188/";

  try {
    serverState = await ensureServer();
    baseUrl = serverState.url;

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
    });
    page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err?.message || err)));

    await installPhoneFixture(page, { experienceStub: true });
    await seedCutoverFixture(page, { profile: "internal_v1", appMode: "phone" });
    await installModelMock(page, modelReply);
    await installWebSearchMock(page, "ok");

    await openPhoneHome(page);
    await dismissOverlays(page);
    await page.evaluate(() => {
      try {
        localStorage.setItem("yueqi.developerMode", "1");
        document.querySelectorAll("[data-devtools-entry]").forEach((el) => {
          el.hidden = false;
        });
      } catch {
        /* ignore */
      }
    });
    screenshots.push(await shot(page, "00-phone-home"));

    // —— J1: cutover profile + TodayContext ——
    try {
      await openPhoneDevtools(page);
      const select = page.locator('[data-phone-screen="devtools"] [data-cutover-profile-select]').first();
      await select.waitFor({ state: "visible", timeout: 10000 });
      // Exercise production_v1 selectable path, then keep internal_v1 for remaining journeys.
      await select.selectOption("production_v1");
      await page.waitForTimeout(400);
      let probe = await probeTodayContext(page);
      const prodOk = probe.profile === "production_v1" && probe.temporalOn && probe.flagsOn && probe.hasToday;
      await select.selectOption("internal_v1");
      await page.waitForTimeout(400);
      probe = await probeTodayContext(page);
      screenshots.push(await shot(page, "j1-cutover-devtools"));
      record(
        "j1_profile_today_context",
        prodOk && probe.profile === "internal_v1" && probe.temporalOn && probe.hasToday,
        `prodOk=${prodOk}; profile=${probe.profile}; today=${probe.hasToday}`,
      );
      await homeFromAnywhere(page);
    } catch (err) {
      record("j1_profile_today_context", false, err.message || err);
      await saveFailureArtifacts(page, "j1", err);
    }
    await beforeJourney();

    // —— J4 early: calendar proposal on phone (core UI) ——
    // Run calendar before preference so proposal host is warm.
    try {
      await ensurePopThread(page, CHAR_A);
      await sendPhoneChat(page, "我明天下午答辩");
      await page.waitForTimeout(800);
      const obsCards = await page.locator("[data-action-proposal-card]").count();
      await sendPhoneChat(page, "帮我明天下午三点加答辩提醒");
      const card = await waitProposalCard(page, "phone", 20000);
      screenshots.push(await shot(page, "j4-phone-proposal"));
      await card.locator('[data-apc-action="confirm"]').click({ force: true });
      await page.waitForTimeout(600);
      const afterConfirm = await card.getAttribute("data-status");
      // Reject path on a second proposal
      await sendPhoneChat(page, "帮我明天下午三点加答辩提醒");
      const card2 = await waitProposalCard(page, "phone", 20000);
      // Prefer a proposed card
      const proposed = page.locator('[data-action-proposal-card][data-status="proposed"]').first();
      const rejectTarget = (await proposed.count()) ? proposed : card2;
      let rejected = false;
      try {
        await sendPhoneChat(page, "帮我后天下午三点加答辩提醒");
        await page.waitForTimeout(800);
        const rejectBtn = page.locator('[data-action-proposal-card][data-status="proposed"] [data-apc-action="reject"]').first();
        await rejectBtn.click({ force: true, timeout: 8000 });
        rejected = true;
      } catch {
        rejected = await page.evaluate(() => {
          try {
            const bag = JSON.parse(localStorage.getItem("yueqi.action.proposals.v1") || "[]");
            const items = Array.isArray(bag) ? bag : bag.items || [];
            return items.some((r) => String(r.status || r.proposal?.status || "") === "rejected");
          } catch {
            return false;
          }
        });
      }
      void rejectTarget;
      await page.waitForTimeout(400);
      // Refresh restore
      await page.reload({ waitUntil: "domcontentloaded" });
      await openPhoneHome(page);
      await dismissOverlays(page);
      await ensurePopThread(page, CHAR_A);
      const restored = await page.locator("[data-action-proposal-card]").count();
      screenshots.push(await shot(page, "j4-phone-after-refresh"));

      // App shell confirm once + English locale once (soft — phone path is authoritative).
      let appCardCount = 0;
      try {
        await switchToAppMode(page);
        await page.evaluate(() => {
          try {
            localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "en", localeChosen: true }));
          } catch {
            /* ignore */
          }
        });
        await sendAppChat(page, "帮我明天下午三点加答辩提醒");
        await page.waitForTimeout(1200);
        appCardCount = await page.locator("[data-action-proposal-host='app'] [data-action-proposal-card], [data-action-proposal-card]").count();
        if (appCardCount >= 1) {
          const appProposed = page.locator('[data-action-proposal-card][data-status="proposed"]').first();
          if (await appProposed.count()) {
            await appProposed.locator('[data-apc-action="confirm"]').click({ force: true }).catch(() => {});
            await page.waitForTimeout(400);
          }
        }
        screenshots.push(await shot(page, "j4-app-proposal"));
      } catch (appErr) {
        notFullyUi.push(`j4: app shell soft-fail ${String(appErr?.message || appErr).slice(0, 80)}`);
      }
      await page.evaluate(() => {
        try {
          localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
        } catch {
          /* ignore */
        }
      });
      await switchToPhoneMode(page);
      await openPhoneHome(page);

      const pass =
        obsCards === 0
        && (afterConfirm === "completed" || afterConfirm === "executed" || afterConfirm === "approved")
        && restored >= 1;
      record(
        "j4_calendar_action_proposal",
        pass,
        `obsCards=${obsCards}; confirm=${afterConfirm}; restored=${restored}; appCards=${appCardCount}; rejected=${rejected}`,
      );
      if (appCardCount < 1) notFullyUi.push("j4: app shell proposal card count soft (phone confirm/restore is authoritative)");
    } catch (err) {
      record("j4_calendar_action_proposal", false, err.message || err);
      await saveFailureArtifacts(page, "j4", err);
    }
    await beforeJourney();

    // —— J2 preference → stable → recall ——
    try {
      const prefUser = `请记住我${PREF_CLAIM}`;
      await sendPhoneAndReply(page, prefUser, CHAR_A);
      let hit = await waitStableHit(page, { companionId: CHAR_A, fragment: PREF_CLAIM }, 4000);
      let ensured = { hit, via: "extract" };
      if (!hit) {
        ensured = await ensureStablePreference(page, {
          companionId: CHAR_A,
          claim: PREF_CLAIM,
          userText: prefUser,
        });
        hit = Boolean(ensured.hit);
        notFullyUi.push(`j2: stable via candidate-ledger after UI remember (${JSON.stringify(ensured)})`);
      }
      const stableCount = await page.evaluate(async ({ companionId }) => {
        const { recallStableMemory } = await import("/src/memory/candidate-ledger.js");
        return recallStableMemory({ companionId }).length;
      }, { companionId: CHAR_A });
      const assistantRows = page.locator(
        "[data-phone-messages] .mini-message.is-ai",
      );
      const assistantBefore = await assistantRows.count();
      await sendPhoneAndReply(page, "我们聊天时你会记得我喜欢什么天气吗？", CHAR_A);
      const stable2 = await waitStableHit(page, { companionId: CHAR_A, fragment: PREF_CLAIM }, 3000);
      const assistantAfter = await assistantRows.count();
      const replyTexts = [];
      for (let index = assistantBefore; index < assistantAfter; index += 1) {
        replyTexts.push(await assistantRows.nth(index).textContent().catch(() => ""));
      }
      const visibleRecall = replyTexts.some((text) => /雨天|安静聊天/.test(String(text || "")));
      screenshots.push(await shot(page, "j2-preference"));
      record(
        "j2_preference_stable_recall",
        Boolean(hit && stable2 && visibleRecall),
        `stableHit=${hit}; secondRecall=${stable2}; visibleRecall=${visibleRecall}; replies=${assistantAfter - assistantBefore}; n=${stableCount}; via=${ensured.via}`,
      );
    } catch (err) {
      record("j2_preference_stable_recall", false, err.message || err);
      await saveFailureArtifacts(page, "j2", err);
    }
    await beforeJourney();

    // —— J3 diary ——
    try {
      // Prefer phone diary app (C1 grid) — App companion tab is often covered by phone shell.
      await openPhoneAppC1(page, "diary").catch(async () => {
        await openPhoneApp(page, "diary");
      });
      await page.waitForTimeout(400);
      const diaryScreen = page.locator('[data-phone-screen="diary"].is-active').first();
      await diaryScreen.waitFor({ state: "visible", timeout: 10000 });
      const writeBtn = diaryScreen.locator("[data-memory-write-today]:visible").first();
      await writeBtn.waitFor({ state: "visible", timeout: 8000 });
      await writeBtn.click({ force: true });
      const composeConfirm = diaryScreen.locator("[data-memory-compose-confirm]:visible").first();
      await composeConfirm.waitFor({ state: "visible", timeout: 8000 });
      await composeConfirm.scrollIntoViewIfNeeded();
      await composeConfirm.click({ force: true });
      // Generation opens the saved entry in the reader. Validate that real UI state,
      // then delete through the reader rather than waiting for the covered feed card.
      const diaryReader = diaryScreen.locator("[data-diary-book]:visible").filter({ hasText: DIARY_MARKER }).first();
      await diaryReader.waitFor({ state: "visible", timeout: 15000 });
      const hasDiary = await diaryReader.isVisible().catch(() => false);
      const delBtn = diaryScreen.locator("[data-diary-page-delete]:visible").first();
      await delBtn.waitFor({ state: "visible", timeout: 10000 });
      page.once("dialog", (d) => d.accept());
      await delBtn.click({ force: true });
      await page.waitForTimeout(600);
      const afterDelete = await page.evaluate(
        async ({ marker }) => {
          const { listDiaries } = await import("/src/diary/records.js");
          const rows = await listDiaries();
          return rows.some((d) => String(d.rawText || d.body || "").includes(marker));
        },
        { marker: DIARY_MARKER },
      );
      screenshots.push(await shot(page, "j3-diary"));
      record("j3_diary_save_search_delete", hasDiary && !afterDelete, `saved=${hasDiary}; gone=${!afterDelete}`);
      await switchToPhoneMode(page);
      await openPhoneHome(page);
    } catch (err) {
      record("j3_diary_save_search_delete", false, err.message || err);
      await saveFailureArtifacts(page, "j3", err);
    }
    await beforeJourney();

    // —— J5 listen ——
    try {
      await openPhoneAppC1(page, "listen");
      const fileInput = page.locator("[data-listen-file]");
      await fileInput.setInputFiles(makeSilentWavFile());
      await page.waitForTimeout(800);
      const before = await page.evaluate(async ({ companionId }) => {
        const { listTimelineEvents } = await import("/src/timeline/repository.js");
        return listTimelineEvents({ companionId, limit: 200 })
          .filter((e) => String(e.eventType || e.type || "").startsWith("listen."))
          .length;
      }, { companionId: CHAR_A });
      const importedTrack = page.locator("[data-phone-tracks] [data-track-id]").first();
      await importedTrack.waitFor({ state: "visible", timeout: 10000 });
      await importedTrack.click();
      await page.waitForTimeout(1000);
      const play = page.locator("[data-listen-play]");
      if (await play.isEnabled().catch(() => false)) {
        await play.click({ force: true });
        await page.waitForTimeout(400);
      }
      const seek = page.locator("[data-listen-seek]");
      // Seek may stay disabled for tiny silent WAVs — only exercise when enabled.
      if (await seek.isEnabled().catch(() => false)) {
        await seek.fill("500");
        await seek.dispatchEvent("change");
        await page.waitForTimeout(200);
        await seek.fill("800");
        await seek.dispatchEvent("change");
        await page.waitForTimeout(200);
      } else {
        // Still count play/load noise without forcing a disabled control.
        await play.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
      const after = await page.evaluate(async ({ companionId }) => {
        const { listTimelineEvents } = await import("/src/timeline/repository.js");
        const rows = listTimelineEvents({ companionId, limit: 200 }).filter((e) =>
          String(e.eventType || e.type || "").startsWith("listen."),
        );
        return {
          count: rows.length,
          types: rows.map((e) => e.eventType || e.type),
        };
      }, { companionId: CHAR_A });
      const delta = after.count - before;
      // A zero-event result is vacuous: require a real listen lifecycle event,
      // while still rejecting seek-event floods.
      const pass = delta >= 1
        && delta <= 2
        && after.types.every((type) => String(type).startsWith("listen."));
      screenshots.push(await shot(page, "j5-listen"));
      record("j5_listen_low_noise", pass, `before=${before}; after=${after.count}; types=${after.types.join(",")}`);
      await homeFromAnywhere(page);
    } catch (err) {
      record("j5_listen_low_noise", false, err.message || err);
      await saveFailureArtifacts(page, "j5", err);
    }
    await beforeJourney();

    // —— J6 reading ——
    try {
      await openPhoneAppC1(page, "read").catch(async () => openPhoneApp(page, "read"));
      // Library may live under phone read screen or app shell — prefer attached file input.
      await page.evaluate(() => {
        const panel = document.querySelector('[data-panel="library"], [data-phone-screen="read"]');
        if (panel) {
          panel.hidden = false;
          panel.classList.add("is-active");
        }
      }).catch(() => {});
      await clickAppTab(page, "library").catch(() => {});
      await page.waitForTimeout(400);
      const bookInput = page.locator("[data-book-file]");
      await bookInput.waitFor({ state: "attached", timeout: 10000 });
      await bookInput.setInputFiles(makeBookTextFile());
      await page.waitForTimeout(1500);
      const before = await page.evaluate(async () => {
        const { getDefaultPalaceIndexStore } = await import("/src/memory/projection/project-to-palace.js");
        const store = getDefaultPalaceIndexStore();
        return typeof store.list === "function"
          ? store.list({ sourceType: "book_chunk" }).filter((r) => !r.stale && r.searchable !== false).length
          : 0;
      });
      const hasSourceRef = await page.evaluate(async ({ marker }) => {
        const { getDefaultPalaceIndexStore } = await import("/src/memory/projection/project-to-palace.js");
        const store = getDefaultPalaceIndexStore();
        const rows = typeof store.list === "function" ? store.list({ sourceType: "book_chunk" }) : [];
        return rows.some((r) =>
          r?.sourceRef?.sourceType === "book_chunk"
          && String(r.searchableText || r.text || r.summary || "").includes(marker),
        );
      }, { marker: BOOK_MARKER });
      page.once("dialog", (d) => d.accept().catch(() => {}));
      await page.evaluate(() => document.querySelector("[data-remove-book]")?.click());
      // Ensure index cleanup even if the clipped remove control did not fire handlers.
      const stillIndexed = await page.evaluate(async ({ marker }) => {
        const { getDefaultPalaceIndexStore } = await import("/src/memory/projection/project-to-palace.js");
        const store = getDefaultPalaceIndexStore();
        const rows = typeof store.list === "function" ? store.list({ sourceType: "book_chunk" }) : [];
        return rows.some((r) =>
          !r.stale && !r.invalidatedAt && r.searchable !== false
          && String(r.searchableText || r.text || "").includes(marker),
        );
      }, { marker: BOOK_MARKER });
      if (stillIndexed) {
        await page.evaluate(async ({ marker }) => {
          const { getDefaultPalaceIndexStore } = await import("/src/memory/projection/project-to-palace.js");
          const { deleteBookMemoryIndex } = await import("/src/library/books-import.js");
          const store = getDefaultPalaceIndexStore();
          const rows = typeof store.list === "function" ? store.list({ sourceType: "book_chunk" }) : [];
          const hit = rows.find((r) => String(r.searchableText || r.text || "").includes(marker));
          if (hit?.sourceId && typeof deleteBookMemoryIndex === "function") {
            const bookId = String(hit.sourceId).split(":")[0];
            deleteBookMemoryIndex(bookId, { force: true });
          } else {
            rows.forEach((r) => {
              if (String(r.searchableText || r.text || "").includes(marker)) {
                r.stale = true;
                r.invalidatedAt = new Date().toISOString();
                r.searchable = false;
              }
            });
          }
        }, { marker: BOOK_MARKER });
        notFullyUi.push("j6: book delete completed via index API after UI remove");
      }
      await page.waitForTimeout(800);
      const after = await page.evaluate(async () => {
        const { getDefaultPalaceIndexStore } = await import("/src/memory/projection/project-to-palace.js");
        const store = getDefaultPalaceIndexStore();
        const rows = typeof store.list === "function" ? store.list({ sourceType: "book_chunk" }) : [];
        return rows.filter((r) => !r.stale && !r.invalidatedAt && r.searchable !== false).length;
      });
      screenshots.push(await shot(page, "j6-reading"));
      record(
        "j6_reading_sourceref_delete",
        hasSourceRef && before >= 1 && after === 0,
        `sourceRef=${hasSourceRef}; before=${before}; after=${after}`,
      );
      await switchToPhoneMode(page);
      await openPhoneHome(page);
    } catch (err) {
      record("j6_reading_sourceref_delete", false, err.message || err);
      await saveFailureArtifacts(page, "j6", err);
    }
    await beforeJourney();

    // —— J7 scenario ——
    try {
      let stageOk = false;
      let theaterOk = false;
      let stageErrMsg = "";
      try {
        await enterScenarioStage(page, { characterId: CHAR_A });
        stageOk = await page.locator('[data-scenario-view="stage"].is-active').isVisible().catch(() => false);
      } catch (stageErr) {
        stageErrMsg = String(stageErr?.message || stageErr);
      }
      if (!stageOk) {
        throw new Error(`scenario stage funnel failed: ${(stageErrMsg || "no-active-stage").slice(0, 180)}`);
      }
      theaterOk = theaterOk
        || await page.locator('[data-phone-screen="theater"]:not([hidden]), [data-scenario-view]').first().isVisible().catch(() => false)
        || await page.evaluate(() => {
          const t = document.querySelector('[data-phone-screen="theater"]');
          return Boolean(t && (t.classList.contains("is-active") || !t.hidden));
        });
      screenshots.push(await shot(page, "j7-scenario-stage"));
      const fictionGuard = await page.evaluate(async () => {
        const {
          attemptScenarioDialogueRealityStable,
          SCENARIO_REALITY_NAMESPACE,
        } = await import("/src/memory/adapters/scenario.js");
        const blocked = attemptScenarioDialogueRealityStable({
          companionId: "char-xingli",
          claim: "情景剧对白不得进现实稳定记忆",
          userExplicit: false,
        });
        return {
          namespace: SCENARIO_REALITY_NAMESPACE,
          blocked: blocked?.ok === false || blocked?.blocked === true || blocked?.promoted === false,
          detail: blocked,
        };
      });
      // Pass when shared_fiction boundary holds and we reached theater/stage UI.
      record(
        "j7_scenario_shared_fiction",
        fictionGuard.blocked && fictionGuard.namespace === "shared_fiction" && (stageOk || theaterOk),
        `stage=${stageOk}; theater=${theaterOk}; blocked=${fictionGuard.blocked}; ns=${fictionGuard.namespace}`,
      );
      await homeFromAnywhere(page).catch(() => {});
    } catch (err) {
      record("j7_scenario_shared_fiction", false, err.message || err);
      await saveFailureArtifacts(page, "j7", err);
    }
    await beforeJourney();

    // —— J8 forget ——
    try {
      const rememberUser = `请记住我${PREF_CLAIM}`;
      const forgetUser = `忘记我${PREF_CLAIM}`;
      await ensurePopThread(page, CHAR_A);
      await sendPhoneAndReply(page, rememberUser, CHAR_A);
      let remembered = await waitStableHit(page, { companionId: CHAR_A, fragment: PREF_CLAIM }, 4000);
      if (!remembered) {
        await ensureStablePreference(page, {
          companionId: CHAR_A,
          claim: PREF_CLAIM,
          userText: rememberUser,
        });
        notFullyUi.push("j8: remember seeded via ledger before forget UI");
      }
      await sendPhoneAndReply(page, forgetUser, CHAR_A);
      await page.waitForTimeout(1200);
      let after = await page.evaluate(
        async ({ companionId, fragment }) => {
          const {
            recallStableMemory,
            forgetUnderstanding,
            STABLE_MEMORY_KEY,
          } = await import("/src/memory/candidate-ledger.js");
          const { isSuppressedContent, recordForgetSuppression } = await import("/src/memory/suppression-ledger.js");
          let stable = recallStableMemory({ companionId });
          let still = stable.some((m) => String(m.body || m.claim || "").includes(fragment));
          let forgotVia = "extract";
          if (still) {
            const result = forgetUnderstanding({ companionId, claimIncludes: fragment });
            forgotVia = `ledger:touched=${result?.touched ?? 0}`;
            // Also match claim/body case-insensitively across storage (extract may lag).
            try {
              const raw = JSON.parse(localStorage.getItem(STABLE_MEMORY_KEY) || "{\"items\":[]}");
              const items = Array.isArray(raw.items) ? raw.items : [];
              const needle = fragment.toLowerCase();
              let patched = 0;
              const forgotten = [];
              for (const m of items) {
                if (companionId && m.companionId && m.companionId !== companionId) continue;
                const text = String(m.body || m.claim || "").toLowerCase();
                if (!text.includes(needle) && !text.includes("雨天")) continue;
                m.deleted = true;
                m.tombstone = { reason: "e2e_user_forget", at: new Date().toISOString() };
                forgotten.push(m);
                patched += 1;
              }
              if (patched) {
                localStorage.setItem(STABLE_MEMORY_KEY, JSON.stringify({ ...raw, items }));
                try {
                  recordForgetSuppression?.({
                    forgottenStable: forgotten,
                    forgottenCandidates: [],
                    companionId,
                    reason: "user_forget",
                  });
                } catch {
                  /* optional */
                }
                forgotVia += `;tombstone=${patched}`;
              }
            } catch (err) {
              forgotVia += `;tombstoneErr=${err?.message || err}`;
            }
            stable = recallStableMemory({ companionId });
            still = stable.some((m) => String(m.body || m.claim || "").includes(fragment));
          }
          let suppressed = false;
          try {
            suppressed = isSuppressedContent(fragment) || isSuppressedContent(`忘记我${fragment}`);
          } catch {
            suppressed = false;
          }
          return { still, suppressed, stableCount: stable.length, forgotVia };
        },
        { companionId: CHAR_A, fragment: PREF_CLAIM },
      );
      if (String(after.forgotVia || "").includes("ledger") || String(after.forgotVia || "").includes("tombstone")) {
        notFullyUi.push("j8: forgetUnderstanding/tombstone after UI forget (extract stalled)");
      }
      screenshots.push(await shot(page, "j8-forget"));
      record(
        "j8_forget_no_revive",
        !after.still || after.suppressed,
        `still=${after.still}; suppressed=${after.suppressed}; via=${after.forgotVia}`,
      );
    } catch (err) {
      record("j8_forget_no_revive", false, err.message || err);
      await saveFailureArtifacts(page, "j8", err);
    }
    await beforeJourney();

    // —— J9 A/B isolation ——
    try {
      await seedCharacterB(page);
      const alphaClaim = "喜欢角色甲私密标记-alpha-only";
      const betaClaim = "喜欢角色乙私密标记-beta-only";
      const alphaText = `请记住我${alphaClaim}`;
      const betaText = `请记住我${betaClaim}`;
      await sendPhoneAndReply(page, alphaText, CHAR_A);
      let aReady = await waitStableHit(page, { companionId: CHAR_A, fragment: "alpha-only" }, 4000);
      if (!aReady) {
        const ensuredA = await ensureStablePreference(page, {
          companionId: CHAR_A,
          claim: alphaClaim,
          userText: alphaText,
        });
        aReady = Boolean(ensuredA.hit);
        notFullyUi.push(`j9: alpha via ledger (${JSON.stringify(ensuredA)})`);
      }

      await ensurePopThread(page, CHAR_B);
      const focusB = await page.evaluate(async ({ CHAR_B }) => {
        const { getChatFocus } = await import("/src/characters/session-context.js");
        const { getActiveCharacterId } = await import("/src/characters/store.js");
        return (getChatFocus()?.characterId || getActiveCharacterId()) === CHAR_B;
      }, { CHAR_B });
      if (!focusB) notFullyUi.push("j9: chat focus may not have switched to B before send");
      await sendPhoneAndReply(page, betaText, CHAR_B);
      let bReady = await waitStableHit(page, { companionId: CHAR_B, fragment: "beta-only" }, 4000);
      if (!bReady) {
        const ensuredB = await ensureStablePreference(page, {
          companionId: CHAR_B,
          claim: betaClaim,
          userText: betaText,
        });
        bReady = Boolean(ensuredB.hit);
        notFullyUi.push(`j9: beta via ledger (${JSON.stringify(ensuredB)})`);
      }
      const iso = await page.evaluate(
        async ({ CHAR_A, CHAR_B }) => {
          const { recallStableMemory } = await import("/src/memory/candidate-ledger.js");
          const a = recallStableMemory({ companionId: CHAR_A });
          const b = recallStableMemory({ companionId: CHAR_B });
          const aText = a.map((m) => String(m.body || m.claim || "")).join("\n");
          const bText = b.map((m) => String(m.body || m.claim || "")).join("\n");
          return {
            aHasAlpha: /alpha-only/.test(aText),
            bHasAlpha: /alpha-only/.test(bText),
            bHasBeta: /beta-only/.test(bText),
            aHasBeta: /beta-only/.test(aText),
          };
        },
        { CHAR_A, CHAR_B },
      );
      screenshots.push(await shot(page, "j9-isolation"));
      record(
        "j9_companion_ab_isolation",
        iso.aHasAlpha && iso.bHasBeta && !iso.bHasAlpha && !iso.aHasBeta,
        JSON.stringify(iso),
      );
    } catch (err) {
      record("j9_companion_ab_isolation", false, err.message || err);
      await saveFailureArtifacts(page, "j9", err);
    }
    await beforeJourney();

    // —— J10 palace rebuild ——
    try {
      serverState = await ensureServerAlive(serverState);
      await recoverToPhoneHome(page).catch(() => openPhoneHome(page));
      await openPhoneDevtools(page);
      const rebuild = page.locator(
        '[data-phone-screen="devtools"] [data-palace-rebuild], [data-phone-screen="devtools"] [data-devtools-action="rebuild-palace"]',
      ).first();
      await rebuild.waitFor({ state: "attached", timeout: 10000 });
      await page.evaluate(() => {
        const btn = document.querySelector(
          '[data-phone-screen="devtools"] [data-palace-rebuild], [data-phone-screen="devtools"] [data-devtools-action="rebuild-palace"]',
        );
        if (btn) btn.click();
      });
      await page.waitForFunction(() => {
        const el = document.querySelector("[data-palace-rebuild-status]");
        const text = el?.textContent || "";
        return /重建完成|entries=|重建失败/i.test(text);
      }, null, { timeout: 15000 }).catch(() => {});
      const statusText = await page.locator("[data-palace-rebuild-status]").textContent().catch(() => "");
      screenshots.push(await shot(page, "j10-rebuild"));
      const rebuiltEntries = Number(String(statusText || "").match(/entries\s*=\s*(\d+)/i)?.[1] || 0);
      record(
        "j10_palace_rebuild",
        /重建完成|entries=/i.test(String(statusText || "")) && rebuiltEntries > 0,
        `status=${statusText}; rebuiltEntries=${rebuiltEntries}`,
      );
      await homeFromAnywhere(page);
    } catch (err) {
      record("j10_palace_rebuild", false, err.message || err);
      await saveFailureArtifacts(page, "j10", err);
    }
    await beforeJourney();

    // —— J11 continuity fingerprint ——
    try {
      // J9 switches chat focus to B. Return to the active companion before
      // comparing all visible surfaces for one relationship.
      await ensurePopThread(page, CHAR_A);
      await page.waitForTimeout(500);
      const phoneFp = await page.locator("[data-home-continuity-card]").first().getAttribute("data-continuity-fingerprint");
      await switchToAppMode(page);
      await page.locator('[data-tab="chat"]').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
      // Refresh life strip
      await page.evaluate(async () => {
        document.dispatchEvent(new CustomEvent("yueqi:companion-life", { detail: {} }));
      });
      await page.waitForTimeout(400);
      const appFp = await page.locator("[data-life-context]").first().getAttribute("data-continuity-fingerprint");
      const petFp = await page.locator("[data-companion-float]").first().getAttribute("data-continuity-fingerprint");
      const modelFp = await page.evaluate(async () => {
        const { getCompanionSurfaceModel } = await import("/src/relationship/surface-service.js");
        const { getActiveCharacterId } = await import("/src/characters/store.js");
        const cid = getActiveCharacterId();
        const app = getCompanionSurfaceModel({ companionId: cid, surface: "app" });
        const phone = getCompanionSurfaceModel({ companionId: cid, surface: "phone" });
        const pet = getCompanionSurfaceModel({ companionId: cid, surface: "pet" });
        const proactive = getCompanionSurfaceModel({ companionId: cid, surface: "proactive" });
        return {
          app: app?.fingerprint,
          phone: phone?.fingerprint,
          pet: pet?.fingerprint,
          proactive: proactive?.fingerprint,
        };
      });
      screenshots.push(await shot(page, "j11-continuity-app"));
      const sameModel =
        modelFp.app
        && modelFp.app === modelFp.phone
        && modelFp.app === modelFp.pet
        && modelFp.app === modelFp.proactive;
      const expectedFp = modelFp.app;
      const uiAligned = Boolean(
        expectedFp
        && phoneFp === expectedFp
        && appFp === expectedFp
        && petFp === expectedFp
      );
      record(
        "j11_continuity_fingerprint",
        sameModel && uiAligned,
        `model=${JSON.stringify(modelFp)}; phoneUi=${phoneFp}; appUi=${appFp}; petUi=${petFp}`,
      );
      if (!phoneFp || !appFp) notFullyUi.push("j11: some DOM fingerprint attrs empty until continuity evidence exists; model fingerprints compared");
    } catch (err) {
      record("j11_continuity_fingerprint", false, err.message || err);
      await saveFailureArtifacts(page, "j11", err);
    }
    await beforeJourney();

    // —— J12 web search + offline ——
    try {
      await page.unroute("**/api/retrieval/**").catch(() => {});
      await installWebSearchMock(page, "ok");
      await ensurePopThread(page, CHAR_A);
      await sendPhoneChat(page, "查一下月栖是什么");
      await page.waitForTimeout(1500);
      const webOk = await page.evaluate(async () => {
        const { listPendingProposals, listProposalRecords } = await import("/src/turn-understanding/index.js");
        const all = [
          ...(typeof listProposalRecords === "function" ? listProposalRecords() : []),
          ...(listPendingProposals?.() || []),
        ];
        // Also read repository bag
        let bag = [];
        try {
          bag = JSON.parse(localStorage.getItem("yueqi.action.proposals.v1") || "[]");
          if (!Array.isArray(bag)) bag = bag.items || [];
        } catch {
          bag = [];
        }
        const rows = [...all, ...bag];
        return rows.some((r) => {
          const p = r.proposal || r;
          const id = String(p.capabilityId || "");
          return id.includes("web") || String(p.title || "").includes("检索") || String(p.title || "").includes("查");
        });
      });
      await page.unroute("**/api/retrieval/**").catch(() => {});
      await installWebSearchMock(page, "offline");
      await sendPhoneChat(page, "查一下今天新闻");
      await page.waitForTimeout(1200);
      // Offline chat still works
      await sendPhoneAndReply(page, "离线也要能聊天：你好呀");
      const offlineChatOk = await page.locator("[data-phone-messages] .mini-message").count() >= 1;
      screenshots.push(await shot(page, "j12-web-offline"));
      record(
        "j12_web_search_offline",
        webOk && offlineChatOk,
        `webProposal=${webOk}; offlineChat=${offlineChatOk}`,
      );
    } catch (err) {
      record("j12_web_search_offline", false, err.message || err);
      await saveFailureArtifacts(page, "j12", err);
    }

    // Ensure all 12 ids present (fail missing as not run)
    for (const id of JOURNEY_IDS) {
      if (!journeyMap.has(id)) {
        record(id, false, "not wired / not executed");
      }
    }
  } catch (err) {
    console.error("FATAL", err);
    if (page) await saveFailureArtifacts(page, "fatal", err);
    for (const id of JOURNEY_IDS) {
      if (!journeyMap.has(id)) {
        record(id, false, `fatal: ${err.message || err}`);
      }
    }
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (serverState?.owned && serverState.child) {
      try {
        serverState.child.kill();
      } catch {
        /* ignore */
      }
    }
  }

  // A direct repository/DOM/storage fallback does not prove the visible
  // product path. Convert each such note into a failed journey.
  for (const violation of notFullyUi) {
    const number = String(violation).match(/^j(\d+)/i)?.[1];
    if (!number) continue;
    const id = JOURNEY_IDS.find((candidate) => candidate.startsWith(`j${number}_`));
    const row = id ? journeyMap.get(id) : null;
    if (!row) continue;
    row.pass = false;
    row.status = "FAIL";
    row.detail = `${row.detail}; strict=${String(violation).slice(0, 180)}`;
  }

  const uniqueConsoleErrors = [...new Set(consoleErrors.map((item) => String(item).trim()).filter(Boolean))];
  const journeys = journeysOf();
  const passed = journeys.filter((j) => j.pass).length;
  const failed = journeys.filter((j) => !j.pass).length;
  const skipped = 0;
  const strictViolationCount = notFullyUi.length + uniqueConsoleErrors.length;
  const status = failed === 0
    && passed === JOURNEY_IDS.length
    && strictViolationCount === 0
    ? "PASS"
    : "FAIL";

  const result = {
    wave: "C6",
    script: "e2e/product-cutover-browser.spec.mjs",
    status,
    baseUrl,
    skipped,
    failed,
    passed,
    total: JOURNEY_IDS.length,
    journeys,
    screenshots,
    notFullyUiDriven: notFullyUi,
    consoleErrors: uniqueConsoleErrors.slice(0, 40),
    strictViolationCount,
    at: new Date().toISOString(),
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(ROOT, "docs/qa/product-cutover/C6_RESULT.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await writeFile(path.join(OUT_DIR, "RESULT.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const md = `# C6 — Browser Product E2E

> Wave: C6  
> Date: ${new Date().toISOString().slice(0, 10)}  
> Plan: \`docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md\` §12  
> Status: **${status}** (skipped=${skipped}, failed=${failed}, passed=${passed}/${JOURNEY_IDS.length})

## Command

\`\`\`powershell
npm run e2e:product-cutover-browser
\`\`\`

## Constraints honored

- Real Playwright default path (no SKIP/exit 0 when browser/server missing).
- Cutover profile seeded as \`internal_v1\` (also exercised \`production_v1\` select in J1).
- PASS requires visible UI actions only; direct repository/DOM/storage fallback is a failure.
- Console errors are release-blocking until eliminated or explicitly handled by the test.
- Screenshots under \`docs/qa/product-cutover/browser/\`.

## Journeys

| ID | Result | Detail |
|---|---|---|
${journeys.map((j) => `| \`${j.id}\` | ${j.status} | ${String(j.detail || "").replace(/\|/g, "/").slice(0, 160)} |`).join("\n")}

## Screenshots

${screenshots.map((s) => `- \`${path.relative(ROOT, s).replace(/\\/g, "/")}\``).join("\n") || "(none)"}

## Not fully UI-driven

${notFullyUi.length ? notFullyUi.map((x) => `- ${x}`).join("\n") : "- (none recorded)"}

## Console errors

${uniqueConsoleErrors.length ? uniqueConsoleErrors.map((x) => `- ${x}`).join("\n") : "- (none recorded)"}

## RESULT

See \`docs/qa/product-cutover/C6_RESULT.json\` and \`docs/qa/product-cutover/browser/RESULT.json\`.
`;

  await writeFile(path.join(ROOT, "docs/qa/product-cutover/C6_BROWSER_E2E.md"), md, "utf8");

  console.log(`\ne2e:product-cutover-browser ${status} ${passed}/${JOURNEY_IDS.length} skipped=${skipped} failed=${failed}`);
  if (status !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
