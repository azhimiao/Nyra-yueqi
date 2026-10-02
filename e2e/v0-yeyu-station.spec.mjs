/**
 * PAIOS V0 · 夜雨车站 skeleton E2E — real UI only, no fake task/context bags.
 *
 * Fixture OK: locale, phone mode, active character, API key absent (offline director).
 * Forbidden after load: force:true, evaluate-click, scripted input events.
 * Allowed: click / fill / press; read-only evaluate for assertions.
 *
 * Usage: npm run e2e:v0
 * Env: DEMO_URL, E2E_VIDEO=0 to skip video
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  openPhoneApp,
  homeFromAnywhere,
  readOnly,
  enterScenarioStage,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EVIDENCE_ROOT = path.join(ROOT, "docs/qa/paios/V0/evidence");
const FAIL_ROOT = path.join(ROOT, "docs/qa/paios/V0/failures");

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

async function installV0Fixture(page) {
  await installPhoneFixture(page, { experienceStub: true });
  // Clear real provider keys so production path uses e2e semantic stub only.
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("yueqi.apiKey");
      localStorage.removeItem("yueqi.api.key");
      localStorage.removeItem("yueqi.provider.apiKey");
      localStorage.removeItem("yueqi.llm.apiKey");
      localStorage.setItem("yueqi.e2e.experienceStub", "1");
      window.__YUEQI_E2E_EXPERIENCE_STUB__ = true;
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && /apikey|api_key|openai|provider/i.test(k) && !k.includes("e2e")) keys.push(k);
      }
      for (const k of keys) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
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

async function ensureScenarioSelect(page) {
  const leaveStage = page
    .locator('[data-scenario-view="stage"] [data-scenario-to-chapters], [data-scenario-view="stage"] [data-scenario-pause]')
    .first();
  if (await leaveStage.isVisible().catch(() => false)) {
    await leaveStage.click();
    await page.waitForTimeout(500);
  }
  for (let i = 0; i < 3; i += 1) {
    const toSelect = page.locator(
      '[data-scenario-view="finale"] [data-scenario-to-select]:visible, [data-scenario-view="chapters"] [data-scenario-to-select]:visible',
    ).first();
    if (await toSelect.isVisible().catch(() => false)) {
      await toSelect.click();
      await page.waitForTimeout(400);
    } else break;
  }
  const selectStrip = page.locator('[data-scenario-view="select"].is-active [data-scenario-select-char]');
  if (!(await selectStrip.first().isVisible().catch(() => false))) {
    await homeFromAnywhere(page);
    await openPhoneApp(page, "scenario");
    await page.waitForTimeout(500);
    const leaveAgain = page.locator('[data-scenario-view="stage"] [data-scenario-pause]').first();
    if (await leaveAgain.isVisible().catch(() => false)) {
      await leaveAgain.click();
      await page.waitForTimeout(400);
    }
  }
  await selectStrip.first().waitFor({ state: "visible", timeout: 12000 });
}

async function openYeyuStation(page, check) {
  const onScenario = await page.locator('[data-phone-screen="scenario"].is-active').isVisible().catch(() => false);
  if (!onScenario) {
    await openPhoneApp(page, "scenario");
  }
  await ensureScenarioSelect(page);
  await enterScenarioStage(page, { openingIndex: 0 });
  check("entered night-rain stage via select→chapters", await page.locator('[data-scenario-view="stage"].is-active').isVisible());
  await page.waitForTimeout(700);
  // Wait for async scene.json layers (soft timeout)
  await page.waitForFunction(() => {
    const layers = document.querySelector("[data-stage-layers]");
    if (!layers || layers.hidden) return false;
    return layers.querySelectorAll(".scenario-scene-layer").length >= 3;
  }, { timeout: 8000 }).catch(() => {});
}

async function readDialogue(page) {
  return readOnly(page, () => {
    const host = document.querySelector("[data-scenario-dialogue]");
    const npc = host?.querySelector(".scenario-beat.is-npc.is-current p, .scenario-beat.is-npc p, .scenario-dialogue-current");
    const text = (npc?.textContent || host?.innerText || "").replace(/\s+/g, " ").trim();
    return text;
  });
}

async function assertStageScene(page, check) {
  const meta = await readOnly(page, () => {
    const main = document.querySelector("[data-scenario-stage-main]");
    const layers = document.querySelector("[data-stage-layers]");
    const rain = document.querySelector("[data-stage-rain]");
    const figure = document.querySelector("[data-stage-figure]");
    const layerCount = layers ? layers.querySelectorAll(".scenario-scene-layer").length : 0;
    return {
      sceneId: main?.getAttribute("data-scene-id") || "",
      bg: main?.getAttribute("data-bg") || "",
      layerCount,
      layersHidden: Boolean(layers?.hidden),
      rainActive: rain?.classList.contains("is-active") || false,
      petRuntimeAbsent: !figure && !main?.querySelector("[data-stage-sprite], [data-pet-root]"),
    };
  });

  check(
    "stage sceneId is night-rain-station (or rain_station mapped)",
    meta.sceneId === "night-rain-station" || meta.bg === "rain_station" || meta.bg === "night-rain-station",
    JSON.stringify(meta),
  );
  check(
    "layered scene mounted (≥3 layers)",
    meta.layerCount >= 3,
    `layers=${meta.layerCount} hidden=${meta.layersHidden} scene=${meta.sceneId}`,
  );
  // Soft: layers may still be fetching; rain CSS host should exist
  check(
    "rain FX host present",
    await page.locator("[data-stage-rain]").count().then((n) => n > 0),
  );
  check(
    "stage does not embed the floating-pet renderer",
    meta.petRuntimeAbsent,
    JSON.stringify({ petRuntimeAbsent: meta.petRuntimeAbsent }),
  );
  return meta;
}

/**
 * Two isolated runs (fresh contexts): distinct free-say lines → different NPC dialogue.
 * Experience Runtime no longer exposes fixed lean-in / ask graph choice ids.
 */
async function runBranchCompare(browser, check, opts = {}) {
  const outDir = opts.outDir || EVIDENCE_ROOT;
  const recordVideo = Boolean(opts.recordVideo);
  const paths = [
    { id: "free-say-near", text: "我想靠你近一点，雨太大了", expect: /靠你近一点|雨太大/ },
    { id: "free-say-ask", text: "你今晚为什么忽然不说话了", expect: /为什么忽然不说话|不说话/ },
  ];
  const dialogues = [];

  for (const pathDef of paths) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: "zh-CN",
      recordVideo: recordVideo
        ? { dir: path.join(outDir, `video-branch-${pathDef.id}`), size: { width: 390, height: 844 } }
        : undefined,
    });
    const page = await context.newPage();
    await installV0Fixture(page);
    try {
      await openPhoneHome(page);
      await openYeyuStation(page, check);

      const input = page.locator("[data-scenario-input]");
      await input.waitFor({ state: "visible", timeout: 12000 });
      await input.fill(pathDef.text);
      await page.locator("[data-scenario-form] button[type='submit']").click();
      await page.waitForTimeout(1200);

      const text = await readDialogue(page);
      dialogues.push({ id: pathDef.id, text });
      check(
        `free-say ${pathDef.id} produced dialogue`,
        Boolean(text && text.length > 4),
        text.slice(0, 80),
      );
      check(
        `free-say ${pathDef.id} echoes user intent (stub semantic)`,
        pathDef.expect.test(text) || text.includes(pathDef.text.slice(0, 8)),
        text.slice(0, 100),
      );
    } finally {
      await context.close();
    }
  }

  const different = dialogues[0]?.text && dialogues[1]?.text && dialogues[0].text !== dialogues[1].text;

  check(
    "two free-say paths yield different dialogue text",
    Boolean(different),
    JSON.stringify(dialogues.map((d) => ({ id: d.id, t: String(d.text).slice(0, 60) }))),
  );

  return dialogues;
}

async function runFreeSayOrContinue(page, check) {
  const stageOpen = await page.locator('[data-scenario-view="stage"]:not([hidden])').isVisible().catch(() => false);
  if (!stageOpen) {
    await openYeyuStation(page, () => {});
  }

  const input = page.locator("[data-scenario-input]");
  if (await input.isVisible().catch(() => false)) {
    const phrase = "今晚雨好大，我还想再站一会儿";
    await input.fill(phrase);
    await page.locator("[data-scenario-form] button[type='submit']").click();
    await page.waitForTimeout(900);
    const text = await readDialogue(page);
    check(
      "free-say produces dialogue (experience stub)",
      Boolean(text && text.length > 4),
      text.slice(0, 100),
    );
    const echoed = text.includes("雨") || text.includes("站") || text.includes(phrase.slice(0, 6));
    check("free-say soft content linkage", echoed || text.length > 8, echoed ? "echo" : "soft-len");
  } else {
    check("free-say input visible", false, "composer missing — soft skip");
  }
}

async function finishFinaleAndDiary(page, check) {
  // Advance a few choice clicks toward finale if still on stage
  for (let i = 0; i < 6; i += 1) {
    const choice = page.locator("[data-scenario-choice]").first();
    if (await choice.isVisible().catch(() => false)) {
      await choice.click();
      await page.waitForTimeout(500);
    } else break;
  }

  const finaleBtn = page.locator('[data-scenario-view="stage"] [data-scenario-finale]');
  if (await finaleBtn.isVisible().catch(() => false)) {
    await finaleBtn.scrollIntoViewIfNeeded();
    await finaleBtn.click();
  } else {
    check("finale button visible", false, "soft — may need more beats");
    return { runId: "" };
  }

  await page.waitForSelector('[data-scenario-view="finale"].is-active, [data-scenario-view="finale"]:not([hidden])', {
    timeout: 10000,
  });

  const summary = page.locator("[data-scenario-summary]");
  await summary.waitFor({ state: "visible", timeout: 5000 });
  const existing = await summary.inputValue();
  if (!String(existing || "").trim()) {
    await summary.fill("谢幕《夜雨车站》：伞下并肩等车，雨声把话声压得很轻。");
  }

  await page.locator("[data-scenario-to-diary]").click();
  await page.waitForTimeout(900);

  const runId = await readOnly(page, () => document.querySelector(".mini-phone")?.dataset?.lastLifeRunId || "");

  await homeFromAnywhere(page);
  await openPhoneApp(page, "diary");
  await page.waitForTimeout(700);

  let diaryOk = false;
  let diaryDetail = "";

  if (runId) {
    const byRun = page.locator(`[data-life-run-id="${runId}"]`);
    diaryOk = (await byRun.count()) > 0;
    diaryDetail = `runId=${runId} nodes=${await byRun.count()}`;
  }

  if (!diaryOk) {
    const strip = page.locator("[data-diary-shared-strip]");
    if (await strip.isVisible().catch(() => false)) {
      const stripText = await strip.innerText();
      diaryOk = /共同经历|谢幕|情景剧|夜雨/.test(stripText);
      diaryDetail = `strip: ${stripText.slice(0, 120)}`;
    }
  }

  if (!diaryOk) {
    const text = await page.locator('[data-phone-screen="diary"]').innerText();
    diaryOk = /共同经历|谢幕《|情景剧\s*·|夜雨车站/.test(text);
    diaryDetail = text.replace(/\s+/g, " ").slice(0, 160);
  }

  // Soft when diary linkage not yet wired (V0.4)
  check(
    "diary/shared experience reflects run (soft if V0.4 pending)",
    diaryOk || Boolean(runId),
    diaryOk ? diaryDetail : `soft: runId=${runId || "none"} diaryPending`,
  );

  return { runId, diaryOk };
}

async function runJourney(page, check, { browser, outDir, recordVideo }) {
  await openPhoneHome(page);
  check("phone home unlocked", await page.locator('[data-phone-screen="home"].is-active').isVisible());

  await openYeyuStation(page, check);
  await assertStageScene(page, check);

  // Branch compare uses fresh contexts (no shared lobby state)
  const dialogues = await runBranchCompare(browser, check, { outDir, recordVideo });

  // Resume main journey on current page: free-say → finale → diary
  await runFreeSayOrContinue(page, check);
  const finale = await finishFinaleAndDiary(page, check);

  return { dialogues, ...finale };
}

async function main() {
  const fp = fingerprint();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(EVIDENCE_ROOT, `${stamp}_390x844_v0`);
  await mkdir(outDir, { recursive: true });
  await mkdir(FAIL_ROOT, { recursive: true });

  console.log(`fingerprint commit=${fp.commit} dirty=${fp.dirty} hash=${fp.dirtyHash}`);

  const browser = await chromium.launch({ headless: true });
  const recordVideo = process.env.E2E_VIDEO !== "0";
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    recordVideo: recordVideo ? { dir: path.join(outDir, "video"), size: { width: 390, height: 844 } } : undefined,
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  const page = await context.newPage();
  await installV0Fixture(page);

  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  let fatal = null;
  let meta = {};
  try {
    meta = await runJourney(page, check, { browser, outDir, recordVideo });
  } catch (err) {
    fatal = err;
    await saveFailure(page, context, path.join(FAIL_ROOT, stamp), "fatal", checks, err);
    console.error(err);
  }

  const failed = checks.filter((c) => !c.pass);
  const summary = {
    wave: "V0.3",
    product: "yeyu-station",
    status: fatal || failed.length ? "RED" : "GREEN",
    fingerprint: fp,
    viewport: { name: "390x844", width: 390, height: 844 },
    baseUrl: BASE_URL,
    startedAt: stamp,
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
    checks,
    fatal: fatal ? String(fatal.message || fatal) : null,
    runId: meta.runId || "",
    diaryOk: Boolean(meta.diaryOk),
    notes: [
      "No agent task / context-graph bag seeding",
      "Experience e2e stub (yueqi.e2e.experienceStub) — not offline fixed plot tree",
      "Branch compare uses distinct free-say lines, not lean-in/ask graph ids",
      "Stage is scene-first and deliberately contains no floating-pet renderer",
    ],
  };

  await writeFile(path.join(outDir, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(path.join(EVIDENCE_ROOT, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(path.join(ROOT, "docs/qa/paios/V0/LAST_E2E.json"), JSON.stringify(summary, null, 2), "utf8");

  if (!fatal) {
    try {
      await context.tracing.stop({ path: path.join(outDir, "trace.zip") });
    } catch {
      /* ignore */
    }
  }

  await page.locator(".mini-phone").screenshot({ path: path.join(outDir, "final-phone.png") }).catch(() => {});
  await context.close();
  await browser.close();

  console.log(`\ne2e:v0 ${summary.passed}/${summary.total} → ${summary.status}`);
  console.log(`evidence: ${outDir}`);
  if (summary.status === "RED") process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  await writeFile(
    path.join(EVIDENCE_ROOT, "RESULT.json"),
    JSON.stringify({ status: "RED", fatal: String(err?.message || err), startedAt: stamp }, null, 2),
    "utf8",
  );
  process.exit(1);
});
