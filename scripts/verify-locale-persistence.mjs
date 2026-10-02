/**
 * Language choice is a product decision, not a storage trick.
 *
 * The only way this script picks a language is by clicking the in-product
 * picker (first-run gate / first-light row, then Me → Language). It never
 * writes `yueqi.settings.v1` and never sets `window.__yueqiEarlyLocale`; a
 * self-check below fails the run if this file ever starts doing either.
 *
 * What it proves for both zh-CN and English:
 *   1. picking in the UI persists the locale,
 *   2. a refresh keeps it,
 *   3. a cold start (fresh browser context, fresh JS heap) keeps it — including
 *      the pre-bootstrap paint, before app.js and t() exist,
 *   4. signing in and signing out do not reset it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const here = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(here), "..");
const BOOT_TIMEOUT = 90000;

// --- self-check: the test may not cheat ------------------------------------
const source = fs.readFileSync(here, "utf8");
for (const forbidden of [`setItem("yueqi.settings.${"v1"}"`, `__yueqiEarlyLocale ${"="}`]) {
  assert.ok(
    !source.includes(forbidden),
    `this test must drive the product picker, never ${forbidden}`,
  );
}

// --- seeds (everything except the language) --------------------------------
function seedShell() {
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
  localStorage.setItem("yueqi.activeCharacterId", "char-xingli");
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
    loggedIn: false,
    token: "",
    authMode: "offline",
    productMode: "developer",
  }));
}

function seedSignedIn() {
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
    loggedIn: true,
    username: "locale-tester",
    token: "test-token",
    authMode: "online",
    productMode: "developer",
  }));
}

function seedSignedOut() {
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
    loggedIn: false,
    username: "",
    token: "",
    authMode: "signed_out",
    productMode: "developer",
  }));
}

// --- harness ----------------------------------------------------------------
const vite = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await vite.listen();
const address = vite.httpServer?.address();
assert(address && typeof address !== "string", "vite did not bind a port");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch();
const failures = [];
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  try {
    assert.deepEqual(actual, expected);
    console.log(`  PASS  ${label}`);
  } catch {
    failures.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    console.log(`  FAIL  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

async function openContext({ storageState, seeds = [], phone = false } = {}) {
  const context = await browser.newContext({
    storageState,
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: phone,
    hasTouch: phone,
    deviceScaleFactor: phone ? 2 : 1,
  });
  for (const seed of seeds) await context.addInitScript(seed);
  return context;
}

/** Locale state as painted before app.js runs, plus what is persisted. */
function readFacts() {
  return {
    lang: document.documentElement.lang,
    dataLocale: document.documentElement.dataset.locale || "",
    boot: document.querySelector("[data-boot-screen]")?.textContent?.trim() || "",
    stored: JSON.parse(localStorage.getItem("yueqi.settings.v1") || "{}").locale || "",
  };
}

async function load(context, { waitForShell = true } = {}) {
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT });
  const early = await page.evaluate(readFacts);
  if (waitForShell) {
    await page.waitForFunction(
      () => document.documentElement.classList.contains("app-boot-ready"),
      null,
      { timeout: BOOT_TIMEOUT },
    );
    await page.waitForTimeout(600);
  }
  return { page, early };
}

/** Click the language the first-run experience offers, whichever shell it is. */
async function pickInFirstRun(page, locale) {
  const gate = page.locator(`[data-lang-gate] [data-set-locale="${locale}"]`);
  const firstLight = page.locator(".fl-lang-btn", { hasText: locale === "en" ? "English" : "中文" });
  await Promise.race([
    gate.waitFor({ state: "visible", timeout: BOOT_TIMEOUT }).catch(() => {}),
    firstLight.first().waitFor({ state: "visible", timeout: BOOT_TIMEOUT }).catch(() => {}),
  ]);
  const target = (await gate.isVisible().catch(() => false)) ? gate : firstLight.first();
  await target.click({ timeout: 20000 });
  await page.waitForTimeout(500);
}

/** Me → Language → the app-language segment: the production switch. */
async function pickInSettings(page, locale) {
  await page.locator('.app-shell [data-tab="me"]').first().click({ timeout: 20000 });
  await page.waitForTimeout(400);
  await page.locator('[data-settings-route="language"]').first().click({ timeout: 20000 });
  await page.waitForTimeout(400);
  await page.locator(`[data-locale-segment] [data-set-locale="${locale}"]`).click({ timeout: 20000 });
  await page.waitForTimeout(600);
}

function expected(locale) {
  return {
    lang: locale === "en" ? "en" : "zh-CN",
    dataLocale: locale,
    boot: locale === "en" ? "Nyra" : "月栖 · Nyra",
    stored: locale,
  };
}

async function navLabel(page) {
  return page.locator('.app-shell [data-tab="chat"] [data-i18n="nav.chat"]').first().innerText();
}

try {
  // 1. Fresh install → pick English in the product UI only.
  console.log("\n[1] fresh install, English picked in the first-run picker");
  let context = await openContext();
  let { page } = await load(context);
  await pickInFirstRun(page, "en");
  check("picked locale is persisted", await page.evaluate(readFacts), expected("en"));

  // 2. Refresh.
  console.log("\n[2] refresh");
  await page.reload({ waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT });
  check("English survives a refresh, before bootstrap", await page.evaluate(readFacts), expected("en"));

  const englishState = await context.storageState();
  await context.close();

  // 3. Cold start: new browser context, nothing in memory.
  console.log("\n[3] cold start with a completed shell");
  context = await openContext({ storageState: englishState, seeds: [seedShell] });
  let loaded = await load(context);
  page = loaded.page;
  check("English before bootstrap paints", loaded.early, expected("en"));
  check("English after bootstrap", await page.evaluate(readFacts), expected("en"));
  check("app chrome is English", await navLabel(page), "Chat");
  check(
    "the instant phone shell boots in English",
    await page.evaluate(() => {
      window.__yueqiMountImmediatePhone?.();
      return document.querySelector(".instant-phone__apps small")?.textContent || "";
    }),
    "Chat",
  );
  await context.close();

  // 4. Signing in and out must not touch the language.
  console.log("\n[4] signed in / signed out");
  context = await openContext({ storageState: englishState, seeds: [seedShell, seedSignedIn] });
  loaded = await load(context);
  check("English while signed in", await loaded.page.evaluate(readFacts), expected("en"));
  await context.close();

  context = await openContext({ storageState: englishState, seeds: [seedShell, seedSignedOut] });
  loaded = await load(context);
  check("English after signing out", await loaded.page.evaluate(readFacts), expected("en"));
  await context.close();

  // 5. Switch back to Chinese from Me → Language.
  console.log("\n[5] switch to 中文 in settings");
  context = await openContext({ storageState: englishState, seeds: [seedShell] });
  loaded = await load(context);
  page = loaded.page;
  await pickInSettings(page, "zh-CN");
  check("switch to Chinese persists", await page.evaluate(readFacts), expected("zh-CN"));
  await page.reload({ waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT });
  check("Chinese survives a refresh, before bootstrap", await page.evaluate(readFacts), expected("zh-CN"));
  const chineseState = await context.storageState();
  await context.close();

  // 6. Chinese cold start, then back to English through the same control.
  console.log("\n[6] Chinese cold start, then back to English");
  context = await openContext({ storageState: chineseState, seeds: [seedShell] });
  loaded = await load(context);
  page = loaded.page;
  check("Chinese before bootstrap paints", loaded.early, expected("zh-CN"));
  check("app chrome is Chinese", await navLabel(page), "聊天");
  await pickInSettings(page, "en");
  check("switch back to English persists", await page.evaluate(readFacts), expected("en"));
  const backToEnglish = await context.storageState();
  await context.close();

  context = await openContext({ storageState: backToEnglish, seeds: [seedShell] });
  loaded = await load(context);
  check("English cold start after the second switch", loaded.early, expected("en"));
  check("app chrome is English again", await navLabel(loaded.page), "Chat");
  await context.close();
} finally {
  await browser.close();
  await vite.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.error("\nlocale persistence FAILED:");
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log("locale persistence PASS");
