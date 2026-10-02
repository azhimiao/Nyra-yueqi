/**
 * Cold-start intro contract.
 *
 *  1. Every launch writes the wordmark: the ink paths are generated at runtime,
 *     so an empty <g data-boot-ink> means the animation never ran.
 *  2. The intro owns only its own completion. The scene keeps covering the app
 *     until the shell is ready, so a slow start never flashes an empty shell.
 *  3. A tap skips straight to the finished wordmark.
 *  4. Automated browsers skip the intro, otherwise every QA script would wait
 *     on it before its first click.
 *
 * Sampling happens inside the page: bootstrapping the dev server blocks the
 * main thread long enough that an external evaluate can land after the intro.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer as createPortServer } from "node:net";
import { fork } from "node:child_process";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BOOT_TIMEOUT = 90000;
const evidenceDir = path.join(root, "docs/qa/boot-splash");
const built = process.argv.includes("--built");
const mode = built ? "production" : "dev";
async function freePort() {
  const server = createPortServer();
  await new Promise((resolve,reject)=>{ server.once("error",reject); server.listen(0,"127.0.0.1",resolve); });
  const port = server.address().port;
  await new Promise((resolve,reject)=>server.close((error)=>error?reject(error):resolve()));
  return port;
}

// Vite cold transforms block Node's event loop. Keep the server away from
// Playwright/CDP so real animation frames can be received and acknowledged.
if (process.argv[2] === "--serve") {
  const production = process.argv[3] === "production";
  const config = { root,cacheDir:process.argv[4],logLevel:"error" };
  const server = production
    ? await preview({...config,preview:{host:"127.0.0.1",port:await freePort(),strictPort:true}})
    : await createServer({...config,server:{host:"127.0.0.1",port:await freePort(),strictPort:true,hmr:false,watch:null}});
  if (!production) await server.listen();
  process.send?.({ port:server.httpServer.address().port });
  await new Promise((resolve) => process.on("message",async(message)=>{
    if (message !== "close") return;
    if (server.close) await server.close();
    else await new Promise((done)=>server.httpServer.close(done));
    resolve();
  }));
  process.exit(0);
}

async function closeServer(child) {
  if (!child || child.exitCode != null) return;
  await new Promise((resolve)=>{
    const timeout = setTimeout(()=>child.kill(),5000);
    child.once("exit",()=>{ clearTimeout(timeout); resolve(); });
    if (child.connected) child.send("close");
    else child.kill();
  });
}

function seed() {
  if (!/^https?:$/.test(location.protocol)) return;
  localStorage.setItem("yueqi.settings.v1", JSON.stringify({ locale: "zh-CN", localeChosen: true }));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
  localStorage.setItem("yueqi.firstLight.v1", JSON.stringify({ done: true, paused: false, stage: "COMPLETED", version: 1 }));
  localStorage.setItem("yueqi.onboarding.v1", JSON.stringify({ done: true, accountMode: "offline", uiModeChosen: true }));
}

function probe() {
  const state = {
    firstDraw: null,
    sawDrawingVisible: false,
    hiddenBeforeReady: false,
    maxPainted: 0,
    growthSteps: 0,
    partialFrames: 0,
    frames: [],
    timeOrigin: performance.timeOrigin,
  };
  window.__splashProbe = state;
  let lastInkLength = -1;
  const sample = () => {
    const scene = document.querySelector("[data-boot-screen]");
    if (!scene) return;
    const style = getComputedStyle(scene);
    const visible = style.visibility !== "hidden" && Number(style.opacity) > 0;
    const bootReady = document.documentElement.classList.contains("app-boot-ready");
    const inked = [...document.querySelectorAll("[data-boot-ink] path")]
      .map((node) => node.getAttribute("d") || "");
    const painted = inked.filter((d) => d.length > 12).length;
    const inkLength = inked.reduce((total, d) => total + d.length, 0);
    if (painted > 0 && painted < 10) state.partialFrames += 1;
    if (state.frames.length < 300) state.frames.push({ at:Math.round(performance.now()), painted, inkLength, visible, bootReady, state:scene.dataset.splashState || "" });
    state.maxPainted = Math.max(state.maxPainted, painted);
    if (inked.length > 0 && inkLength !== lastInkLength) {
      state.growthSteps += 1;
      lastInkLength = inkLength;
    }
    if (!state.firstDraw && inked.length > 0) {
      state.firstDraw = { strokes: inked.length, visible, bootReady, splashState: scene.dataset.splashState || "" };
    }
    if (scene.dataset.splashState === "drawing" && visible) state.sawDrawingVisible = true;
    if (scene.dataset.splashState === "drawing" && bootReady) state.bootReadyWhileDrawing = true;
    if (!bootReady && !visible) state.hiddenBeforeReady = true;
  };
  sample();
  window.setInterval(sample, 40);
}

function readScene() {
  const scene = document.querySelector("[data-boot-screen]");
  const style = scene ? getComputedStyle(scene) : null;
  const inked = [...document.querySelectorAll("[data-boot-ink] path")]
    .map((node) => node.getAttribute("d") || "");
  return {
    exists: Boolean(scene),
    splashState: scene?.dataset.splashState || "",
    strokes: inked.length,
    painted: inked.filter((d) => d.length > 12).length,
    brand: document.querySelector("[data-boot-brand]")?.textContent?.trim() || "",
    visible: style ? style.visibility !== "hidden" && Number(style.opacity) > 0 : false,
    splashDone: document.documentElement.classList.contains("splash-done"),
    bootReady: document.documentElement.classList.contains("app-boot-ready"),
    probe: window.__splashProbe || null,
  };
}

let failures = 0;
const checks = [];
function check(name, run) {
  try {
    run();
    checks.push({ name, pass:true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    checks.push({ name, pass:false, error:error?.message || String(error) });
    console.error(`FAIL  ${name}\n      ${error?.message || error}`);
  }
}

const cacheDir = await mkdtemp(path.join(tmpdir(), "nyra-splash-verify-"));
let serverProcess, browser;
const pageErrors = [];
const evidence = { at:new Date().toISOString(), mode, isolated:true, checks, pageErrors, motion:[] };
try {
await mkdir(evidenceDir, { recursive:true });
if (built) {
  const html = await readFile(path.join(root,"www/index.html"),"utf8");
  check("production HTML has exactly one independent splash entry before main", () => {
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match)=>match[1]);
    const splash = scripts.filter((src)=>/\/splash-[^/]+\.js$/.test(src));
    assert.equal(splash.length,1);
    assert.equal(scripts[0],splash[0]);
  });
}
serverProcess = fork(fileURLToPath(import.meta.url),["--serve",mode,cacheDir],{stdio:["ignore","pipe","pipe","ipc"]});
let serverLog = "";
serverProcess.stdout.on("data",(data)=>{ serverLog=(serverLog+data).slice(-6000); });
serverProcess.stderr.on("data",(data)=>{ serverLog=(serverLog+data).slice(-6000); });
const address = await new Promise((resolve,reject)=>{
  const timeout = setTimeout(()=>reject(new Error(`splash test server timeout: ${serverLog}`)),BOOT_TIMEOUT);
  serverProcess.once("message",(message)=>{ clearTimeout(timeout); resolve(message); });
  serverProcess.once("exit",(code)=>{ clearTimeout(timeout); reject(new Error(`splash test server exited ${code}: ${serverLog}`)); });
});
const baseUrl = `http://127.0.0.1:${address.port}/`;

browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
await context.addInitScript(seed);
await context.addInitScript(probe);
await context.route("**/*", (route) => {
  const url = new URL(route.request().url());
  return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
});
context.on("page", (page) => page.on("pageerror", (error) => pageErrors.push(error.message)));

// ── 1. The intro plays, and covers the app until the shell is ready ─────────
const page = await context.newPage();
// Capture compositor frames before navigation. Playwright's first page helper
// can arrive after Vite's cold module transform; it cannot prove motion then.
const cdp = await context.newCDPSession(page);
const capturedFrames = [];
cdp.on("Page.screencastFrame", (frame) => {
  capturedFrames.push({ data:frame.data, at:frame.metadata.timestamp * 1000 });
  void cdp.send("Page.screencastFrameAck", { sessionId:frame.sessionId }).catch(()=>{});
});
await cdp.send("Page.enable");
await cdp.send("Page.startScreencast", { format:"png",maxWidth:390,maxHeight:844,everyNthFrame:2 });
await page.goto(`${baseUrl}?splash=1`, { waitUntil: "commit", timeout: BOOT_TIMEOUT });
await page.waitForFunction(
  () => document.documentElement.classList.contains("splash-done")
    && document.documentElement.classList.contains("app-boot-ready"),
  null,
  { timeout: BOOT_TIMEOUT },
);
await page.waitForTimeout(700);
const settled = await page.evaluate(readScene);
evidence.settled = settled;
await cdp.send("Page.stopScreencast");
for (const count of [2,5,10]) {
  const sample = settled.probe.frames.find((frame)=>frame.painted === count && frame.visible);
  if (!sample) continue;
  const at = settled.probe.timeOrigin + sample.at;
  const frame = capturedFrames.filter((frame)=>frame.at >= at).sort((a,b)=>a.at-b.at)[0];
  if (!frame) continue;
  const file = `${mode}-motion-${count}.png`;
  await writeFile(path.join(evidenceDir,file),Buffer.from(frame.data,"base64"));
  evidence.motion.push({file,painted:count,visible:sample.visible,state:sample.state,at:sample.at,captureDelayMs:Math.round(frame.at-at)});
}
const completedSample = settled.probe.frames.find((frame)=>frame.state === "ready" && frame.visible);
if (completedSample) {
  const at = settled.probe.timeOrigin + completedSample.at;
  const frame = capturedFrames.filter((frame)=>frame.at >= at).sort((a,b)=>a.at-b.at)[0];
  if (frame) {
    evidence.completedWordmarkFile = `${mode}-completed.png`;
    await writeFile(path.join(evidenceDir,evidence.completedWordmarkFile),Buffer.from(frame.data,"base64"));
  }
}
check("multiple captured frames show the handwritten progression", () => {
  assert.equal(evidence.motion.length,3);
  assert(evidence.motion.every((frame) => frame.visible), "a captured motion frame was hidden");
  assert(evidence.motion.every((frame) => frame.captureDelayMs < 180), "a motion capture arrived after its stroke interval");
  assert(evidence.motion[0].painted < evidence.motion[1].painted && evidence.motion[1].painted < evidence.motion[2].painted, "motion captures did not progress");
});
check("cold start writes the wordmark instead of a static label", () => {
  assert(settled.exists, "boot screen is missing");
  assert.equal(settled.strokes, 10, `expected 10 strokes, got ${settled.strokes}`);
  assert.equal(settled.probe?.maxPainted, 10, `only ${settled.probe?.maxPainted}/10 strokes were written`);
  assert.equal(settled.brand, "月栖 · Nyra");
});
check("the wordmark is on screen while it is being written", () => {
  assert(settled.probe?.firstDraw, "no frame observed with generated strokes");
  assert(settled.probe.firstDraw.visible, "the intro was hidden while drawing");
  assert(settled.probe.sawDrawingVisible, "no visible frame in the drawing state");
});
check("a busy main thread cannot skip the stroke animation", () => {
  // A wall-clock timeline charges bootstrap stalls to the animation and jumps
  // straight to the finished wordmark; a stepped one keeps drawing.
  assert(
    settled.probe?.growthSteps >= 3,
    `the wordmark appeared in ${settled.probe?.growthSteps} step(s) instead of being written`,
  );
});
check("the app bundle does not compile while the wordmark is being written", () => {
  assert(!settled.probe?.bootReadyWhileDrawing, "boot ran during the intro and would freeze a stroke");
});
check("the intro never uncovers an unready shell", () => {
  assert(!settled.probe?.hiddenBeforeReady, "the intro left before the shell was ready");
});
check("the intro hands over once the shell is ready", () => {
  assert.equal(settled.splashState, "done");
  assert.equal(settled.painted, 10, `only ${settled.painted}/10 strokes finished`);
  assert(!settled.visible, "the intro still covers a ready shell");
  assert(settled.bootReady, "shell never reported ready");
});
await page.locator(".app-shell").first().waitFor({ state: "visible", timeout: 30000 });
await page.close();

// ── 2. A tap skips to the finished wordmark ─────────────────────────────────
const tapPage = await context.newPage();
await tapPage.goto(`${baseUrl}?splash=1`, { waitUntil: "commit", timeout: BOOT_TIMEOUT });
await tapPage.waitForFunction(
  () => document.querySelector("[data-boot-screen]")?.dataset.splashState === "drawing",
  null,
  { timeout: BOOT_TIMEOUT },
);
await tapPage.touchscreen.tap(40, 40);
const skipped = await tapPage.evaluate(readScene);
evidence.skipped = skipped;
check("a tap skips the intro without dropping strokes", () => {
  assert.equal(skipped.splashState, "done");
  assert.equal(skipped.painted, 10, `only ${skipped.painted}/10 strokes were completed`);
  assert(skipped.splashDone, "skipping did not mark the intro done");
});
await tapPage.close();

// ── 3. QA automation is never blocked by the intro ──────────────────────────
const autoPage = await context.newPage();
await autoPage.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: BOOT_TIMEOUT });
await autoPage.waitForFunction(
  () => document.querySelector("[data-boot-screen]")?.dataset.splashState === "done",
  null,
  { timeout: BOOT_TIMEOUT },
);
const automated = await autoPage.evaluate(readScene);
check("automated browsers skip the intro", () => {
  assert.equal(automated.strokes, 0, "the intro animated under automation");
  assert(automated.splashDone, "automation was left waiting on the intro");
});
await autoPage.close();

// ── 4. Reduced motion shows a complete brand with no handwriting or dust ────
const reducedPage = await context.newPage();
await reducedPage.emulateMedia({ reducedMotion:"reduce" });
await reducedPage.goto(`${baseUrl}?splash=1`, { waitUntil:"commit", timeout:BOOT_TIMEOUT });
await reducedPage.waitForFunction(() => document.querySelector("[data-boot-screen]")?.dataset.splashState === "done", null, { timeout:BOOT_TIMEOUT });
const reduced = await reducedPage.evaluate(readScene);
evidence.reduced = reduced;
check("reduced motion keeps the full wordmark without stroke or dust animation", () => {
  assert.equal(reduced.painted,10);
  assert.equal(reduced.probe.partialFrames,0);
});
const reducedStyle = await reducedPage.locator('[data-boot-dust]').evaluate((node) => getComputedStyle(node).animationName);
check("reduced motion disables background drift", () => assert.equal(reducedStyle,"none"));
await reducedPage.close();

// ── 5. The explicit opt-out works in a non-automated browser too ────────────
const optOut = await context.newPage();
await optOut.addInitScript(() => {
  Object.defineProperty(navigator,"webdriver",{get:()=>false});
  if (!/^https?:$/.test(location.protocol)) return;
  localStorage.setItem("yueqi.splash","0");
});
await optOut.goto(baseUrl, { waitUntil:"domcontentloaded", timeout:BOOT_TIMEOUT });
await optOut.waitForFunction(() => document.querySelector('[data-boot-screen]')?.dataset.splashState === 'done', null, { timeout:BOOT_TIMEOUT });
const disabled = await optOut.evaluate(readScene);
check("saved opt-out skips handwriting for normal browsers", () => {
  assert.equal(disabled.strokes,0);
  assert(disabled.splashDone);
});
await optOut.close();

// A stalled remote stylesheet must not hold the local application behind splash.
const fontPage = await context.newPage();
let pendingFonts;
await fontPage.route("https://fonts.googleapis.com/**", (route) => { pendingFonts = route; });
await fontPage.goto(baseUrl, { waitUntil: "commit", timeout: BOOT_TIMEOUT });
await fontPage.waitForFunction(() => document.documentElement.classList.contains("app-boot-ready"), null, { timeout: BOOT_TIMEOUT });
check("application boots while optional remote fonts remain pending", () => assert(pendingFonts));
assert.equal(await fontPage.locator("[data-optional-fonts]").getAttribute("media"), "print");
await pendingFonts.fulfill({ contentType: "text/css", body: "/* Optional font download completed. */" });
await fontPage.waitForFunction(() => document.querySelector("[data-optional-fonts]")?.media === "all");
check("optional fonts activate after loading without restarting the app", () => assert(true));
await fontPage.close();
check("splash verification raises no page errors", () => assert.deepEqual(pageErrors,[]));
} catch(error) {
  failures += 1;
  evidence.fatal = error.stack || String(error);
  console.error(error);
} finally {
  evidence.passed = checks.filter((check)=>check.pass).length;
  evidence.failed = failures;
  await Promise.allSettled([
    browser?.close(),
    closeServer(serverProcess),
  ]);
  // The only recursive cleanup target is this run's freshly created temp dir.
  assert(path.resolve(cacheDir).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(cacheDir,{recursive:true,force:true});
  await writeFile(path.join(evidenceDir,`VERIFY_${mode.toUpperCase()}.json`), JSON.stringify(evidence,null,2));
  await writeFile(path.join(evidenceDir,"VERIFY_LATEST.json"), JSON.stringify(evidence,null,2));
}

if (failures) {
  console.error(`\n${failures} boot splash check(s) failed`);
  process.exit(1);
}
console.log("\nboot splash OK");
