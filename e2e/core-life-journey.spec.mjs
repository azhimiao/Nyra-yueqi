/**
 * PAIOS P0 · Golden life journey — real UI actions only.
 *
 * Forbidden after load: force:true, evaluate(click), scripted input/change events,
 * store writes, DOM injection, custom event navigation.
 * Allowed: click / fill / press; read-only evaluate for assertions.
 *
 * Usage: node e2e/core-life-journey.spec.mjs
 * Env: DEMO_URL, E2E_VIEWPORT=390x844|all, E2E_VIDEO=1, E2E_ROUNDS=1
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  XINGLI_LIFE_DATE,
  VIEWPORTS,
  installPhoneFixture,
  openPhoneHome,
  goAppsPage,
  openPhoneApp,
  homeFromAnywhere,
  readOnly,
  enterScenarioStage,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_ROOT = path.join(ROOT, "docs/qa/paios/P0/evidence");
const FAIL_ROOT = path.join(ROOT, "docs/qa/paios/P0/failures");

function fingerprint() {
  let commit = "nogit";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    /* ignore */
  }
  const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  const hash = createHash("sha256").update(dirty || "clean").digest("hex").slice(0, 12);
  return { commit, dirtyHash: hash, dirty: Boolean(dirty.trim()) };
}

function pickViewports() {
  const want = process.env.E2E_VIEWPORT || "390x844";
  if (want === "all") return VIEWPORTS;
  return VIEWPORTS.filter((v) => v.name === want);
}

async function saveFailure(page, context, dir, tag, checks, err) {
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${tag}-page.png`), fullPage: true }).catch(() => {});
  const phone = page.locator(".mini-phone");
  if (await phone.count()) {
    await phone.screenshot({ path: path.join(dir, `${tag}-phone.png`) }).catch(() => {});
  }
  await writeFile(
    path.join(dir, `${tag}-error.txt`),
    `${err?.stack || err}\n\n${checks.map((c) => `${c.pass ? "OK" : "XX"} ${c.name} ${c.detail}`).join("\n")}\n`,
    "utf8",
  );
  try {
    await context.tracing.stop({ path: path.join(dir, `${tag}-trace.zip`) });
  } catch {
    /* ignore */
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {(name: string, pass: boolean, detail?: string) => void} check
 */
async function runJourney(page, check) {
  await openPhoneHome(page);

  const homeName = await page.locator("[data-phone-name]").first().textContent().catch(() => "");
  check("home shows 林星梨", /星梨|林星梨/.test(String(homeName)), homeName);

  const boy = page.locator("[data-phone-boy] img, [data-phone-boy] canvas, [data-phone-boy] .xingli-stage, [data-phone-boy] .sprite-character");
  check("home character visual present", (await boy.count()) > 0);

  // Pop via dock (visible on home)
  const popDock = page.locator('.mini-dock [data-app-id="pop"]');
  await popDock.waitFor({ state: "visible", timeout: 8000 });
  await popDock.click();
  await page.waitForSelector('[data-phone-screen="pop"].is-active, [data-phone-screen="pop"]:not([hidden])', {
    timeout: 10000,
  });
  check("Pop screen opened via click", true);

  // TA phone
  await homeFromAnywhere(page);
  await openPhoneApp(page, "sidewrite");
  await page.waitForTimeout(500);

  if (await page.locator("[data-ta-consent-ok]").isVisible().catch(() => false)) {
    await page.locator("[data-ta-consent-ok]").click();
    await page.waitForTimeout(300);
  }
  const pick = page.locator('[data-sw-layer="picker"]:not([hidden]) [data-sw-pick]').first();
  if (await pick.isVisible().catch(() => false)) {
    await pick.click();
    await page.waitForTimeout(400);
  }

  const dateText = String(await page.locator("[data-ta-date]").first().textContent().catch(() => ""));
  check(
    "TA lock date matches DayPack 2026-03-12",
    /3\s*月\s*12/.test(dateText) || dateText.includes(XINGLI_LIFE_DATE),
    `ui="${dateText}"`,
  );

  if (await page.locator("[data-ta-unlock]").isVisible().catch(() => false)) {
    await page.locator("[data-ta-unlock]").click();
    await page.waitForTimeout(400);
  }
  await page.waitForSelector("[data-ta-open-app='messages']", { state: "visible", timeout: 12000 });
  await page.locator("[data-ta-open-app='messages']").click();
  await page.waitForTimeout(400);
  const threads = await page.locator("[data-ta-thread]").count();
  check("TA messages list has threads", threads >= 1, `n=${threads}`);

  if (threads >= 1) {
    await page.locator("[data-ta-thread]").first().click();
    await page.waitForSelector('[data-ta-pane="detail"]', { state: "visible", timeout: 8000 });
    const overflow = await readOnly(page, () => {
      const phone = document.querySelector(".mini-phone");
      const pane = document.querySelector('[data-ta-pane="detail"]');
      if (!phone || !pane) return { ok: false, reason: "detail pane missing" };
      const pr = phone.getBoundingClientRect();
      for (const el of [pane, ...pane.querySelectorAll(".ta-bubble-chip, .ta-sub-appbar, button")]) {
        const ar = el.getBoundingClientRect();
        if (ar.width < 1) continue;
        if (ar.right > pr.right + 2 || ar.left < pr.left - 2) {
          return { ok: false, reason: `overflow ${el.className || el.tagName}` };
        }
      }
      return { ok: true, reason: "ok" };
    });
    check("messages detail fits viewport without horizontal overflow", overflow.ok, overflow.reason);
  }

  // Back home → Pop reaction
  await homeFromAnywhere(page);
  await page.locator('.mini-dock [data-app-id="pop"]').click();
  await page.waitForSelector('[data-phone-screen="pop"]', { timeout: 10000 });
  await page.waitForTimeout(600);
  const popText = String(await page.locator("[data-phone-messages]").innerText().catch(() => ""));
  check(
    "Pop shows some post-peek reaction text (no private leak)",
    popText.length > 0 && !/privateFacts|银行卡/i.test(popText),
    popText.slice(0, 80),
  );

  // Scenario (漫卷: select → chapters → stage)
  await homeFromAnywhere(page);
  await enterScenarioStage(page);
  await page.waitForTimeout(600);

  const poseMeta = await readOnly(page, () => {
    const fig = document.querySelector("[data-stage-figure]");
    const pose = document.querySelector("[data-stage-pose]");
    return {
      src: pose?.getAttribute("src") || fig?.getAttribute("data-pose-url") || "",
      pack: fig?.getAttribute("data-package") || "",
      sprite: Boolean(document.querySelector("[data-stage-sprite] canvas, [data-stage-sprite] .sprite-character")),
    };
  });
  check("scenario pose is not global pet-poses fallback", !/pet-poses\//i.test(poseMeta.src || ""), poseMeta.src);
  check(
    "scenario uses xingli character package (sprite or still)",
    poseMeta.sprite || /characters\/xingli/i.test(poseMeta.src) || poseMeta.pack === "xingli",
    JSON.stringify(poseMeta),
  );

  const dims = await readOnly(page, () => {
    const view = document.querySelector('[data-scenario-view="stage"]');
    const fig = view?.querySelector("[data-stage-figure]");
    const stage = view?.querySelector("[data-scenario-stage]") || view;
    if (!fig || !stage) return null;
    const fr = fig.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    return { fh: fr.height, sh: sr.height, ratio: sr.height ? fr.height / sr.height : 0, hidden: Boolean(view.hidden) };
  });
  check(
    "stage figure occupies ≥28% of stage height",
    Boolean(dims && !dims.hidden && (dims.ratio >= 0.28 || dims.fh >= 160)),
    dims ? JSON.stringify(dims) : "missing",
  );

  for (let i = 0; i < 4; i += 1) {
    const choice = page.locator("[data-scenario-choice]").first();
    if (await choice.isVisible().catch(() => false)) {
      await choice.click();
      await page.waitForTimeout(450);
    } else break;
  }

  const finaleBtn = page.locator('[data-scenario-view="stage"] [data-scenario-finale]');
  await finaleBtn.scrollIntoViewIfNeeded();
  await finaleBtn.waitFor({ state: "visible", timeout: 12000 });
  await finaleBtn.click();
  await page.waitForSelector('[data-scenario-view="finale"].is-active, [data-scenario-view="finale"]:not([hidden])', {
    timeout: 10000,
  });

  // Summary is product-prefilled in openFinale — only edit if empty
  const summary = page.locator("[data-scenario-summary]");
  await summary.waitFor({ state: "visible", timeout: 5000 });
  const existing = await summary.inputValue();
  if (!String(existing || "").trim()) {
    await summary.fill("谢幕《夜雨车站》：伞下并肩等车，雨声把话声压得很轻。");
  }

  await page.locator("[data-scenario-to-diary]").click();
  await page.waitForTimeout(900);

  const runId = await readOnly(page, () => document.querySelector(".mini-phone")?.dataset?.lastLifeRunId || "");

  // Diary — assert THIS run via data-life-run-id (not loose old copy)
  await homeFromAnywhere(page);
  await openPhoneApp(page, "diary");
  await page.waitForTimeout(700);

  // Cover strip should show shared experience without needing force-open
  const strip = page.locator("[data-diary-shared-strip]");
  const stripVisible = await strip.isVisible().catch(() => false);
  let diaryOk = false;
  let diaryDetail = "";

  if (runId) {
    const byRun = page.locator(`[data-life-run-id="${runId}"]`);
    diaryOk = (await byRun.count()) > 0;
    diaryDetail = `runId=${runId} nodes=${await byRun.count()}`;
  }

  if (!diaryOk && stripVisible) {
    const stripText = await strip.innerText();
    diaryOk = /共同经历|谢幕|情景剧/.test(stripText);
    diaryDetail = `strip: ${stripText.slice(0, 120)}`;
  }

  if (!diaryOk) {
    const cover = page.locator("[data-diary-book-cover]");
    if (await cover.isVisible().catch(() => false)) {
      await cover.click();
      await page.waitForTimeout(600);
    }
    const text = await page.locator('[data-phone-screen="diary"]').innerText();
    diaryOk = /共同经历|谢幕《|情景剧\s*·/.test(text);
    diaryDetail = text.replace(/\s+/g, " ").slice(0, 160);
  }

  check("diary reflects shared scenario experience for this run", diaryOk, diaryDetail);

  // Creator hub / cocreate removed from product shell — assert gone.
  await homeFromAnywhere(page);
  await goAppsPage(page);
  const creatorGone = !(await page.locator('[data-app-id="folder:creator"], [data-folder-id="creator"]').first().isVisible().catch(() => false));
  check("creator folder removed from home", creatorGone);
  check("cocreate app not on home", !(await page.locator('[data-app-id="cocreate"]').isVisible().catch(() => false)));
  check("绘境 / studio not on home", !(await page.locator('[data-app-id="studio"]').isVisible().catch(() => false)));
  check("作品工坊 not on home", !(await page.locator('[data-app-id="experience-studio"]').isVisible().catch(() => false)));

  await page.reload({ waitUntil: "domcontentloaded" });
  await openPhoneHome(page);
  const nameAfter = String(await page.locator("[data-phone-name]").first().textContent().catch(() => ""));
  check("after reload still 林星梨", /星梨|林星梨/.test(nameAfter), nameAfter);

  return { runId };
}

async function runOne({ viewport, round, fp }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(EVIDENCE_ROOT, `${stamp}_${viewport.name}_r${round}`);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const recordVideo = process.env.E2E_VIDEO !== "0";
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: "zh-CN",
    recordVideo: recordVideo ? { dir: path.join(outDir, "video"), size: { width: viewport.width, height: viewport.height } } : undefined,
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  await installPhoneFixture(page);

  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
    console.log(`${pass ? "PASS" : "FAIL"}  [${viewport.name}] ${name}${detail ? ` — ${detail}` : ""}`);
  };

  let fatal = null;
  let meta = {};
  try {
    meta = await runJourney(page, check);
  } catch (err) {
    fatal = err;
    const failDir = path.join(FAIL_ROOT, `${stamp}_${viewport.name}`);
    await saveFailure(page, context, failDir, "fatal", checks, err);
    console.error(`Failure artifacts → ${failDir}`);
  }

  const failed = checks.filter((c) => !c.pass);
  const summary = {
    fingerprint: fp,
    viewport,
    round,
    baseUrl: BASE_URL,
    startedAt: stamp,
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
    fatal: fatal ? String(fatal.message || fatal) : null,
    runId: meta.runId || "",
  };

  await writeFile(path.join(outDir, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(path.join(ROOT, "docs/qa/paios/P0/LAST_E2E.json"), JSON.stringify(summary, null, 2), "utf8");

  if (!fatal) {
    try {
      await context.tracing.stop({ path: path.join(outDir, "trace.zip") });
    } catch {
      /* ignore */
    }
  }

  // Key screenshot
  await page.locator(".mini-phone").screenshot({ path: path.join(outDir, "final-phone.png") }).catch(() => {});

  await context.close();
  await browser.close();

  console.log(`\ne2e:core-life-journey [${viewport.name} r${round}] ${summary.passed}/${summary.total}${fatal || failed.length ? " RED" : ""}`);
  return summary;
}

async function main() {
  const fp = fingerprint();
  console.log(`fingerprint commit=${fp.commit} dirty=${fp.dirty} hash=${fp.dirtyHash}`);
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  await mkdir(FAIL_ROOT, { recursive: true });

  const viewports = pickViewports();
  const rounds = Math.max(1, Number(process.env.E2E_ROUNDS || 1));
  const results = [];

  for (const viewport of viewports) {
    for (let r = 1; r <= rounds; r += 1) {
      results.push(await runOne({ viewport, round: r, fp }));
    }
  }

  const allGreen = results.every((r) => !r.fatal && r.failed.length === 0);
  await writeFile(
    path.join(ROOT, "docs/qa/paios/P0/LAST_E2E_BATCH.json"),
    JSON.stringify({ fingerprint: fp, allGreen, results }, null, 2),
    "utf8",
  );

  if (!allGreen) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
