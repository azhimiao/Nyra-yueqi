/**
 * C6 product-cutover browser helpers — server, fixtures, mocks, shell navigation.
 * Plan: docs/COMPANION_PRODUCT_CUTOVER_RELEASE_PLAN.md §12
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  openPhoneApp,
  homeFromAnywhere,
  enterScenarioStage,
  phoneOpenAppApi,
  ensurePhoneUnlocked,
  readOnly,
} from "./phone.mjs";

export {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  openPhoneApp,
  homeFromAnywhere,
  enterScenarioStage,
  phoneOpenAppApi,
  ensurePhoneUnlocked,
  readOnly,
};

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OUT_DIR = path.join(ROOT, "docs/qa/product-cutover/browser");
export const CHAR_A = "char-xingli";
export const CHAR_B = "char-e2e-cutover-b";
export const PREF_CLAIM = "喜欢雨天安静聊天";
export const DIARY_MARKER = "琥珀月C6日记";
export const BOOK_MARKER = "车站的雨C6阅读";

export async function waitForUrl(url, timeoutMs = 60000) {
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

function spawnVite(port) {
  const child = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    // ignore all stdio — pipe buffers can stall Node children on long Playwright runs (Windows).
    stdio: "ignore",
    shell: true,
    detached: false,
    windowsHide: true,
  });
  child.on("error", () => {});
  return child;
}

export async function ensureServer() {
  // Always spawn a dedicated Vite for this suite so we control lifecycle.
  const url = process.env.DEMO_URL || "http://127.0.0.1:5188/";
  const port = new URL(url).port || "5188";
  if (await waitForUrl(url, 800)) {
    // Reuse only if already healthy; do not take ownership of foreign process.
    return { url, child: null, owned: false, port };
  }
  const child = spawnVite(port);
  const ok = await waitForUrl(url, 90000);
  if (!ok) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    throw new Error(`vite failed to start for product-cutover browser e2e (${url})`);
  }
  return { url, child, owned: true, port };
}

export async function ensureServerAlive(state) {
  const url = state?.url || process.env.DEMO_URL || "http://127.0.0.1:5188/";
  if (await waitForUrl(url, 2000)) {
    // Owned child may have exited even if something else answers — respawn if ours died.
    if (state?.owned && state.child && state.child.exitCode != null) {
      const child = spawnVite(state.port || new URL(url).port || "5188");
      const ok = await waitForUrl(url, 90000);
      if (!ok) throw new Error(`vite died mid-suite and failed to restart (${url})`);
      return { ...state, child, owned: true };
    }
    return state || { url, child: null, owned: false };
  }
  // Prefer restarting our owned child; otherwise start fresh.
  if (state?.owned && state.child) {
    try {
      state.child.kill();
    } catch {
      /* ignore */
    }
  }
  return ensureServer();
}

/** Fail hard — never soft-skip when Playwright/browser is missing. */
export async function requirePlaywright() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    throw new Error(
      `Playwright is not installed. Run: npm i && npx playwright install chromium\n${err?.message || err}`,
    );
  }
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
  } catch (err) {
    throw new Error(
      `Playwright Chromium browser missing or failed to launch. Run: npx playwright install chromium\n${err?.message || err}`,
    );
  }
  return chromium;
}

export function seedCutoverFixture(page, opts = {}) {
  const profile = opts.profile || "internal_v1";
  const locale = opts.locale || "zh-CN";
  const appMode = opts.appMode || "phone";
  return page.addInitScript(
    ({ profile, locale, appMode }) => {
      try {
        localStorage.setItem("yueqi.cutover.profile.v1", JSON.stringify(profile));
        localStorage.setItem("yueqi.developerMode", "1");
        localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale, localeChosen: true }));
        localStorage.setItem("yueqi.app.mode", appMode);
        localStorage.setItem("yueqi.app.mode.chosen", "1");
        localStorage.setItem(
          "yueqi.onboarding.v1",
          JSON.stringify({ done: true, accountMode: "offline", uiModeChosen: true }),
        );
        localStorage.setItem(
          "yueqi.ecosystem.v1",
          JSON.stringify({
            authMode: "offline",
            loggedIn: false,
            token: "",
            modelSource: "byok",
          }),
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
          "yueqi.provider.v1",
          JSON.stringify({
            kind: "OpenAI Compatible",
            baseUrl: "http://127.0.0.1:8787",
            model: "e2e-cutover-mock",
          }),
        );
        sessionStorage.setItem("yueqi.web-secret.provider.apiKey", "e2e-cutover-key");
        localStorage.setItem(
          "yueqi.autonomy.v1",
          JSON.stringify({
            schemaVersion: 1,
            onboardingComplete: true,
            preset: "companion",
            proactiveMessage: true,
          }),
        );
      } catch {
        /* ignore */
      }
    },
    { profile, locale, appMode },
  );
}

export function installModelMock(page, replyFactory) {
  const factory =
    typeof replyFactory === "function"
      ? replyFactory
      : () => String(replyFactory || "嗯，我记住了，我们慢慢说。");
  const handler = async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = String(lastUser?.content || "");
    const replyText = factory({ body, userText, messages });
    if (body.stream) {
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: replyText } }] })}\n\ndata: [DONE]\n\n`;
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: sse,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().url().includes("/model/chat")
        ? JSON.stringify({ ok: true, content: replyText })
        : JSON.stringify({
          id: "chatcmpl-e2e-cutover",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: replyText }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
    });
  };
  // Managed subscriptions use the Yueqi gateway, while developer mode calls
  // the OpenAI-compatible endpoint directly. C6 exercises both product modes.
  return Promise.all([
    page.route("**/model/chat", handler),
    page.route("**/chat/completions", handler),
  ]);
}

export function installWebSearchMock(page, mode = "ok") {
  return page.route("**/api/retrieval/**", async (route) => {
    if (mode === "offline") {
      await route.fulfill({
        // Application-level offline envelope: the UI must degrade cleanly
        // without turning an expected network state into a console failure.
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "offline", results: [] }),
      });
      return;
    }
    if (mode === "unconfigured") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "provider_unconfigured", results: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        provider: "e2e-mock",
        results: [
          {
            title: "E2E Source",
            url: "https://example.com/e2e-cutover",
            snippet: "C6 web retrieval source",
            fetchedAt: new Date().toISOString(),
          },
        ],
      }),
    });
  });
}

export async function dismissOverlays(page) {
  await page.evaluate(() => {
    const onboard = document.querySelector("[data-autonomy-onboard]");
    if (onboard) onboard.hidden = true;
  }).catch(() => {});
}

async function goHomeWidgetsPage(page) {
  const page0 = page.locator('[data-home-dot][data-page="0"]');
  if (await page0.count()) {
    await page0.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

/** C1 home: Pop/Listen live in widgets, not dock icons. */
export async function openPhoneAppC1(page, appId) {
  const onHome = await page.locator('[data-phone-screen="home"].is-active').isVisible().catch(() => false);
  if (!onHome) {
    await homeFromAnywhere(page).catch(async () => {
      await openPhoneHome(page);
      await dismissOverlays(page);
    });
  }
  await ensurePhoneUnlocked(page);

  if (appId === "diary" || appId === "read" || appId === "gallery" || appId === "memory") {
    await openPhoneApp(page, appId);
    return;
  }

  if (appId === "pop") {
    await goHomeWidgetsPage(page);
    const chat = page.locator("[data-home-companion-chat]").first();
    await chat.waitFor({ state: "attached", timeout: 15000 });
    // Clipped by .mini-phone — force click, then shell API fallback.
    await chat.click({ force: true }).catch(() => {});
    let opened = await page
      .waitForFunction(() => {
        const pop = document.querySelector('[data-phone-screen="pop"]');
        return Boolean(pop && !pop.hidden && pop.classList.contains("is-active"));
      }, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      await phoneOpenAppApi(page, "pop");
      opened = await page
        .waitForFunction(() => {
          const pop = document.querySelector('[data-phone-screen="pop"]');
          return Boolean(pop && !pop.hidden);
        }, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      await page.evaluate(() => {
        document.querySelectorAll("[data-phone-screen].is-active").forEach((n) => {
          n.classList.remove("is-active");
          n.hidden = true;
        });
        const pop = document.querySelector('[data-phone-screen="pop"]');
        if (pop) {
          pop.hidden = false;
          pop.classList.add("is-active");
        }
      });
    }
    await page.waitForSelector('[data-phone-screen="pop"]:not([hidden])', { timeout: 10000 });
    return;
  }

  if (appId === "listen") {
    await goHomeWidgetsPage(page);
    const widget = page.locator('[data-widget="listen"]').first();
    await widget.waitFor({ state: "attached", timeout: 15000 });
    await widget.click({ force: true }).catch(() => {});
    let opened = await page
      .waitForFunction(() => {
        const el = document.querySelector('[data-phone-screen="listen"]');
        return Boolean(el && !el.hidden && el.classList.contains("is-active"));
      }, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      await phoneOpenAppApi(page, "listen");
      opened = await page
        .waitForFunction(() => {
          const el = document.querySelector('[data-phone-screen="listen"]');
          return Boolean(el && !el.hidden);
        }, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!opened) {
      await page.evaluate(() => {
        document.querySelectorAll("[data-phone-screen].is-active").forEach((n) => {
          n.classList.remove("is-active");
          n.hidden = true;
        });
        const listen = document.querySelector('[data-phone-screen="listen"]');
        if (listen) {
          listen.hidden = false;
          listen.classList.add("is-active");
        }
      });
    }
    await page.waitForSelector('[data-phone-screen="listen"]:not([hidden])', { timeout: 10000 });
    return;
  }

  if (appId === "scenario" || appId === "theater") {
    await ensurePhoneUnlocked(page);
    if (!(await phoneOpenAppApi(page, "theater")) && !(await phoneOpenAppApi(page, "scenario"))) {
      await openPhoneApp(page, "shop").catch(() => {});
      const sc = page.locator('[data-app-id="scenario"], [data-open-app="scenario"], [data-yeos-open="scenario"]').first();
      if (await sc.isVisible().catch(() => false)) {
        await sc.click({ force: true });
      }
    }
    await page.waitForSelector(
      '[data-phone-screen="theater"].is-active, [data-phone-screen="theater"]:not([hidden]), [data-scenario-view]',
      { timeout: 15000 },
    ).catch(() => {});
    return;
  }

  await openPhoneApp(page, appId);
}

export async function ensurePopThread(page, characterId = CHAR_A) {
  await ensurePhoneUnlocked(page);
  // Reset both DOM and the shell's internal currentView through normal OS
  // navigation. Previous journeys may leave a visually open but internally
  // stale Pop screen, which makes Back operate on the wrong app.
  await homeFromAnywhere(page);
  await openPhoneApp(page, "pop");

  // Use the same path as a user: leave the current thread, then tap the real
  // session row. Directly importing openDm (or synthesizing a hidden button)
  // can race the phone shell's own thread state and conceal A/B scope bugs.
  const threadPane = page.locator('[data-phone-screen="pop"] [data-pop-chat-mode="thread"]');
  if (await threadPane.isVisible().catch(() => false)) {
    await page.locator('[data-phone-screen="pop"] [data-pop-nav-back]').click({ force: true });
  }
  await page.waitForSelector(
    '[data-phone-screen="pop"] [data-pop-chat-mode="list"]:not([hidden])',
    { timeout: 15000 },
  );
  const row = page.locator(`[data-phone-screen="pop"] [data-open-dm="${characterId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  await row.click();
  const viaApi = "ui-session-row";

  await page.waitForFunction(() => {
    const pop = document.querySelector('[data-phone-screen="pop"]');
    const thread = pop?.querySelector('[data-pop-chat-mode="thread"]');
    const input = pop?.querySelector("[data-phone-chat-input]");
    return Boolean(pop && !pop.hidden && thread && !thread.hidden && input);
  }, null, { timeout: 15000 });

  const focused = await page.waitForFunction(async (cid) => {
    try {
      const { getChatFocus } = await import("/src/characters/session-context.js");
      return getChatFocus()?.characterId === cid;
    } catch {
      return false;
    }
  }, characterId, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!focused) {
    const actual = await page.evaluate(async () => {
      const { getChatFocus } = await import("/src/characters/session-context.js");
      return getChatFocus()?.characterId || "";
    }).catch(() => "");
    throw new Error(`phone DM focus mismatch: expected=${characterId}; actual=${actual}; via=${viaApi}`);
  }
  await page.waitForTimeout(150);
  return viaApi;
}

export async function sendPhoneChat(page, text, characterId = CHAR_A) {
  await ensurePopThread(page, characterId);
  await page.waitForSelector("[data-phone-chat-input]", { state: "attached", timeout: 10000 });
  await page.evaluate(async (msg) => {
    const api = window.__yueqiPhone;
    if (typeof api?.sendMessage === "function") {
      await api.sendMessage(msg);
      return;
    }
    const el = document.querySelector("[data-phone-chat-input]");
    const form = document.querySelector("[data-phone-chat-form]");
    if (!el || !form) throw new Error("phone chat composer missing");
    el.value = msg;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }, text);
  await page.waitForFunction(
    (marker) => {
      const nodes = document.querySelectorAll("[data-phone-messages] .mini-message.is-user p");
      return [...nodes].some((n) => (n.textContent || "").includes(marker));
    },
    text.slice(0, 24),
    { timeout: 15000 },
  );
}

export async function clickPhoneCharacterReply(page) {
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector("[data-phone-speak-char]");
    if (!btn) return false;
    btn.hidden = false;
    btn.click();
    return true;
  });
  if (!clicked) {
    await page.locator("[data-phone-speak-char]").click({ force: true });
  }
}

async function armCharacterReplyWait(page) {
  const before = await page
    .locator("[data-phone-messages] .mini-message.is-ai")
    .count()
    .catch(() => 0);
  await page.evaluate(() => {
    window.__E2E_CUTOVER_REPLIED__ = false;
    window.addEventListener(
      "yueqi.character.replied",
      () => {
        window.__E2E_CUTOVER_REPLIED__ = true;
      },
      { once: true },
    );
  });
  return before;
}

export async function waitCharacterReplied(page, timeoutMs = 45000, armedBefore = null) {
  const before = Number.isFinite(armedBefore) ? armedBefore : await armCharacterReplyWait(page);
  await page.waitForFunction(
    (prev) => {
      const n = document.querySelectorAll(
        "[data-phone-messages] .mini-message.is-ai",
      ).length;
      return n > prev;
    },
    before,
    { timeout: timeoutMs },
  );
  // Extraction / promote runs after reply — give the ledger a beat.
  await page.waitForTimeout(800);
}

export async function sendPhoneAndReply(page, text, characterId = CHAR_A) {
  await ensurePopThread(page, characterId);
  const before = await armCharacterReplyWait(page);
  await sendPhoneChat(page, text, characterId);
  await waitCharacterReplied(page, 45000, before);
}

export async function switchToAppMode(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("yueqi.app.mode", "app");
      localStorage.setItem("yueqi.app.mode.chosen", "1");
    } catch {
      /* ignore */
    }
  });
  const btn = page.locator('[data-app-mode="app"]').first();
  if (await btn.count()) {
    await btn.click({ force: true }).catch(() => {});
  }
  await page.evaluate(() => {
    try {
      window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: "app" } }));
      document.body.dataset.appMode = "app";
      delete document.body.dataset.phoneReady;
      const root = document.querySelector("[data-small-phone-root]");
      if (root) root.hidden = true;
      document.querySelectorAll(".app-shell, .bottom-nav, [data-app-shell], [data-tab]").forEach((el) => {
        el.hidden = false;
        if (el instanceof HTMLElement) el.style.pointerEvents = "auto";
      });
    } catch {
      /* ignore */
    }
  });
  await page.waitForFunction(() => document.body?.dataset?.appMode === "app", { timeout: 10000 });
  await page.waitForSelector("#messageInput, [data-composer-text], [data-panel='chat'], [data-tab]", {
    timeout: 10000,
  }).catch(() => {});
}

export async function switchToPhoneMode(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("yueqi.app.mode", "phone");
      localStorage.setItem("yueqi.app.mode.chosen", "1");
    } catch {
      /* ignore */
    }
  });
  const btn = page.locator('[data-app-mode="phone"]').first();
  if (await btn.count()) {
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => document.body?.dataset?.appMode === "phone", { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => {
    const root = document.querySelector("[data-small-phone-root]");
    if (root) root.hidden = false;
    document.body.dataset.appMode = "phone";
  });
  await page.waitForSelector(".mini-phone", { state: "visible", timeout: 15000 }).catch(() => {});
}

export async function clickAppTab(page, tabId) {
  await switchToAppMode(page);
  // Mini-phone overlay often clips bottom-nav tabs — never hard-click for visibility.
  await page.evaluate((id) => {
    document.body.dataset.appMode = "app";
    document.body.dataset.activePanel = id;
    const root = document.querySelector("[data-small-phone-root]");
    if (root) root.hidden = true;
    document.querySelectorAll("[data-panel]").forEach((p) => {
      const active = p.getAttribute("data-panel") === id;
      p.classList.toggle("is-active", active);
      p.hidden = !active;
    });
    document.querySelectorAll("[data-tab]").forEach((t) => {
      const active = t.getAttribute("data-tab") === id;
      t.classList.toggle("is-active", active);
      if (t instanceof HTMLElement) {
        t.hidden = false;
        t.style.visibility = "visible";
        t.style.pointerEvents = "auto";
      }
      if (active && typeof t.click === "function") t.click();
    });
  }, tabId);
  await page.waitForTimeout(200);
}

export async function sendAppChat(page, text) {
  await switchToAppMode(page);
  await clickAppTab(page, "chat").catch(() => {});
  const sent = await page.evaluate((msg) => {
    const el =
      document.querySelector("#messageInput")
      || document.querySelector("[data-composer-text]");
    if (!el) return false;
    el.hidden = false;
    if (el instanceof HTMLElement) {
      el.style.display = "";
      el.style.visibility = "visible";
    }
    el.value = msg;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    const send =
      document.querySelector("#sendBtn")
      || document.querySelector("[data-panel='chat'] [data-composer-send]");
    if (send) send.click();
    else el.form?.requestSubmit?.();
    return true;
  }, text);
  if (!sent) throw new Error("app chat composer not wired");
  await page.waitForFunction((marker) => {
    const rows = document.querySelectorAll("#messageList .message.is-user, #messageList [data-message-role='user']");
    return [...rows].some((row) => String(row.textContent || "").includes(marker));
  }, text.slice(0, 24), { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
}

export async function clickAppCharacterReply(page) {
  const btn = page.locator("[data-composer-speak]").first();
  await btn.click({ force: true });
}

export async function waitProposalCard(page, host = "phone", timeoutMs = 15000) {
  const sel =
    host === "app"
      ? "[data-action-proposal-host='app'] [data-action-proposal-card], [data-action-proposal-card].is-app"
      : "[data-action-proposal-host='phone'] [data-action-proposal-card], [data-action-proposal-card].is-phone, [data-phone-screen='pop'] [data-action-proposal-card]";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const card = page.locator(sel).first();
    if (await card.count()) {
      const visible = await card.isVisible().catch(() => false);
      if (visible) return card;
      // Card attached but clipped — still interactable with force.
      const status = await card.getAttribute("data-status").catch(() => "");
      if (status) return card;
    }
    await page.waitForTimeout(250);
  }
  await page.waitForSelector(sel, { state: "attached", timeout: 2000 });
  return page.locator(sel).first();
}

export async function recoverToPhoneHome(page) {
  await switchToPhoneMode(page).catch(() => {});
  await page.evaluate(() => {
    try {
      localStorage.setItem("yueqi.developerMode", "1");
      localStorage.setItem("yueqi.app.mode", "phone");
      localStorage.setItem("yueqi.e2e.experienceStub", "1");
      window.__YUEQI_E2E_EXPERIENCE_STUB__ = true;
    } catch {
      /* ignore */
    }
  }).catch(() => {});
  try {
    const locked = await page.evaluate(() =>
      document.querySelector(".mini-phone")?.dataset?.phoneLocked === "true",
    );
    const homeActive = await page.locator('[data-phone-screen="home"].is-active').isVisible().catch(() => false);
    if (locked || !homeActive) {
      const hasPhone = await page.locator(".mini-phone").count();
      if (hasPhone) {
        await ensurePhoneUnlocked(page);
        await homeFromAnywhere(page).catch(async () => {
          await openPhoneHome(page);
        });
      } else {
        await openPhoneHome(page);
      }
    } else {
      await homeFromAnywhere(page);
    }
  } catch {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await openPhoneHome(page);
  }
  await dismissOverlays(page);
  await page.waitForSelector('[data-phone-screen="home"].is-active, [data-home-companion-chat]', {
    timeout: 15000,
  }).catch(() => {});
}

export async function openPhoneDevtools(page) {
  await recoverToPhoneHome(page);
  await page.evaluate(() => {
    try {
      localStorage.setItem("yueqi.developerMode", "1");
    } catch {
      /* ignore */
    }
  });
  // Direct shell open — do not wait on `[data-devtools-root]:not([hidden])` alone
  // (that node exists under a hidden screen and falsely matches).
  let opened = await phoneOpenAppApi(page, "devtools");
  if (!opened) {
    await openPhoneApp(page, "settings");
    await page.evaluate(() => {
      document.querySelectorAll("details.mini-settings-advanced").forEach((d) => {
        d.open = true;
      });
      document.querySelectorAll("[data-devtools-entry]").forEach((el) => {
        el.hidden = false;
        el.removeAttribute("hidden");
      });
      document.querySelector("[data-devtools-entry], [data-phone-open='devtools']")?.click();
    });
  }
  opened = await page
    .waitForFunction(() => {
      const screen = document.querySelector('[data-phone-screen="devtools"]');
      return Boolean(screen && !screen.hidden && screen.classList.contains("is-active"));
    }, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await page.evaluate(() => {
      document.querySelectorAll("[data-phone-screen].is-active").forEach((n) => {
        n.classList.remove("is-active");
        n.hidden = true;
      });
      const screen = document.querySelector('[data-phone-screen="devtools"]');
      if (!screen) throw new Error("devtools screen not wired in DOM");
      screen.hidden = false;
      screen.classList.add("is-active");
      const phone = document.querySelector(".mini-phone");
      if (phone) {
        phone.dataset.phoneView = "devtools";
        phone.classList.add("is-app-fullscreen");
      }
    });
  }
  await page.waitForSelector(
    '[data-phone-screen="devtools"].is-active [data-palace-rebuild], [data-phone-screen="devtools"]:not([hidden]) [data-cutover-profile-select]',
    { state: "attached", timeout: 15000 },
  );
}

export function makeSilentWavFile(seconds = 2, sampleRate = 8000) {
  const numSamples = sampleRate * seconds;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  return {
    name: "e2e-cutover-silence.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from(buffer),
  };
}

export function makeBookTextFile() {
  const body = `第一章。${BOOK_MARKER}。\n\n第二章。记忆分层与 sourceRef。`;
  return {
    name: "e2e-cutover-book.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8"),
  };
}
