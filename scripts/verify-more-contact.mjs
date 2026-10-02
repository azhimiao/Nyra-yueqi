/**
 * "更多" lives in the sidebar, never in the bottom dock.
 *
 * Two regressions this locks down:
 *  1. A fourth dock button wrapped the fixed bottom dock onto a second row.
 *  2. That taller dock then covered the chat composer, because the content
 *     shell reserves space for a single-row dock.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function seed() {
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({
    locale: "zh-CN",
    localeChosen: true,
  }));
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
    token: "local-offline",
    username: "本机测试",
    productMode: "developer",
  }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({
    onboardingComplete: true,
    preset: "quiet",
  }));
}

/**
 * The dock is a grid whose centre button is deliberately raised, so rows are
 * counted by vertical overlap rather than by a shared top edge.
 */
function readDock() {
  const dock = document.querySelector(".bottom-tabs.nyra-dock");
  if (!dock) return null;
  const rects = [...dock.querySelectorAll(":scope > button")]
    .map((button) => button.getBoundingClientRect())
    .sort((a, b) => a.top - b.top);
  const rows = [];
  rects.forEach((rect) => {
    const row = rows.find((band) => rect.top < band.bottom && rect.bottom > band.top);
    if (row) {
      row.top = Math.min(row.top, rect.top);
      row.bottom = Math.max(row.bottom, rect.bottom);
    } else {
      rows.push({ top: rect.top, bottom: rect.bottom });
    }
  });
  return {
    rows: rows.length,
    buttons: rects.length,
    contactButtons: dock.querySelectorAll("[data-contact-menu]").length,
    top: dock.getBoundingClientRect().top,
  };
}

function readComposer() {
  const field = document.querySelector("#messageInput");
  if (!field) return null;
  const rect = field.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom, height: rect.height };
}

const expected = {
  github: "github.com/azhimiao/Nyra-yueqi",
  discord: "CogPrism",
  wechat: "azhimiaoo",
  "qq-group": "1034044082",
  email: "3804762525@qq.com",
  qq: "3804762525",
};

const vite = await createServer({
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
await vite.listen();
const address = vite.httpServer?.address();
assert(address && typeof address !== "string", "vite did not bind a port");

const browser = await chromium.launch({ headless: true });
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  }
}

async function openApp(viewport) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(seed);
  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => document.documentElement.classList.contains("app-boot-ready"),
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(800);
  return page;
}

async function assertContactPage(page, more) {
  await page.locator('[data-settings-view="community"]').waitFor({
    state: "visible",
    timeout: 20_000,
  });
  const contactView = page.locator('[data-settings-view="community"]');
  assert.equal(await more.getAttribute("aria-current"), "page", "更多 is not marked active");
  for (const [channel, value] of Object.entries(expected)) {
    assert.equal(
      (await contactView.locator(`[data-custom-contact-${channel}]`).textContent())?.trim(),
      value,
      `${channel} contact is missing or wrong`,
    );
  }
  assert.equal(
    await contactView.locator("[data-custom-contact-github]").getAttribute("href"),
    "https://github.com/azhimiao/Nyra-yueqi",
    "GitHub project link points to the wrong repository",
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    "contact page overflows horizontally",
  );
}

const phone = await openApp({ width: 390, height: 844 });

await check("the bottom dock stays on one row", async () => {
  const dock = await phone.evaluate(readDock);
  assert.ok(dock, "bottom dock is missing");
  assert.equal(dock.contactButtons, 0, "更多 must not sit in the bottom dock");
  assert.equal(dock.rows, 1, `dock wrapped onto ${dock.rows} rows (${dock.buttons} buttons)`);
});

await check("the chat composer is not covered by the dock", async () => {
  const dock = await phone.evaluate(readDock);
  const composer = await phone.evaluate(readComposer);
  assert.ok(composer, "chat composer is missing");
  assert.ok(composer.height > 20, `composer collapsed to ${composer.height}px`);
  assert.ok(
    composer.bottom <= dock.top + 1,
    `composer bottom ${composer.bottom} overlaps dock top ${dock.top}`,
  );
});

await check("the phone sidebar opens 更多 with every contact channel", async () => {
  await phone.locator("[data-drawer-open]:visible").first().click();
  const more = phone.locator(".drawer-nav [data-contact-menu]");
  await more.waitFor({ state: "visible", timeout: 10_000 });
  await more.click();
  await assertContactPage(phone, more);
});

await phone.close();

const desktop = await openApp({ width: 1280, height: 900 });

await check("the desktop sidebar opens 更多 with every contact channel", async () => {
  const more = desktop.locator(".side-tabs [data-contact-menu]");
  await more.waitFor({ state: "visible", timeout: 10_000 });
  await more.click();
  await assertContactPage(desktop, more);
});

await desktop.close();
await browser.close();
await vite.close();

console.log("");
if (failures) {
  console.error(`verify-more-contact failed: ${failures}`);
  process.exit(1);
}
console.log("verify-more-contact: ok");
