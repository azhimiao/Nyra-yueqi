/**
 * Message menu regression: every action a bubble offers has to actually land.
 *
 * The failures this guards were reported as "sometimes I cannot delete or
 * regenerate": the seeded greeting and the notice a failed turn leaves behind
 * live only in the rendered thread, never in Conversation V2, and the write
 * path used to refuse anything without a V2 node.
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name}: ${error.message}`);
  }
};

function seed() {
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({ loggedIn: true, token: "verify", productMode: "developer" }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
  localStorage.setItem("yueqi.activeCharacterId", "char-xingli");

  window.__menuFeedback = [];
  window.addEventListener("yueqi:chat-feedback", (event) => {
    window.__menuFeedback.push(String(event.detail?.message || ""));
  });
}

const vite = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await vite.listen();
const address = vite.httpServer?.address();
assert(address && typeof address !== "string", "vite did not report a port");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.addInitScript(seed);
page.on("dialog", (dialog) => {
  // Native dialogs are the thing being removed; accepting them would hide a
  // regression behind a passing run.
  failures.push(`native ${dialog.type()} dialog appeared: ${dialog.message()}`);
  void dialog.dismiss();
});
await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), null, { timeout: 90000 });
await page.waitForTimeout(1200);

// A turn with no model configured leaves a user bubble plus the failure notice,
// which is exactly the thread state from the bug report.
await page.fill("#messageInput", "回归测试消息");
await page.press("#messageInput", "Enter");
await page.waitForTimeout(3500);

const survey = () => page.evaluate(() => [...document.querySelectorAll("#messageList .message")].map((el) => ({
  id: el.dataset.messageId,
  role: el.classList.contains("user") ? "user" : "ai",
  inV2: Boolean(el.dataset.conversationSessionId),
  hasMenu: Boolean(el.querySelector("[data-message-menu]")),
  actions: [...el.querySelectorAll("[data-message-action]")].map((b) => b.dataset.messageAction),
})));

const thread = await survey();
console.log("thread:", JSON.stringify(thread));

check("every message carries a menu, including the one just sent", () => {
  const naked = thread.filter((m) => !m.hasMenu);
  assert.equal(naked.length, 0, `missing menus: ${JSON.stringify(naked)}`);
});

check("the thread really does hold bubbles outside Conversation V2", () => {
  // Without this the run would pass while testing nothing of interest.
  assert.ok(thread.some((m) => !m.inV2), "expected at least one projection-only bubble");
});

const drain = () => page.evaluate(() => {
  const out = window.__menuFeedback.slice();
  window.__menuFeedback.length = 0;
  return out;
});

async function runAction(messageId, action) {
  await drain();
  const article = `#messageList .message[data-message-id="${messageId}"]`;
  await page.click(`${article} [data-message-menu-trigger]`, { force: true });
  await page.waitForTimeout(200);
  await page.click(`${article} [data-message-action="${action}"]`, { force: true });
  await page.waitForTimeout(250);
  return article;
}

// React on a projection-only bubble.
const projectionOnly = thread.find((m) => !m.inV2 && m.role === "ai");
assert.ok(projectionOnly, "no projection-only assistant bubble to test");

{
  await runAction(projectionOnly.id, "react");
  await page.waitForTimeout(900);
  const feedback = await drain();
  const painted = await page.evaluate(
    (id) => Boolean(document.querySelector(`#messageList .message[data-message-id="${id}"] .message-reactions`)?.textContent.trim()),
    projectionOnly.id,
  );
  check("react on a bubble outside V2 succeeds", () => {
    assert.deepEqual(feedback, [], `unexpected feedback: ${JSON.stringify(feedback)}`);
    assert.ok(painted, "reaction chip was not rendered");
  });
}

// Edit through the in-app dialog, not window.prompt.
{
  await runAction(projectionOnly.id, "edit");
  await page.waitForTimeout(300);
  const dialogVisible = await page.isVisible(".text-prompt-modal .text-prompt-field");
  check("edit opens the in-app editor rather than a native prompt", () => {
    assert.ok(dialogVisible, ".text-prompt-modal did not open");
  });
  if (dialogVisible) {
    await page.fill(".text-prompt-modal .text-prompt-field", "编辑后的内容");
    await page.click(".text-prompt-modal [data-prompt-ok]");
    await page.waitForTimeout(900);
    const feedback = await drain();
    const text = await page.evaluate(
      (id) => document.querySelector(`#messageList .message[data-message-id="${id}"] p`)?.textContent || "",
      projectionOnly.id,
    );
    check("edit on a bubble outside V2 succeeds", () => {
      assert.deepEqual(feedback, [], `unexpected feedback: ${JSON.stringify(feedback)}`);
      assert.equal(text.trim(), "编辑后的内容");
    });
  }
}

// Delete through the in-app confirm.
{
  await runAction(projectionOnly.id, "delete");
  await page.waitForTimeout(300);
  const confirmVisible = await page.isVisible(".confirm-modal [data-confirm-ok]");
  check("delete asks with the in-app confirm", () => {
    assert.ok(confirmVisible, "confirm modal did not open");
  });
  if (confirmVisible) {
    await page.click(".confirm-modal [data-confirm-ok]");
    await page.waitForTimeout(900);
    const feedback = await drain();
    const stillThere = await page.evaluate(
      (id) => Boolean(document.querySelector(`#messageList .message[data-message-id="${id}"]`)),
      projectionOnly.id,
    );
    check("delete on a bubble outside V2 removes it", () => {
      assert.deepEqual(feedback, [], `unexpected feedback: ${JSON.stringify(feedback)}`);
      assert.equal(stillThere, false, "message survived the delete");
    });
  }
}

// The popover must not be laid over the bubble it belongs to, and must stay
// inside the transcript.
{
  const remaining = await survey();
  const target = remaining[remaining.length - 1];
  assert.ok(target, "thread is empty");
  await page.click(`#messageList .message[data-message-id="${target.id}"] [data-message-menu-trigger]`, { force: true });
  await page.waitForTimeout(320);
  const geometry = await page.evaluate((id) => {
    const article = document.querySelector(`#messageList .message[data-message-id="${id}"]`);
    const list = article.querySelector("[data-message-menu-list]");
    const bubble = article.getBoundingClientRect();
    const menu = list.getBoundingClientRect();
    const scroller = document.querySelector("#messageList").getBoundingClientRect();
    return {
      overlapsBubble: menu.top < bubble.bottom - 1 && menu.bottom > bubble.top + 1,
      insideScroller: menu.top >= scroller.top - 1 && menu.bottom <= scroller.bottom + 1,
      isUp: article.querySelector("[data-message-menu]").classList.contains("is-up"),
      menu: { top: Math.round(menu.top), bottom: Math.round(menu.bottom), width: Math.round(menu.width) },
      scroller: { top: Math.round(scroller.top), bottom: Math.round(scroller.bottom) },
    };
  }, target.id);
  console.log("geometry:", JSON.stringify(geometry));
  check("the open popover does not cover its own bubble", () => {
    assert.equal(geometry.overlapsBubble, false, `menu overlaps bubble: ${JSON.stringify(geometry)}`);
  });
  check("the open popover stays inside the transcript", () => {
    assert.equal(geometry.insideScroller, true, `menu escapes the scroller: ${JSON.stringify(geometry)}`);
  });
}

// The mini-phone Pop thread binds its own handler against the same module, so
// its dialogs and failure copy need the same walk-through.
{
  // Added after the seed so it runs last on the reload and wins the mode.
  await page.addInitScript(() => {
    localStorage.setItem("yueqi.app.mode", "phone");
    localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false }));
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), null, { timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__yueqiPhone), null, { timeout: 40000 });
  await page.waitForTimeout(1000);

  const unlock = page.locator("[data-lock-to-passcode]");
  if (await unlock.isVisible().catch(() => false)) await unlock.click({ force: true }).catch(() => {});
  await page.waitForFunction(
    () => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false",
    null,
    { timeout: 30000 },
  );
  await page.evaluate(() => window.__yueqiPhone.openApp("pop"));
  await page.waitForTimeout(900);
  // Pop opens on its session list; the thread is a level deeper.
  await page.click(".mini-pop-session[data-open-dm]", { timeout: 20000 });
  await page.waitForTimeout(1200);

  const popMessages = await page.evaluate(() => [...document.querySelectorAll(".mini-message[data-message-id]")].map((el) => ({
    id: el.dataset.messageId,
    hasMenu: Boolean(el.querySelector("[data-message-menu]")),
  })));
  console.log("pop thread:", JSON.stringify(popMessages));

  check("the Pop thread renders message menus", () => {
    assert.ok(popMessages.length, "Pop thread has no messages");
    assert.ok(popMessages.every((m) => m.hasMenu), "some Pop bubbles have no menu");
  });

  if (popMessages.length) {
    const target = popMessages[popMessages.length - 1];
    const article = `.mini-message[data-message-id="${target.id}"]`;
    await page.click(`${article} [data-message-menu-trigger]`, { force: true });
    await page.waitForTimeout(250);
    await page.click(`${article} [data-message-action="delete"]`, { force: true });
    await page.waitForTimeout(400);
    const confirmVisible = await page.isVisible(".confirm-modal [data-confirm-ok]");
    check("Pop delete asks with the in-app confirm", () => {
      assert.ok(confirmVisible, "confirm modal did not open in the Pop thread");
    });
    if (confirmVisible) {
      await page.click(".confirm-modal [data-confirm-ok]");
      await page.waitForTimeout(1000);
      const gone = await page.evaluate(
        (id) => !document.querySelector(`.mini-message[data-message-id="${id}"]`),
        target.id,
      );
      check("Pop delete removes the bubble", () => {
        assert.ok(gone, "message survived the delete in the Pop thread");
      });
    }
  }
}

await browser.close();
await vite.close();

if (failures.length) {
  console.error(`\nverify:message-menu FAILED (${failures.length})`);
  failures.forEach((line) => console.error(` - ${line}`));
  process.exit(1);
}
console.log("\nverify:message-menu PASS");
