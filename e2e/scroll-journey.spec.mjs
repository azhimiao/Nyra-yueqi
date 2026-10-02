import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { BASE_URL } from "./helpers/phone.mjs";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
const page = await context.newPage();
const checks = [];

function check(name, pass, detail = "") {
  checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function openPhone() {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.locator(".mini-phone").waitFor({ state: "visible" });
  const unlock = page.locator("[data-lock-to-passcode]");
  if (await unlock.isVisible().catch(() => false)) await unlock.click();
  await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false");
  await page.locator('[data-phone-screen="home"].is-active').waitFor({ state: "visible" });
}

async function openScroll() {
  const dot = page.locator('[data-home-dot][data-page="1"]');
  if (await dot.isVisible().catch(() => false)) await dot.click();
  await page.locator('[data-app-id="scroll"]').first().click();
  await page.locator('[data-phone-screen="scroll"].is-active').waitFor({ state: "visible" });
  await page.locator("[data-scroll-library]").waitFor({ state: "visible" });
}

try {
  await page.addInitScript(() => {
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
    localStorage.setItem("yueqi.app.mode", "phone");
    localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false }));
    if (!sessionStorage.getItem("scroll-e2e-initialized")) {
      localStorage.removeItem("yueqi.scroll.v2");
      sessionStorage.setItem("scroll-e2e-initialized", "1");
    }
  });
  await openPhone();
  await openScroll();
  await page.locator("[data-scroll-library]").waitFor({ state: "visible" });
  check("漫卷首先进入作品库", await page.locator(".scroll-work").count() >= 2);
  const libraryOverflow = await page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    const library = document.querySelector("[data-scroll-library]");
    return Boolean(phone && library && library.scrollWidth <= phone.clientWidth + 2);
  });
  check("作品库没有横向溢出", libraryOverflow);

  await page.locator('[data-scroll-work="rainbound-journey"]').first().click();
  await page.locator(".scroll-chapters").waitFor({ state: "visible" });
  check("作品进入章节页", await page.locator("[data-scroll-chapter]").count() >= 2);

  await page.locator('[data-scroll-chapter="rain-platform"]').click();
  await page.locator("[data-scroll-stage]").waitFor({ state: "visible" });
  await page.locator(".scroll-stage__bg").waitFor({ state: "visible" });
  check("视觉小说场景背景真实加载", await page.locator(".scroll-stage__bg").evaluate((img) => img.complete && img.naturalWidth > 0));
  check("内置作品不再落入缺失占位", await page.locator('[data-scroll-asset-missing="background"]').count() === 0);
  const stageOverflow = await page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    const stage = document.querySelector("[data-scroll-stage]");
    return Boolean(phone && stage && stage.getBoundingClientRect().width <= phone.getBoundingClientRect().width + 2);
  });
  check("点读舞台适配手机宽度", stageOverflow);
  await page.locator("[data-scroll-next]").click();
  await page.locator("[data-scroll-next]").click();
  check("舞台使用独立 VN 星梨立绘", /assets\/vn\/rainbound\/portraits/.test(await page.locator(".scroll-stage__portrait img").getAttribute("src")));
  await page.locator("[data-scroll-auto]").click();
  check("自动阅读控制可正常点击", await page.locator("[data-scroll-auto]").getAttribute("aria-pressed") === "true");
  await page.locator("[data-scroll-auto]").click();
  await page.locator("[data-scroll-skip]").click();
  check("快进在未读内容前自动停止", await page.locator("[data-scroll-skip]").getAttribute("aria-pressed") === "false" && await page.getByText("已到未读内容，快进已暂停").isVisible());
  await mkdir("docs/qa", { recursive: true });
  await page.screenshot({ path: "docs/qa/creative-modes-scroll-stage-mobile.png", fullPage: true });

  await page.locator("[data-scroll-saves]").click();
  await page.locator('[data-scroll-slot-name="slot-1"]').fill("雨夜起点");
  await page.locator('[data-scroll-save-slot="slot-1"]').click();
  check("命名快存可操作", /雨夜起点/.test(await page.locator('[data-scroll-slot-name="slot-1"]').inputValue()));
  await page.locator("[data-scroll-close-panel]").click();

  for (let i = 0; i < 10; i += 1) {
    const choice = page.locator('[data-scroll-choice="stay"]');
    if (await choice.isVisible().catch(() => false)) {
      await choice.click();
      break;
    }
    await page.locator("[data-scroll-next]").click();
  }
  check("分支选择进入独立路径", /stay-1/.test(await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.scroll.v2") || "{}").sessions?.["rainbound-journey"]?.autoSave?.frameId || "")));

  for (let i = 0; i < 16; i += 1) {
    if (await page.locator("[data-scroll-ending]").isVisible().catch(() => false)) break;
    const next = page.locator("[data-scroll-next]");
    await next.click();
  }
  await page.locator("[data-scroll-ending]").waitFor({ state: "visible" });
  check("分支抵达结局页", /为你错过一班车/.test(await page.locator("[data-scroll-ending]").innerText()));

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".mini-phone").waitFor({ state: "visible" });
  const unlockAfter = page.locator("[data-lock-to-passcode]");
  if (await unlockAfter.isVisible().catch(() => false)) await unlockAfter.click();
  await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false");
  await openScroll();
  const continued = await page.locator('[data-scroll-continue="rainbound-journey"]').isVisible().catch(() => false);
  const persistedFrame = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.scroll.v2") || "{}").sessions?.["rainbound-journey"]?.autoSave?.frameId || "");
  check("刷新后作品进度仍存在", continued && Boolean(persistedFrame), persistedFrame);
  await page.screenshot({ path: "docs/qa/creative-modes-scroll-mobile.png", fullPage: true });
} catch (error) {
  console.error(error);
  check("E2E 无致命异常", false, error?.message || error);
} finally {
  await context.close();
  await browser.close();
}

const failed = checks.filter((item) => !item.pass);
console.log(`\ne2e:scroll ${checks.length - failed.length}/${checks.length}${failed.length ? " RED" : " GREEN"} @ ${BASE_URL}`);
if (failed.length) process.exitCode = 1;
