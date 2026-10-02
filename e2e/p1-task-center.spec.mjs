/**
 * PAIOS P1 evidence — open Task Center, approve a seeded R2 task (real clicks).
 * Fixture seeds localStorage before goto; after load: click/fill only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  homeFromAnywhere,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/paios/P1/evidence");

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
  // Seed one awaiting_approval calendar task for char-xingli (fixture, before app boot).
  // Shape must match createTaskDraft: nested `intent`, `events`, plan node risk R2.
  await page.addInitScript(() => {
    const now = new Date().toISOString();
    const taskId = "task-e2e-cal-1";
    const intentId = "intent-e2e-cal-1";
    const approvalId = "appr-e2e-1";
    const stepId = "step-e2e-1";
    const nodeId = "c1";
    const bag = {
      schemaVersion: 1,
      tasks: {
        [taskId]: {
          id: taskId,
          schemaVersion: 1,
          state: "awaiting_approval",
          intent: {
            id: intentId,
            schemaVersion: 1,
            capabilityId: "calendar-draft",
            characterId: "char-xingli",
            title: "日程草稿：一起看剧",
            summary: "周五 20:00 一起看剧",
            input: { text: "周五 20:00 一起看剧", characterId: "char-xingli" },
            risk: "R2",
            idempotentKey: "e2e-cal-1",
            createdAt: now,
          },
          plan: {
            id: "plan-1",
            intentId,
            nodes: [
              {
                id: nodeId,
                capabilityId: "calendar-draft",
                label: "生成日历草稿",
                risk: "R2",
                requiresApproval: true,
                inputSummary: "周五 20:00 一起看剧",
                effectSummary: "本地日历草稿",
              },
            ],
            edges: [],
          },
          steps: [
            {
              id: stepId,
              taskId,
              nodeId,
              capabilityId: "calendar-draft",
              status: "pending",
              attempt: 0,
              checkpoint: { risk: "R2", index: 0, label: "生成日历草稿" },
              input: { text: "周五 20:00 一起看剧", characterId: "char-xingli" },
              output: null,
              error: null,
              startedAt: null,
              finishedAt: null,
            },
          ],
          approvals: [
            {
              id: approvalId,
              taskId,
              stepId,
              risk: "R2",
              title: "确认：生成日历草稿",
              exactEffect: "将在本地创建日历草稿「一起看剧」，不会自动发送或邀请他人。",
              dataUsed: ["对话片段", "本地日历草稿"],
              affects: ["本地日历草稿"],
              decision: "pending",
              createdAt: now,
              decidedAt: null,
            },
          ],
          events: [
            {
              id: "evt-1",
              taskId,
              stepId,
              type: "proposed",
              summary: "提议创建日程草稿",
              capabilityId: "calendar-draft",
              inputSummary: "",
              resultSummary: "",
              userDecision: null,
              at: now,
              meta: {},
            },
          ],
          checkpoint: { stepId, cursor: 0, payload: { risk: "R2" } },
          outcome: null,
          createdAt: now,
          updatedAt: now,
        },
      },
      artifacts: {},
      writeLog: [],
    };
    localStorage.setItem("yueqi.agent.tasks.v1", JSON.stringify(bag));
  });

  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  try {
    await openPhoneHome(page);
    // Pop → 我 → 任务中心
    await page.locator('.mini-dock [data-app-id="pop"]').click();
    await page.waitForSelector('[data-phone-screen="pop"]', { timeout: 10000 });
    await page.locator('[data-pop-tab="me"]').click();
    await page.waitForTimeout(300);
    await page.locator('[data-phone-open="tasks"]').first().click();
    await page.waitForSelector('[data-phone-screen="tasks"].is-active', { timeout: 10000 });
    check("task center screen opened", true);

    await page.locator("[data-task-filter='awaiting']").click();
    await page.waitForTimeout(200);
    const row = page.locator("[data-task-select]").first();
    await row.waitFor({ state: "visible", timeout: 8000 });
    await row.click();
    await page.waitForSelector("[data-task-approval]", { timeout: 8000 });
    check("approval sheet visible", true);

    const effect = await page.locator("[data-task-approval]").innerText();
    check("approval shows exact effect", /日历|草稿|本地/.test(effect), effect.slice(0, 80));

    await page.locator("[data-task-approve]").click();
    await page.waitForTimeout(600);
    await page.locator("[data-task-filter='done']").click();
    await page.waitForTimeout(300);
    const doneText = await page.locator("[data-task-list]").innerText();
    check("task completed after approve", /完成|已完成|一起看剧|日程/.test(doneText), doneText.slice(0, 100));

    await page.locator(".mini-phone").screenshot({ path: path.join(OUT, "task-center-done.png") });
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
  await writeFile(path.join(ROOT, "docs/qa/paios/P1/LAST_E2E.json"), JSON.stringify(summary, null, 2), "utf8");
  try {
    await context.tracing.stop({ path: path.join(OUT, "trace.zip") });
  } catch {
    /* ignore */
  }
  await context.close();
  await browser.close();
  console.log(`\ne2e:p1-task-center ${summary.passed}/${summary.total}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
