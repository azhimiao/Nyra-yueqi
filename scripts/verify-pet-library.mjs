/**
 * Desk pet library layout contract.
 *
 * The preview windows are fixed-size grid containers. Without explicit tracks
 * their implicit row grows to the sprite's intrinsic square, the child's
 * height:100% resolves against that instead of the window, and overflow:hidden
 * crops every pet down to its head. Leaving the view also unmounts the
 * previews, so returning must remount them.
 */

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

function seed() {
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({
    done: true,
    paused: false,
    stage: "COMPLETED",
    migratedFromLegacy: true,
    version: 1,
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
    token: "local-pet-library-verify",
    productMode: "developer",
  }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({
    onboardingComplete: true,
    preset: "quiet",
  }));
}

/** Every mounted preview must fit inside its window. */
function measureCards() {
  return [...document.querySelectorAll(".pet-library-card")]
    .filter((card) => card.getBoundingClientRect().height > 0)
    .map((card) => {
      const host = card.querySelector(".pet-library-card__preview");
      const window = host.getBoundingClientRect();
      const art = host.querySelector("canvas") || host.querySelector(".bubble-character");
      const box = art?.getBoundingClientRect();
      return {
        id: card.dataset.petLibraryPick || "custom",
        // Pets mount an element; the import tile is just a glyph.
        mounted: Boolean(host.firstElementChild) || host.textContent.trim().length > 0,
        windowHeight: Math.round(window.height),
        artHeight: box ? Math.round(box.height) : null,
      };
    });
}

/** The app shell and the mini phone shell both carry these hooks. */
function clickVisible(page, selector) {
  return page.locator(selector).locator("visible=true").first().click();
}

async function openLibrary(page) {
  await clickVisible(page, '[data-tab="companion"]');
  await clickVisible(page, '[data-companion-tab="character"]');
  await clickVisible(page, '.pet-hub-nav__item[data-pet-open-view="library"]');
  await page.waitForSelector(".pet-library-card canvas", { timeout: 15000 });
  await page.waitForTimeout(400);
}

function assertFits(cards, label) {
  assert.ok(cards.length >= 2, `${label}: expected pet cards, saw ${cards.length}`);
  for (const card of cards) {
    assert.ok(card.mounted, `${label}: ${card.id} preview is empty`);
    if (card.artHeight == null) continue;
    assert.ok(
      card.artHeight <= card.windowHeight + 1,
      `${label}: ${card.id} art is ${card.artHeight}px inside a ${card.windowHeight}px window — it will be cropped`,
    );
  }
}

const browser = await chromium.launch({ headless: true });
let failure = null;

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1200, height: 900 }]) {
    const label = `${viewport.width}px`;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error?.message || error)));
    await page.addInitScript(seed);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      () => document.documentElement.classList.contains("app-boot-ready"),
      null,
      { timeout: 60000 },
    );

    await openLibrary(page);
    assertFits(await page.evaluate(measureCards), label);
    console.log(`PASS ${label}: every pet preview fits its window`);

    // Leaving unmounts the sprites; identical markup on return must remount.
    await clickVisible(page, '[data-pet-view="library"] .pet-hub-back');
    await page.waitForTimeout(400);
    await clickVisible(page, '.pet-hub-nav__item[data-pet-open-view="library"]');
    await page.waitForTimeout(1200);
    assertFits(await page.evaluate(measureCards), `${label} after revisit`);
    console.log(`PASS ${label}: previews survive leaving and re-entering the library`);

    assert.deepEqual(errors, [], `${label}: page errors`);
    await context.close();
  }
  console.log("\nPet library layout checks passed.");
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  await vite?.close();
}

if (failure) throw failure;
