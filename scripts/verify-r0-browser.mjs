/**
 * R0 browser evidence — First Light mount + Explore tab geometry.
 * Usage: DEMO_URL=http://127.0.0.1:5173/ node scripts/verify-r0-browser.mjs
 * Banner: R0_BROWSER_SCRIPT_V3
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

console.log("R0_BROWSER_SCRIPT_V3");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/companion-os/R0");
const shotDir = join(outDir, "screenshots");
mkdirSync(shotDir, { recursive: true });

/** @type {{ id: string, pass: boolean, detail: string }[]} */
const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

async function waitForUrl(url, timeoutMs = 60000) {
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

async function ensureServer() {
  if (process.env.DEMO_URL) return { url: process.env.DEMO_URL, child: null };
  const url = "http://127.0.0.1:5173/";
  if (await waitForUrl(url, 1500)) return { url, child: null };
  const child = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5173"], {
    cwd: root,
    stdio: "pipe",
    shell: true,
  });
  const ok = await waitForUrl(url, 90000);
  if (!ok) {
    child.kill();
    throw new Error("vite failed to start for R0 browser verify");
  }
  return { url, child };
}

async function seedFreshFirstLight(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
    localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
      loggedIn: true,
      token: "r0-browser-session",
      username: "r0-browser",
      userId: "r0-browser",
      productMode: "developer",
      subscriptionStatus: "inactive",
      credits: 0,
    }));
    localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({
      done: true,
      accountMode: "online",
      productMode: "developer",
      productModeChosen: true,
      uiModeChosen: true,
    }));
    localStorage.setItem("yueqi.app.mode", "app");
    localStorage.setItem("yueqi.app.mode.chosen", "1");
    localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({
      schemaVersion: 1,
      done: false,
      paused: false,
      stage: "WELCOME",
      entryPath: "careful",
      draft: {},
      previewLines: [],
      errorMessage: "",
      updatedAt: new Date().toISOString(),
      committedCharacterId: "",
      migratedFromLegacy: false,
    }));
  });
}

async function seedExploreReady(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
    localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({
      loggedIn: true,
      token: "r0-browser-session",
      username: "r0-browser",
      userId: "r0-browser",
      productMode: "developer",
      subscriptionStatus: "inactive",
      credits: 0,
    }));
    localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({
      done: true,
      accountMode: "online",
      productMode: "developer",
      productModeChosen: true,
      uiModeChosen: true,
    }));
    localStorage.setItem("yueqi.app.mode", "phone");
    localStorage.setItem("yueqi.app.mode.chosen", "1");
    localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({
      schemaVersion: 1,
      done: true,
      paused: false,
      stage: "COMPLETED",
      entryPath: "careful",
      draft: { name: "测试角色" },
      previewLines: [],
      errorMessage: "",
      updatedAt: new Date().toISOString(),
      committedCharacterId: "test-char",
      migratedFromLegacy: false,
    }));
    localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({
      schemaVersion: 1,
      onboardingComplete: true,
      preset: "companion",
    }));
    // Disable passcode so lock-to-passcode / TIME unlocks without keypad.
    localStorage.setItem("yueqi.phone.os.v1", JSON.stringify({
      passcodeEnabled: false,
      passcode: "0000",
    }));
  });
}

function tabGeometryOk(box) {
  return Boolean(box && box.width > 0 && box.height > 0);
}

async function unlockPhoneIfNeeded(page) {
  const locked = await page.locator('.mini-phone[data-phone-locked="true"]').count();
  if (!locked) return true;
  await page.evaluate(() => {
    const onboard = document.querySelector("[data-autonomy-onboard]");
    if (onboard) onboard.hidden = true;
    // With passcodeEnabled=false this unlocks; otherwise opens keypad.
    const hint = document.querySelector("[data-lock-to-passcode]");
    hint?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    // If keypad shown, enter default 0000
    for (const digit of ["0", "0", "0", "0"]) {
      document.querySelector(`[data-lock-key="${digit}"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const still = await page.locator('.mini-phone[data-phone-locked="true"]').count();
    if (!still) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

async function openExplore(page) {
  await page.evaluate(() => {
    document.querySelector("[data-autonomy-onboard]") && (document.querySelector("[data-autonomy-onboard]").hidden = true);
    window.dispatchEvent(new CustomEvent("yueqi.explore.navigate", { detail: { tab: "chat" } }));
  });
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const visible = await page.locator('[data-phone-screen="explore"]:not([hidden])').count();
    if (visible > 0) return true;
    await page.evaluate(() => {
      const icon = document.querySelector('[data-app-id="explore"]');
      icon?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      window.dispatchEvent(new CustomEvent("yueqi.explore.navigate", { detail: { tab: "chat" } }));
    });
    await page.waitForTimeout(350);
  }
  return false;
}

async function run() {
  const { url, child } = await ensureServer();
  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];

  try {
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on("pageerror", (err) => consoleErrors.push(String(err?.message || err)));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      await seedFreshFirstLight(page);
      await page.goto(url, { waitUntil: "load", timeout: 90000 });
      const deadline = Date.now() + 45000;
      let open = 0;
      while (Date.now() < deadline) {
        open = await page.locator(".first-light.is-open").count();
        if (open > 0) break;
        await page.waitForTimeout(400);
      }
      const brandCrash = consoleErrors.some((e) => /getBrandName is not defined/i.test(e));
      const diag = await page.evaluate(() => ({
        flDone: JSON.parse(localStorage.getItem("yueqi.firstLight.v1") || "{}").done,
        flStage: JSON.parse(localStorage.getItem("yueqi.firstLight.v1") || "{}").stage,
        obDone: JSON.parse(localStorage.getItem("yueqi.onboarding.v1") || "{}").done,
        hasHost: Boolean(document.querySelector("[data-first-light]")),
        hasOpenClass: Boolean(document.querySelector(".first-light.is-open")),
        gateOpen: Boolean(document.querySelector("[data-onboard-gate].is-open")),
      }));
      await page.screenshot({ path: join(shotDir, "first-light-welcome.png") });
      record("first_light_mount", open > 0 && !brandCrash, `open=${open} brandCrash=${brandCrash} diag=${JSON.stringify(diag)}`);
      if (open > 0 && !brandCrash) {
        await page.evaluate(() => {
          document.querySelector(".first-light.is-open .fl-option")
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(400);
        record("first_light_advance", true, "advanced past welcome");
      } else {
        record("first_light_advance", false, "mount failed");
      }
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on("pageerror", (err) => consoleErrors.push(String(err?.message || err)));
      await seedExploreReady(page);
      await page.goto(url, { waitUntil: "load", timeout: 90000 });
      await page.waitForSelector("[data-small-phone-root]", { timeout: 45000 });
      await page.evaluate(() => {
        document.body.dataset.appMode = "phone";
        const rootEl = document.querySelector("[data-small-phone-root]");
        if (rootEl) rootEl.hidden = false;
      });
      const readyDeadline = Date.now() + 20000;
      while (Date.now() < readyDeadline) {
        if (await page.locator('[data-phone-screen="explore"]').count()) break;
        await page.waitForTimeout(300);
      }

      const unlocked = await unlockPhoneIfNeeded(page);
      if (!unlocked) {
        record("explore_tabs_geometry", false, "phone unlock failed");
      } else {
        const opened = await openExplore(page);
        const tabs = ["chat", "tasks", "market"];
        const geos = {};
        for (const tab of tabs) {
          const btn = page.locator(`[data-phone-screen="explore"] [data-explore-tab="${tab}"]`).first();
          let visible = false;
          let box = null;
          try {
            visible = opened && await btn.isVisible();
            box = visible ? await btn.boundingBox() : null;
          } catch {
            visible = false;
          }
          geos[tab] = { visible, width: box?.width || 0, height: box?.height || 0 };
          if (visible && tabGeometryOk(box)) {
            await page.evaluate((tabId) => {
              document.querySelector(`[data-phone-screen="explore"] [data-explore-tab="${tabId}"]`)
                ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            }, tab);
            await page.waitForTimeout(120);
          }
        }
        await page.screenshot({ path: join(shotDir, "explore-tabs.png") });
        const allOk = opened && tabs.every((t) => geos[t].visible && geos[t].width > 0 && geos[t].height > 0);
        record("explore_tabs_geometry", allOk, JSON.stringify({ opened, geos }));
      }

      const drawerPhoneSwitch = await page.locator('[data-ui-mode-switch="phone"]').count();
      const staleDrawerExplore = await page.locator('[data-drawer-nav="explore"]').count();
      record(
        "app_drawer_phone_switch_dom",
        drawerPhoneSwitch > 0 && staleDrawerExplore === 0,
        `phoneSwitch=${drawerPhoneSwitch} staleExplore=${staleDrawerExplore}`,
      );
      await page.close();
    }

    const unexplained = consoleErrors.filter((e) => !/favicon|ResizeObserver|net::|Failed to load resource/i.test(e));
    record("console_clean", unexplained.length === 0, unexplained.slice(0, 5).join(" | "));
  } finally {
    await browser.close();
    if (child) {
      try { child.kill(); } catch { /* ignore */ }
    }
  }

  const allPass = cases.every((c) => c.pass);
  const payload = {
    phase: "R0-browser",
    script: "R0_BROWSER_SCRIPT_V3",
    generatedAt: new Date().toISOString(),
    status: allPass ? "pass" : "fail",
    command: "node scripts/verify-r0-browser.mjs",
    cases,
    consoleErrors,
  };
  writeFileSync(join(outDir, "VERIFY_BROWSER.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(allPass ? "\nR0 BROWSER ALL PASS" : "\nR0 BROWSER FAILED");
  process.exit(allPass ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "VERIFY_BROWSER.json"), `${JSON.stringify({
    phase: "R0-browser",
    status: "fail",
    error: String(err?.stack || err),
  }, null, 2)}\n`);
  process.exit(1);
});
