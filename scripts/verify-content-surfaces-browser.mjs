import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const evidence = path.resolve("docs/qa/content-surfaces");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const cases = [], errors = [];
const seed = () => {
  if (localStorage.getItem("content-surfaces-fixture")) return;
  localStorage.setItem("content-surfaces-fixture", "1");
  for (const [key, value] of Object.entries({
    "yueqi.settings.v1": { locale: "zh-CN", localeChosen: true },
    "yueqi.firstLight.v1": { done: true, stage: "COMPLETED", migratedFromLegacy: true, version: 1 },
    "yueqi.firstLight.v2": { schemaVersion: 2, done: true, stage: "COMPLETED" },
    "yueqi.onboarding.v1": { done: true, accountMode: "offline", productMode: "developer", productModeChosen: true, uiModeChosen: true },
    "yueqi.ecosystem.v1": { loggedIn: false, authMode: "offline", productMode: "developer" },
    "yueqi.autonomy.v1": { onboardingComplete: true, preset: "quiet" },
    "yueqi.phone.os.v1": { passcodeEnabled: false },
  })) localStorage.setItem(key, JSON.stringify(value));
  localStorage.setItem("yueqi.app.mode", "app");
  localStorage.setItem("yueqi.app.mode.chosen", "1");
};
await context.addInitScript(seed);
await context.route("https://fonts.googleapis.com/**", r => r.fulfill({ contentType: "text/css", body: "" }));
await context.route("https://fonts.gstatic.com/**", r => r.abort());
const page = await context.newPage();
page.on("pageerror", e => errors.push(e.stack));
page.setDefaultTimeout(15000);
const screenshot = name => page.screenshot({ path: path.join(evidence, `${name}.png`), animations: "disabled" });
const mode = async value => {
  await page.evaluate(value => window.dispatchEvent(new CustomEvent("yueqi.ui.switch-mode", { detail: { mode: value } })), value);
  await page.waitForFunction(value => document.body.dataset.appMode === value, value);
};
const appPanel = async id => {
  await mode("app");
  await page.evaluate(id => document.querySelector(`[data-tab="${id}"]`)?.click(), id);
  await page.locator(`[data-panel="${id}"].is-active`).waitFor();
};
const phone = async id => {
  await mode("phone");
  await page.evaluate(id => window.__yueqiPhone.openApp(id), id);
  await page.waitForFunction(id => document.querySelector(".mini-phone")?.dataset.phoneView === id, id);
  await page.waitForFunction(() => !document.querySelector(".mini-phone__content")?.classList.contains("is-app-expanding"));
  return page.locator(`[data-phone-screen="${id}"]`);
};
const fit = async root => {
  const metrics = await root.evaluate(el => ({ w: el.clientWidth, sw: el.scrollWidth, doc: document.documentElement.scrollWidth, vw: innerWidth }));
  assert(metrics.sw <= metrics.w + 1 && metrics.doc <= metrics.vw + 1, JSON.stringify(metrics));
};
async function run(name, work) {
  try { await work(); cases.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (e) { await screenshot(`failure-${cases.length}`).catch(() => {}); cases.push({ name, pass: false, error: e.stack }); console.error(`FAIL ${name}: ${e.message}`); }
}
try {
  await page.goto(process.env.DEMO_URL || "http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__yueqiPhone && window.__yueqiFullBootstrapState === "ready", null, { timeout: 150000 });
  await run("fresh chat starts with a compact welcome and all setup links remain reachable", async () => {
    await appPanel("chat");
    const note = page.locator('[data-panel="chat"] [data-chat-intro-note]');
    await note.waitFor();
    assert.equal(await note.locator("[data-chat-intro-toggle]").getAttribute("aria-expanded"), "false");
    const rect = await note.boundingBox(); assert(rect.height < 220, `welcome height ${rect.height}`);
    await note.locator("[data-chat-intro-toggle]").click();
    assert.equal(await note.locator("[data-chat-intro-action]").count(), 11);
    assert(await note.locator("[data-chat-intro-body]").isVisible());
    await note.locator("[data-chat-intro-compose]").click();
    assert(!(await note.locator("[data-chat-intro-body]").isVisible()));
    assert(await page.evaluate(() => /TEXTAREA|INPUT/.test(document.activeElement.tagName)));
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 }); await fit(note);
      await screenshot(`app-chat-${width}`);
    }
  });
  await run("App gallery and player retain distinct readable first screens", async () => {
    await appPanel("library");
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-library-tab="music"]').click();
      assert(await page.locator('[data-co-listen-tell]').isDisabled());
      assert(await page.locator('[data-open-music-list]').isVisible());
      assert.match(await page.locator('[data-open-music-list]').textContent(), /歌单/);
      await fit(page.locator('.library-page')); await screenshot(`app-listen-${width}`);
      await page.locator('[data-library-tab="album"]').click();
      await page.locator('.app-gallery .gallery-collection-head').waitFor();
      await fit(page.locator('.app-gallery')); await screenshot(`app-gallery-${width}`);
    }
  });
  await run("phone chat keeps the same compact guide and focuses its own composer", async () => {
    const pop = await phone('pop');
    await page.evaluate(async () => window.__yueqiPhone.openDmThread((await import('/src/characters/store.js')).getActiveCharacterId()));
    const note = pop.locator('[data-chat-intro-note]'); await note.waitFor();
    assert.equal(await note.locator('[data-chat-intro-toggle]').getAttribute('aria-expanded'), 'false');
    await note.locator('[data-chat-intro-compose]').click();
    assert(await page.evaluate(() => document.activeElement.matches('[data-phone-chat-input]')));
    await fit(note); await screenshot('phone-chat-390');
  });
  await run("phone listen reports waiting, paused and co-listen off accurately", async () => {
    const listen = await phone("listen");
    assert.match(await listen.locator('[data-listen-companion-state]').textContent(), /等你选曲/);
    assert.equal(await listen.locator('[data-listen-play-label]').textContent(), "播放");
    await listen.locator('[data-listen-colisten]').click();
    assert.match(await listen.locator('[data-listen-companion-state]').textContent(), /共听已关闭/);
    assert.equal(await listen.locator('[data-listen-colisten]').getAttribute('aria-checked'), 'false');
    await listen.locator('[data-listen-colisten]').click();
    assert.equal(await listen.locator('[data-listen-colisten]').getAttribute('aria-checked'), 'true');
    assert.match(await listen.locator('[data-listen-companion-state]').textContent(), /等你选曲/);
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 }); await fit(listen); await screenshot(`phone-listen-${width}`);
    }
    await listen.locator('[data-listen-sheet-toggle]').click();
    assert(await listen.locator('[data-phone-tracks]').isVisible());
    await screenshot("phone-playlist-390");
  });
  await run("empty gallery collections are compact destinations and identity has a clear next action", async () => {
    const gallery = await phone("gallery");
    await gallery.locator('.gallery-collection-head').waitFor();
    assert((await gallery.locator('[data-album-key]').count()) >= 4);
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 }); await fit(gallery);
      const rows = await gallery.locator('.mini-album-stack__fan').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
      assert(rows.every(height => height <= 60), rows.join(","));
      await screenshot(`phone-gallery-${width}`);
    }
    await gallery.locator('[data-album-key="pg-visual-identity"]').click();
    assert(await gallery.locator('.gallery-group-empty').isVisible());
    const add = gallery.locator('[data-gallery-add-photos]');
    assert((await add.boundingBox()).height >= 44);
    await screenshot("phone-gallery-identity-empty-390");
    await gallery.locator('[data-gallery-back]').click();
    assert(await gallery.locator('[data-gallery-pane="stacks"]').isVisible());
  });
  await run("saved diary exposes a keyboard reachable open button", async () => {
    await page.evaluate(async () => {
      const { saveDiary } = await import('/src/diary/records.js');
      await saveDiary({ title: "雨停以后", body: "这是隔离浏览器中的验收日记。窗前的光渐渐亮起来，今天想记下这一刻。", id: "qa-content-diary" });
    });
    const diary = await phone("diary");
    const entry = diary.locator('[data-open-diary]').first();
    await entry.waitFor();
    assert.equal(await entry.evaluate(n => n.tagName), "BUTTON");
    const entrySize = await entry.evaluate(n => ({ height: n.offsetHeight, minHeight: getComputedStyle(n).minHeight, color: getComputedStyle(n).color }));
    assert(entrySize.height >= 44, JSON.stringify(entrySize));
    await screenshot('phone-diary-entry-390');
    await entry.focus(); await page.keyboard.press("Enter");
    assert(await diary.locator('[data-diary-book].is-open').isVisible());
    await screenshot("phone-diary-open-390");
    await diary.locator('[data-diary-book-close]').click();
    assert(await entry.isVisible());
  });
  await run("local audio import really plays and pauses with truthful companion status", async () => {
    const listen = await phone("listen");
    const rate = 8000, samples = rate * 15;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
    await listen.locator('[data-listen-file]').setInputFiles({ name: "qa-silent.wav", mimeType: "audio/wav", buffer: wav });
    const track = listen.locator('[data-track-play]').filter({ hasText: 'qa-silent' });
    await track.waitFor(); await track.click();
    await page.waitForFunction(() => { const audio = document.querySelector('[data-listen-audio]'); return audio && !audio.paused && audio.currentTime > 0; });
    assert.match(await listen.locator('[data-listen-companion-state]').textContent(), /正在一起听/);
    await page.waitForFunction(() => document.querySelector('[data-listen-play]')?.dataset.loading !== '1');
    assert.equal(await listen.locator('[data-listen-play]').evaluate(n => n.classList.contains('is-loading')), false);
    await listen.locator('[data-listen-sheet-toggle]').click();
    await listen.locator('[data-listen-play]').click();
    await page.waitForFunction(() => document.querySelector('[data-listen-audio]').paused);
    assert.match(await listen.locator('[data-listen-companion-state]').textContent(), /暂时停在这里/);
    await screenshot('phone-listen-imported-paused-390');
  });
  await run("App co-listen sharing preserves a draft and submits only an empty composer", async () => {
    await appPanel('chat');
    const draft = "  今天想跟你说一件事。\n这句话还没有写完  ";
    await page.evaluate(draft => {
      const input = document.querySelector('#messageInput');
      const form = input.closest('form');
      window.__qaContentSubmissions = [];
      // Stop at the browser submit boundary, before the application's model call.
      window.__qaContentSubmitGuard = event => {
        if (event.target !== form) return;
        event.preventDefault(); event.stopImmediatePropagation();
        window.__qaContentSubmissions.push(input.value);
      };
      window.addEventListener('submit', window.__qaContentSubmitGuard, true);
      input.value = draft;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, draft);
    await appPanel('library');
    await page.locator('[data-library-tab="music"]').click();
    const tell = page.locator('[data-co-listen-tell]');
    assert(await tell.isEnabled());
    await tell.click();
    const appended = await page.locator('#messageInput').inputValue();
    assert(appended.startsWith(`${draft}\n\n`));
    assert.match(appended.slice(draft.length), /qa-silent/);
    assert.equal(await page.evaluate(() => window.__qaContentSubmissions.length), 0);
    assert(await page.locator('#messageInput').evaluate(n => n === document.activeElement));
    await page.locator('#messageInput').evaluate(n => { n.scrollTop = 0; });
    await screenshot('app-listen-draft-preserved-390');
    await page.locator('#messageInput').fill('');
    await appPanel('library');
    await tell.click();
    const sent = await page.evaluate(() => window.__qaContentSubmissions);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /qa-silent/);
    assert(!sent[0].includes(draft));
    await page.evaluate(() => window.removeEventListener('submit', window.__qaContentSubmitGuard, true));
    await page.locator('#messageInput').fill('');
  });
  await run("photo import opens the actual image and returns to its collection", async () => {
    const gallery = await phone('gallery');
    await gallery.locator('[data-album-key="pg-visual-identity"]').click();
    const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 220; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e6eff5'; ctx.fillRect(0, 0, 180, 220); ctx.fillStyle = '#63879e'; ctx.fillRect(30, 40, 120, 140); return canvas.toDataURL('image/png').split(',')[1]; });
    await gallery.locator('[data-gallery-file]').setInputFiles({ name: 'qa-reference.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    await gallery.locator('[data-photo-index="0"]').waitFor();
    await gallery.locator('[data-photo-index="0"]').click();
    assert(await gallery.locator('[data-phone-album-lightbox]').isVisible());
    await page.waitForFunction(() => { const image = document.querySelector('[data-phone-screen="gallery"] [data-lightbox-img]'); return image?.complete && image.naturalWidth > 0; });
    assert(await gallery.locator('[data-lightbox-img]').evaluate(n => n.complete && n.naturalWidth > 0));
    await gallery.locator('[data-lightbox-close]').click();
    await gallery.locator('[data-gallery-back]').click();
    await gallery.locator('[data-album-key="pg-visual-identity"] img').waitFor();
    assert(await gallery.locator('[data-album-key="pg-visual-identity"] img').count());
    await screenshot('phone-gallery-with-photo-390');
  });
  await run("English content controls remain legible at 360 px", async () => {
    await page.evaluate(async () => (await import('/src/i18n/index.js')).setLocale('en'));
    await page.setViewportSize({ width: 360, height: 800 });
    await appPanel('chat');
    const intro = page.locator('[data-panel="chat"] [data-chat-intro-note]');
    await fit(intro); await screenshot('app-chat-en-360');
    const listen = await phone('listen'); await fit(listen);
    assert.equal(await listen.locator('[data-listen-play-label]').textContent(), 'Play');
    assert.match(await listen.locator('[data-listen-companion-state]').textContent(), /Paused/);
    await screenshot('phone-listen-en-360');
    const gallery = await phone('gallery'); await fit(gallery); await screenshot('phone-gallery-en-360');
  });
  await run("runtime remains clean", async () => assert.deepEqual(errors, []));
} finally {
  await writeFile(path.join(evidence, "BROWSER_VERIFY.json"), JSON.stringify({ generatedAt: new Date().toISOString(), cases, runtimeErrors: errors, passed: cases.filter(x => x.pass).length, failed: cases.filter(x => !x.pass).length }, null, 2));
  await context.close(); await browser.close();
}
if (cases.some(x => !x.pass)) process.exitCode = 1;
