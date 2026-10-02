/**
 * P2 — Diary + selfie vertical slice harness (Codex DEL-02 / DEL-03 / DEL-12).
 *
 * finding_id: DEL-02, DEL-03, DEL-12
 * Source: docs/qa/companion-os/CODEX_AUDIT_EXTRACTS_2026-08-02/delivery-final.md
 *
 * Proves flagship delivery chains offline with honest mocks (no paid imagegen/chat provider).
 * Gate: vertical_slice_harness_green — NOT vertical_slice_green (real Provider is external).
 *
 * Diary: save → Artifact → Today inbox → deep link → diary entity; Pop artifact card.
 * Selfie: Pop intent → allowFakeSelfie → Media/Photo → Artifact → Today → gallery; Pop card.
 * Relationship: artifact viewed + cohabit selfie event after open/mark-read.
 *
 * Usage: node e2e/p2-diary-selfie-vertical.spec.mjs
 * Env: DEMO_URL (default http://127.0.0.1:5177/)
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  openPhoneApp,
  homeFromAnywhere,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/companion-os/P2_VERTICAL_SLICE_E2E");
const CHAR = "char-xingli";
const DIARY_TITLE = "E2E_DEL02_日记触达";
const DIARY_BODY = "端到端交付链测试正文：保存、今日页、深链、Pop 卡。";
const DIARY_DAY = "2026-02-14";
const SELFIE_TEXT = "发张自拍";

async function waitForUrl(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok || res.status === 304) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function ensureServer() {
  const url = process.env.DEMO_URL || BASE_URL;
  if (await waitForUrl(url, 2000)) return { url, child: null };
  const port = new URL(url).port || "5177";
  const child = spawn("npx", ["vite", "--host", "127.0.0.1", `--port`, port], {
    cwd: ROOT,
    stdio: "pipe",
    shell: true,
  });
  const ok = await waitForUrl(url, 90000);
  if (!ok) {
    child.kill();
    throw new Error(`vite failed to start for P2 vertical slice e2e (${url})`);
  }
  return { url, child };
}

function seedVerticalSliceFixture(page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem("yueqi.e2e.allowFakeSelfie", "1");
      localStorage.setItem(
        "yueqi.onboarding.v1",
        JSON.stringify({ done: true, accountMode: "offline" }),
      );
      localStorage.setItem(
        "yueqi.firstLight.v1",
        JSON.stringify({
          schemaVersion: 1,
          done: true,
          paused: false,
          stage: "COMPLETED",
          entryPath: "careful",
          draft: {},
          previewLines: [],
          errorMessage: "",
          updatedAt: new Date().toISOString(),
          committedCharacterId: "char-xingli",
          migratedFromLegacy: false,
        }),
      );
      localStorage.setItem(
        "yueqi.autonomy.v1",
        JSON.stringify({
          schemaVersion: 1,
          onboardingComplete: true,
          preset: "companion",
        }),
      );
    } catch {
      /* ignore */
    }
  });
}

async function ensurePopChatThread(page) {
  await openPhoneApp(page, "pop");
  const inThread = await page.locator('[data-pop-chat-mode="thread"]:not([hidden])').isVisible().catch(() => false);
  if (inThread) return;
  await page.waitForSelector('[data-pop-chat-mode="list"]:not([hidden])', { timeout: 15000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = page.locator(`[data-open-dm="${CHAR}"]`).first();
    if (!(await row.isVisible().catch(() => false))) break;
    await row.click({ force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    if (await page.locator('[data-pop-chat-mode="thread"]:not([hidden])').isVisible().catch(() => false)) {
      break;
    }
  }
  await page.waitForSelector('[data-pop-chat-mode="thread"]:not([hidden])', { timeout: 15000 });
  const chatTab = page.locator('[data-pop-tab="chat"]');
  if (await chatTab.isVisible().catch(() => false)) {
    await chatTab.click();
    await page.waitForTimeout(150);
  }
}

async function sendPopText(page, text) {
  await ensurePopChatThread(page);
  const input = page.locator("[data-phone-chat-input]");
  await input.waitFor({ state: "visible", timeout: 10000 });
  await input.fill(text);
  await page.locator("[data-phone-send]").click();
}

async function saveDiaryViaApp(page, payload) {
  return page.evaluate(async (data) => {
    const { saveDiary } = await import("/src/diary/records.js");
    const saved = await saveDiary(data);
    return { diaryId: saved.id, title: saved.title };
  }, payload);
}

async function probeDeliveryState(page, { diaryId, artifactPrefix }) {
  return page.evaluate(async ({ diaryId, artifactPrefix }) => {
    const {
      getArtifact,
      listTodayInboxItems,
      listDeliveryOutbox,
    } = await import("/src/artifacts/index.js");
    const { listCohabitEvents } = await import("/src/memory/cohabit-timeline.js");
    const artifactId = diaryId ? `diary:${diaryId}` : "";
    const inbox = listTodayInboxItems({ companionId: "char-xingli", limit: 20 });
    const artifact = artifactId ? getArtifact(artifactId) : null;
    const selfieArt = artifactPrefix
      ? inbox.find((row) => String(row.artifact?.artifactId || "").startsWith(artifactPrefix))?.artifact
      : null;
    const outbox = listDeliveryOutbox({ companionId: "char-xingli", limit: 30 });
    const cohabit = listCohabitEvents({ characterId: "char-xingli", limit: 30 });
    return {
      artifact,
      selfieArt,
      inboxCount: inbox.length,
      inboxTypes: inbox.map((row) => row.type),
      popPending: outbox.filter((row) => row.channel === "pop" && row.status === "pending").length,
      cohabitSelfie: cohabit.some((ev) => String(ev.kind || "") === "selfie"),
    };
  }, { diaryId, artifactPrefix });
}

async function waitForTodayItem(page, titleFragment, timeoutMs = 20000) {
  await page.waitForFunction(
    (fragment) => {
      const items = document.querySelectorAll("[data-today-open]");
      return [...items].some((el) => (el.textContent || "").includes(fragment));
    },
    titleFragment,
    { timeout: timeoutMs },
  );
}

async function requeuePopDelivery(page, artifactId) {
  await page.evaluate(async (id) => {
    const key = "yueqi.delivery.outbox.v1";
    const raw = localStorage.getItem(key);
    const bag = raw ? JSON.parse(raw) : { items: [] };
    for (const item of bag.items || []) {
      if (item.channel === "pop" && (!id || item.artifactId === id)) {
        item.status = "pending";
        item.deliveredAt = "";
      }
    }
    localStorage.setItem(key, JSON.stringify(bag));
    document.dispatchEvent(new CustomEvent("yueqi:diary-saved", { detail: {} }));
    document.dispatchEvent(new CustomEvent("yueqi:selfie-created", { detail: {} }));
    await new Promise((r) => setTimeout(r, 400));
  }, artifactId);
}

async function waitForPopArtifactCard(page, artifactIdPrefix = "", artifactId = "") {
  await ensurePopChatThread(page);
  await requeuePopDelivery(page, artifactId);
  const selector = artifactIdPrefix
    ? `[data-artifact-open][data-artifact-id^="${artifactIdPrefix}"]`
    : "[data-artifact-open]";
  await page.waitForSelector(selector, { timeout: 15000 });
  return page.locator(selector).count();
}

async function staticDiaryCorrectionChecks(check) {
  const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
  const extraction = read("src/context/extraction.js");
  const appJs = read("src/app.js");
  check(
    "diary_correction_user_evidence_only",
    extraction.includes("只有用户亲口陈述、纠正、要求记住或要求忘记的内容才能成为操作证据")
      && extraction.includes("inferred=true"),
    "context/extraction.js",
  );
  check(
    "diary_overwrite_confirm",
    appJs.includes("confirmOverwriteDiary") && appJs.includes("if (!overwrite) return"),
    "app.js confirmOverwriteDiary",
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { url, child: viteChild } = await ensureServer();
  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  await staticDiaryCorrectionChecks(check);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  let diaryId = "";
  let selfieArtifactId = "";

  try {
    await installPhoneFixture(page, { experienceStub: true });
    await seedVerticalSliceFixture(page);
    await openPhoneHome(page);
    await page.evaluate(() => {
      const onboard = document.querySelector("[data-autonomy-onboard]");
      if (onboard) onboard.hidden = true;
    });

    // —— DEL-02 Diary chain ——
    const saved = await saveDiaryViaApp(page, {
      title: DIARY_TITLE,
      body: DIARY_BODY,
      diaryDay: DIARY_DAY,
      companionId: CHAR,
      characterId: CHAR,
      roleName: "星璃",
    });
    diaryId = saved.diaryId;
    check("diary: save returned id", Boolean(diaryId), diaryId);

    await page.waitForFunction(
      async (id) => {
        const { getDiaryById } = await import("/src/diary/records.js");
        const row = await getDiaryById(id);
        return Boolean(row?.rawText);
      },
      diaryId,
      { timeout: 15000 },
    );
    let probe = await probeDeliveryState(page, { diaryId });
    check("diary: artifact registered", probe.artifact?.type === "diary", JSON.stringify(probe.artifact?.artifactId));
    check("diary: today inbox lists item", probe.inboxTypes.includes("diary"), probe.inboxTypes.join(","));

    await waitForTodayItem(page, DIARY_TITLE);
    const todayBtn = page.locator("[data-today-open]").filter({ hasText: DIARY_TITLE }).first();
    await todayBtn.click();
    await page.waitForSelector('[data-phone-screen="diary"].is-active', { timeout: 15000 });
    check("diary: deep link opens diary app", true);

    const cover = page.locator("[data-diary-book-cover]");
    if (await cover.isVisible().catch(() => false)) {
      await cover.click({ force: true });
      await page.waitForTimeout(400);
    }

    const diaryEntity = await page.evaluate(async ({ id, title }) => {
      const { getDiaryById } = await import("/src/diary/records.js");
      const row = await getDiaryById(id);
      const screen = document.querySelector('[data-phone-screen="diary"]');
      const text = screen?.innerText || "";
      return {
        recordOk: row?.title === title,
        visible: text.includes(title),
        interior: Boolean(screen?.querySelector("[data-diary-book-interior]:not([hidden])")),
      };
    }, { id: diaryId, title: DIARY_TITLE });
    check(
      "diary: entity content visible",
      diaryEntity.recordOk && (diaryEntity.visible || diaryEntity.interior),
      JSON.stringify(diaryEntity),
    );

    probe = await probeDeliveryState(page, { diaryId });
    check(
      "diary: relationship viewed after open",
      probe.artifact?.status === "viewed" || Boolean(probe.artifact?.viewedAt),
      probe.artifact?.status || "",
    );

    await homeFromAnywhere(page);
    const popCards = await waitForPopArtifactCard(page, "diary:", `diary:${diaryId}`);
    check("diary: pop artifact card flushed", popCards >= 1, String(popCards));

    // —— DEL-03 Selfie chain ——
    await homeFromAnywhere(page);
    await sendPopText(page, SELFIE_TEXT);
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll("[data-phone-messages] .mini-message.is-ai p");
        return [...nodes].some((n) => {
          const t = n.textContent || "";
          return t.includes("拍好") || t.includes("自拍");
        });
      },
      { timeout: 20000 },
    );
    const failedSelfie = await page.locator('[data-phone-messages] .mini-message[data-message-id]').filter({
      has: page.locator("p"),
    }).evaluateAll((nodes) => nodes.some((n) => (n.textContent || "").includes("不能真的拍照")));
    check("selfie: no PROVIDER_REQUIRED in harness", !failedSelfie);

    await page.waitForTimeout(1000);
    probe = await probeDeliveryState(page, { artifactPrefix: "selfie:" });
    check("selfie: cohabit relation event", probe.cohabitSelfie, "selfie kind");
    check(
      "selfie: today inbox item",
      probe.inboxTypes.includes("selfie"),
      probe.inboxTypes.join(","),
    );

    selfieArtifactId = await page.evaluate(async () => {
      const { listTodayInboxItems } = await import("/src/artifacts/index.js");
      const row = listTodayInboxItems({ companionId: "char-xingli", limit: 20 })
        .find((item) => item.type === "selfie");
      return row?.artifact?.artifactId || "";
    });
    check("selfie: artifact id captured", Boolean(selfieArtifactId), selfieArtifactId);

    await homeFromAnywhere(page);
    const selfieToday = page.locator('[data-today-open][data-artifact-id^="selfie:"]').first();
    await selfieToday.waitFor({ state: "visible", timeout: 15000 });
    await selfieToday.click();
    await page.waitForSelector('[data-phone-screen="gallery"].is-active', { timeout: 15000 });
    const galleryOpen = await page.locator("[data-phone-album-lightbox]:not([hidden]), [data-photo-index]").first()
      .isVisible()
      .catch(() => false);
    check("selfie: deep link opens gallery surface", galleryOpen);

    const selfiePopCard = await waitForPopArtifactCard(page, "selfie:", selfieArtifactId);
    check("selfie: pop artifact card present", selfiePopCard >= 1, String(selfiePopCard));

    await page.screenshot({ path: path.join(OUT, "vertical-slice-final.png") });
  } catch (err) {
    check("journey fatal", false, String(err.message || err));
    await page.screenshot({ path: path.join(OUT, "fatal.png"), fullPage: true }).catch(() => {});
  }

  const failed = checks.filter((c) => !c.pass);
  const summary = {
    finding_ids: ["DEL-02", "DEL-03", "DEL-12"],
    gate: failed.length ? "vertical_slice_harness_red" : "vertical_slice_harness_green",
    real_provider_gate: "external — vertical_slice_green requires configured imagegen + device evidence",
    harness: "mocked — allowFakeSelfie + programmatic diary save (no paid Provider)",
    baseUrl: url,
    companionId: CHAR,
    diaryId,
    selfieArtifactId,
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
    at: new Date().toISOString(),
  };
  await writeFile(path.join(OUT, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(
    path.join(OUT, "EVIDENCE.md"),
    `# P2 vertical slice harness (${summary.gate})\n\n`
    + `- **Codex:** DEL-02 / DEL-03 / DEL-12\n`
    + `- **Gate:** \`${summary.gate}\` (NOT \`vertical_slice_green\` without real Provider)\n`
    + `- **Run:** \`npm run e2e:p2-vertical-slice\`\n`
    + `- **Score:** ${summary.passed}/${summary.total}\n`
    + `- **At:** ${summary.at}\n\n`
    + `## Chains\n\n`
    + `1. Diary: save → Artifact → Today → deep link → diary + Pop card\n`
    + `2. Selfie: Pop intent → allowFakeSelfie → Media → Artifact → Today → gallery + Pop card\n`
    + `3. Relationship: artifact \`viewed\` on open; cohabit \`selfie\` event\n\n`
    + `## Artifacts\n\n`
    + `- \`RESULT.json\`\n`
    + `- \`vertical-slice-final.png\` / \`fatal.png\`\n`,
    "utf8",
  );

  await context.close();
  await browser.close();
  viteChild?.kill?.();

  console.log(`\ne2e:p2-vertical-slice ${summary.passed}/${summary.total} — ${summary.gate}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
