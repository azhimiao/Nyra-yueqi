/**
 * Context Pipeline Enterprise golden UI journey.
 *
 * After load this uses normal clicks/fill only. The fixture is installed before
 * navigation. Evidence: per-viewport screenshot + Playwright trace + video.
 * Requires the app at DEMO_URL (default http://127.0.0.1:5177/).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BASE_URL, installPhoneFixture, openPhoneHome } from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/context-enterprise/evidence");
const VIEWPORTS = process.env.E2E_VIEWPORT === "all"
  ? [
    { name: "390x844", width: 390, height: 844 },
    { name: "1366x768", width: 1366, height: 768 },
  ]
  : [{ name: "390x844", width: 390, height: 844 }];

async function runViewport(browser, viewport) {
  const dir = path.join(OUT, viewport.name);
  await mkdir(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "zh-CN",
    recordVideo: { dir: path.join(dir, "video"), size: { width: viewport.width, height: viewport.height } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const checks = [];
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
    console.log(`${pass ? "PASS" : "FAIL"}  ${viewport.name} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  await installPhoneFixture(page, { experienceStub: false });
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    localStorage.setItem("yueqi.phone.moments.v1", JSON.stringify([{
      id: "ctx-e2e-moment",
      author: "你",
      authorId: "user",
      authorType: "user",
      sourceType: "local",
      time: "刚刚",
      createdAt: now,
      content: "今晚想去看紫色的云",
      images: [],
      likes: [],
      comments: [],
      shareWithCompanion: true,
      visibleToCharacterIds: ["char-xingli"],
      privacy: "companion_shared",
    }]));
    // Keep provider unavailable: Broker still runs, while no fake assistant
    // reply can make the journey pass by accident.
    localStorage.removeItem("yueqi.provider.config.v1");
  });

  try {
    await openPhoneHome(page);
    await page.locator('.mini-dock [data-app-id="pop"]').click();
    await page.waitForSelector('[data-phone-screen="pop"].is-active', { timeout: 12000 });

    // Consent is a real UI control. Turn it off before asking the character.
    await page.locator('[data-pop-tab="moments"]').click();
    const share = page.locator('[data-moment-id="ctx-e2e-moment"] [data-moment-share]');
    await share.waitFor({ state: "visible", timeout: 8000 });
    check("moment consent starts enabled", await share.isChecked());
    await share.uncheck();
    check("moment consent can be disabled", !(await share.isChecked()));

    await page.locator('[data-pop-tab="chat"]').click();
    const dm = page.locator("[data-open-dm]").first();
    await dm.waitFor({ state: "visible", timeout: 10000 });
    await dm.click();
    await page.waitForSelector('[data-pop-chat-mode="thread"]:not([hidden])', { timeout: 10000 });

    const phrase = "你看到我刚发的紫色云动态了吗";
    await page.locator("[data-phone-chat-input]").fill(phrase);
    await page.locator("[data-phone-send]").click();
    await page.waitForTimeout(1400);

    const speak = page.locator("[data-phone-speak-char]");
    await speak.click();
    await page.waitForTimeout(1600);
    await speak.click();
    await page.waitForTimeout(1600);

    // Open the product UI, not an injected diagnostics route.
    await page.locator('[data-pop-tab="me"]').click();
    await page.locator('[data-phone-open="context"]').click();
    await page.waitForSelector('[data-phone-screen="context"].is-active', { timeout: 10000 });
    await page.locator('[data-ctx-mode="inspector"]').click();
    await page.waitForSelector("[data-ctx-trace-select]", { timeout: 10000 });
    const traceCards = await page.locator("[data-ctx-trace-select]").count();
    check("Context Inspector has real broker traces", traceCards >= 2, `count=${traceCards}`);

    const traceState = await page.evaluate((text) => {
      const inspector = JSON.parse(localStorage.getItem("yueqi.context.inspector.v1") || "{}");
      const traces = Array.isArray(inspector.traces) ? inspector.traces : [];
      const userTrace = traces.find((item) => item.request?.turnIntent === "user_message" && item.request?.purpose === "chat");
      const continueTrace = traces.find((item) => item.request?.turnIntent === "continue" && item.request?.purpose === "chat");
      const conversation = JSON.parse(localStorage.getItem("yueqi.conversation.v2") || "{}");
      const userCopies = Object.values(conversation.sessions || {}).flatMap((session) => Object.values(session.messageNodes || {}))
        .filter((message) => message.role === "user" && message.content === text).length;
      return {
        traceCount: traces.length,
        hasUserTrace: Boolean(userTrace),
        hasContinueTrace: Boolean(continueTrace),
        userTracePurpose: userTrace?.request?.purpose || "",
        userTraceWithinBudget: userTrace?.trace?.withinBudget === true,
        userTraceMomentBlocks: (userTrace?.blocks || []).filter((block) => block.id === "moments").length,
        userCopies,
      };
    }, phrase);
    check("first turn is chat/user_message", traceState.hasUserTrace && traceState.userTracePurpose === "chat", JSON.stringify(traceState));
    check("second role reply is continue", traceState.hasContinueTrace, JSON.stringify(traceState));
    check("repeat reply does not duplicate user seed", traceState.userCopies === 1, `copies=${traceState.userCopies}`);
    check("disabled moment is absent from model context", traceState.userTraceMomentBlocks === 0, `blocks=${traceState.userTraceMomentBlocks}`);
    check("broker trace is within hard capacity", traceState.userTraceWithinBudget, JSON.stringify(traceState));

    const detailText = await page.locator("[data-ctx-trace-detail]").innerText();
    check("Inspector exposes budget and authority", /预算|会话权威|未越界/.test(detailText), detailText.slice(0, 160));

    await page.locator(".mini-phone").screenshot({ path: path.join(dir, "context-inspector.png") });
    const unexpected = consoleErrors.filter((line) => !/模型|API|provider|Failed to load resource|ERR_/i.test(line));
    check("no unexpected console errors", unexpected.length === 0, unexpected.slice(0, 3).join(" | "));
  } catch (error) {
    check("journey fatal", false, error?.message || String(error));
    await page.screenshot({ path: path.join(dir, "fatal.png"), fullPage: true }).catch(() => {});
  }

  await context.tracing.stop({ path: path.join(dir, "trace.zip") }).catch(() => {});
  await context.close();
  const failed = checks.filter((item) => !item.pass);
  const result = { viewport, baseUrl: BASE_URL, passed: checks.length - failed.length, failed: failed.length, checks };
  await writeFile(path.join(dir, "RESULT.json"), JSON.stringify(result, null, 2), "utf8");
  return result;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const viewport of VIEWPORTS) results.push(await runViewport(browser, viewport));
  } finally {
    await browser.close();
  }
  const summary = {
    at: new Date().toISOString(),
    command: "npm run e2e:context-enterprise",
    baseUrl: BASE_URL,
    status: results.every((item) => item.failed === 0) ? "evidence_green" : "Product RED",
    passed: results.reduce((sum, item) => sum + item.passed, 0),
    failed: results.reduce((sum, item) => sum + item.failed, 0),
    results,
  };
  await writeFile(path.join(OUT, "E2E_LATEST.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(`\ne2e:context-enterprise ${summary.passed} passed, ${summary.failed} failed`);
  if (summary.failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
