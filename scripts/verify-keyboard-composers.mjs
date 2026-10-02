import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let vite = null;
let baseUrl = process.env.YUEQI_BASE_URL;

if (!baseUrl) {
  vite = await createServer({
    root,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0 },
  });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert(address && typeof address !== "string", "Vite test server did not expose a port");
  baseUrl = `http://127.0.0.1:${address.port}/`;
}

const browser = await chromium.launch({ headless: true });
const viewport = { width: 390, height: 844 };

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
    token: "local-keyboard-verify",
    productMode: "developer",
  }));
  localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({
    passcodeEnabled: false,
    passcode: "0000",
  }));
  // Finishing First Light hands over to the autonomy picker, which would sit on
  // top of the Pop composer and swallow the clicks these checks depend on.
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({
    onboardingComplete: true,
    preset: "quiet",
  }));
}

async function openPage(mode) {
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.message || error)));
  await page.addInitScript(seed, mode);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => document.documentElement.classList.contains("app-boot-ready"),
    null,
    { timeout: 60000 },
  );
  await page.evaluate(() => {
    document.documentElement.classList.add("is-native-app", "is-compact-shell");
  });
  await page.waitForTimeout(1200);
  return { context, page, errors };
}

async function closeKeyboard(page) {
  await page.evaluate(() => {
    document.activeElement?.blur?.();
    window.dispatchEvent(new CustomEvent("yueqi:ime", { detail: { bottom: 0 } }));
  });
  await page.waitForTimeout(250);
}

async function verifyComposer(page, {
  name,
  inputSelector,
  shellSelector,
  composerSelector,
  contentSelector,
  headerSelector,
}) {
  const input = page.locator(inputSelector).first();
  await input.waitFor({ state: "visible", timeout: 15000 });

  const before = await page.locator(shellSelector).evaluate((node) => ({
    height: Math.round(node.getBoundingClientRect().height),
    scrollTop: Math.round(node.scrollTop),
  }));
  await input.click();
  await page.waitForTimeout(200);

  const focused = await page.locator(shellSelector).evaluate((node) => ({
    height: Math.round(node.getBoundingClientRect().height),
    keyboardOpen: document.documentElement.classList.contains("is-keyboard-open"),
  }));
  assert.equal(focused.keyboardOpen, false, `${name}: focus alone must not invent a keyboard`);
  assert.equal(focused.height, before.height, `${name}: focus alone must not resize the shell`);

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("yueqi:ime", { detail: { bottom: 320 } }));
  });
  await page.waitForTimeout(400);

  const state = await page.evaluate((selectors) => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      const box = node?.getBoundingClientRect();
      return box ? {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        height: Math.round(box.height),
      } : null;
    };
    const shell = document.querySelector(selectors.shellSelector);
    const dock = document.querySelector(".nyra-dock, .bottom-tabs");
    const pet = document.querySelector("[data-companion-float]");
    return {
      keyboardOpen: document.documentElement.classList.contains("is-keyboard-open"),
      inset: getComputedStyle(document.documentElement).getPropertyValue("--vv-offset-bottom").trim(),
      shell: rect(selectors.shellSelector),
      content: selectors.contentSelector ? rect(selectors.contentSelector) : null,
      composer: rect(selectors.composerSelector),
      input: rect(selectors.inputSelector),
      header: selectors.headerSelector ? rect(selectors.headerSelector) : null,
      shellScrollTop: Math.round(shell?.scrollTop || 0),
      dockVisibility: dock ? getComputedStyle(dock).visibility : "absent",
      petVisibility: pet ? getComputedStyle(pet).visibility : "absent",
    };
  }, {
    inputSelector,
    shellSelector,
    composerSelector,
    contentSelector,
    headerSelector,
  });

  assert.equal(state.keyboardOpen, true, `${name}: measured IME must open keyboard mode`);
  assert.equal(state.inset, "320px", `${name}: measured inset must reach CSS`);
  assert(state.shell, `${name}: shell must exist`);
  assert(state.composer, `${name}: composer must exist`);
  assert(state.input, `${name}: input must exist`);
  assert.equal(state.shell.height, viewport.height - 320, `${name}: shell must match the visible viewport`);
  assert.equal(state.shellScrollTop, 0, `${name}: shell must not scroll the header away`);
  assert(
    state.composer.bottom <= state.shell.bottom && state.shell.bottom - state.composer.bottom <= 8,
    `${name}: composer must sit directly above the keyboard`,
  );
  assert(
    state.input.bottom <= state.shell.bottom,
    `${name}: input must remain fully visible`,
  );
  if (state.content) {
    assert(
      state.content.bottom <= state.shell.bottom,
      `${name}: content must not extend under the keyboard`,
    );
  }
  if (state.header) {
    assert(state.header.top >= 0, `${name}: header must remain on-screen`);
  }
  if (state.dockVisibility !== "absent") {
    assert.equal(state.dockVisibility, "hidden", `${name}: app dock must hide while typing`);
  }
  if (state.petVisibility !== "absent") {
    assert.equal(state.petVisibility, "hidden", `${name}: float pet must hide while typing`);
  }

  await closeKeyboard(page);
  const restored = await page.evaluate((selectors) => {
    const shell = document.querySelector(selectors.shellSelector);
    const header = selectors.headerSelector ? document.querySelector(selectors.headerSelector) : null;
    return {
      keyboardOpen: document.documentElement.classList.contains("is-keyboard-open"),
      inset: getComputedStyle(document.documentElement).getPropertyValue("--vv-offset-bottom").trim(),
      shellHeight: Math.round(shell?.getBoundingClientRect().height || 0),
      shellScrollTop: Math.round(shell?.scrollTop || 0),
      documentScrollTop: Math.round(document.scrollingElement?.scrollTop || 0),
      headerTop: header ? Math.round(header.getBoundingClientRect().top) : null,
    };
  }, { shellSelector, headerSelector });
  assert.equal(restored.keyboardOpen, false, `${name}: keyboard mode must clear after close`);
  assert.ok(
    Number.parseFloat(restored.inset) === 0 || restored.inset === "",
    `${name}: keyboard inset must clear after close (got ${restored.inset || "empty"})`,
  );
  assert.equal(restored.shellHeight, before.height, `${name}: shell height must recover after close`);
  assert.equal(restored.shellScrollTop, 0, `${name}: shell must remain at the top after close`);
  assert.equal(restored.documentScrollTop, 0, `${name}: document must remain at the top after close`);
  if (restored.headerTop != null) {
    assert(restored.headerTop >= 0, `${name}: header must remain on-screen after close`);
  }
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

async function activatePhoneScreen(page, screenId) {
  await page.evaluate((id) => {
    document.querySelectorAll("[data-phone-screen].is-active").forEach((node) => {
      node.classList.remove("is-active");
      node.hidden = true;
    });
    const screen = document.querySelector(`[data-phone-screen="${id}"]`);
    if (screen) {
      screen.hidden = false;
      screen.classList.add("is-active");
    }
  }, screenId);
  await page.waitForTimeout(200);
}

async function preparePopThread(page) {
  await page.evaluate(async () => {
    const { getActiveCharacterId, setActiveCharacterId } = await import("/src/characters/store.js");
    const characterId = getActiveCharacterId();
    setActiveCharacterId?.(characterId);
    const { openDm } = await import("/src/characters/sessions.js");
    await openDm(characterId);

    document.querySelectorAll("[data-phone-screen].is-active").forEach((node) => {
      node.classList.remove("is-active");
      node.hidden = true;
    });
    const pop = document.querySelector('[data-phone-screen="pop"]');
    if (pop) {
      pop.hidden = false;
      pop.classList.add("is-active");
    }
    const list = pop?.querySelector('[data-pop-chat-mode="list"]');
    const thread = pop?.querySelector('[data-pop-chat-mode="thread"]');
    if (list) list.hidden = true;
    if (thread) thread.hidden = false;
  });
  await page.waitForTimeout(200);
}

try {
  {
    const { context, page, errors } = await openPage("app");
    await verifyComposer(page, {
      name: "App chat",
      inputSelector: "#messageInput",
      shellSelector: ".app-shell",
      composerSelector: ".composer-stack.pop-composer",
      contentSelector: ".content-shell",
      headerSelector: ".chat-sticky",
    });

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("yueqi.assist.open-panel", { detail: { panel: "me" } }));
    });
    await page.waitForSelector('.app-page[data-panel="me"].is-active', {
      state: "visible",
      timeout: 15000,
    });
    await page.locator('[data-settings-route="assist"]:visible').first().click();
    await verifyComposer(page, {
      name: "App assistant",
      inputSelector: '[data-settings-view="assist"] [data-assist-input]',
      shellSelector: ".app-shell",
      composerSelector: '[data-settings-view="assist"] .assist-composer',
      contentSelector: ".content-shell",
    });
    assert.deepEqual(errors, [], `App shell page errors: ${errors.join("; ")}`);
    await context.close();
  }

  {
    const { context, page, errors } = await openPage("phone");
    await unlockPhone(page);
    await preparePopThread(page);
    await verifyComposer(page, {
      name: "Mini-phone Pop",
      inputSelector: '[data-phone-screen="pop"] [data-phone-chat-input]',
      shellSelector: ".mini-phone",
      composerSelector: '[data-phone-screen="pop"] .mini-composer',
      contentSelector: '[data-phone-screen="pop"]',
      headerSelector: '[data-phone-screen="pop"] .mini-appbar',
    });

    await activatePhoneScreen(page, "assist");
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("yueqi:phone-open-app", {
        detail: { appId: "assist" },
      }));
    });
    await page.waitForFunction(
      () => {
        const screen = document.querySelector('[data-phone-screen="assist"]');
        return Boolean(screen && screen.classList.contains("is-active") && !screen.hidden);
      },
      null,
      { timeout: 15000 },
    );
    // `paintView` triggers the same lazy mount/refresh used by the product.
    await page.waitForSelector('[data-phone-screen="assist"] [data-assist-input]', {
      state: "attached",
      timeout: 15000,
    });
    await verifyComposer(page, {
      name: "Mini-phone assistant",
      inputSelector: '[data-phone-screen="assist"] [data-assist-input]',
      shellSelector: ".mini-phone",
      composerSelector: '[data-phone-screen="assist"] .assist-composer',
      contentSelector: '[data-phone-screen="assist"]',
      headerSelector: '[data-phone-screen="assist"] .mini-appbar',
    });

    await activatePhoneScreen(page, "explore");
    await verifyComposer(page, {
      name: "Mini-phone Explore",
      inputSelector: '[data-phone-screen="explore"] .explore-session__composer input',
      shellSelector: ".mini-phone",
      composerSelector: '[data-phone-screen="explore"] .explore-session__composer',
      contentSelector: '[data-phone-screen="explore"]',
      headerSelector: '[data-phone-screen="explore"] .explore-appbar',
    });
    assert.deepEqual(errors, [], `Phone shell page errors: ${errors.join("; ")}`);
    await context.close();
  }

  console.log("All keyboard-composer browser checks passed.");
} finally {
  await browser.close();
  await vite?.close();
}
