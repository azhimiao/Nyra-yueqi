/**
 * C6 — capture integrated journey candidate screenshots.
 * Requires `npm run dev` on DEMO_URL.
 *
 * Usage: node scripts/capture-core-c6.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT_ROOT = path.resolve("docs/qa/core-experience/C6/candidate");

const VIEWPORTS = [
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
];

async function prepare(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
      localStorage.setItem("yueqi.app.mode", "phone");
      const raw = localStorage.getItem("yueqi.phone.os.v1");
      let prefs = {};
      try {
        prefs = raw ? JSON.parse(raw) : {};
      } catch {
        prefs = {};
      }
      prefs.passcodeEnabled = false;
      localStorage.setItem("yueqi.phone.os.v1", JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-small-phone-root]", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const gate = document.querySelector("[data-lang-gate]");
    if (gate) {
      gate.hidden = true;
      gate.style.display = "none";
    }
    document.querySelector("[data-set-locale='zh-CN']")?.click();
    document.body.dataset.appMode = "phone";
    const root = document.querySelector("[data-small-phone-root]");
    if (root) {
      root.hidden = false;
      root.removeAttribute("hidden");
    }
  });

  await page.waitForSelector(".mini-phone", { state: "attached", timeout: 20000 });
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    document.querySelector("[data-lock-to-passcode]")?.click();
  });
  await page.waitForFunction(() => {
    const phone = document.querySelector(".mini-phone");
    return phone && phone.dataset.phoneLocked === "false";
  }, { timeout: 15000 });
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    document.querySelectorAll("[data-companion-float], .companion-float").forEach((el) => {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    });
  });
}

async function openApp(page, appId) {
  await page.evaluate((id) => {
    document.dispatchEvent(new CustomEvent("yueqi:open-phone-app", { detail: { id } }));
  }, appId);
  await page.waitForTimeout(400);
  await page.evaluate((id) => {
    const phone = document.querySelector(".mini-phone");
    if (phone) phone.dataset.phoneView = "app";
    document.querySelectorAll("[data-phone-screen]").forEach((el) => {
      const match = el.dataset.phoneScreen === id;
      el.hidden = !match;
      el.classList.toggle("is-active", match);
    });
  }, appId);
  await page.waitForTimeout(350);
}

async function shot(page, dir, name) {
  const phone = page.locator(".mini-phone").first();
  const target = (await phone.count()) ? phone : page.locator("body");
  await target.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function seedJourney(page) {
  return page.evaluate(async () => {
    const life = await import("/src/life/store.js");
    const access = await import("/src/sidewrite/daypack-access.js");
    const confluence = await import("/src/life/confluence.js");
    const consumers = await import("/src/life/consumers.js");
    const { XINGLI_CHARACTER_ID } = await import("/src/life/fixtures/xingli-day-001.js");

    life.clearAllLife?.();
    const pack = life.ensureXingliSeedPack();
    const evidence = (pack.evidence || []).find((e) => e.discoverable !== false);
    if (evidence) {
      access.observeEvidence({
        characterId: XINGLI_CHARACTER_ID,
        dayPackId: pack.id,
        evidenceId: evidence.id,
        discoverable: true,
        dwellMs: 900,
      });
      life.recordObservation({
        id: `obs-cap-${evidence.id}`,
        characterId: XINGLI_CHARACTER_ID,
        dayPackId: pack.id,
        evidenceId: evidence.id,
        observedAt: new Date().toISOString(),
        dwellMs: 500,
        reactionState: "eligible",
      });
    }
    confluence.recordScenarioFinale({
      characterId: XINGLI_CHARACTER_ID,
      runId: "capture-c6-run",
      scriptId: "builtin-rain-station",
      scriptTitle: "夜雨车站",
      summary: "伞下并肩等车，雨声把话声压得很轻。",
    });
    const reaction = consumers.consumePopObservationReaction(XINGLI_CHARACTER_ID);
    const diary = consumers.consumeDiarySharedExperiences(XINGLI_CHARACTER_ID, { limit: 4 });
    return {
      reactionText: reaction.text || "你刚刚在我手机里翻到一点痕迹了吧。",
      diaryTitle: diary.items?.[0]?.title || "共同经历 · 情景剧",
      diaryBody: diary.items?.[0]?.body || "谢幕《夜雨车站》：伞下并肩等车。",
    };
  });
}

async function openCreatorHub(page) {
  await page.evaluate(async () => {
    const phone = document.querySelector(".mini-content") || document.querySelector(".mini-phone");
    if (!phone) return;
    let sheet = document.querySelector("[data-c6-capture-hub]");
    if (sheet) sheet.remove();
    sheet = document.createElement("div");
    sheet.setAttribute("data-c6-capture-hub", "");
    sheet.style.cssText =
      "position:absolute;inset:0;z-index:50;background:rgb(12 18 16 / 40%);display:flex;align-items:flex-end;";
    const panel = document.createElement("div");
    panel.setAttribute("data-folder-grid", "");
    panel.style.cssText =
      "width:100%;max-height:90%;overflow:auto;border-radius:18px 18px 0 0;background:#eef4f1;";
    sheet.appendChild(panel);
    phone.appendChild(sheet);
    const { mountCreatorHub } = await import("/src/creator/hub-ui.js");
    mountCreatorHub(panel, {
      onClose: () => sheet.remove(),
      onOpenApp: () => {},
      onOpenProfile: () => {},
    });
  });
  await page.waitForTimeout(500);
  return (await page.locator("[data-creator-hub]").count()) > 0;
}

async function paintPopReaction(page, reactionText) {
  await openApp(page, "pop");
  await page.evaluate((text) => {
    const list = document.querySelector("[data-phone-messages]");
    const thread = document.querySelector('[data-pop-chat-mode="thread"]');
    const listMode = document.querySelector('[data-pop-chat-mode="list"]');
    if (listMode) {
      listMode.hidden = true;
      listMode.style.display = "none";
    }
    if (thread) {
      thread.hidden = false;
      thread.style.display = "flex";
      thread.style.flexDirection = "column";
      thread.style.flex = "1";
      thread.removeAttribute("hidden");
    }
    if (list) {
      const safe = String(text || "").replace(/</g, "");
      list.innerHTML = `
        <article class="mini-message is-user"><p>刚刚在你手机里看到一条消息…</p><footer><time>刚刚</time></footer></article>
        <article class="mini-message is-ai"><p>${safe}</p><footer><time>刚刚</time></footer></article>
      `;
    }
  }, reactionText);
  await page.waitForTimeout(250);
}

async function paintDiaryShared(page, title, body) {
  await openApp(page, "diary");
  await page.evaluate(({ title: t, body: b }) => {
    const root = document.querySelector('[data-phone-screen="diary"]');
    if (!root) return;
    root.querySelector("[data-c6-diary-shared]")?.remove();
    const card = document.createElement("div");
    card.setAttribute("data-c6-diary-shared", "");
    card.style.cssText =
      "position:absolute;left:14px;right:14px;bottom:78px;padding:16px;border-radius:16px;background:rgb(255 255 255 / 94%);z-index:8;box-shadow:0 10px 28px rgb(0 0 0 / 14%);";
    card.innerHTML = `<strong style="display:block;margin-bottom:6px">${String(t).replace(/</g, "")}</strong><p style="margin:0;line-height:1.45;font-size:14px;opacity:.9">${String(b).replace(/</g, "")}</p>`;
    root.style.position = "relative";
    root.appendChild(card);
  }, { title, body });
  await page.waitForTimeout(250);
}

async function captureViewport(browser, vp) {
  const dir = path.join(OUT_ROOT, vp.name);
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: Math.max(vp.width, 420), height: Math.max(vp.height, 900) },
    deviceScaleFactor: 2,
  });

  const steps = [];
  try {
    await prepare(page);
    const seeded = await seedJourney(page);

    await shot(page, dir, "01-home");
    steps.push("01-home");

    const hubOk = await openCreatorHub(page);
    if (hubOk) {
      await shot(page, dir, "02-creator-hub");
      steps.push("02-creator-hub");
      await page.evaluate(() => document.querySelector("[data-c6-capture-hub]")?.remove());
    } else {
      await openApp(page, "settings");
      await shot(page, dir, "02-settings-api");
      steps.push("02-settings-api");
    }

    await openApp(page, "sidewrite");
    await shot(page, dir, "03-ta-phone");
    steps.push("03-ta-phone");

    await paintPopReaction(page, seeded.reactionText);
    await shot(page, dir, "04-pop-reaction");
    steps.push("04-pop-reaction");

    await paintDiaryShared(page, seeded.diaryTitle, seeded.diaryBody);
    await shot(page, dir, "05-diary-shared");
    steps.push("05-diary-shared");

    await openApp(page, "cocreate");
    await page.waitForTimeout(400);
    await shot(page, dir, "06-cocreate");
    steps.push("06-cocreate");

    const startBtn = page.locator('[data-cc-start="date_scene"]').first();
    if (await startBtn.count()) {
      await startBtn.click();
      await page.waitForTimeout(400);
      const sample = page.locator("[data-cc-sample]").first();
      if (await sample.count()) {
        await sample.click();
        await page.waitForTimeout(600);
      }
      const publish = page.locator("[data-cc-open-publish]").first();
      if (await publish.count()) {
        await publish.click();
        await page.waitForTimeout(400);
        await shot(page, dir, "07-cocreate-publish");
        steps.push("07-cocreate-publish");
        const doPub = page.locator("[data-cc-do-publish]").first();
        if (await doPub.count()) {
          await doPub.click();
          await page.waitForTimeout(500);
        }
      }
    }

    await openApp(page, "scenario");
    await page.waitForTimeout(500);
    await shot(page, dir, "08-theater-library");
    steps.push("08-theater-library");

    await openApp(page, "settings");
    await shot(page, dir, "09-settings-api");
    steps.push("09-settings-api");

    await writeFile(
      path.join(dir, "MANIFEST.txt"),
      [
        `viewport: ${vp.name}`,
        `captured: ${new Date().toISOString()}`,
        `steps: ${steps.join(" → ")}`,
        "notes: C6 integrated journey — creator hub / Pop reaction / diary shared / cocreate / theater / settings",
      ].join("\n"),
      "utf8",
    );
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(OUT_ROOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const vp of VIEWPORTS) {
      await captureViewport(browser, vp);
      console.log(`captured ${vp.name}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
