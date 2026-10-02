/**
 * PAIOS P2 evidence — open Context Graph viewer, select memory, freeze (real clicks).
 * Fixture seeds localStorage before goto; after load: click only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/paios/P2/evidence");

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    recordVideo: { dir: path.join(OUT, "video"), size: { width: 390, height: 844 } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  await installPhoneFixture(page);
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const bag = {
      schemaVersion: 1,
      items: {
        "ctx-e2e-1": {
          id: "ctx-e2e-1",
          schemaVersion: 1,
          kind: "semantic",
          content: "喜欢雨天窗边咖啡",
          summary: "喜欢雨天窗边咖啡",
          source: "user.stated",
          sourceRef: "e2e-pref-1",
          occurredAt: now,
          createdAt: now,
          confidence: 0.95,
          characterId: "char-xingli",
          workspaceId: "char-xingli",
          privacyLevel: "shared",
          retention: "permanent",
          expiresAt: null,
          lastUsedAt: null,
          conflictState: "none",
          conflictWith: [],
          frozen: false,
          forbidProactive: false,
          deleted: false,
          deletedAt: null,
          whyRemembered: "用户明确说过的偏好，用于长期跟进",
          tags: ["preference", "e2e"],
          relationHints: [],
          taskHints: [],
          meta: {},
        },
      },
      tombstones: {},
      migration: { lastRunAt: null, sources: {} },
    };
    localStorage.setItem("yueqi.context.graph.v1", JSON.stringify(bag));
  });

  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    await openPhoneHome(page);
    await page.locator('.mini-dock [data-app-id="pop"]').click();
    await page.waitForSelector('[data-phone-screen="pop"]', { timeout: 10000 });
    await page.locator('[data-pop-tab="me"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-phone-open="context"]').first().click();
    await page.waitForSelector('[data-phone-screen="context"].is-active', { timeout: 10000 });
    check("context viewer screen opened", true);

    const card = page.locator("[data-ctx-select]").first();
    await card.waitFor({ state: "visible", timeout: 8000 });
    const cardText = await card.innerText();
    check("seeded memory visible", /雨天|咖啡|喜欢/.test(cardText), cardText.slice(0, 80));
    await card.click();
    await page.waitForSelector("[data-ctx-detail] dl", { timeout: 8000 });
    const detail = await page.locator("[data-ctx-detail]").innerText();
    check("shows why remembered", /为何记住|长期跟进|偏好/.test(detail), detail.slice(0, 120));
    check("shows source", /来源|user\.stated/.test(detail), detail.slice(0, 120));

    await page.locator('[data-ctx-action="freeze"]').click();
    await page.waitForTimeout(400);
    const after = await page.locator("[data-ctx-detail]").innerText();
    check("freeze action available", /解冻|冻结/.test(after));
    const listText = await page.locator("[data-ctx-list]").innerText();
    check("freeze badge or state reflected", /冻结|禁主动/.test(listText + after));

    await page.locator(".mini-phone").screenshot({ path: path.join(OUT, "context-viewer.png") });
  } catch (err) {
    check("journey fatal", false, String(err.message || err));
    await page.screenshot({ path: path.join(OUT, "fatal.png"), fullPage: true }).catch(() => {});
  }

  const failed = checks.filter((c) => !c.pass);
  const summary = {
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
  };
  await writeFile(path.join(OUT, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(path.join(ROOT, "docs/qa/paios/P2/LAST_E2E.json"), JSON.stringify(summary, null, 2), "utf8");
  try {
    await context.tracing.stop({ path: path.join(OUT, "trace.zip") });
  } catch {
    /* ignore */
  }
  await context.close();
  await browser.close();
  console.log(`\ne2e:p2-context-viewer ${summary.passed}/${summary.total}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
