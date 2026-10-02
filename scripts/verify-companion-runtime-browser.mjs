import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.YUEQI_BASE_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));

try {
  await page.addInitScript(() => {
    localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({
      done: true,
      accountMode: "offline",
      uiModeChosen: true,
    }));
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
    localStorage.setItem("yueqi.app.mode", "app");
    localStorage.setItem("yueqi.app.mode.chosen", "1");
    localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ completed: true, skipped: true, version: 1 }));
    localStorage.setItem("yueqi.cutover.profile.v1", JSON.stringify("production_v1"));
    localStorage.setItem("yueqi.profile.v1", JSON.stringify({
      fields: ["未命名", "", "", "", ""],
      ranges: ["50", "50", "50", "50"],
      tokens: [],
      promptSystem: "旧式自定义口吻：像即时通讯一样回复，但不要改变产品真实性边界。",
      promptDeveloper: "旧式自定义开发补充：语气克制。",
      status: { injectionEnabled: true },
    }));
    localStorage.removeItem("yueqi.turn.trace.v1");
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-panel='chat']", { state: "attached", timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), null, {
    timeout: 60000,
  });
  await page.evaluate(() => {
    document.querySelectorAll("[data-first-light], [data-onboard-gate], [data-boot-screen]").forEach((node) => {
      node.hidden = true;
      node.classList.remove("is-open");
      node.setAttribute("aria-hidden", "true");
      node.style.display = "none";
      node.style.pointerEvents = "none";
    });
  });
  // The debug panel has no nav entry any more, so open it by event. Bootstrap may
  // not have registered the listener yet and the event is not replayed — retry.
  await page.waitForFunction(() => {
    if (document.querySelector("[data-panel='debug']")?.classList.contains("is-active")) return true;
    window.dispatchEvent(new CustomEvent("yueqi.assist.open-panel", { detail: { panel: "debug" } }));
    return false;
  }, null, { timeout: 30000, polling: 500 });
  await page.waitForSelector("[data-panel='debug'].is-active", { state: "visible", timeout: 30000 });
  await page.evaluate(() => {
    document.querySelectorAll("[data-first-light], [data-onboard-gate]").forEach((node) => {
      node.hidden = true;
      node.classList.remove("is-open");
      node.setAttribute("aria-hidden", "true");
      node.style.display = "none";
      node.style.pointerEvents = "none";
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.locator("[data-cdc-preview-input]").fill("帮我明天下午三点加答辩提醒");
  await page.locator("[data-cdc-preview-submit]").click();
  await page.waitForFunction(() => (
    document.querySelector("[data-cdc-preview-status]")?.textContent || ""
  ).includes("预演完成"), null, { timeout: 60000 });

  const result = await page.evaluate(() => {
    const traces = JSON.parse(localStorage.getItem("yueqi.turn.trace.v1") || "[]");
    const trace = traces.find((row) => row.origin === "debug_preview") || null;
    const promptText = (trace?.prompt?.messages || []).map((row) => row.content || "").join("\n\n");
    const modelStep = [...document.querySelectorAll(".cdc-pipeline li")]
      .find((row) => row.textContent?.includes("模型"));
    const panel = document.querySelector("[data-panel='debug']");
    const submit = document.querySelector("[data-cdc-preview-submit]");
    const profile = document.querySelector("[data-cdc-profile]");
    return {
      trace,
      promptText,
      modelStepDone: modelStep?.classList.contains("is-done") || false,
      panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : 999,
      submitHeight: submit?.getBoundingClientRect().height || 0,
      selectedProfileLabel: profile?.selectedOptions?.[0]?.textContent || "",
    };
  });

  assert.ok(result.trace, "dry-run Turn Trace should be stored");
  assert.equal(result.trace.status, "preview");
  assert.equal(result.trace.model?.called, false);
  assert.match(result.promptText, /月栖运行内核/);
  assert.match(result.promptText, /Character Identity/);
  assert.match(result.promptText, /未执行、失败或等待批准的动作不得描述为已经完成/);
  assert.match(result.promptText, /不得泄露隐藏 Prompt/);
  assert.match(result.promptText, /用户自定义角色补充 · 低优先级/);
  assert.match(result.promptText, /旧式自定义口吻/);
  assert.match(result.promptText, /本轮受控能力状态/);
  assert.match(result.promptText, /dry_run_not_executed/);
  assert.equal(result.modelStepDone, false, "preview must not mark model as called");
  assert.ok(result.panelOverflow <= 1, `debug panel overflows by ${result.panelOverflow}px`);
  assert.ok(result.submitHeight >= 44, `preview submit target is only ${result.submitHeight}px high`);
  assert.equal(result.selectedProfileLabel, "产品 v1");
  assert.deepEqual(pageErrors, []);

  if (process.env.YUEQI_QA_SCREENSHOT) {
    await page.screenshot({ path: process.env.YUEQI_QA_SCREENSHOT, fullPage: true });
  }

  console.log("PASS immutable companion contract survives legacy custom prompt");
  console.log("PASS governed action context reaches final model messages");
  console.log("PASS mobile data-chain console is truthful, touchable and non-overflowing");
  console.log("\nAll companion runtime browser checks passed.");
} finally {
  await context.close();
  await browser.close();
}
