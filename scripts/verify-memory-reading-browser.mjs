/** Isolated reading semantics and source-link checks. No model calls or user data. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const out = path.resolve('docs/qa/context-spaces');
await mkdir(out, {recursive:true});
const server = await createServer({root:process.cwd(),logLevel:'error',cacheDir:'node_modules/.vite-memory-reading',server:{host:'127.0.0.1',port:0,hmr:false,watch:null}});
let browser; const results=[], errors=[];
try {
  await server.listen();
  console.log('Memory reading fixture: Vite ready');
  const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(); page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(60000);
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR '+e.message);});
  await page.addInitScript(()=>{delete window.indexedDB;});
  await page.route('**/__memory_reading',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f2f6f9}main{padding:20px;box-sizing:border-box}*{box-sizing:border-box}</style></head><body><main class="author-route" data-reading-space="memory"></main><script type="module">
  import '/src/settings/editors/authoring.css';
  import {mountMemoryEditor} from '/src/settings/editors/memory-editor.js';
  import * as db from '/src/storage/db.js';
  import * as manager from '/src/memory/manager.js';
  import {ensureSession} from '/src/conversation/store.js';
  import {sendUser,appendAssistantCandidate} from '/src/conversation/runtime.js';
  import {buildOriginMemoryRecord} from '/src/characters/origin-memories.js';
  import {appendCohabitEvent} from '/src/memory/cohabit-timeline.js';
  localStorage.setItem('yueqi.settings.v1',JSON.stringify({locale:'zh-CN',localeChosen:true}));
  await db.openMemoryDb();
  for(const [id,name] of [['a','星梨'],['b','闻舟']]) await db.storeRecord('characters',{id,name,profile:{fields:[name]}});
  const session=ensureSession({id:'qa-chat-a',characterId:'a'}).value;
  sendUser(session.id,'今晚先停一下，剩下的明天再做。');appendAssistantCandidate(session.id,'好，今晚先休息。');
  const other=ensureSession({id:'qa-chat-b',characterId:'b'}).value;sendUser(other.id,'其他角色不能看到这句话。');
  const history=await manager.listManagedMemories('a',{layer:'recent'});
  await db.storeRecord('memories',db.normalizeMemory({id:'qa-summary',characterId:'a',companionId:'a',title:'今晚先休息',rawText:'把剩下的事留到明天，今晚先休息。',source:'chat.memory',sourceRef:{kind:'conversation.turn_summary',conversationId:session.id,characterId:'a',messageIds:history.map(x=>x.sourceRef.messageIds[0])},createdAt:'2026-09-25T15:18:00Z'}));
  await manager.saveManagedMemory('a',{title:'你补写的偏好',rawText:'忙的时候不用催我回复。'});
  await db.storeRecord('memories',buildOriginMemoryRecord('a',{id:'qa-origin',title:'相识前的故乡',rawText:'作者设定：她在山里长大。'}));
  appendCohabitEvent({characterId:'a',appId:'listen',summary:'一起听过的雨声',kind:'listened',idempotencyKey:'qa-read-listen'});
  window.manager=manager;window.memory=mountMemoryEditor(document.querySelector('main'),{characterId:'a'});await memory.ready;window.ready=true;
  </script></body></html>`}));
  await page.goto(base+'/__memory_reading',{waitUntil:'domcontentloaded'});console.log('Memory reading fixture: page loaded');await page.waitForFunction(()=>window.ready,null,{timeout:60000}).catch(error=>{throw new Error(`${error.message}; page errors: ${errors.join('; ')}`);});
  const root=page.locator('[data-memory-editor]');
  async function run(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:e.stack});console.error('FAIL '+name+': '+e.message);await page.screenshot({path:path.join(out,`memory-failure-${results.length}.png`)});}}
  async function expand(selector){const el=root.locator(selector);if(!await el.evaluate(x=>x.open))await el.locator(':scope > summary').click();}
  await run('continuous reading retains neighbouring records and origin stays separate',async()=>{
    assert.equal(await root.locator('[data-memory-open]').count(),3);
    assert.doesNotMatch(await root.locator('[data-memory-list]').textContent(),/cohabit\.listened/);
    assert.ok(!(await root.locator('[data-memory-list]').textContent()).includes('作者设定'));
    await root.locator('[data-memory-open="qa-summary"]').click();
    assert.equal(await root.locator('[data-memory-open]').count(),3);
    assert.equal(await root.locator('.memory-editor__detail').count(),1);
    assert.equal(await root.locator('[data-memory-management]').evaluate(x=>x.open),false);
    await expand('[data-memory-source]');
    assert.equal(await root.locator('.memory-editor__quote').count(),2);
    assert.match(await root.locator('.memory-editor__source').textContent(),/今晚先停一下/);
    assert.doesNotMatch(await root.locator('.memory-editor__source').textContent(),/其他角色不能/);
    await page.screenshot({path:path.join(out,'memory-inline-source-390.png'),fullPage:true});
  });
  await run('manual record admits no conversation link and supports in-place recall settings',async()=>{
    await root.locator('[data-memory-open]').filter({hasText:'你补写的偏好'}).click();
    await expand('[data-memory-source]');
    assert.match(await root.locator('.memory-editor__source').textContent(),/未关联聊天/);
    assert.equal(await root.locator('.memory-editor__quote').count(),0);
    await expand('[data-memory-management]');await root.locator('[data-memory-recall]').uncheck();
    await page.waitForFunction(()=>!memory.hasUnsaved);
    assert.equal(await root.locator('[data-memory-recall]').isChecked(),false);
    assert.equal(await root.locator('[data-memory-open]').count(),3);
  });
  await run('origin and raw chat sources remain reachable without merging into shared stream',async()=>{
    await root.locator('[data-memory-action="tab:origin"]').click();await root.locator('[data-memory-open]').filter({hasText:'相识前的故乡'}).waitFor();
    assert.equal(await root.locator('[data-memory-open]').count(),1);assert.match(await root.textContent(),/不代表你们共同经历/);
    await root.locator('[data-memory-action="tab:stream"]').click();
    await root.locator('[data-memory-action="tab:recent"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('[data-memory-open]').length===2);
    assert.ok(!(await root.textContent()).includes('其他角色不能'));
    await page.evaluate(()=>memory.handleBack());
  });
  await run('empty character has no invented memories and exactly one add action',async()=>{
    await root.locator('[data-memory-character]').selectOption('b');
    await root.locator('.memory-editor__empty').filter({hasText:'这里还没有记录'}).waitFor();
    assert.equal(await root.locator('[data-memory-open]').count(),0);
    assert.equal(await root.locator('[data-memory-action=add]').count(),1);
    await root.locator('[data-memory-action=add]').click();await root.locator('[data-memory-field=rawText]').fill('新的草稿内容');
    await page.evaluate(()=>memory.setCharacterId('a'));
    await root.locator('[data-memory-action=confirm-cancel]').click();
    assert.equal(await root.locator('[data-memory-field=rawText]').inputValue(),'新的草稿内容');
    assert.equal(await page.evaluate(()=>memory.characterId),'b');
    await root.locator('[data-memory-action=cancel-edit]').click();await root.locator('[data-memory-action=confirm-accept]').click();
  });
  await run('long content stays within reading surface at 360, 390 and 412 in both themes',async()=>{
    await page.evaluate(async()=>{await manager.saveManagedMemory('b',{title:'连续阅读的长标题'.repeat(12),rawText:'保留每一行原始文字。\\n'.repeat(90)+'https://example.invalid/'+ 'longunbrokentext'.repeat(18)});await memory.refresh();});
    await root.locator('[data-memory-open]').click();
    for(const theme of ['light','ink'])for(const width of [360,390,412]){
      await page.setViewportSize({width,height:844});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      const info=await root.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,document:document.documentElement.scrollWidth,width:innerWidth}));
      assert.ok(info.scroll<=info.client+1&&info.document<=info.width+1,JSON.stringify(info));
    }
    await page.screenshot({path:path.join(out,'memory-long-dark-412.png'),fullPage:false});
  });
  assert.deepEqual(errors,[]);
} finally {await browser?.close();await server.close();}
await writeFile(path.join(out,'MEMORY_READING_VERIFY.json'),JSON.stringify({isolated:true,at:new Date().toISOString(),passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results,pageErrors:errors},null,2));
if(results.some(x=>!x.pass)||errors.length)process.exitCode=1;
