/**
 * App-mode chat layout contract.
 *
 * Two regressions this locks down:
 *  1. The transcript bottom-anchored short threads with `align-content: end`,
 *     which pushes a long thread's overflow above the scroller's start edge
 *     where there is no scrollable area. History became unreachable.
 *  2. The composer re-added `env(safe-area-inset-bottom)` even though the fixed
 *     dock below it already spans that inset, leaving a dead band under the
 *     input field on gesture-nav handsets.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIMULATED_INSET = 24;
const MAX_DEAD_BAND = 22;

function seed() {
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({ loggedIn: true, token: "verify", productMode: "developer" }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
}

/** Strip the tall intro card so the short-thread branch is actually reachable. */
function shortenTranscript() {
  const list = document.querySelector("#messageList");
  list.querySelectorAll(".chat-intro-note, .message, .chat-time-separator").forEach((n) => n.remove());
  const only = document.createElement("article");
  only.className = "message ai";
  only.textContent = "single message";
  list.appendChild(only);
  void list.offsetHeight;
}

function appendMessages(count) {
  const list = document.querySelector("#messageList");
  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("article");
    row.className = "message ai";
    row.textContent = `history ${i}`;
    row.style.minHeight = "60px";
    list.appendChild(row);
  }
  void list.offsetHeight;
}

function readTranscript() {
  const list = document.querySelector("#messageList");
  const messages = [...list.querySelectorAll(".message")];
  const listRect = list.getBoundingClientRect();

  list.scrollTop = 99999;
  const maxScrollTop = list.scrollTop;
  const lastBottomAtEnd = messages.length
    ? messages[messages.length - 1].getBoundingClientRect().bottom
    : null;

  list.scrollTop = 0;
  const firstTopAtStart = messages.length
    ? messages[0].getBoundingClientRect().top
    : null;

  return {
    client: list.clientHeight,
    scroll: list.scrollHeight,
    maxScrollTop,
    listTop: listRect.top,
    listBottom: listRect.bottom,
    padTop: parseFloat(getComputedStyle(list).paddingTop),
    padBottom: parseFloat(getComputedStyle(list).paddingBottom),
    firstTopAtStart,
    lastBottomAtEnd,
    count: messages.length,
  };
}

/**
 * env() cannot be driven from the harness, so the inset is replayed with inline
 * !important on the three elements whose stylesheets reference it.
 */
function simulateInset(inset) {
  const set = (sel, prop, value) => {
    const n = document.querySelector(sel);
    if (!n) throw new Error(`missing ${sel}`);
    n.style.setProperty(prop, value, "important");
  };
  set("main.content-shell", "padding-bottom", `${62 + inset}px`);
  set(".bottom-tabs.nyra-dock", "min-height", `${58 + inset}px`);
  set(".bottom-tabs.nyra-dock", "padding-bottom", `${3 + inset}px`);
}

function readBottomChrome() {
  const field = document.querySelector("#messageInput").getBoundingClientRect();
  const dock = document.querySelector(".bottom-tabs.nyra-dock").getBoundingClientRect();
  return { fieldBottom: field.bottom, dockTop: dock.top, deadBand: dock.top - field.bottom };
}

const vite = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await vite.listen();
const address = vite.httpServer?.address();
assert(address && typeof address !== "string", "vite did not bind a port");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch();
let failures = 0;

async function openChat() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(seed);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), null, { timeout: 60000 });
  await page.waitForSelector("#messageList", { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { context, page };
}

async function check(name, fn) {
  const { context, page } = await openChat();
  try {
    await fn(page);
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  } finally {
    await context.close();
  }
}

await check("long transcript scrolls and reaches its oldest message", async (page) => {
  await page.evaluate(appendMessages, 30);
  await page.waitForTimeout(150);
  const t = await page.evaluate(readTranscript);

  assert(t.scroll > t.client + 1, `transcript did not overflow (scroll ${t.scroll} vs client ${t.client})`);
  assert(t.maxScrollTop > 0, `transcript is not scrollable: maxScrollTop ${t.maxScrollTop} with ${t.scroll - t.client}px of overflow`);
  assert(
    t.firstTopAtStart >= t.listTop - 1,
    `oldest message is unreachable above the scroller: top ${Math.round(t.firstTopAtStart)} vs list top ${Math.round(t.listTop)}`,
  );
  assert(
    t.lastBottomAtEnd <= t.listBottom + 1,
    `newest message sits past the scroller end: bottom ${Math.round(t.lastBottomAtEnd)} vs list bottom ${Math.round(t.listBottom)}`,
  );
});

await check("short transcript stays anchored to the composer", async (page) => {
  await page.evaluate(shortenTranscript);
  await page.waitForTimeout(150);
  const t = await page.evaluate(readTranscript);

  assert.equal(t.count, 1, `expected a single message, saw ${t.count}`);
  assert(t.maxScrollTop === 0, `short transcript should not scroll, maxScrollTop ${t.maxScrollTop}`);
  const slack = t.listBottom - t.padBottom - t.lastBottomAtEnd;
  assert(
    slack <= 2,
    `short transcript is not bottom-anchored: ${Math.round(slack)}px of empty space below the last message`,
  );
});

await check("composer does not double-count the bottom safe area", async (page) => {
  const before = await page.evaluate(readBottomChrome);
  await page.evaluate(simulateInset, SIMULATED_INSET);
  await page.waitForTimeout(200);
  const after = await page.evaluate(readBottomChrome);

  assert(
    after.deadBand <= MAX_DEAD_BAND,
    `input field floats ${Math.round(after.deadBand)}px above the dock under a ${SIMULATED_INSET}px inset `
      + `(was ${Math.round(before.deadBand)}px with no inset); the inset is being applied twice`,
  );
  assert(after.deadBand >= 0, `input field overlaps the dock by ${Math.round(-after.deadBand)}px`);
});

await browser.close();
await vite.close();

if (failures) {
  console.error(`\n${failures} chat layout check(s) failed`);
  process.exit(1);
}
console.log("\nchat scroll + composer layout OK");
