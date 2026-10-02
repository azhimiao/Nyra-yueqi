/** Isolated storage only: no user's browser profile or product DB is touched. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServer } from "vite";

const server = process.env.AUTHORING_BASE_URL ? null : await createServer({ root: process.cwd(), logLevel: "error", cacheDir: "node_modules/.vite-memory-worldbook-boundaries", server: { host: "127.0.0.1", port: 0, hmr: false, watch: null } });
let browser;
try {
await server?.listen();
browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
const results = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => { delete window.indexedDB; });
await page.route("**/__memory_worldbook_boundaries", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px}#worldbook{margin-top:40px}</style></head><body><main id="memory"></main><main id="worldbook"></main><script type="module">
import '/src/settings/editors/authoring.css';
import { mountMemoryEditor } from '/src/settings/editors/memory-editor.js';
import { mountWorldbookEditor } from '/src/settings/editors/worldbook-editor.js';
import * as db from '/src/storage/db.js';
import * as manager from '/src/memory/manager.js';
import * as worldStore from '/src/worldbook/store.js';
import { LOCAL_KEYS } from '/src/constants.js';
import { getMemoryRecallPolicy } from '/src/memory/recall-policy.js';
import { searchMemories } from '/src/memory/rag.js';
localStorage.setItem(LOCAL_KEYS.settingsKey, JSON.stringify({locale:'en',localeChosen:true}));
await db.openMemoryDb();
let fixture=JSON.parse(localStorage.getItem('__boundary_fixture')||'null');
if(!fixture){
  for(const id of ['a','b']) await db.storeRecord('characters',{id,name:'Character '+id,profile:{fields:['Character '+id]}});
  const noteA=await manager.saveManagedMemory('a',{title:'A note',rawText:'A lighthouse memory',searchable:true});
  const noteB=await manager.saveManagedMemory('b',{title:'B note',rawText:'B mountain memory',searchable:true});
  for(const id of ['a','b']) await worldStore.upsertWorldbookEntry({id:'world-'+id,title:'World '+id,content:'Lore for '+id,characterId:id,constant:true,scope:'character'});
  await worldStore.upsertWorldbookEntry({id:'world-global',title:'Global world',content:'Shared sky',scope:'global',constant:true});
  fixture={noteA,noteB};localStorage.setItem('__boundary_fixture',JSON.stringify(fixture));
}
const {noteA,noteB}=fixture;
window.test={db,manager,worldStore,LOCAL_KEYS,noteA,noteB,getMemoryRecallPolicy,searchMemories};
window.memory=mountMemoryEditor(document.querySelector('#memory'),{characterId:'a'});
window.worldbook=mountWorldbookEditor(document.querySelector('#worldbook'),{characterId:'a'});
await Promise.all([memory.ready,worldbook.ready]);
window.failNextWrite=(key)=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key){Storage.prototype.setItem=original;throw new Error('fixture_write_failed');}return original.call(this,k,v);};};
window.ready=true;
</script></body></html>` }));
const base = process.env.AUTHORING_BASE_URL || `http://127.0.0.1:${server.httpServer.address().port}`;
await page.goto(`${base}/__memory_worldbook_boundaries`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
const memory = page.locator("#memory");
const world = page.locator("#worldbook");
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
const waitMemory = () => page.waitForFunction(() => !window.memory.hasUnsaved && !document.querySelector('#memory .author-status')?.textContent.includes('Loading'));
const waitWorld = () => page.waitForFunction(() => !window.worldbook.hasUnsaved);

await test("memory character switching clears old rows and keeps provenance", async () => {
  assert.equal(await memory.locator('[data-memory-open]').count(), 1);
  await memory.locator('[data-memory-character]').selectOption('b');
  await page.waitForFunction(() => document.querySelector('#memory [data-memory-open]')?.textContent.includes('B note'));
  assert.ok(!(await memory.textContent()).includes('A lighthouse'));
  await memory.locator('[data-memory-open]').click();
  assert.match(await memory.textContent(), /Manual note/);
  await page.evaluate(() => window.memory.handleBack());
  await memory.locator('[data-memory-character]').selectOption('a');
  await page.waitForFunction(() => document.querySelector('#memory [data-memory-open]')?.textContent.includes('A note'));
  await memory.locator('[data-memory-open]').click();
  await memory.locator('[data-memory-management] > summary').click();
});

await test("memory recall failure rolls back, retry survives producer rewrite", async () => {
  await page.evaluate(() => failNextWrite(test.LOCAL_KEYS.memoryKey));
  // click once: Playwright uncheck retries when the app correctly rolls back.
  await memory.locator('[data-memory-recall]').click();
  await waitMemory();
  assert.equal(await memory.locator('[data-memory-recall]').isChecked(), true, JSON.stringify(await page.evaluate(async () => ({ status:document.querySelector('#memory .author-status')?.textContent, row:(await test.manager.listManagedMemories('a'))[0], policy:test.getMemoryRecallPolicy(test.noteA) }))));
  assert.match(await memory.locator('.author-status').textContent(), /Could not/);
  assert.equal(await page.evaluate(() => test.getMemoryRecallPolicy(test.noteA).searchable), true);
  await memory.locator('[data-memory-recall]').uncheck();
  await waitMemory();
  assert.equal(await memory.locator('[data-memory-recall]').isChecked(), false);
  const recalled = await page.evaluate(async () => {
    await test.db.storeRecord('memories', { ...test.noteA, searchable: true });
    return test.searchMemories('lighthouse', { companionId: 'a' });
  });
  assert.equal(recalled.length, 0);
  await memory.locator('[data-memory-recall]').check(); await waitMemory();
});

await test("memory edit failure keeps draft and original record, then saves", async () => {
  await memory.locator('[data-memory-action=edit]').click();
  await memory.locator('[data-memory-field=rawText]').fill('A revised lighthouse memory');
  await page.evaluate(() => failNextWrite('yueqi.memory.suppression.v1'));
  await memory.locator('button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#memory .author-status')?.textContent.includes('Could not'));
  assert.equal(await memory.locator('[data-memory-field=rawText]').inputValue(), 'A revised lighthouse memory');
  assert.equal(await page.evaluate(async () => (await test.manager.listManagedMemories('a'))[0].rawText), 'A lighthouse memory');
  await memory.locator('button[type=submit]').click(); await waitMemory();
  assert.equal(await memory.locator('.memory-editor__body').textContent(), 'A revised lighthouse memory');
  await memory.locator('[data-memory-management]').evaluate((element) => { element.open = true; });
  await page.evaluate(() => window.memory.refresh());
  assert.equal(await memory.locator('.memory-editor__body').textContent(), 'A revised lighthouse memory');
});

await test("memory delete failure retains note; success cannot be resurrected", async () => {
  await memory.locator('[data-memory-action=delete]').click();
  await page.evaluate(() => failNextWrite(test.LOCAL_KEYS.memoryKey));
  await memory.locator('[data-memory-action=confirm-accept]').click(); await waitMemory();
  assert.equal(await memory.locator('.memory-editor__body').count(), 1);
  assert.match(await memory.locator('.author-status').textContent(), /Could not/);
  await memory.locator('[data-memory-action=delete]').click();
  await memory.locator('[data-memory-action=confirm-accept]').click(); await waitMemory();
  const rows = await page.evaluate(async () => {
    await test.db.storeRecord('memories', { ...test.noteA, id:'producer-retry', searchable:true, tombstone:null, invalidatedAt:null });
    return test.manager.listManagedMemories('a');
  });
  assert.equal(rows.length, 0);
  assert.equal(await page.evaluate(async () => (await test.manager.listManagedMemories('b'))[0].rawText), 'B mountain memory');
});

await test("worldbook scope, dirty refresh, failed save and retry", async () => {
  assert.equal(await world.locator('[data-wb-open]').count(), 2);
  await world.locator('[data-wb-filter]').selectOption('b');
  assert.ok(!(await world.textContent()).includes('Lore for a'));
  await world.locator('[data-wb-open="world-b"]').click();
  await world.locator('[data-wb-edit="world-b"]').click();
  await world.locator('[name=content]').fill('Revised B lore');
  await page.evaluate(() => window.worldbook.refresh());
  assert.equal(await world.locator('[name=content]').inputValue(), 'Revised B lore');
  await page.evaluate(() => failNextWrite(test.LOCAL_KEYS.worldKey));
  await world.locator('button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('#worldbook [role=alert]'));
  assert.equal(await world.locator('[name=content]').inputValue(), 'Revised B lore');
  assert.equal(await page.evaluate(async () => (await test.worldStore.getWorldbookEntry('world-b')).content), 'Lore for b');
  await world.locator('button[type=submit]').click(); await waitWorld();
  assert.equal(await page.evaluate(async () => (await test.worldStore.getWorldbookEntry('world-b')).content), 'Revised B lore');
});

await test("worldbook toggle/delete failures retain saved state", async () => {
  await world.locator('[data-world-entry="world-b"] .wb-usage > summary').click();
  await page.evaluate(() => failNextWrite(test.LOCAL_KEYS.worldKey));
  await world.locator('[data-wb-enabled="world-b"]').click(); await waitWorld();
  assert.equal(await world.locator('[data-wb-enabled="world-b"]').isChecked(), true, JSON.stringify(await page.evaluate(async () => ({ status:document.querySelector('#worldbook .author-status')?.textContent, row:await test.worldStore.getWorldbookEntry('world-b') }))));
  await world.locator('[data-wb-enabled="world-b"]').uncheck(); await waitWorld();
  assert.equal(await page.evaluate(async () => (await test.worldStore.getWorldbookEntry('world-b')).enabled), false);
  await world.locator('[data-wb-edit="world-b"]').click();
  await world.locator('[data-wb-action=delete]').click();
  await page.evaluate(() => failNextWrite(test.LOCAL_KEYS.worldKey));
  await world.locator('[data-wb-action=confirm-delete]').click(); await waitWorld();
  assert.equal(await world.locator('[data-wb-form]').count(), 1);
  assert.ok(await page.evaluate(async () => test.worldStore.getWorldbookEntry('world-b')));
  await world.locator('[data-wb-action=confirm-delete]').click(); await waitWorld();
  assert.equal(await page.evaluate(async () => test.worldStore.getWorldbookEntry('world-b')), null);
});

await test("worldbook invalid import cannot write; confirmed conflicts merge only intended IDs", async () => {
  const file = world.locator('[data-wb-file]');
  await file.setInputFiles({ name:'invalid.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({character_book:{entries:[{content:'bad',keys:'wrong type'}]}})) });
  await page.waitForFunction(() => document.querySelector('#worldbook [role=alert]'));
  assert.equal(await world.locator('[data-wb-action=merge]').count(), 0);
  const before = await page.evaluate(async () => (await test.worldStore.listWorldbookEntries()).length);
  await file.setInputFiles({name:'update.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({entries:[{id:'world-global',content:'Updated global sky',title:'Global revised',scope:'global',constant:true}]}))});
  await world.locator('[data-wb-action=merge]').waitFor();
  assert.match(await world.locator('.wb-import-review').textContent(), /1 will update/);
  await world.locator('[data-wb-action=merge]').click(); await waitWorld();
  const rows = await page.evaluate(async () => test.worldStore.listWorldbookEntries());
  assert.equal(rows.length, before);
  assert.equal(rows.find((row)=>row.id==='world-global').content, 'Updated global sky');
  assert.equal(rows.find((row)=>row.id==='world-a').content, 'Lore for a');
});

await test("both editors remain within narrow phone bounds", async () => {
  for (const width of [360,390,412]) {
    await page.setViewportSize({ width, height:844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
  }
  assert.deepEqual(errors, []);
});

await test("saved changes and recall tombstones survive a full page reload", async () => {
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.equal(await memory.locator('[data-memory-open]').count(), 0);
  await memory.locator('[data-memory-character]').selectOption('b');
  await page.waitForFunction(() => document.querySelector('#memory [data-memory-open]')?.textContent.includes('B note'));
  const state = await page.evaluate(async () => ({
    global: await test.worldStore.getWorldbookEntry('world-global'),
    deleted: await test.worldStore.getWorldbookEntry('world-b'),
    policy: test.getMemoryRecallPolicy(test.noteA),
    recalled: await test.searchMemories('lighthouse', { companionId:'a' }),
  }));
  assert.equal(state.global.content, 'Updated global sky');
  assert.equal(state.deleted, null);
  assert.equal(state.policy.deleted, true);
  assert.equal(state.recalled.length, 0);
  assert.deepEqual(errors, []);
});

const report = { at:new Date().toISOString(), isolated:true, passed:results.filter((row)=>row.pass).length, failed:results.filter((row)=>!row.pass).length, results, pageErrors:errors };
await mkdir('docs/qa/authoring', { recursive:true });
await writeFile('docs/qa/authoring/MEMORY_WORLDBOOK_BOUNDARIES.json', JSON.stringify(report,null,2));
if(report.failed) process.exitCode=1;
} finally { await browser?.close(); await server?.close(); }
