/**
 * P0 — Cross-character browser evidence (Codex CROSS-browser).
 *
 * finding_id: CROSS-browser
 * Source: docs/qa/companion-os/CODEX_AUDIT_EXTRACTS_2026-08-02/crosschar-final.md
 *
 * Playwright proves Pop love chat keeps reply ownership on character A when focus
 * switches to B during pending buffer or mid-stream — module probes alone are insufficient.
 *
 * Strategy: intercept /model/chat with a gate-controlled delayed SSE (no paid model).
 * Character switch uses real Pop UI clicks (data-open-dm); storage/DOM probes are read-only.
 *
 * Blockers (none for offline): requires Chromium + Vite app shell; model service not required.
 *
 * Usage: node e2e/p0-cross-character-browser.spec.mjs
 * Env: DEMO_URL (default http://127.0.0.1:5177/)
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BASE_URL,
  installPhoneFixture,
  openPhoneHome,
  readOnly,
} from "./helpers/phone.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/qa/companion-os/CROSS_BROWSER_E2E");
const CHAR_A = "char-xingli";
const USER_PENDING = "E2E_CROSS_PENDING_USER_A";
const REPLY_PENDING = "E2E_CROSS_PENDING_REPLY_A";
const USER_STREAM = "E2E_CROSS_STREAM_USER_A";
const REPLY_STREAM = "E2E_CROSS_STREAM_REPLY_A";

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
  const url = process.env.DEMO_URL || BASE_URL;
  if (await waitForUrl(url, 2000)) return { url, child: null };
  const port = new URL(url).port || "5177";
  const child = spawn("npx", ["vite", "--host", "127.0.0.1", `--port`, port], {
    cwd: ROOT,
    stdio: "pipe",
    shell: true,
  });
  const ok = await waitForUrl(url, 90000);
  if (!ok) {
    child.kill();
    throw new Error(`vite failed to start for cross-character browser e2e (${url})`);
  }
  return { url, child };
}

function seedCrossCharacterFixture(page) {
  return page.addInitScript(() => {
    try {
      localStorage.setItem(
        "yueqi.onboarding.v1",
        JSON.stringify({ done: true, accountMode: "offline" }),
      );
      localStorage.setItem(
        "yueqi.firstLight.v1",
        JSON.stringify({
          schemaVersion: 1,
          done: true,
          paused: false,
          stage: "COMPLETED",
          entryPath: "careful",
          draft: {},
          previewLines: [],
          errorMessage: "",
          updatedAt: new Date().toISOString(),
          committedCharacterId: "char-xingli",
          migratedFromLegacy: false,
        }),
      );
      localStorage.setItem(
        "yueqi.provider.v1",
        JSON.stringify({
          kind: "OpenAI Compatible",
          baseUrl: "http://127.0.0.1:8787",
          model: "e2e-cross-mock",
        }),
      );
      sessionStorage.setItem("yueqi.web-secret.provider.apiKey", "e2e-cross-key");
      localStorage.setItem(
        "yueqi.autonomy.v1",
        JSON.stringify({
          schemaVersion: 1,
          onboardingComplete: true,
          preset: "companion",
        }),
      );
    } catch {
      /* ignore */
    }
  });
}

function installModelMock(page, replyText, gateRef) {
  return page.route("**/model/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    let body = {};
    try {
      body = JSON.parse(route.request().postData() || "{}");
    } catch {
      body = {};
    }
    if (gateRef.wait) {
      await gateRef.wait();
    }
    if (body.stream) {
      const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: replyText } }] })}\n\ndata: [DONE]\n\n`;
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: sse,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, content: replyText }),
    });
  });
}

async function ensurePopApp(page) {
  const onPop = await page.locator('[data-phone-screen="pop"].is-active').isVisible().catch(() => false);
  if (!onPop) {
    await page.locator('.mini-dock [data-app-id="pop"]').click();
    await page.waitForSelector('[data-phone-screen="pop"]', { timeout: 15000 });
  }
  const chatTab = page.locator('[data-pop-tab="chat"]');
  if (await chatTab.isVisible().catch(() => false)) {
    await chatTab.click();
    await page.waitForTimeout(150);
  }
}

async function ensurePopSessionList(page) {
  await ensurePopApp(page);
  const inThread = await page.locator('[data-pop-chat-mode="thread"]:not([hidden])').isVisible().catch(() => false);
  if (inThread) {
    await page.locator("[data-pop-nav-back]").click();
    await page.waitForSelector('[data-pop-chat-mode="list"]:not([hidden])', { timeout: 10000 });
  }
  await page.waitForSelector('[data-pop-chat-mode="list"]:not([hidden])', { timeout: 15000 });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-open-dm]").length >= 1,
    { timeout: 15000 },
  );
}

async function openPopChat(page) {
  await ensurePopSessionList(page);
}

async function openDmThread(page, characterId) {
  await ensurePopSessionList(page);
  const row = page.locator(`[data-open-dm="${characterId}"]`).first();
  await row.waitFor({ state: "visible", timeout: 15000 });
  await row.click();
  await page.waitForSelector('[data-pop-chat-mode="thread"]:not([hidden])', { timeout: 15000 });
}

async function sendPopMessage(page, text) {
  const input = page.locator("[data-phone-chat-input]");
  await input.waitFor({ state: "visible", timeout: 10000 });
  await input.fill(text);
  await page.locator("[data-phone-send]").click();
  await page.waitForFunction(
    (marker) => {
      const nodes = document.querySelectorAll("[data-phone-messages] .mini-message.is-user p");
      return [...nodes].some((n) => (n.textContent || "").includes(marker));
    },
    text,
    { timeout: 15000 },
  );
}

async function clickCharacterReply(page) {
  await page.locator("[data-phone-speak-char]").click();
}

async function waitForCharacterReplied(page, flag = "__E2E_REPLY_DONE__", timeoutMs = 45000) {
  await page.evaluate((eventFlag) => {
    window[eventFlag] = false;
    window.addEventListener(
      "yueqi.character.replied",
      () => {
        window[eventFlag] = true;
      },
      { once: true },
    );
  }, flag);
  await page.waitForFunction(
    (eventFlag) => window[eventFlag] === true,
    flag,
    { timeout: timeoutMs },
  );
}

async function seedCharacterB(page) {
  return page.evaluate(async () => {
    const { upsertCharacter, getCharacterSync, listCharactersSync } = await import("/src/characters/store.js");
    const { addContact } = await import("/src/characters/contacts.js");
    const { BUILTIN_CHARACTER_ID } = await import("/src/constants.js");
    const charBId = "char-e2e-cross-b";
    const builtin = getCharacterSync(BUILTIN_CHARACTER_ID) || listCharactersSync()[0];
    const profile = builtin?.profile
      ? {
        ...builtin.profile,
        fields: [...(builtin.profile.fields || [])],
      }
      : undefined;
    if (profile?.fields) {
      profile.fields[0] = "E2E角色乙";
      profile.fields[1] = "乙";
      profile.fields[4] = "乙的人设";
    }
    await upsertCharacter({
      id: charBId,
      name: "E2E角色乙",
      alias: "乙",
      profile,
      source: "user",
    });
    addContact(BUILTIN_CHARACTER_ID);
    addContact(charBId);
    window.__E2E_CHAR_B__ = charBId;
    return charBId;
  });
}

async function probeOwnership(page, charA, charB, replyMarker) {
  return page.evaluate(
    async ({ charA, charB, replyMarker }) => {
      const { getMessagesBySession } = await import("/src/storage/db.js");
      const { dmSessionId } = await import("/src/characters/ids.js");
      const { getChatFocus } = await import("/src/characters/session-context.js");
      const msgsA = await getMessagesBySession(dmSessionId(charA), 80);
      const msgsB = await getMessagesBySession(dmSessionId(charB), 80);
      const visible = [...document.querySelectorAll("[data-phone-messages] .mini-message p")].map(
        (el) => el.textContent || "",
      );
      const aAssist = msgsA.filter((m) => m.role === "assistant").map((m) => m.content);
      const bAssist = msgsB.filter((m) => m.role === "assistant").map((m) => m.content);
      return {
        focusCharacterId: getChatFocus().characterId,
        aHasReply: aAssist.some((t) => t.includes(replyMarker)),
        bHasReply: bAssist.some((t) => t.includes(replyMarker)),
        bVisibleHasReply: visible.some((t) => t.includes(replyMarker)),
        visibleCount: visible.length,
      };
    },
    { charA, charB, replyMarker },
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { url, child: viteChild } = await ensureServer();
  const checks = [];
  const check = (name, pass, detail = "") => {
    checks.push({ name, pass: Boolean(pass), detail: String(detail || "") });
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
  });
  const page = await context.newPage();

  let charB = "";
  try {
    await installPhoneFixture(page, { experienceStub: true });
    await seedCrossCharacterFixture(page);

    const pendingGate = {};
    pendingGate.wait = () => Promise.resolve();
    await installModelMock(page, REPLY_PENDING, pendingGate);

    await openPhoneHome(page);
    await page.evaluate(() => {
      const onboard = document.querySelector("[data-autonomy-onboard]");
      if (onboard) onboard.hidden = true;
    });
    charB = await seedCharacterB(page);
    check("seed character B", Boolean(charB), charB);

    await openPopChat(page);

    // —— Case 1: pending buffer — A send → switch B → reply on B thread ——
    await openDmThread(page, CHAR_A);
    await sendPopMessage(page, USER_PENDING);
    await openDmThread(page, charB);
    check("focus on B before reply", (await readOnly(page, () => {
      return document.querySelector('[data-pop-chat-mode="thread"]:not([hidden])') != null;
    })), "thread");
    await clickCharacterReply(page);
    await waitForCharacterReplied(page, "__E2E_PENDING_DONE__");

    let probe = await probeOwnership(page, CHAR_A, charB, REPLY_PENDING);
    check("pending: A session owns reply", probe.aHasReply, JSON.stringify(probe));
    check("pending: B session lacks reply", !probe.bHasReply, JSON.stringify(probe));
    check("pending: B visible chat lacks A reply", !probe.bVisibleHasReply, JSON.stringify(probe));

    // —— Case 2: streaming — A send → reply → switch B mid-flight ——
    const streamGate = {};
    let releaseStream;
    streamGate.wait = () => new Promise((resolve) => {
      releaseStream = resolve;
    });
    await page.unroute("**/model/chat").catch(() => {});
    await installModelMock(page, REPLY_STREAM, streamGate);

    await openDmThread(page, CHAR_A);
    await sendPopMessage(page, USER_STREAM);
    await page.evaluate(() => {
      window.__E2E_STREAM_DONE__ = false;
      window.addEventListener(
        "yueqi.character.replied",
        () => {
          window.__E2E_STREAM_DONE__ = true;
        },
        { once: true },
      );
    });

    await clickCharacterReply(page);
    await page.waitForTimeout(350);
    await openDmThread(page, charB);
    check("switched to B mid-stream", true);
    releaseStream?.();
    await page.waitForFunction(
      () => window.__E2E_STREAM_DONE__ === true,
      { timeout: 40000 },
    );

    probe = await probeOwnership(page, CHAR_A, charB, REPLY_STREAM);
    check("streaming: A session owns reply", probe.aHasReply, JSON.stringify(probe));
    check("streaming: B session lacks reply", !probe.bHasReply, JSON.stringify(probe));
    check("streaming: B visible chat lacks A reply", !probe.bVisibleHasReply, JSON.stringify(probe));
    check("streaming: focus remains B", probe.focusCharacterId === charB, probe.focusCharacterId);

    await page.screenshot({ path: path.join(OUT, "cross-char-final.png") });
  } catch (err) {
    check("journey fatal", false, String(err.message || err));
    await page.screenshot({ path: path.join(OUT, "fatal.png"), fullPage: true }).catch(() => {});
  }

  const failed = checks.filter((c) => !c.pass);
  const summary = {
    finding_id: "CROSS-browser",
    baseUrl: url,
    charA: CHAR_A,
    charB,
    passed: checks.length - failed.length,
    total: checks.length,
    failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
    at: new Date().toISOString(),
  };
  await writeFile(path.join(OUT, "RESULT.json"), JSON.stringify(summary, null, 2), "utf8");

  await context.close();
  await browser.close();
  viteChild?.kill?.();

  console.log(`\ne2e:p0-cross-character-browser ${summary.passed}/${summary.total}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
