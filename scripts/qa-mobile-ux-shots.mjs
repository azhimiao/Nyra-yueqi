/**
 * Mobile UX visual QA — isolate mini-phone, screenshot pages, measure overflow.
 * Usage: DEMO_URL=http://127.0.0.1:5173/ node scripts/qa-mobile-ux-shots.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { installPhoneFixture } from "../e2e/helpers/phone.mjs";

const BASE_URL = process.env.DEMO_URL || "http://127.0.0.1:5173/";
const VIEWPORT = {
  width: Number(process.env.QA_WIDTH) || 390,
  height: Number(process.env.QA_HEIGHT) || 844,
};
const OUT_DIR = path.resolve(
  "docs/qa/mobile-ux-repair",
  `${VIEWPORT.width}x${VIEWPORT.height}`,
);
const findings = [];

function note(name, pass, detail = "") {
  findings.push({ name, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function bootPhone(page) {
  await installPhoneFixture(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "yueqi.onboarding.v1",
        JSON.stringify({ done: true, accountMode: "offline" }),
      );
      localStorage.setItem(
        "yueqi.firstLight.v1",
        JSON.stringify({ completed: true, skipped: true, version: 1 }),
      );
      localStorage.setItem(
        "yueqi.settings.v1",
        JSON.stringify({ locale: "zh-CN", localeChosen: true }),
      );
    } catch {
      /* ignore */
    }
  });

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".mini-phone", { state: "attached", timeout: 45000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), {
    timeout: 60000,
  }).catch(() => {});

  await page.evaluate(() => {
    document.querySelectorAll("[data-onboard-gate], .lang-gate, .onboard-gate, [data-boot-screen]").forEach((el) => {
      el.setAttribute("hidden", "");
      el.setAttribute("aria-hidden", "true");
      el.classList.remove("is-open");
      el.style.display = "none";
      el.style.pointerEvents = "none";
    });
    document.documentElement.classList.add("is-compact-shell", "is-native-app", "app-boot-ready");
    document.documentElement.classList.remove("immediate-phone-ready");
    document.body.dataset.appMode = "phone";
    document.body.dataset.phoneReady = "1";
    delete document.body.dataset.phoneBooting;
    const root = document.querySelector("[data-small-phone-root]");
    if (root) {
      root.hidden = false;
      root.style.visibility = "visible";
      root.style.display = "block";
    }
    const appShell = document.querySelector(".app-shell");
    if (appShell) {
      appShell.style.display = "none";
      appShell.style.pointerEvents = "none";
    }
  });

  await page.waitForSelector(".mini-phone", { state: "visible", timeout: 15000 });

  // Real unlock (JS locked flag); DOM-only unlock is not enough for openApp().
  await page.evaluate(() => {
    const hint = document.querySelector("[data-lock-to-passcode]");
    const pane = document.querySelector('[data-lock-pane="TIME"]');
    (hint || pane)?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(600);
  await page.waitForFunction(() => {
    if (document.querySelector(".mini-phone")?.dataset.phoneLocked === "false" && window.__yueqiPhone?.openApp) {
      return true;
    }
    document.querySelector("[data-lock-to-passcode]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelector('[data-lock-pane="TIME"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return false;
  }, { timeout: 15000 });
  await page.waitForTimeout(200);
}

async function shot(page, name) {
  await page.locator(".mini-phone").screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log(`SHOT  ${name}.png`);
}

async function openApp(page, appId) {
  await page.evaluate((id) => {
    document.body.dataset.appMode = "phone";
    document.body.dataset.phoneReady = "1";
    document.querySelector(".app-shell")?.setAttribute("style", "display:none;pointer-events:none");
    if (window.__yueqiPhone?.openApp) {
      window.__yueqiPhone.openApp(id);
      return;
    }
    const icon = document.querySelector(`[data-app-id="${id}"]`);
    icon?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }, appId);
  await page.waitForSelector(`[data-phone-screen="${appId}"].is-active:not([hidden])`, { timeout: 12000 });
  await page.waitForTimeout(350);
}

async function goHome(page) {
  await page.evaluate(() => {
    if (window.__yueqiPhone?.openApp) {
      window.__yueqiPhone.openApp("home");
      return;
    }
    document.querySelector("[data-phone-home]")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await page.waitForTimeout(300);
}

async function setHomePage(page, index) {
  await page.evaluate((idx) => {
    const dot = document.querySelector(`[data-home-dot][data-page="${idx}"]`);
    dot?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, index);
  await page.waitForTimeout(350);
  return page.evaluate(() => document.querySelector("[data-home-dot].is-active")?.dataset?.page ?? null);
}

async function swipeHome(page, direction) {
  const before = await page.evaluate(() => document.querySelector("[data-home-dot].is-active")?.dataset?.page ?? null);
  // Dispatch PointerEvents on the pager viewport (parent of [data-home-track]).
  const result = await page.evaluate(async (dir) => {
    const track = document.querySelector("[data-home-track]");
    const viewport = track?.parentElement;
    if (!viewport) return { ok: false, reason: "no viewport" };
    const r = viewport.getBoundingClientRect();
    const y = r.top + r.height * 0.55;
    const fromX = dir === "left" ? r.left + r.width * 0.82 : r.left + r.width * 0.18;
    const toX = dir === "left" ? r.left + r.width * 0.12 : r.left + r.width * 0.88;
    const pid = 42;
    const fire = (type, x, buttons = 1) => {
      viewport.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: pid,
          pointerType: "touch",
          isPrimary: true,
          clientX: x,
          clientY: y,
          buttons,
        }),
      );
    };
    fire("pointerdown", fromX, 1);
    const steps = 16;
    for (let i = 1; i <= steps; i += 1) {
      fire("pointermove", fromX + ((toX - fromX) * i) / steps, 1);
    }
    fire("pointerup", toX, 0);
    await new Promise((resolve) => setTimeout(resolve, 450));
    return {
      ok: true,
      after: document.querySelector("[data-home-dot].is-active")?.dataset?.page ?? null,
    };
  }, direction);
  return { before, after: result.after, dir: direction, ok: result.ok, reason: result.reason };
}

async function measureActive(page) {
  return page.evaluate(() => {
    const phone = document.querySelector(".mini-phone");
    const screen = phone?.querySelector("[data-phone-screen].is-active") || phone;
    if (!phone || !screen) return null;
    const pr = phone.getBoundingClientRect();
    const title = screen.querySelector(".mini-appbar strong, .mini-home-greeting strong");
    const titleFs = title ? Number.parseFloat(getComputedStyle(title).fontSize) : null;
    const rect = (selector) => {
      const node = screen.querySelector(selector);
      if (!node || getComputedStyle(node).display === "none") return null;
      const r = node.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    };
    const dock = document.querySelector(".nyra-dock");
    const dockVisible = Boolean(dock && getComputedStyle(dock).display !== "none" && dock.getBoundingClientRect().height > 0);
    const clipped = [];
    screen.querySelectorAll("button, .mini-widget, .mini-shop-card, .modal-panel, .voice-call-stage").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height < 2) return;
      if (r.bottom > pr.bottom + 4 || r.top < pr.top - 4 || r.right > pr.right + 4 || r.left < pr.left - 4) {
        clipped.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 40),
          bottom: Math.round(r.bottom - pr.top),
          phoneH: Math.round(pr.height),
        });
      }
    });
    return {
      titleFs,
      appbar: rect(".mini-appbar, .explore-appbar"),
      diaryCover: rect(".diary-book-cover"),
      shopCard: rect(".mini-shop-card"),
      settingsRow: rect(".mini-settings-row"),
      calendarGrid: rect(".mini-cal-grid"),
      horizontalOverflow: screen.scrollWidth > phone.clientWidth + 1,
      dockVisible,
      clipped: clipped.slice(0, 8),
      phoneReady: document.body.dataset.phoneReady || "",
      appMode: document.body.dataset.appMode || "",
      screen: screen.dataset.phoneScreen || "home",
    };
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "zh-CN",
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  try {
    await bootPhone(page);
    await shot(page, "01-home-p0");
    let m = await measureActive(page);
    note("home phoneReady / no app dock", m?.phoneReady === "1" && !m?.dockVisible, JSON.stringify(m));
    note("home title font <= 22", !m?.titleFs || m.titleFs <= 22, `titleFs=${m?.titleFs}`);
    note("home no horizontal overflow", !m?.horizontalOverflow, `overflow=${m?.horizontalOverflow}`);
    const homeOwnership = await page.evaluate(() => {
      const firstPage = document.querySelector('[data-home-page="0"]');
      return {
        duplicateShortcuts: firstPage?.querySelectorAll(".mini-home-shortcut").length || 0,
        appIcons: firstPage?.querySelectorAll(".mini-app-icon").length || 0,
        widgets: firstPage?.querySelectorAll("[data-widget]").length || 0,
      };
    });
    note(
      "home dashboard has widgets only; app icons live on movable app pages",
      homeOwnership.duplicateShortcuts === 0 && homeOwnership.appIcons === 0 && homeOwnership.widgets >= 4,
      JSON.stringify(homeOwnership),
    );
    await page.locator('[data-home-page="0"] [data-home-companion-chat]').click();
    await page.waitForTimeout(200);
    const todayRoute = await page.evaluate(() => {
      const phone = document.querySelector(".mini-phone");
      const pop = document.querySelector('[data-phone-screen="pop"]');
      return {
        locked: phone?.dataset.phoneLocked || "",
        phoneView: phone?.dataset.phoneView || "",
        popActive: pop?.classList.contains("is-active") || false,
        popHidden: pop?.hidden ?? true,
      };
    });
    note("today widget opens companion chat", todayRoute.popActive && !todayRoute.popHidden, JSON.stringify(todayRoute));
    await goHome(page);
    await setHomePage(page, 0);
    const left = await swipeHome(page, "left");
    await shot(page, "02-home-swipe-left");
    note("swipe left advances page", left.after !== left.before && Number(left.after) > Number(left.before), JSON.stringify(left));

    await setHomePage(page, 1);
    const right = await swipeHome(page, "right");
    await shot(page, "03-home-swipe-right");
    note("swipe right returns page", right.after !== right.before && Number(right.after) < Number(right.before), JSON.stringify(right));

    await setHomePage(page, 1);
    await shot(page, "04-home-p1");

    for (const appId of ["diary", "shop", "explore", "memory", "settings", "calendar"]) {
      try {
        await goHome(page);
        await openApp(page, appId);
        await shot(page, `10-${appId}`);
        m = await measureActive(page);
        note(`${appId} opens`, m?.screen === appId, JSON.stringify(m));
        note(`${appId} no app dock`, !m?.dockVisible, `dockVisible=${m?.dockVisible}`);
        if (m?.titleFs) note(`${appId} title <= 18`, m.titleFs <= 18, `titleFs=${m.titleFs}`);
        if (m?.appbar) note(`${appId} appbar <= 54`, m.appbar.height <= 54, `height=${m.appbar.height}`);
        note(`${appId} no horizontal overflow`, !m?.horizontalOverflow, `overflow=${m?.horizontalOverflow}`);

        if (appId === "diary" && m?.diaryCover) {
          note("diary cover <= 220 wide", m.diaryCover.width <= 220, JSON.stringify(m.diaryCover));
        }
        if (appId === "shop" && m?.shopCard) {
          note("shop card <= 230 high", m.shopCard.height <= 230, JSON.stringify(m.shopCard));
        }
        if (appId === "settings" && m?.settingsRow) {
          note("settings row <= 48 high", m.settingsRow.height <= 48, JSON.stringify(m.settingsRow));
        }
        if (appId === "calendar" && m?.calendarGrid) {
          note("calendar grid <= 280 high", m.calendarGrid.height <= 280, JSON.stringify(m.calendarGrid));
        }

        if (appId === "shop") {
          const backs = await page.evaluate(() => {
            const screen = document.querySelector('[data-phone-screen="shop"].is-active');
            const nodes = [...(screen?.querySelectorAll("[data-shop-back], [data-phone-back], .mini-appbar [data-phone-back]") || [])];
            return nodes.filter((el) => el.getBoundingClientRect().height > 0).length;
          });
          note("shop single back", backs <= 1, `backs=${backs}`);
        }

        if (appId === "diary") {
          const flip = await page.evaluate(async () => {
            const screen = document.querySelector('[data-phone-screen="diary"].is-active');
            const cover = screen?.querySelector("[data-diary-book-cover]");
            cover?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            await new Promise((r) => setTimeout(r, 500));
            const book = screen?.querySelector(".diary-book, .stf__parent, [data-diary-book]");
            const pageState = () => {
              const indicator = document.querySelector('[data-phone-screen="diary"] [data-diary-page-indicator]')?.textContent?.trim() || "";
              const visiblePage = document.querySelector('[data-phone-screen="diary"] .diary-flip-page');
              const diaryId = visiblePage?.dataset?.diaryId || "";
              const title = visiblePage?.querySelector(".diary-page-title")?.textContent?.trim() || "";
              return [indicator, diaryId, title].join("|");
            };
            const before = pageState();
            const viewport = screen?.querySelector("[data-diary-book-stage]") || book || screen;
            const r = viewport?.getBoundingClientRect();
            if (r && r.width > 10) {
              const y = r.top + r.height * 0.55;
              const fromX = r.left + r.width * 0.82;
              const toX = r.left + r.width * 0.18;
              const fire = (type, x, buttons = 1) => {
                viewport.dispatchEvent(
                  new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    pointerId: 9,
                    pointerType: "touch",
                    isPrimary: true,
                    clientX: x,
                    clientY: y,
                    buttons,
                  }),
                );
              };
              fire("pointerdown", fromX, 1);
              for (let i = 1; i <= 12; i += 1) fire("pointermove", fromX + ((toX - fromX) * i) / 12, 1);
              fire("pointerup", toX, 0);
            }
            document.querySelector('[data-phone-screen="diary"] [data-diary-page-next]')?.dispatchEvent(
              new MouseEvent("click", { bubbles: true }),
            );
            await new Promise((r) => setTimeout(r, 500));
            const after = pageState();
            return {
              hasBook: Boolean(book),
              hasCover: Boolean(cover),
              before,
              after,
              changed: before !== after,
              coverOpen: cover ? cover.getAttribute("aria-expanded") === "true" || cover.hidden : false,
            };
          });
          await page.waitForTimeout(200);
          await shot(page, "11-diary-after-flip");
          note("diary cover opens / flip works", flip.coverOpen && flip.changed, JSON.stringify(flip));
        }

        if (appId === "explore") {
          const tabs = page.locator('[data-phone-screen="explore"].is-active [data-explore-tab], [data-phone-screen="explore"].is-active [role="tab"]');
          const n = await tabs.count();
          for (let i = 0; i < Math.min(n, 3); i += 1) {
            await tabs.nth(i).click({ force: true }).catch(() => {});
            await page.waitForTimeout(300);
            await shot(page, `12-explore-tab-${i}`);
          }
        }
      } catch (err) {
        note(`${appId} open`, false, err.message);
        await shot(page, `10-${appId}-FAIL`).catch(() => {});
      }
    }

    // Voice call modal in app mode
    await page.evaluate(() => {
      document.body.dataset.appMode = "app";
      delete document.body.dataset.phoneReady;
      const root = document.querySelector("[data-small-phone-root]");
      if (root) root.style.display = "none";
      const appShell = document.querySelector(".app-shell");
      if (appShell) {
        appShell.style.display = "";
        appShell.style.pointerEvents = "";
      }
      const modal = document.querySelector("#videoCallModal");
      if (!modal) return;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      modal.dataset.callMode = "voice";
      modal.style.display = "grid";
      const stage = document.querySelector("[data-voice-call-stage]");
      if (stage) stage.hidden = false;
      const video = document.querySelector("[data-video-call-preview]");
      if (video) video.hidden = true;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, "20-voice-call.png") });
    console.log("SHOT  20-voice-call.png");
    const call = await page.evaluate(() => {
      const modal = document.querySelector("#videoCallModal");
      const panel = modal?.querySelector(".modal-panel");
      const hang = modal?.querySelector(".video-call-stop, [data-video-call-stop]");
      const vh = window.innerHeight;
      const pr = panel?.getBoundingClientRect();
      const hr = hang?.getBoundingClientRect();
      return {
        panelFits: pr ? pr.top >= -2 && pr.bottom <= vh + 4 : false,
        hangVisible: hr ? hr.bottom <= vh + 2 && hr.top >= 0 : false,
        panel: pr && { top: Math.round(pr.top), bottom: Math.round(pr.bottom), h: Math.round(pr.height) },
        hang: hr && { top: Math.round(hr.top), bottom: Math.round(hr.bottom) },
        vh,
      };
    });
    note("voice call panel fits", call.panelFits, JSON.stringify(call));
    note("voice hangup visible", call.hangVisible, JSON.stringify(call.hang));
  } finally {
    const report = {
      generatedAt: new Date().toISOString(),
      viewport: VIEWPORT,
      baseUrl: BASE_URL,
      findings,
      pass: findings.filter((f) => f.pass).length,
      fail: findings.filter((f) => !f.pass).length,
    };
    await writeFile(path.join(OUT_DIR, "REPORT.json"), JSON.stringify(report, null, 2), "utf8");
    await writeFile(
      path.join(OUT_DIR, "REPORT.md"),
      [
        `# Mobile UX QA`,
        "",
        `${report.pass} pass / ${report.fail} fail — ${report.generatedAt}`,
        "",
        ...findings.map((f) => `- ${f.pass ? "PASS" : "FAIL"} **${f.name}**${f.detail ? ` — \`${f.detail}\`` : ""}`),
        "",
      ].join("\n"),
      "utf8",
    );
    await browser.close();
    console.log(`\nPASS ${report.pass} / FAIL ${report.fail}`);
    if (report.fail > 0) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
