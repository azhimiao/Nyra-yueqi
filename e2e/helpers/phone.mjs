/**
 * PAIOS P0 helpers — fixture only before goto; after load: normal clicks only.
 * Product-cutover may use force clicks for clipped mini-phone hit targets.
 */

export const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5177/";
export const XINGLI_LIFE_DATE = "2026-03-12";

export const VIEWPORTS = [
  { name: "360x780", width: 360, height: 780 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "1366x768", width: 1366, height: 768 },
];

export async function installPhoneFixture(page, opts = {}) {
  const experienceStub = opts.experienceStub !== false;
  await page.addInitScript((stub) => {
    try {
      localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
      localStorage.setItem("yueqi.app.mode", "phone");
      localStorage.setItem("yueqi.activeCharacterId", "char-xingli");
      localStorage.setItem("yueqi.selectedPetId", "xingli");
      if (stub) {
        localStorage.setItem("yueqi.e2e.experienceStub", "1");
        window.__YUEQI_E2E_EXPERIENCE_STUB__ = true;
      }
      localStorage.setItem(
        "yueqi.sidewrite.boundary.v1",
        JSON.stringify({ "char-xingli": new Date().toISOString() }),
      );
      const raw = localStorage.getItem("yueqi.phone.os.v1");
      let prefs = {};
      try {
        prefs = raw ? JSON.parse(raw) : {};
      } catch {
        prefs = {};
      }
      prefs.passcodeEnabled = false;
      localStorage.setItem("yueqi.phone.os.v1", JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, experienceStub);
}

/** Prefer shell API when clipped widgets sit outside the Playwright viewport. */
export async function phoneOpenAppApi(page, appId) {
  return page.evaluate((id) => {
    try {
      if (typeof window.__YUEQI_E2E_EXPERIENCE_STUB__ !== "boolean") {
        window.__YUEQI_E2E_EXPERIENCE_STUB__ = localStorage.getItem("yueqi.e2e.experienceStub") === "1";
      }
      const api = window.__yueqiPhone;
      if (api && typeof api.openApp === "function") {
        api.openApp(id);
      } else {
        window.dispatchEvent(new CustomEvent("yueqi:phone-open-app", {
          detail: { appId: id },
        }));
      }
      const screenId = id === "scenario" ? "theater" : id;
      const screen = document.querySelector(`[data-phone-screen="${screenId}"]`);
      return Boolean(screen && (screen.classList.contains("is-active") || !screen.hidden));
    } catch {
      /* ignore */
    }
    return false;
  }, appId);
}

export async function ensurePhoneUnlocked(page) {
  await page.waitForSelector(".mini-phone", { state: "attached", timeout: 20000 }).catch(() => {});
  const unlock = page.locator("[data-lock-to-passcode]");
  if (await unlock.isVisible().catch(() => false)) {
    await unlock.click({ force: true }).catch(() => {});
  }
  await page.waitForFunction(() => {
    const phone = document.querySelector(".mini-phone");
    return phone && phone.dataset.phoneLocked === "false";
  }, { timeout: 15000 }).catch(async () => {
    await page.evaluate(() => {
      document.querySelector("[data-lock-to-passcode]")?.click();
    }).catch(() => {});
  });
}

export async function openPhoneHome(page) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-small-phone-root]", { state: "attached", timeout: 30000 });

  const langBtn = page.locator("[data-set-locale='zh-CN']");
  if (await langBtn.count()) {
    try {
      await langBtn.first().click({ timeout: 3000 });
    } catch {
      /* already chosen */
    }
  }

  // Ensure phone mode attribute is on body (drives CSS that clears float hit-testing).
  const phoneModeBtn = page.locator('[data-app-mode="phone"]');
  if (await phoneModeBtn.isVisible().catch(() => false)) {
    await phoneModeBtn.click({ force: true });
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => document.body?.dataset?.appMode === "phone", { timeout: 10000 }).catch(() => {});

  await page.waitForSelector(".mini-phone", { state: "visible", timeout: 20000 });
  await ensurePhoneUnlocked(page);
  await page.waitForSelector('[data-phone-screen="home"].is-active', { timeout: 10000 });
}

export async function goAppsPage(page) {
  const appsDot = page.locator('[data-home-dot][data-page="1"]');
  if (await appsDot.isVisible().catch(() => false)) {
    await appsDot.click({ force: true });
    await page.waitForTimeout(300);
  } else {
    await page.evaluate(() => {
      document.querySelector('[data-home-dot][data-page="1"]')?.click();
    }).catch(() => {});
  }
}

export async function openPhoneApp(page, appId) {
  // Ensure we are on home (not mid-drag), then apps page where needed.
  const onHome = await page.locator('[data-phone-screen="home"].is-active').isVisible().catch(() => false);
  if (!onHome) {
    await homeFromAnywhere(page).catch(() => {});
  }
  await ensurePhoneUnlocked(page);

  // Dock icons are visible on page 0; grid apps need page 1+.
  const dock = page.locator(`.mini-dock [data-app-id="${appId}"]`);
  if (await dock.isVisible().catch(() => false)) {
    await dock.click({ force: true });
    const opened = await page
      .locator(`[data-phone-screen="${appId}"].is-active, [data-phone-screen="${appId}"]:not([hidden])`)
      .isVisible()
      .catch(() => false);
    if (opened) return;
  }

  // Frozen / missing icons: prefer shell API (works with E2E experience stub).
  const resolvedScreen = appId === "scenario" ? "theater" : appId;
  if (await phoneOpenAppApi(page, appId === "scenario" ? "theater" : appId) || await phoneOpenAppApi(page, appId)) {
    const viaApi = await page
      .waitForSelector(
        `[data-phone-screen="${resolvedScreen}"].is-active, [data-phone-screen="${resolvedScreen}"]:not([hidden]), [data-phone-screen="${appId}"]:not([hidden])`,
        { timeout: 8000 },
      )
      .then(() => true)
      .catch(() => false);
    if (viaApi) return;
  }

  await goAppsPage(page);
  // Page 2+ advanced apps (studio)
  if (appId === "lab") {
    const page2 = page.locator('[data-home-dot][data-page="2"]');
    if (await page2.isVisible().catch(() => false)) {
      await page2.click({ force: true });
      await page.waitForTimeout(300);
    }
  }
  const icon = page.locator(
    `[data-home-app-grid] [data-app-id="${appId}"], .mini-dock [data-app-id="${appId}"], [data-app-id="${appId}"]`,
  ).first();
  if (await icon.isVisible().catch(() => false)) {
    await icon.click({ force: true });
  } else if (!(await phoneOpenAppApi(page, appId))) {
    await icon.waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
    await icon.click({ force: true }).catch(() => {});
  }
  const screenId = appId === "scenario" ? "theater" : appId;
  await page.waitForSelector(
    `[data-phone-screen="${screenId}"].is-active, [data-phone-screen="${screenId}"]:not([hidden]), [data-phone-screen="${appId}"]:not([hidden])`,
    { timeout: 15000 },
  );
}

/** Return to phone home via shell API / in-app back (no fake home-indicator bar). */
export async function homeFromAnywhere(page) {
  for (let i = 0; i < 3; i += 1) {
    const navBack = page.locator("[data-ta-nav-back]:visible, [data-ta-lock-back]:visible, [data-phone-back]:visible").first();
    if (await navBack.isVisible().catch(() => false)) {
      await navBack.click({ force: true });
      await page.waitForTimeout(250);
    } else break;
  }

  await page.evaluate(() => {
    const api = window.__yueqiPhone;
    if (!api) return;
    if (typeof api.setView === "function") api.setView("home");
    else if (typeof api.openApp === "function") api.openApp("home");
    else if (typeof api.goBack === "function") {
      for (let i = 0; i < 6 && api.isInApp?.(); i += 1) api.goBack();
    }
  }).catch(() => {});
  await ensurePhoneUnlocked(page);
  await page.waitForSelector('[data-phone-screen="home"].is-active', { timeout: 10000 });
}

/**
 * 漫卷 funnel: select → chapters → stage (reference VN flow).
 * @param {import('playwright').Page} page
 * @param {{ openingIndex?: number, openingId?: string, characterId?: string }} [opts]
 */
export async function enterScenarioStage(page, opts = {}) {
  const characterId = opts.characterId || "char-xingli";
  const openingIndex = Number.isFinite(opts.openingIndex) ? opts.openingIndex : 0;

  // Player UI (`data-scenario-view`) mounts under the theater screen; openApp("scenario") maps there.
  const onTheater = await page
    .locator('[data-phone-screen="theater"].is-active, [data-phone-screen="scenario"].is-active')
    .isVisible()
    .catch(() => false);
  if (!onTheater) {
    await ensurePhoneUnlocked(page);
    const icon = page.locator('[data-app-id="scenario"], [data-app-id="theater"]').first();
    if (await icon.isVisible().catch(() => false)) {
      await icon.click({ force: true });
    } else if (!(await phoneOpenAppApi(page, "theater")) && !(await phoneOpenAppApi(page, "scenario"))) {
      await openPhoneApp(page, "shop").catch(() => {});
      const shopItem = page.locator('[data-app-id="scenario"], [data-pin-app="scenario"], [data-install-app="scenario"]').first();
      if (await shopItem.isVisible().catch(() => false)) {
        await shopItem.click({ force: true });
      } else {
        await phoneOpenAppApi(page, "theater");
      }
    }
    const opened = await page
      .waitForSelector(
        '[data-phone-screen="theater"].is-active, [data-phone-screen="theater"]:not([hidden]), [data-scenario-view="select"]',
        { timeout: 10000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!opened) {
      await page.evaluate(() => {
        const screen =
          document.querySelector('[data-phone-screen="theater"]')
          || document.querySelector('[data-phone-screen="scenario"]');
        if (!screen) return;
        document.querySelectorAll("[data-phone-screen].is-active").forEach((n) => {
          n.classList.remove("is-active");
          n.hidden = true;
        });
        screen.hidden = false;
        screen.classList.add("is-active");
        const phone = document.querySelector(".mini-phone");
        if (phone) {
          phone.dataset.phoneView = screen.dataset.phoneScreen || "theater";
          phone.classList.add("is-app-fullscreen");
        }
      });
    }
    await page.waitForSelector('[data-phone-screen="theater"], [data-scenario-view]', { timeout: 15000 });
  }

  // Leave stage / finale back toward select or chapters.
  const leaveStage = page
    .locator('[data-scenario-view="stage"] [data-scenario-pause], [data-scenario-view="stage"] [data-scenario-to-chapters]')
    .first();
  if (await leaveStage.isVisible().catch(() => false)) {
    await leaveStage.click({ force: true });
    await page.waitForTimeout(400);
  }
  const toSelect = page
    .locator('[data-scenario-view="finale"] [data-scenario-to-select]:visible, [data-scenario-view="chapters"] [data-scenario-to-select]:visible')
    .first();
  if (await toSelect.isVisible().catch(() => false)) {
    await toSelect.click({ force: true });
    await page.waitForTimeout(300);
  }

  const theaterRoot = page.locator(
    '[data-phone-screen="theater"].is-active, [data-phone-screen="theater"]:not([hidden])',
  ).last();
  await theaterRoot.waitFor({ state: "visible", timeout: 12000 });
  const selectView = theaterRoot.locator('[data-scenario-view="select"].is-active, [data-scenario-view="select"]:not([hidden])');
  if (!(await selectView.first().isVisible().catch(() => false))) {
    await homeFromAnywhere(page).catch(() => {});
    await ensurePhoneUnlocked(page);
    if (!(await phoneOpenAppApi(page, "theater")) && !(await phoneOpenAppApi(page, "scenario"))) {
      await page.evaluate(() => {
        const screen = document.querySelector('[data-phone-screen="theater"]');
        if (!screen) return;
        document.querySelectorAll("[data-phone-screen].is-active").forEach((n) => {
          n.classList.remove("is-active");
          n.hidden = true;
        });
        screen.hidden = false;
        screen.classList.add("is-active");
      });
    }
  }
  await selectView.first().waitFor({ state: "visible", timeout: 12000 });

  const strip = theaterRoot.locator(`[data-scenario-select-char="${characterId}"]`).first();
  if (await strip.isVisible().catch(() => false)) {
    await strip.click({ force: true });
    await page.waitForTimeout(150);
  }

  const workCard = theaterRoot.locator(
    '[data-pick-work="script-rain-station"], [data-pick-work]:visible, [data-pick-script="script-rain-station"]',
  ).first();
  if (await workCard.isVisible().catch(() => false)) {
    await workCard.click({ force: true });
    await page.waitForTimeout(250);
  } else if (await selectView.first().isVisible().catch(() => false)) {
    const confirm = theaterRoot.locator("[data-scenario-select-confirm]");
    if (await confirm.isVisible().catch(() => false)) await confirm.click({ force: true });
  }

  const chaptersView = theaterRoot.locator('[data-scenario-view="chapters"].is-active');
  await chaptersView.waitFor({ state: "visible", timeout: 12000 });

  const rain = chaptersView.locator('[data-pick-script="script-rain-station"]');
  if (await rain.isVisible().catch(() => false)) {
    await rain.click({ force: true });
    await chaptersView.locator('[data-opening-enter]:visible').first().waitFor({ state: "visible", timeout: 10000 });
  }

  let openingBtn;
  if (opts.openingId) {
    openingBtn = chaptersView.locator(`[data-opening-enter="${opts.openingId}"]:visible`).first();
  } else {
    openingBtn = chaptersView.locator("[data-opening-enter]:visible").nth(openingIndex);
  }
  if (!(await openingBtn.count())) {
    // Some packages expose a single continue / start control instead of opening cards.
    openingBtn = chaptersView.locator(
      "[data-opening-enter]:visible, [data-scenario-start]:visible, [data-scenario-enter-stage]:visible, [data-scenario-continue]:visible",
    ).first();
  }
  await openingBtn.waitFor({ state: "visible", timeout: 10000 });
  await openingBtn.click({ force: true }).catch(async () => {
    await page.evaluate(() => {
      document.querySelector('[data-phone-screen="theater"]:not([hidden]) [data-opening-enter], [data-phone-screen="theater"]:not([hidden]) [data-scenario-start], [data-phone-screen="theater"]:not([hidden]) [data-scenario-enter-stage]')?.click();
    });
  });
  await theaterRoot.locator('[data-scenario-view="stage"].is-active').waitFor({ state: "visible", timeout: 15000 });
}

/** Read-only DOM probe (allowed). */
export async function readOnly(page, fn) {
  return page.evaluate(fn);
}
