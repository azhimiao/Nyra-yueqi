import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { installPhoneFixture } from "../e2e/helpers/phone.mjs";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const OUT = "docs/qa/mobile-ux-repair";

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await (
  await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  })
).newPage();

await installPhoneFixture(page);
await page.addInitScript(() => {
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline" }));
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({ passcodeEnabled: false }));
});
await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__yueqiPhone?.openApp, { timeout: 60000 });
await page.evaluate(() => {
  document.querySelectorAll("[data-onboard-gate], .lang-gate").forEach((el) => {
    el.style.display = "none";
    el.hidden = true;
  });
  document.documentElement.classList.add("is-compact-shell", "is-native-app", "app-boot-ready");
  document.documentElement.classList.remove("immediate-phone-ready");
  document.body.dataset.appMode = "phone";
  document.body.dataset.phoneReady = "1";
  delete document.body.dataset.phoneBooting;
  const phoneRoot = document.querySelector("[data-small-phone-root]");
  if (phoneRoot) {
    phoneRoot.hidden = false;
    phoneRoot.style.display = "block";
    phoneRoot.style.visibility = "visible";
  }
  document.querySelector(".app-shell")?.setAttribute("style", "display:none;pointer-events:none");
  document.querySelector("[data-lock-to-passcode]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  window.__yueqiPhone?.setVisible?.(true, { lock: false });
});
await page.waitForTimeout(800);
await page.waitForFunction(() => document.querySelector(".mini-phone")?.dataset.phoneLocked === "false", {
  timeout: 15000,
}).catch(() => {});
await page.evaluate(() => {
  window.__yueqiPhone?.setVisible?.(true, { lock: false });
  window.__yueqiPhone?.openApp?.("home");
  const phone = document.querySelector(".mini-phone");
  if (phone) {
    phone.style.visibility = "visible";
    phone.style.opacity = "1";
  }
});
await page.waitForTimeout(500);

const geom = await page.evaluate(() => {
  const arm = document.querySelector(".mini-widget--vinyl .mini-vinyl__arm");
  const disc = document.querySelector(".mini-widget--vinyl .mini-vinyl__disc");
  const play = document.querySelector(".mini-home-widget-action");
  const phone = document.querySelector(".mini-phone");
  const vinyl = document.querySelector(".mini-widget--vinyl");
  return {
    phone: phone
      ? {
          hidden: phone.hidden || phone.closest("[hidden]") != null,
          locked: phone.dataset.phoneLocked,
          w: Math.round(phone.getBoundingClientRect().width),
          h: Math.round(phone.getBoundingClientRect().height),
          display: getComputedStyle(phone).display,
          visibility: getComputedStyle(phone).visibility,
        }
      : null,
    vinylHidden: vinyl?.hidden,
    armBox: arm ? { w: Math.round(arm.getBoundingClientRect().width), h: Math.round(arm.getBoundingClientRect().height) } : null,
    discBox: disc ? { w: Math.round(disc.getBoundingClientRect().width), h: Math.round(disc.getBoundingClientRect().height) } : null,
    playBox: play ? { w: Math.round(play.getBoundingClientRect().width), h: Math.round(play.getBoundingClientRect().height) } : null,
    shortcuts: document.querySelectorAll(".mini-home-shortcut").length,
    greetingFs: getComputedStyle(document.querySelector(".mini-home-greeting strong") || document.body).fontSize,
    hasStage: Boolean(document.querySelector("[data-home-stage]")),
    hasProgress: Boolean(document.querySelector("[data-home-listen-progress]")),
  };
});
console.log(JSON.stringify(geom, null, 2));
await page.screenshot({ path: `${OUT}/30-home-reference-pass.png`, fullPage: false });
console.log("SHOT ok");
await browser.close();
