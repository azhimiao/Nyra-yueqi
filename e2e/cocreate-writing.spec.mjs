import { chromium } from "playwright";
import { installPhoneFixture, openPhoneHome, openPhoneApp } from "./helpers/phone.mjs";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5174/";

function check(name, condition, detail = "") {
  if (!condition) throw new Error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
  console.log(`PASS ${name}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await installPhoneFixture(page, { experienceStub: false });
await page.addInitScript(() => {
  if (!sessionStorage.getItem("yueqi.e2e.cocreate.cleared")) {
    localStorage.removeItem("yueqi.cocreate.projects.v3");
    sessionStorage.setItem("yueqi.e2e.cocreate.cleared", "1");
  }
});

try {
  await openPhoneHome(page);
  await openPhoneApp(page, "cocreate");
  await page.waitForSelector(".cocreate-app--v3", { state: "visible" });

  check("real cocreate app opened", await page.locator(".cocreate-app--v3").isVisible());
  check("project library is first view", await page.locator('[data-cc-view="library"]').isVisible());
  check("seed project is concrete content", await page.getByText("潮汐来信", { exact: true }).isVisible());
  check("no WITH TA relationship framing", (await page.locator(".cocreate-app--v3").innerText()).includes("WITH TA") === false);

  await page.locator("[data-cc-open-project]").first().click();
  await page.waitForSelector('[data-cc-view="workspace"]', { state: "visible" });
  check("workspace has manuscript editor", await page.locator("[data-cc-manuscript]").isVisible());
  check("workspace has chapter rail", await page.locator("[data-cc-open-chapter]").count() >= 3);

  const editor = page.locator("[data-cc-manuscript]");
  const original = await editor.inputValue();
  const marker = "\n\n门外传来三下很轻的敲门声。";
  await editor.fill(original + marker);
  check("manual writing updates word count", (await page.locator("[data-cc-word-count]").innerText()).includes("字"));
  await page.locator('[data-cc-tab="outline"]').click();
  const synopsisBeforeReload = page.locator('[data-cc-bible-field="synopsis"]');
  await synopsisBeforeReload.fill("这是立即切页后仍应保存的长篇简介。世界规则与人物动机会进入生成上下文。");
  await page.locator('[data-cc-tab="draft"]').click();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mini-phone", { state: "visible" });
  const unlock = page.locator("[data-lock-to-passcode]");
  if (await unlock.isVisible().catch(() => false)) await unlock.click();
  await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false");
  await openPhoneApp(page, "cocreate");
  await page.locator("[data-cc-open-project]").first().click();
  await page.waitForSelector("[data-cc-manuscript]", { state: "visible" });
  check("manuscript survives reload", (await page.locator("[data-cc-manuscript]").inputValue()).includes("三下很轻的敲门声"));

  await page.locator('[data-cc-tab="outline"]').click();
  check("outline is a real editable surface", await page.locator("[data-cc-outline-row]").count() >= 3);
  const synopsis = page.locator('[data-cc-bible-field="synopsis"]');
  check("rapid cross-field edits survive navigation", (await synopsis.inputValue()).includes("立即切页后仍应保存"));

  await page.locator('[data-cc-tab="bible"]').click();
  check("story bible has cast records", await page.locator("[data-cc-cast-row]").count() >= 2);
  check("story bible has world records", await page.locator("[data-cc-world-row]").count() >= 2);

  await page.locator('[data-cc-tab="draft"]').click();
  const beforeNoKey = await page.locator("[data-cc-manuscript]").inputValue();
  await page.locator('[data-cc-tool="rewrite"]').click();
  await page.waitForTimeout(450);
  check("no-key model tool does not mutate manuscript", (await page.locator("[data-cc-manuscript]").inputValue()) === beforeNoKey);
  check("no fake offline revision is created", await page.locator("[data-cc-revision]").count() === 0);

  const box = await page.locator(".cocreate-app--v3").evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  check("mobile workspace has no horizontal overflow", box.scrollWidth <= box.clientWidth + 1, JSON.stringify(box));

  await page.screenshot({ path: "docs/qa/creative-modes-cocreate-mobile.png" });
  console.log("Cocreate writing journey complete");
} finally {
  await browser.close();
}
