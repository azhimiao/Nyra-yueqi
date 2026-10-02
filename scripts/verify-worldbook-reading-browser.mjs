/** Reading, editing, scope and XSS evidence in an isolated browser database. */
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "docs/qa/context-spaces/worldbook");
await mkdir(output, { recursive: true });
const server = await createServer({ root, logLevel: "error", cacheDir: path.join(root, "node_modules/.vite-worldbook-reading"), server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
const results = [], errors = [];
let browser;
try {
  await server.listen();
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => { delete window.indexedDB; });
  await page.route("**/__worldbook_reading", (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:20px;background:#f7f9fb;color:#203a50;font-family:system-ui}body[data-theme=ink]{background:#162334}header.shell{font-size:14px;padding:8px 0 18px;color:inherit}main{max-width:650px;margin:auto}</style></head><body><main><header class="shell">世界书</header><div id="worldbook"></div></main><script type="module">
import '/src/settings/editors/authoring.css';
import { mountWorldbookEditor } from '/src/settings/editors/worldbook-editor.js';
import * as db from '/src/storage/db.js';
import * as store from '/src/worldbook/store.js';
import { LOCAL_KEYS } from '/src/constants.js';
localStorage.setItem(LOCAL_KEYS.settingsKey, JSON.stringify({locale:'zh-CN',localeChosen:true}));
await db.openMemoryDb();
for (const [id,name] of [['a','星梨'],['b','闻舟']]) await db.storeRecord('characters',{id,name,profile:{fields:[name]}});
window.store=store;window.db=db;window.LOCAL_KEYS=LOCAL_KEYS;
window.editor=mountWorldbookEditor(document.querySelector('#worldbook'),{characterId:'a'});
await editor.ready;window.ready=true;
window.failNextWrite=()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===LOCAL_KEYS.worldKey){Storage.prototype.setItem=original;throw new Error('fixture_write_failed');}return original.call(this,key,value);};};
</script></body></html>` }));
  await page.goto(`${base}__worldbook_reading`);
  await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
  const world = page.locator("#worldbook");
  const screenshot = async (name) => { await page.evaluate(() => scrollTo(0, 0)); return page.screenshot({ path: path.join(output, `${name}.png`), animations: "disabled" }); };
  const run = async (name, task) => {
    try { await task(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, pass: false, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); await screenshot(`failure-${results.length}`).catch(() => {}); }
  };
  const waitSaved = () => page.waitForFunction(() => !editor.hasUnsaved);
  const openEntry = async (id) => { const button = world.locator(`[data-wb-open="${id}"]`); if (await button.getAttribute("aria-expanded") !== "true") await button.click(); };
  const openRules = async () => { const summary = world.locator(".wb-form-usage > summary"); if (!(await summary.locator("..").getAttribute("open"))) { if (!(await summary.locator("..").evaluate((node) => node.open))) await summary.click(); } };
  await run("empty scope has no invented world entries or editor form", async () => {
    assert.equal(await world.locator("[data-wb-open]").count(), 0);
    assert.equal(await world.locator("[data-wb-form]").count(), 0);
    assert.match(await world.innerText(), /这里还没有设定/);
    await screenshot("empty-390");
  });
  await run("author a real scoped detail, then read it in place", async () => {
    await world.locator('[data-wb-action="new"]').click();
    await world.locator('[name="title"]').fill("旧港的灯");
    await world.locator('[name="content"]').fill("旧港沿着海岸延伸。灯塔每晚准时亮起，给晚归的人留一条路。\n\n港口的书店在雨天也营业，门口放着一把可以借走的伞。");
    await world.locator('[name="category"]').fill("地点");
    await openRules();
    await world.locator('[name="constant"]').check();
    await world.locator('button[type="submit"]').click();
    await waitSaved();
    assert.equal(await world.locator("[data-wb-form]").count(), 0);
    assert.equal(await world.locator("[data-wb-open]").count(), 1);
    assert.match(await world.locator(".wb-reading-copy:visible").innerText(), /可以借走的伞/);
    const saved = await page.evaluate(async () => (await store.listWorldbookEntries())[0]);
    assert.equal(saved.characterId, "a");assert.equal(saved.scope, "character");assert.equal(saved.constant, true);
    await screenshot("reading-390");
    await world.locator("[data-wb-open]").click();
    assert.equal(await world.locator(".wb-reading-copy:visible").count(), 0);
    assert.equal(await world.locator("[data-wb-form]").count(), 0);
  });
  await run("shared detail is visible across characters, categories and search are real", async () => {
    await page.evaluate(async () => {
      await store.upsertWorldbookEntry({id:'shared',title:'怎样称呼彼此',content:'称呼由各自决定，不替对方做选择。',category:'规则',constant:true,scope:'global'});
      await store.upsertWorldbookEntry({id:'b-only',title:'闻舟的工作室',content:'他的工作室在城北。',category:'地点',constant:true,scope:'character',characterId:'b'});
      await editor.refresh();
    });
    assert.equal(await world.locator('[data-wb-open="b-only"]').count(),0);
    await world.locator('[data-wb-category="规则"]').click();
    assert.equal(await world.locator('[data-wb-open]').count(),1);
    await world.locator('[data-wb-category=""]').click();
    await world.locator('[data-wb-action="search"]').click();
    await world.locator('[data-wb-search]').fill('借走');
    assert.equal(await world.locator('[data-wb-open]').count(),1);
    await world.locator('[data-wb-search]').fill('不存在的设定');
    assert.match(await world.innerText(),/没有匹配/);
    await world.locator('[data-wb-action="search"]').click();
    await world.locator('[data-wb-filter]').selectOption('b');
    assert.equal(await world.locator('[data-wb-open]').count(),2);
    assert.ok(!(await world.innerText()).includes('旧港的灯'));
    await openEntry('shared');
    await world.locator('[data-wb-edit="shared"]').click();
    assert.match(await world.locator('[data-wb-sharing]').innerText(),/影响所有角色/);
    await world.locator('[name="content"]').fill('使用彼此选择的称呼。');
    await world.locator('button[type=submit]').click();await waitSaved();
    await world.locator('[data-wb-filter]').selectOption('a');await openEntry('shared');
    assert.match(await world.locator('.wb-reading-copy:visible').innerText(),/彼此选择/);
  });
  await run("usage configuration, failure rollback, discard and retry retain boundaries", async () => {
    await world.locator('[data-world-entry="shared"] .wb-usage > summary').click();
    assert.match(await world.locator('.wb-usage-content:visible').innerText(),/不代表某次回复已引用/);
    await page.evaluate(() => failNextWrite());
    // A click models one user action; setChecked can retry the write after an intentional rollback.
    await world.locator('[data-wb-enabled="shared"]').click();await waitSaved();
    assert.equal(await world.locator('[data-wb-enabled="shared"]').isChecked(),true);
    await world.locator('[data-wb-enabled="shared"]').uncheck();await waitSaved();
    assert.equal(await page.evaluate(async ()=>(await store.getWorldbookEntry('shared')).enabled),false);
    await world.locator('[data-wb-edit="shared"]').click();
    await world.locator('[name="content"]').fill('不应保存的草稿');
    await world.locator('.wb-form-savebar [data-wb-action="back"]').click();
    await world.locator('[data-wb-action="stay"]').click();
    assert.equal(await world.locator('[name="content"]').inputValue(),'不应保存的草稿');
    await world.locator('.wb-form-savebar [data-wb-action="back"]').click();
    await world.locator('[data-wb-action="discard"]').click();
    assert.equal(await page.evaluate(async ()=>(await store.getWorldbookEntry('shared')).content),'使用彼此选择的称呼。');
  });
  await run("malicious titles, categories, attributes and full reading paragraphs stay text", async () => {
    await page.evaluate(async () => {
      const payload='<img src=x onerror="window.__worldXss=true">';
      await store.upsertWorldbookEntry({id:'malicious-\"-entry',title:payload,category:payload,content:payload+'\n\n<script>window.__worldXss=true<\\/script>',scope:'global'});
      await editor.refresh();
    });
    const malicious = world.locator('[data-wb-open]').filter({hasText:'<img src=x'});
    await malicious.click();
    assert.equal(await world.locator('img,script').count(),0);
    assert.equal(await page.evaluate(()=>Boolean(window.__worldXss)),false);
    assert.match(await world.locator('.wb-reading-copy:visible').innerText(),/<script>/);
    await page.evaluate(async()=>{await store.deleteWorldbookEntry('malicious-"-entry');await editor.refresh();});
  });
  await run("phone widths, long content and dark reading remain contained", async () => {
    await page.evaluate(async()=>{await store.upsertWorldbookEntry({id:'long',title:'很长的地点名称，依然可以自然换行而不是挤到屏幕外面',content:'海风经过每一条长街。'.repeat(60)+'\n\nhttps://example.invalid/'+ 'unbrokentext'.repeat(40),scope:'global',category:'地点',constant:true});await editor.refresh();});
    for(const width of [360,390,412]) {
      await page.setViewportSize({width,height:844});await openEntry('long');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
      await screenshot(`long-${width}`);
    }
    await page.evaluate(()=>document.body.dataset.theme='ink');await screenshot('dark-412');
    assert.deepEqual(errors,[]);
  });
} finally {
  await browser?.close();await server.close();
  const report={at:new Date().toISOString(),isolated:true,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results,pageErrors:errors};
  await writeFile(path.join(output,'VERIFY.json'),JSON.stringify(report,null,2));
  if(report.failed||errors.length)process.exitCode=1;
}
