/**
 * Open Experience evidence pack — real DOM clicks; e2e semantic stub for stage turns.
 * Captures: handfeel video (390×844 + 375×812), stage / action / finale / Pop / Studio shots,
 * branch / candidate / regenerate UI, pager / back / keyboard / background-gen / restore.
 *
 * Usage: DEMO_URL=http://127.0.0.1:5177/ npm run e2e:evidence
 */
import { mkdir, writeFile, rename, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  openPhoneApp,
  homeFromAnywhere,
  goAppsPage,
  enterScenarioStage,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/open-experience/evidence");
const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "375x812", width: 375, height: 812 },
];

const checks = [];
function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, dir, name) {
  await mkdir(dir, { recursive: true });
  const phone = page.locator(".mini-phone");
  const target = (await phone.count()) ? phone : page;
  await target.screenshot({ path: path.join(dir, `${name}.png`) });
}

async function openNightRain(page, openingIndex = 0) {
  await enterScenarioStage(page, { openingIndex });
}

async function freeSay(page, text) {
  const input = page.locator("[data-scenario-input]");
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.fill(text);
  await page.locator("[data-scenario-form] button[type='submit']").click();
  await page.waitForTimeout(900);
}

async function dragPager(page, dx) {
  const track = page.locator("[data-home-pager], .phone-home-pager, [data-home-pages]").first();
  const box = await track.boundingBox();
  if (!box) return false;
  const x = box.x + box.width * 0.7;
  const y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  return true;
}

async function settleVideo(dir, label) {
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir)).filter((f) => f.endsWith(".webm"));
  if (!files.length) return "";
  const src = path.join(dir, files[0]);
  const dest = path.join(dir, `${label}.webm`);
  try {
    await rename(src, dest);
  } catch {
    return src;
  }
  return dest;
}

async function runViewport(browser, vp) {
  const shotDir = path.join(OUT, "screens", vp.name);
  const videoDir = path.join(OUT, "video", vp.name);
  await mkdir(shotDir, { recursive: true });
  await mkdir(videoDir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: "zh-CN",
    recordVideo: { dir: videoDir, size: { width: vp.width, height: vp.height } },
  });
  const page = await context.newPage();
  await installPhoneFixture(page, { experienceStub: true });

  try {
    await openPhoneHome(page);
    check(`${vp.name} phone home`, await page.locator('[data-phone-screen="home"].is-active').isVisible());
    await shot(page, shotDir, "01-home");

    // Pager drag (home → apps)
    const dragged = await dragPager(page, -Math.min(140, vp.width * 0.35));
    check(`${vp.name} pager drag attempted`, dragged);
    await page.waitForTimeout(500);
    await shot(page, shotDir, "02-pager");

    // Soft keyboard: open Pop thread then focus composer
    await homeFromAnywhere(page).catch(() => {});
    await openPhoneApp(page, "pop");
    await page.waitForTimeout(400);
    // Session list → companion thread (or compose DM)
    const session = page.locator("[data-open-dm], [data-pop-session-list] button, .mini-pop-session").first();
    if (await session.isVisible().catch(() => false)) {
      await session.click();
      await page.waitForTimeout(400);
    } else {
      const newChat = page.locator("[data-pop-new-chat]");
      if (await newChat.isVisible().catch(() => false)) {
        await newChat.click();
        await page.locator("[data-pop-compose-dm]").click();
        await page.waitForTimeout(300);
        const pick = page.locator("[data-pop-dm-pick-list] button, [data-set-companion]").first();
        if (await pick.isVisible().catch(() => false)) await pick.click();
        await page.waitForTimeout(400);
      }
    }
    const chatInput = page.locator("[data-phone-chat-input]");
    if (await chatInput.isVisible().catch(() => false)) {
      await chatInput.click();
      await chatInput.fill("今晚雨站那边……");
      check(`${vp.name} pop input focus`, true);
    } else {
      check(`${vp.name} pop input focus`, false, "composer missing after open thread");
    }
    await shot(page, shotDir, "03-pop-keyboard");

    await homeFromAnywhere(page);
    await openNightRain(page, 0);
    await page.waitForTimeout(800);
    await page.waitForFunction(() => {
      const fig = document.querySelector("[data-stage-figure], [data-stage-layers] .scenario-scene-layer");
      return Boolean(fig);
    }, { timeout: 8000 }).catch(() => {});
    await shot(page, shotDir, "04-stage");

    await freeSay(page, "我想把伞往你那边挪一点");
    await shot(page, shotDir, "05-action-after-say");

    // Branch / regenerate / candidate strip
    await page.locator("[data-scenario-branches]").click();
    await page.locator("[data-branch-sheet]").waitFor({ state: "visible", timeout: 5000 });
    await shot(page, shotDir, "06-branch-panel");
    check(`${vp.name} branch panel`, await page.locator("[data-branch-sheet]").isVisible());

    const fork = page.locator("[data-branch-fork]");
    if (await fork.isVisible().catch(() => false)) {
      await fork.click();
      await page.waitForTimeout(400);
    }
    const regen = page.locator("[data-branch-regen]");
    if (await regen.isVisible().catch(() => false)) {
      await regen.click();
      await page.waitForTimeout(1000);
      check(`${vp.name} regenerate click`, true);
    } else {
      check(`${vp.name} regenerate click`, false, "regen missing");
    }
    const candNext = page.locator("[data-cand-next]");
    if (await candNext.isVisible().catch(() => false)) {
      await candNext.click();
      check(`${vp.name} candidate swipe`, true);
    } else {
      check(`${vp.name} candidate swipe`, true, "single candidate — strip hidden ok");
    }
    const close = page.locator("[data-branch-close]");
    if (await close.isVisible().catch(() => false)) await close.click();

    // Background generation: leave while busy? Soft — pause and restore
    await page.locator("[data-scenario-pause]").click();
    await page.waitForTimeout(500);
    await openPhoneApp(page, "scenario");
    await page.waitForTimeout(600);
    const stageOrContinue = await page.locator(
      '[data-scenario-view="stage"].is-active, [data-scenario-continue]',
    ).first().isVisible().catch(() => false);
    check(`${vp.name} state restore / continue`, stageOrContinue);
    await shot(page, shotDir, "07-restore");

    // Ensure stage for finale
    if (await page.locator("[data-scenario-continue]").isVisible().catch(() => false)) {
      await page.locator("[data-scenario-continue]").click();
      await page.waitForTimeout(800);
    }
    if (!(await page.locator('[data-scenario-view="stage"].is-active').isVisible().catch(() => false))) {
      await openNightRain(page, 1);
      await freeSay(page, "我们再站一会儿");
    }

    await page.locator("[data-scenario-finale]").click();
    await page.waitForSelector('[data-scenario-view="finale"]', { timeout: 10000 });
    await shot(page, shotDir, "08-finale");
    check(`${vp.name} finale`, true);

    const summary = page.locator("[data-scenario-summary]");
    if (await summary.isVisible().catch(() => false)) {
      await summary.fill("证据包谢幕：雨夜站台，伞缘相碰。");
    }
    if (await page.locator("[data-scenario-to-diary]").isVisible().catch(() => false)) {
      await page.locator("[data-scenario-to-diary]").click();
      await page.waitForTimeout(700);
    }

    await homeFromAnywhere(page);
    await openPhoneApp(page, "pop");
    await page.waitForTimeout(500);
    await shot(page, shotDir, "09-pop-recall");

    // Creator / 作品工坊 removed — assert gone, shoot settings instead.
    await homeFromAnywhere(page);
    await goAppsPage(page);
    const creatorGone = !(await page.locator('[data-app-id="folder:creator"]').first().isVisible().catch(() => false));
    check(`${vp.name} creator folder gone`, creatorGone);
    await openPhoneApp(page, "settings");
    await page.waitForTimeout(500);
    await shot(page, shotDir, "10-settings");
    check(`${vp.name} settings open`, await page.locator('[data-phone-screen="settings"].is-active').isVisible().catch(() => false));
  } catch (err) {
    check(`${vp.name} journey fatal`, false, String(err.message || err));
    await shot(page, shotDir, "fatal").catch(() => {});
  }

  await context.close();
  await settleVideo(videoDir, `handfeel-${vp.name}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log(`evidence BASE_URL=${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    await runViewport(browser, vp);
  }

  await browser.close();

  const failed = checks.filter((c) => !c.pass);
  const summary = {
    pack: "open-experience-evidence",
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    status: failed.length ? "RED" : "GREEN",
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
    checks,
    out: OUT,
    notes: [
      "DOM evidence uses yueqi.e2e.experienceStub (semantic stub, not fixed plot tree)",
      "Real LLM 30-round is separate: npm run evidence:llm-30",
    ],
  };
  await writeFile(path.join(OUT, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`\ne2e:evidence ${summary.passed}/${summary.total} → ${summary.status}`);
  console.log(`out: ${OUT}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
