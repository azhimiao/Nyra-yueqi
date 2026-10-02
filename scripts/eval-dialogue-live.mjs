import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { startDialogueGateway } from "./lib/dialogue-eval-gateway.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "docs/qa/dialogue-evaluation");
await mkdir(out, { recursive: true });
const inputs = [
  "你好，今天在干嘛呢？",
  "叫我林夏就好。我今天刚搬家，桌上只有一盏旧台灯。",
  "折腾一天很累，我想吐槽两句，你先别给建议。",
  "搬家师傅临走还把钥匙落在我屋里了，结果我又追了两层楼。",
  "我现在坐在地板上，外卖凉了。你不用安慰得太满，陪我说两句就好。",
  "对了，记一下我喜欢热乌龙茶，不喝咖啡。",
  "我刚才说错了，咖啡不是完全不喝，只是晚上不喝。茶还是喜欢乌龙。",
  "今天路过一家花店，看见很小的一盆薄荷。你会选薄荷还是仙人掌？为什么？",
  "你记得我今天最折腾的那件事，和桌上放着什么吗？不确定就直说。",
  "我晚上想喝点东西，你会给我选什么？别把我说成完全不喝咖啡。",
  "我们以前一起去过哪座城市？如果没有记录就说没这段经历。",
  "你自己的生活里，有什么细小的东西是你真正在意的？不用围着我转。",
];
const gateway = await startDialogueGateway();
if (!gateway.available) throw new Error(gateway.reason);
const vite = await createServer({ root, logLevel: "error", cacheDir: join(root, "node_modules/.vite-dialogue-live"), server: { host: "127.0.0.1", port: 5221, strictPort: true, hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch();
const results = [], requests = [], errors = [];
let callCount = 0;
async function persist() {
  await writeFile(join(out, "live-conversations.json"), JSON.stringify({ checkedAt: new Date().toISOString(), fixture: "fresh default Nyra, isolated local Hosted gateway, actual provider", callCount, results, runtimeErrors: errors }, null, 2));
  await writeFile(join(out, "live-request-snapshots.json"), JSON.stringify(requests, null, 2));
}
try {
  for (const tier of (process.env.DIALOGUE_EVAL_TIERS || "standard,high").split(",")) {
    await gateway.setTier(tier);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Shanghai" });
    await context.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
    await context.route("https://fonts.gstatic.com/**", route => route.abort());
    await context.route("**/model/chat", async route => {
      callCount++;
      if (callCount > 60) return route.fulfill({ status: 429, contentType: "application/json", body: '{"error":"evaluation_call_limit"}' });
      const body = route.request().postDataJSON();
      requests.push({ tier, requestNumber: callCount, businessPurpose: body.businessPurpose, companionId: body.companionId, stream: body.stream, temperature: body.temperature, maxTokens: body.maxTokens, messages: body.messages, tools: body.tools?.map(x => x.function?.name) });
      return route.continue();
    });
    await context.addInitScript(({ base, token, userId, tier }) => {
      if (localStorage.getItem("dialogue.fixture.seeded")) return;
      const values = {
        "yueqi.settings.v1": { locale: "zh-CN", localeChosen: true },
        "yueqi.firstLight.v1": { done: true, stage: "COMPLETED", migratedFromLegacy: true, version: 1 },
        "yueqi.firstLight.v2": { schemaVersion: 2, stage: "COMPLETED", done: true },
        "yueqi.onboarding.v1": { done: true, accountMode: "online", productMode: "hosted", productModeChosen: true, uiModeChosen: true },
        "yueqi.ecosystem.v1": { loggedIn: true, authMode: "online", modelSource: "hosted", token, userId, username: userId, hostedTier: tier, billingBalance: 100000 },
        "yueqi.autonomy.v1": { onboardingComplete: true, preset: "quiet", proactiveMessage: false },
        "yueqi.phone.os.v1": { passcodeEnabled: false },
      };
      for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("yueqi.serviceBase", base);
      localStorage.setItem("yueqi.app.mode", "app");
      localStorage.setItem("yueqi.app.mode.chosen", "1");
      localStorage.setItem("dialogue.fixture.seeded", "1");
    }, { base: gateway.base, token: gateway.token, userId: gateway.userId, tier });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", error => errors.push({ tier, error: error.message }));
    await page.goto("http://127.0.0.1:5221/", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.__yueqiFullBootstrapState === "ready", null, { timeout: 150000 });
    async function attachObserver() {
      await page.evaluate(() => {
        window.__dialogueEvents = [];
        document.addEventListener("yueqi:chat-turn-progress", event => {
          const d = event.detail;
          window.__dialogueEvents.push({ at: Date.now(), messageId: d.messageId, phase: d.phase, visibleText: d.visibleText || "", visibleLength: d.visibleText?.length || 0, innerStateLength: d.innerState?.length || 0, protocolLeak: /<\/?(?:think|yueqi-runtime|inner-state)[\s>]/i.test(d.visibleText || "") });
        });
      });
    }
    await attachObserver();
    const turns = [...inputs, "你还记得我让你怎么称呼我、桌上有什么，以及我什么时候不喝咖啡吗？"];
    for (let i = 0; i < turns.length; i++) {
      if (i === inputs.length) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.__yueqiFullBootstrapState === "ready", null, { timeout: 150000 });
        await attachObserver();
      }
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem("yueqi.turn.trace.v1") || "[]")[0]?.id || "");
      const started = Date.now(), requestStart = requests.length;
      await page.locator("#messageInput").fill(turns[i]);
      await page.locator("#messageInput").press("Enter");
      let timeout = false;
      try {
        await page.waitForFunction(before => {
          const t = JSON.parse(localStorage.getItem("yueqi.turn.trace.v1") || "[]")[0];
          return t && t.id !== before && ["completed", "failed"].includes(t.status);
        }, before, { timeout: 150000 });
      } catch { timeout = true; }
      const observation = await page.evaluate(({ before, started }) => {
        const trace = JSON.parse(localStorage.getItem("yueqi.turn.trace.v1") || "[]").find(t => t.id !== before);
        const nodes = [...document.querySelectorAll("#messageList .message.ai")];
        const last = nodes.at(-1);
        const body = last?.querySelector("[data-message-body]") || last?.querySelector("p");
        const events = (window.__dialogueEvents || []).filter(e => e.at >= started);
        return { status: trace?.status, reply: trace?.response?.text || events.findLast(e => e.visibleText)?.visibleText || body?.textContent || "", model: trace?.model?.model || "server-resolved", budget: trace?.prompt?.budget, blockStats: trace?.prompt?.blocks?.map(b => ({ id: b.id, tokens: b.tokens, included: b.included })), firstVisibleMs: events.find(e => e.visibleLength > 0)?.at - started || null, visibleUpdates: events.filter(e => e.visibleLength > 0).length, innerStateUpdates: events.filter(e => e.innerStateLength > 0).length, protocolLeak: events.some(e => e.protocolLeak), finalVisibleLength: events.at(-1)?.visibleLength, traceError: trace?.error || null };
      }, { before, started });
      const row = { tier, turn: i + 1, afterReload: i === inputs.length, input: turns[i], ...observation, elapsedMs: Date.now() - started, timeout, requestIndices: Array.from({ length: requests.length - requestStart }, (_, k) => requestStart + k) };
      results.push(row);
      console.log(JSON.stringify({ tier, turn: row.turn, status: row.status, timeout, reply: row.reply, firstVisibleMs: row.firstVisibleMs, elapsedMs: row.elapsedMs, calls: requests.length - requestStart }));
      await persist();
      if (timeout || row.status === "failed") break;
    }
    await page.screenshot({ path: join(out, `live-${tier}-final.png`), animations: "disabled" });
    await context.close();
  }
} finally {
  await persist();
  await browser.close(); await vite.close(); await gateway.stop();
}
