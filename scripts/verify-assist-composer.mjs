/**
 * The assistant composer must be the chat composer, not a bare text bar:
 * same painted pill, a real send chip, dictation, growth and a length readout.
 *
 * Several older sheets style assistant fields as settings inputs, so this runs
 * in a browser and asserts computed values instead of source text.
 */

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let vite = null;
let baseUrl = process.env.YUEQI_BASE_URL;

if (!baseUrl) {
  vite = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert(address && typeof address !== "string", "Vite test server did not expose a port");
  baseUrl = `http://127.0.0.1:${address.port}/`;
}

const browser = await chromium.launch({ headless: true });

function seed(mode) {
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", mode);
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({
    done: true,
    paused: false,
    stage: "COMPLETED",
    migratedFromLegacy: true,
    version: 1,
  }));
  localStorage.setItem("yueqi.firstLight.v2", JSON.stringify({
    schemaVersion: 2,
    stage: "COMPLETED",
    done: true,
    paused: false,
  }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({
    done: true,
    accountMode: "offline",
    productMode: "developer",
    productModeChosen: true,
    uiModeChosen: true,
  }));
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
    loggedIn: true,
    token: "local-assist-composer-verify",
    productMode: "developer",
  }));
  localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false, passcode: "0000" }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ version: 1, preset: "quiet", onboardingComplete: true }));
}

async function openPage(mode, viewport) {
  const context = await browser.newContext({
    viewport,
    isMobile: viewport.width < 700,
    hasTouch: viewport.width < 700,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(String(error?.stack || error?.message || error));
  });
  await page.addInitScript(seed, mode);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => document.documentElement.classList.contains("app-boot-ready"),
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    document.querySelectorAll("[data-first-light].is-open").forEach((node) => {
      node.classList.remove("is-open");
      node.hidden = true;
    });
  });
  return { context, page, errors };
}

function measure(scope) {
  const root = document.querySelector(scope);
  const box = root.querySelector(".assist-composer__box");
  const field = root.querySelector("[data-assist-input]");
  const send = root.querySelector("[data-assist-send]");
  const mic = root.querySelector("[data-assist-mic]");
  const counter = root.querySelector("[data-assist-counter]");
  const rect = (node) => {
    const value = node?.getBoundingClientRect();
    return value ? {
      left: Math.round(value.left),
      width: Math.round(value.width),
      height: Math.round(value.height),
    } : null;
  };
  const style = (node) => (node ? getComputedStyle(node) : null);
  return {
    pill: {
      background: style(box).backgroundColor,
      radius: style(box).borderTopLeftRadius,
      ...rect(box),
    },
    field: {
      background: style(field).backgroundColor,
      border: style(field).borderTopWidth,
      shadow: style(field).boxShadow,
      fontSize: style(field).fontSize,
      ...rect(field),
    },
    send: {
      background: style(send).backgroundColor,
      radius: style(send).borderTopLeftRadius,
      disabled: send.disabled,
      ...rect(send),
    },
    mic: mic ? { ...rect(mic), radius: style(mic).borderTopLeftRadius } : null,
    counterHidden: counter.hidden,
  };
}

async function verifyAssistComposer(page, { name, scope, chatFieldSelector }) {
  await page.waitForSelector(`${scope} [data-assist-input]`, { state: "visible", timeout: 20000 });
  const idle = await page.evaluate(measure, scope);

  assert(idle.pill, `${name}: the field pill must exist`);
  assert.notEqual(idle.pill.background, "rgba(0, 0, 0, 0)", `${name}: the pill must stay painted`);
  assert.equal(idle.field.background, "rgba(0, 0, 0, 0)", `${name}: only the pill is painted`);
  assert.equal(idle.field.border, "0px", `${name}: the field must not become a settings input`);
  assert.equal(idle.field.shadow, "none", `${name}: the field must not carry an inset ring`);
  assert.equal(idle.field.fontSize, "16px", `${name}: 16px keeps mobile browsers from zooming`);
  assert(idle.pill.height >= 44, `${name}: the pill must clear the 44px touch target`);
  if (idle.mic && idle.pill && idle.send) {
    const gapLeft = idle.pill.left - (idle.mic.left + idle.mic.width);
    const gapRight = idle.send.left - (idle.pill.left + idle.pill.width);
    assert(gapLeft >= -1, `${name}: mic must not overlap the pill`);
    assert(gapRight >= -1, `${name}: send must sit beside the pill, not on it`);
  }

  assert.equal(idle.send.disabled, true, `${name}: send starts disabled on an empty field`);
  assert.notEqual(idle.send.background, "rgba(0, 0, 0, 0)", `${name}: disabled send keeps a visible chip`);
  assert.equal(idle.send.radius, "50%", `${name}: send is round like chat`);
  assert(idle.send.width >= 40 && idle.send.height >= 40, `${name}: send must stay tappable`);

  assert(idle.mic, `${name}: dictation must be available while voice is on`);
  assert(idle.mic.width >= 40 && idle.mic.height >= 40, `${name}: mic must stay tappable`);
  assert.equal(idle.counterHidden, true, `${name}: the length readout stays quiet until near the cap`);

  if (chatFieldSelector) {
    const chatField = await page.locator(chatFieldSelector).first().evaluate((node) => getComputedStyle(node).backgroundColor);
    assert.equal(idle.pill.background, chatField, `${name}: the pill must match the chat field`);
  }

  const input = page.locator(`${scope} [data-assist-input]`).first();
  await input.click();
  await page.waitForTimeout(120);
  const focused = await page.evaluate(measure, scope);
  assert.equal(focused.field.shadow, "none", `${name}: focus must not paint a settings inset ring`);
  assert.equal(focused.field.border, "0px", `${name}: focus must not add a settings border`);
  if (focused.pill && focused.send) {
    assert(
      focused.send.left >= focused.pill.left + focused.pill.width - 1,
      `${name}: focused send must stay outside the pill`,
    );
  }

  await input.fill("检查一下当前角色人设");
  await page.waitForTimeout(150);
  const typed = await page.evaluate(measure, scope);
  assert.equal(typed.send.disabled, false, `${name}: send activates once there is text`);
  assert.notEqual(typed.send.background, idle.send.background, `${name}: active send must read differently`);

  await input.fill("行".repeat(1150));
  await page.waitForTimeout(200);
  const long = await page.evaluate(measure, scope);
  assert(long.field.height > typed.field.height, `${name}: the field must grow with the text`);
  assert(long.field.height <= 120, `${name}: growth must stop instead of eating the screen`);
  assert.equal(long.counterHidden, false, `${name}: the length readout must appear near the cap`);

  await input.fill("");
  await page.waitForTimeout(150);
  const cleared = await page.evaluate(measure, scope);
  assert.equal(cleared.field.height, idle.field.height, `${name}: the field must shrink back`);
  assert.equal(cleared.send.disabled, true, `${name}: send must disable again`);
  assert.equal(cleared.counterHidden, true, `${name}: the readout must hide again`);

  console.log(`PASS ${name}`);
}

async function unlockPhone(page) {
  await page.waitForFunction(() => {
    if (document.querySelector(".mini-phone")?.dataset.phoneLocked === "false") return true;
    document.querySelector("[data-lock-to-passcode]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.querySelector('[data-lock-pane="TIME"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return false;
  }, null, { timeout: 20000, polling: 300 });
}

try {
  {
    const { context, page, errors } = await openPage("app", { width: 1280, height: 860 });
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("yueqi.assist.open-panel", { detail: { panel: "me" } }));
    });
    await page.waitForSelector('.app-page[data-panel="me"].is-active', { state: "visible", timeout: 20000 });
    await page.locator('[data-settings-route="assist"]:visible').first().click();
    await verifyAssistComposer(page, {
      name: "App assistant",
      scope: '[data-settings-view="assist"]',
      chatFieldSelector: "#messageInput",
    });
    assert.deepEqual(errors, [], `App shell page errors: ${errors.join("; ")}`);
    await context.close();
  }

  {
    const { context, page, errors } = await openPage("app", { width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.classList.add("is-native-app", "is-compact-shell");
      window.dispatchEvent(new CustomEvent("yueqi.assist.open-panel", { detail: { panel: "me" } }));
    });
    await page.waitForSelector('.app-page[data-panel="me"].is-active', { state: "visible", timeout: 20000 });
    await page.locator('[data-settings-route="assist"]:visible').first().click();
    await verifyAssistComposer(page, {
      name: "App assistant phone",
      scope: '[data-settings-view="assist"]',
    });
    const input = page.locator('[data-settings-view="assist"] [data-assist-input]').first();
    await input.click();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("yueqi:ime", { detail: { bottom: 320 } }));
    });
    await page.waitForTimeout(300);
    const ime = await page.evaluate(() => {
      const shell = document.querySelector(".app-shell");
      const composer = document.querySelector('[data-settings-view="assist"] .assist-composer');
      const pill = document.querySelector('[data-settings-view="assist"] .assist-composer__box');
      const send = document.querySelector('[data-settings-view="assist"] [data-assist-send]');
      const field = document.querySelector('[data-settings-view="assist"] [data-assist-input]');
      const shellBox = shell?.getBoundingClientRect();
      const composerBox = composer?.getBoundingClientRect();
      const pillBox = pill?.getBoundingClientRect();
      const sendBox = send?.getBoundingClientRect();
      return {
        keyboardOpen: document.documentElement.classList.contains("is-keyboard-open"),
        gap: shellBox && composerBox ? Math.round(shellBox.bottom - composerBox.bottom) : null,
        sendOverlap: pillBox && sendBox ? Math.round(pillBox.right - sendBox.left) : null,
        fieldShadow: field ? getComputedStyle(field).boxShadow : null,
      };
    });
    assert.equal(ime.keyboardOpen, true, "App assistant phone: IME must open keyboard mode");
    assert(ime.gap != null && ime.gap <= 8, `App assistant phone: composer must sit on the IME (gap ${ime.gap})`);
    assert(ime.sendOverlap != null && ime.sendOverlap <= 1, `App assistant phone: send must not cover the pill (overlap ${ime.sendOverlap})`);
    assert.equal(ime.fieldShadow, "none", "App assistant phone: focused field must not grow a settings ring");
    const shotDir = path.join(root, "artifacts/assist-composer-probe");
    await mkdir(shotDir, { recursive: true });
    await page.screenshot({
      path: path.join(shotDir, "phone-390-focus.png"),
      fullPage: false,
    });
    assert.deepEqual(errors, [], `App assistant phone page errors: ${errors.join("; ")}`);
    await context.close();
  }

  {
    const { context, page, errors } = await openPage("phone", { width: 390, height: 844 });
    await unlockPhone(page);
    await page.evaluate(() => {
      document.querySelectorAll("[data-phone-screen].is-active").forEach((node) => {
        node.classList.remove("is-active");
        node.hidden = true;
      });
      const screen = document.querySelector('[data-phone-screen="assist"]');
      if (screen) {
        screen.hidden = false;
        screen.classList.add("is-active");
      }
    });
    await verifyAssistComposer(page, {
      name: "Mini-phone assistant",
      scope: '[data-phone-screen="assist"]',
    });
    assert.deepEqual(errors, [], `Phone shell page errors: ${errors.join("; ")}`);
    await context.close();
  }

  console.log("All assistant composer checks passed.");
} finally {
  await browser.close();
  await vite?.close();
}
