/**
 * Mini-phone chrome contract.
 *
 *  1. The control bar (App switch + notifications) is home-screen furniture.
 *     Opening an app must remove it *and* release the top clearance every view
 *     reserves for it, while keeping the device status-bar inset so app headers
 *     never slide under the system clock.
 *  2. Empty home-grid slots are holes in the layout. While arranging icons they
 *     may show an outline, but they must never inherit the app tile's opaque
 *     fill and drop shadow, which made them read as blank white apps.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTROLBAR_HEIGHT = 44;
const APPS = ["pop", "diary", "listen"];

function seed() {
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", "phone");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
  localStorage.setItem("yueqi.firstLight.v2", JSON.stringify({ schemaVersion: 2, stage: "COMPLETED", done: true, paused: false }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
    loggedIn: false,
    token: "",
    authMode: "offline",
    productMode: "developer",
  }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
  localStorage.setItem("yueqi.activeCharacterId", "char-xingli");
  localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false }));
}

function readChrome() {
  const phone = document.querySelector(".mini-phone");
  const bar = phone.querySelector(".mini-controlbar");
  const view = phone.querySelector("[data-phone-screen].is-active");
  const barStyle = getComputedStyle(bar);
  const screenTop = phone.querySelector(".mini-phone__screen").getBoundingClientRect().top;

  // The tallest thing an app draws at its own top edge, whatever it is called.
  const header = view?.querySelector(".mini-appbar, header, [class*='__bar']") || null;

  return {
    view: phone.dataset.phoneView,
    fullscreen: phone.classList.contains("is-app-fullscreen"),
    barDisplayed: barStyle.display !== "none",
    barHeight: Math.round(bar.getBoundingClientRect().height),
    safeTop: barStyle.getPropertyValue("--mini-safe-top").trim(),
    controlbarVar: barStyle.getPropertyValue("--mini-controlbar-height").trim(),
    viewPadTop: view ? Math.round(parseFloat(getComputedStyle(view).paddingTop)) : null,
    headerOffset: header ? Math.round(header.getBoundingClientRect().top - screenTop) : null,
  };
}

function readSlot() {
  const phone = document.querySelector(".mini-phone");
  const slot = phone.querySelector(".mini-app-slot > i");
  if (!slot) throw new Error("the home grid has no empty slot to inspect");
  const tile = phone.querySelector(".mini-app-icon > span");
  const style = getComputedStyle(slot);
  const rect = slot.getBoundingClientRect();
  const alphaOf = (color) => {
    const parts = /rgba?\(([^)]+)\)/.exec(color)?.[1].split(",").map((v) => parseFloat(v));
    if (!parts) return 1;
    return parts.length > 3 ? parts[3] : 1;
  };
  return {
    shown: getComputedStyle(slot.parentElement).visibility !== "hidden",
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    tileWidth: tile ? Math.round(tile.getBoundingClientRect().width) : null,
    fillAlpha: alphaOf(style.backgroundColor),
    shadow: style.boxShadow,
  };
}

const vite = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await vite.listen();
const address = vite.httpServer?.address();
assert(address && typeof address !== "string", "vite did not bind a port");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch();
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
await page.waitForSelector(".mini-phone .mini-controlbar", { timeout: 30000 });
await page.waitForFunction(() => Boolean(window.__yueqiPhone), null, { timeout: 30000 });
await page.waitForTimeout(1200);

// A locked phone refuses openApp, so the lock screen has to be cleared first.
const unlock = page.locator("[data-lock-to-passcode]");
if (await unlock.isVisible().catch(() => false)) {
  await unlock.click({ force: true }).catch(() => {});
}
await page.waitForFunction(
  () => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false",
  null,
  { timeout: 20000 },
);

const goHome = async () => {
  await page.evaluate(() => window.__yueqiPhone.setView("home"));
  await page.waitForTimeout(400);
};
const openApp = async (id) => {
  await page.evaluate((appId) => window.__yueqiPhone.openApp(appId), id);
  await page.waitForTimeout(600);
};

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  }
};

await goHome();
const home = await page.evaluate(readChrome);

check("home screen shows the control bar and reserves its clearance", () => {
  assert.equal(home.view, "home", `expected the home view, saw ${home.view}`);
  assert(home.barDisplayed, "control bar is hidden on the home screen");
  assert.equal(home.barHeight, CONTROLBAR_HEIGHT, `control bar is ${home.barHeight}px tall, expected ${CONTROLBAR_HEIGHT}`);
  assert(
    home.viewPadTop >= CONTROLBAR_HEIGHT,
    `home reserves only ${home.viewPadTop}px of top clearance for a ${CONTROLBAR_HEIGHT}px bar`,
  );
});

for (const app of APPS) {
  await openApp(app);
  const inApp = await page.evaluate(readChrome);

  check(`"${app}" reclaims the control bar strip`, () => {
    assert(inApp.fullscreen, `.is-app-fullscreen missing for "${app}" (view ${inApp.view})`);
    assert(!inApp.barDisplayed, `control bar still visible inside "${app}"`);
    assert.equal(
      inApp.controlbarVar,
      "0px",
      `--mini-controlbar-height is ${inApp.controlbarVar} inside "${app}", so views keep reserving space`,
    );
    assert(
      inApp.viewPadTop <= home.viewPadTop - CONTROLBAR_HEIGHT,
      `"${app}" still pads ${inApp.viewPadTop}px at the top (home pads ${home.viewPadTop}px); `
        + `expected at most ${home.viewPadTop - CONTROLBAR_HEIGHT}px`,
    );
    if (inApp.headerOffset !== null) {
      assert(
        inApp.headerOffset < CONTROLBAR_HEIGHT,
        `"${app}" header still starts ${inApp.headerOffset}px down the screen`,
      );
    }
  });
}

await goHome();
const back = await page.evaluate(readChrome);
check("returning home restores the control bar", () => {
  assert.equal(back.view, "home", `expected the home view, saw ${back.view}`);
  assert(back.barDisplayed, "control bar did not come back on the home screen");
  assert.equal(back.viewPadTop, home.viewPadTop, `home clearance changed: ${home.viewPadTop}px then ${back.viewPadTop}px`);
});

// `setEditMode()` in phone-shell.js is what puts this class on the phone, and the
// whole arrange-mode stylesheet keys on it, so toggling it renders the real state.
const setArranging = (on) => page.evaluate(
  (flag) => document.querySelector(".mini-phone").classList.toggle("is-home-editing", flag),
  on,
);

const idleSlot = await page.evaluate(readSlot);
check("empty slots stay invisible outside arrange mode", () => {
  assert(!idleSlot.shown, "empty grid slots are painted on the normal home screen");
});

await setArranging(true);
await page.waitForTimeout(300);
const arrangingSlot = await page.evaluate(readSlot);
await setArranging(false);

check("arrange mode draws empty slots as outlines, not blank app tiles", () => {
  assert(arrangingSlot.shown, "empty slots never appear while arranging, so there is nothing to drop onto");
  assert(
    Math.abs(arrangingSlot.width - arrangingSlot.height) <= 1,
    `slot is ${arrangingSlot.width}x${arrangingSlot.height}, not square like an icon tile`,
  );
  assert(
    arrangingSlot.fillAlpha <= 0.2,
    `slot fill is ${arrangingSlot.fillAlpha} opaque, which reads as a blank white app`,
  );
  const shadows = arrangingSlot.shadow.split(/,(?![^()]*\))/).filter((part) => part.trim() && part.trim() !== "none");
  assert(
    shadows.every((part) => part.includes("inset")),
    `slot casts an outer shadow like a real tile: ${arrangingSlot.shadow}`,
  );
  if (arrangingSlot.tileWidth !== null) {
    assert(
      Math.abs(arrangingSlot.width - arrangingSlot.tileWidth) <= 2,
      `slot footprint ${arrangingSlot.width}px breaks the grid rhythm set by ${arrangingSlot.tileWidth}px tiles`,
    );
  }
});

await openApp("settings");
await page.locator('[data-phone-auth-mode="register"]').click();
const registerBeforeConsent = await page.evaluate(() => ({
  registerFieldsVisible: !document.querySelector("[data-phone-auth-register-only]")?.hidden,
  emailCodeVisible: !document.querySelector("[data-phone-auth-email-register-only]")?.hidden,
  submitDisabled: document.querySelector("[data-phone-auth-login]")?.disabled,
  terms: document.querySelector('[data-phone-auth-form] [data-legal-document="terms"]')?.getAttribute("href"),
  privacy: document.querySelector('[data-phone-auth-form] [data-legal-document="privacy"]')?.getAttribute("href"),
}));
check("phone registration shows current legal terms and blocks unaccepted submit", () => {
  assert(registerBeforeConsent.registerFieldsVisible, "phone registration fields stayed hidden");
  assert(registerBeforeConsent.emailCodeVisible, "email registration code stayed hidden");
  assert(registerBeforeConsent.submitDisabled, "phone registration submit is enabled before consent");
  assert.match(registerBeforeConsent.terms || "", /doc=terms&lang=zh-CN/);
  assert.match(registerBeforeConsent.privacy || "", /doc=privacy&lang=zh-CN/);
});

await page.locator("[data-phone-auth-legal-consent]").check();
await page.locator("[data-phone-auth-email]").fill("phone-check@example.com");
await page.locator("[data-phone-auth-code]").fill("123456");
await page.locator("[data-phone-auth-password]").fill("secret12");
const submitDisabledAfterConsent = await page.locator("[data-phone-auth-login]").isDisabled();
check("email registration enables submit after email code and consent", () => {
  assert.equal(submitDisabledAfterConsent, false);
});

await page.locator('[data-phone-auth-type="phone"]').click();
await page.locator("[data-phone-auth-phone]").fill("13800138000");
const phoneRegister = await page.evaluate(() => ({
  phoneVisible: !document.querySelector("[data-phone-auth-phone-only]")?.hidden,
  emailCodeHidden: document.querySelector("[data-phone-auth-email-register-only]")?.hidden,
  countryCode: document.querySelector("[data-phone-auth-country-code]")?.value,
  submitDisabled: document.querySelector("[data-phone-auth-login]")?.disabled,
}));
check("phone registration uses country code and no email verification code", () => {
  assert(phoneRegister.phoneVisible, "phone field stayed hidden");
  assert(phoneRegister.emailCodeHidden, "email code is visible for phone registration");
  assert.equal(phoneRegister.countryCode, "+86");
  assert.equal(phoneRegister.submitDisabled, false);
});

await page.locator('[data-phone-auth-mode="login"]').click();
const phoneLogin = await page.evaluate(() => ({
  emailCodeHidden: document.querySelector("[data-phone-auth-email-register-only]")?.hidden,
  legalHidden: document.querySelector("[data-phone-auth-legal-consent]")?.closest("[data-phone-auth-register-only]")?.hidden,
  submitDisabled: document.querySelector("[data-phone-auth-login]")?.disabled,
}));
check("phone login needs only country code, phone, and password", () => {
  assert(phoneLogin.emailCodeHidden, "phone login shows an email code");
  assert(phoneLogin.legalHidden, "phone login shows registration consent");
  assert.equal(phoneLogin.submitDisabled, false);
});

await page.locator('[data-phone-auth-type="email"]').click();
const emailLogin = await page.evaluate(() => ({
  emailVisible: !document.querySelector("[data-phone-auth-email-only]")?.hidden,
  phoneHidden: document.querySelector("[data-phone-auth-phone-only]")?.hidden,
  emailCodeHidden: document.querySelector("[data-phone-auth-email-register-only]")?.hidden,
}));
check("email login keeps email fields and hides phone and registration code", () => {
  assert(emailLogin.emailVisible, "email login hid the email field");
  assert(emailLogin.phoneHidden, "email login still shows phone fields");
  assert(emailLogin.emailCodeHidden, "email login shows a registration code");
});

await browser.close();
await vite.close();

if (failures) {
  console.error(`\n${failures} mini-phone chrome check(s) failed`);
  process.exit(1);
}
console.log("\nmini-phone chrome OK");
