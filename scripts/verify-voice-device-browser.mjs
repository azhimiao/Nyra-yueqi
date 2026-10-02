/**
 * Keyless reading aloud in a real browser.
 *
 * The regression this locks down: with no speech key and no Hosted speech
 * supplier, the speaker button was live but produced nothing. It must now drive
 * the device's own voice, and on a device with no installed voice it must say so
 * instead of spinning forever.
 *
 * Run: node scripts/verify-voice-device-browser.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function seed() {
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", migratedFromLegacy: true, version: 1 }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true }));
  localStorage.setItem("yueqi.ecosystem.v1", JSON.stringify({ loggedIn: true, token: "verify", productMode: "developer" }));
  localStorage.setItem("yueqi.autonomy.v1", JSON.stringify({ onboardingComplete: true, preset: "quiet" }));
  // Feature flag plus an empty voice key: the device route is the only one left.
  localStorage.setItem("yueqi.features.v1", JSON.stringify({ voice: true }));
  localStorage.setItem("yueqi.voice.v1", JSON.stringify({ ttsProvider: "ElevenLabs", voiceId: "", ttsApiKey: "" }));
}

/** Replaces the platform engine so the check does not depend on OS voices. */
function installFakeSynthesis({ withVoice }) {
  const spoken = [];
  const voices = withVoice ? [{ name: "Fake zh", lang: "zh-CN", default: true }] : [];
  window.__spokenByDevice = spoken;
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  }
  Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speaking: false,
      getVoices: () => voices,
      addEventListener() {},
      removeEventListener() {},
      cancel() {
        this.speaking = false;
      },
      speak(utterance) {
        if (!voices.length) return;
        this.speaking = true;
        spoken.push(utterance.text);
        setTimeout(() => utterance.onstart?.(), 5);
        setTimeout(() => {
          this.speaking = false;
          utterance.onend?.();
        }, 30);
      },
    },
  });
}

/**
 * Builds the same markup the chat panel renders for an assistant line, so the
 * delegated speaker handler and the real speech modules are what get exercised.
 */
function seedAssistantMessage() {
  const list = document.querySelector("#messageList");
  list.querySelectorAll(".chat-intro-note, .message, .chat-time-separator").forEach((node) => node.remove());
  const article = document.createElement("article");
  article.className = "message ai";
  const row = document.createElement("div");
  row.className = "message-row";
  const paragraph = document.createElement("p");
  paragraph.textContent = "今晚的风很轻。";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-speak";
  button.dataset.speakMessage = "true";
  button.setAttribute("aria-label", "朗读");
  row.append(paragraph, button);
  article.append(row);
  list.append(article);
  return Boolean(list.querySelector("[data-speak-message]"));
}

const vite = await createServer({ root, logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await vite.listen();
const address = vite.httpServer?.address();
assert(address && typeof address !== "string", "vite did not bind a port");
const baseUrl = `http://127.0.0.1:${address.port}/`;

const browser = await chromium.launch();
let failures = 0;

async function openChat({ withVoice }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const alerts = [];
  page.on("dialog", (dialog) => {
    alerts.push(dialog.message());
    dialog.dismiss().catch(() => {});
  });
  await page.addInitScript(seed);
  await page.addInitScript(installFakeSynthesis, { withVoice });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), null, { timeout: 60000 });
  await page.waitForSelector("#messageList", { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { context, page, alerts };
}

async function check(name, options, fn) {
  const { context, page, alerts } = await openChat(options);
  try {
    await fn(page, alerts);
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${name}\n      ${error.message}`);
  } finally {
    await context.close();
  }
}

await check("speaker button reads aloud with no key and no hosted supplier", { withVoice: true }, async (page) => {
  assert.equal(await page.evaluate(seedAssistantMessage), true, "could not seed an assistant message");
  await page.waitForTimeout(300);
  const button = page.locator("[data-speak-message]").first();
  await button.waitFor({ state: "attached", timeout: 10000 });
  assert.equal(await button.isEnabled(), true, "speaker button was disabled");

  await button.click({ force: true });
  await page.waitForFunction(() => (window.__spokenByDevice || []).length > 0, null, { timeout: 8000 });
  const spoken = await page.evaluate(() => window.__spokenByDevice);
  assert.equal(spoken[0], "今晚的风很轻。", `device voice spoke the wrong text: ${JSON.stringify(spoken)}`);

  // Playback must release the button instead of leaving it stuck mid-speech.
  await page.waitForFunction(
    () => !document.querySelector("[data-speak-message]")?.classList.contains("is-speaking"),
    null,
    { timeout: 8000 },
  );
});

await check("a device with no installed voice says so instead of hanging", { withVoice: false }, async (page, alerts) => {
  assert.equal(await page.evaluate(seedAssistantMessage), true, "could not seed an assistant message");
  await page.waitForTimeout(300);
  const button = page.locator("[data-speak-message]").first();
  await button.waitFor({ state: "attached", timeout: 10000 });
  await button.click({ force: true });
  await page.waitForTimeout(1200);
  assert.equal(
    await page.evaluate(() => (window.__spokenByDevice || []).length),
    0,
    "no voice is installed, so nothing should have been synthesized",
  );
  assert.equal(
    await button.evaluate((node) => node.classList.contains("is-speaking")),
    false,
    "the button stayed in its speaking state with no engine to finish it",
  );
  const feedback = [
    ...alerts,
    await page.locator("[data-chat-feedback-host]").first().textContent().catch(() => ""),
  ].join(" ");
  assert.match(
    feedback,
    /没有可用的声音|语音密钥/,
    `tapping an unavailable speaker should report why, saw: ${feedback.slice(0, 200)}`,
  );
});

await browser.close();
await vite.close();

if (failures) {
  console.error(`\n${failures} device speech check(s) failed`);
  process.exit(1);
}
console.log("\ndevice speech routing OK");
