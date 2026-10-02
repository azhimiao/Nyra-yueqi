/** Diagnostic only. Synthetic SSE, isolated browser; never calls a real model. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('docs/qa/dialogue-repair');
const vite = await (await import('vite')).createServer({root:process.cwd(),logLevel:'error',cacheDir:'node_modules/.vite-stream-repair',server:{host:'127.0.0.1',port:5245,strictPort:true,hmr:false,watch:null}});
await vite.listen();
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [], results = [];
await context.route('**/*', r => {
  const url = new URL(r.request().url());
  if (url.hostname === '127.0.0.1' && url.port === '5245') return r.continue();
  if (url.pathname === '/local/session') return r.fulfill({ json: { token: 'qa-local-synthetic' } });
  if (url.hostname === 'fonts.googleapis.com') return r.fulfill({ contentType: 'text/css', body: '' });
  return r.abort();
});
await context.addInitScript(() => {
  if (localStorage.getItem('dialogue-audit-fixture')) return;
  localStorage.setItem('dialogue-audit-fixture', '1');
  for (const [key, value] of Object.entries({
    'yueqi.settings.v1': { locale: 'zh-CN', localeChosen: true },
    'yueqi.firstLight.v1': { done: true, stage: 'COMPLETED', version: 1 },
    'yueqi.firstLight.v2': { schemaVersion: 2, done: true, stage: 'COMPLETED' },
    'yueqi.onboarding.v1': { done: true, accountMode: 'offline', productMode: 'developer', productModeChosen: true, uiModeChosen: true },
    'yueqi.ecosystem.v1': { loggedIn: false, authMode: 'offline', modelSource: 'byok' },
    'yueqi.autonomy.v1': { onboardingComplete: true, preset: 'quiet' },
    'yueqi.phone.os.v1': { passcodeEnabled: false },
    'yueqi.provider.v1': { kind: 'custom', baseUrl: 'https://qa.invalid/v1', apiKey: 'qa-synthetic-not-a-secret', model: 'qa-synthetic' },
  })) localStorage.setItem(key, JSON.stringify(value));
  localStorage.setItem('yueqi.app.mode', 'app'); localStorage.setItem('yueqi.app.mode.chosen', '1');
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(15000);
const run = async (name, work) => {
  try { const detail = await work(); results.push({ name, completed: true, pass:true, ...detail }); console.log(JSON.stringify(results.at(-1))); }
  catch(e) { results.push({ name, completed: false, pass:false, error: e.stack }); console.log(JSON.stringify(results.at(-1))); }
};
try {
  await page.goto('http://127.0.0.1:5245/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__yueqiPhone && window.__yueqiFullBootstrapState === 'ready', null, { timeout: 150000 });
  await page.evaluate(() => {
    window.__qaOriginalFetch = window.fetch;
    window.__qaQueue = []; window.__qaCalls = []; window.__qaTurnEvents = [];
    window.addEventListener('yueqi.character.replied', e => window.__qaTurnEvents.push({ ...e.detail }));
    window.__qaStream = (spec, signal) => {
      const enc = new TextEncoder();
      let cancelled = false;
      const stream = new ReadableStream({
        async start(controller) {
          const abort = () => { cancelled = true; controller.error(new DOMException('Synthetic fetch aborted', 'AbortError')); };
          if (signal?.aborted) { abort(); return; }
          signal?.addEventListener('abort', abort, { once: true });
          try {
            for (const item of spec.parts || []) {
              if (cancelled) return;
              const text = typeof item === 'string' ? item : `data: ${JSON.stringify(item)}\n\n`;
              const bytes = enc.encode(text);
              if (spec.bytewise) for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
              else controller.enqueue(bytes);
              if (spec.delay) await new Promise(r => setTimeout(r, spec.delay));
            }
            if (spec.stall) await new Promise(r => setTimeout(r, spec.stall));
            if (spec.throwAtEnd) controller.error(new Error('synthetic_connection_reset'));
            else controller.close();
          } catch (e) { if (!cancelled) controller.error(e); }
        }, cancel() { cancelled = true; },
      });
      return new Response(stream, { status: spec.status || 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    window.fetch = async (url, opts = {}) => {
      const value = String(url);
      if (value.endsWith('/model/chat') || value.endsWith('/chat/completions')) {
        const body = JSON.parse(opts.body || '{}');
        const latestUserText = [...(body.messages || [])].reverse().find(message => message.role === 'user')?.content || '';
        const specIndex = window.__qaQueue.findIndex(item => !item.expectedPrompt || String(latestUserText).includes(item.expectedPrompt));
        window.__qaCalls.push({ stream: body.stream, purpose: body.businessPurpose || '', messages: body.messages, signalAborted: opts.signal?.aborted || false });
        if (body.businessPurpose && body.businessPurpose !== 'chat.companion_reply' && body.businessPurpose !== 'qa.stream') {
          return Response.json({ ok: true, content: '{"operations":[]}', choices: [{ message: { content: '{"operations":[]}' } }] });
        }
        const spec = specIndex >= 0 ? window.__qaQueue.splice(specIndex, 1)[0] : null;
        if (!spec) throw new Error('missing_synthetic_response');
        if (spec.json) { if(spec.delay) await new Promise(r=>setTimeout(r,spec.delay)); return Response.json(spec.json); }
        if (spec.status) return Response.json({ error: 'synthetic_rate_limit' }, { status: spec.status });
        return window.__qaStream(spec, opts.signal);
      }
      if (value.endsWith('/local/session')) return Response.json({ token: 'qa-local-synthetic' });
      return window.__qaOriginalFetch(url, opts);
    };
  });

  const chunk = content => ({choices:[{delta:{content}}]});
  const good = text => ({parts:[chunk(text),'data: [DONE]\n\n']});
  await run('web offline BYOK uses real stream and hides private reasoning',async()=>{
    const r=await page.evaluate(async()=>{
      const {callModel}=await import('/src/model/client.js');
      window.__qaQueue.push({bytewise:true,parts:[{choices:[{delta:{reasoning_content:'PRIVATE_NATIVE_FIXTURE'}}]},{choices:[{delta:{content:'<think>PRIVATE_INLINE_FIXTURE</think>公开你好🌙'}}]},'data: [DONE]\n\n']});
      const visible=[];const reasoning=[];
      const r=await callModel({kind:'custom',baseUrl:'https://qa.invalid/v1',apiKey:'qa-synthetic',model:'qa'},[],{stream:true,onDelta:t=>visible.push(t),onReasoning:r=>reasoning.push(r)});
      return {wire:window.__qaCalls.at(-1).stream,visible,reasoning,result:r};
    });
    assert.equal(r.wire,true);assert.equal(r.result.content,'公开你好🌙');assert.ok(!JSON.stringify(r).includes('PRIVATE_'));assert.equal(r.result.transport,'direct-sse');return {wireStream:true,privateLeak:false};
  });
  await run('native transport adapter simulation honestly reports buffered delivery and ignores late cancellation result',async()=>{
    const r=await page.evaluate(async()=>{
      const {callModel}=await import('/src/model/client.js');const original=window.Capacitor.isNativePlatform;window.Capacitor.isNativePlatform=()=>true;
      const cfg={kind:'custom',baseUrl:'https://qa.invalid/v1',apiKey:'qa-synthetic',model:'qa'};
      try {
        window.__qaQueue.push({json:{choices:[{message:{content:'原生缓冲答复'},finish_reason:'stop'}]}});const transport=[];const r=await callModel(cfg,[],{stream:true,onTransport:t=>transport.push(t)});const wire=window.__qaCalls.at(-1).stream;
        window.__qaQueue.push({delay:160,json:{choices:[{message:{content:'不应在取消后出现'},finish_reason:'stop'}]}});const c=new AbortController();let lateDelta=false;setTimeout(()=>c.abort(),25);let cancelled=false;
        try{await callModel(cfg,[],{stream:true,signal:c.signal,onDelta:()=>lateDelta=true});}catch(e){cancelled=e.name==='AbortError';}
        await new Promise(r=>setTimeout(r,200));return {wire,transport,content:r.content,cancelled,lateDelta};
      } finally {window.Capacitor.isNativePlatform=original;}
    });assert.equal(r.wire,false);assert.equal(r.transport[0].streaming,false);assert.equal(r.transport[0].cancellableTransport,false);assert.equal(r.cancelled,true);assert.equal(r.lateDelta,false);return {...r,deviceProof:false};
  });
  await run('429 retry and whole-body deadline/cancel',async()=>{
    const r=await page.evaluate(async()=>{
      const {callModelStream}=await import('/src/model/client.js'); const cfg={model:'qa'};
      window.__qaQueue.push({status:429},{parts:[{choices:[{delta:{content:'重试成功'},finish_reason:'stop'}]}]});const n=window.__qaCalls.length;
      const success=await callModelStream(cfg,[],{businessPurpose:'qa.stream'});
      const cases=[];
      for(const mode of ['timeout','cancel']){
        window.__qaQueue.push({parts:[{choices:[{delta:{content:'半句'}}]}],stall:800});
        const c=new AbortController();if(mode==='cancel')setTimeout(()=>c.abort(),40);
        const start=performance.now();try{await callModelStream(cfg,[],{businessPurpose:'qa.stream',timeoutMs:mode==='timeout'?50:1000,signal:c.signal});cases.push({ok:true});}catch(e){cases.push({mode,name:e.name,ms:Math.round(performance.now()-start)});}
      }
      return {retryCalls:window.__qaCalls.length-n-2,success:success.content,cases};
    });assert.equal(r.retryCalls,2);assert.equal(r.success,'重试成功');assert.deepEqual(r.cases.map(x=>x.name),['TimeoutError','AbortError']);assert.ok(r.cases.every(x=>x.ms<500));return r;
  });
  await page.evaluate(()=>{
    localStorage.setItem('yueqi.ecosystem.v1',JSON.stringify({loggedIn:true,token:'qa-synthetic',authMode:'online',modelSource:'hosted',userId:'qa-isolated'}));
    document.querySelector('[data-tab="chat"]')?.click();window.__qaProgress=[];window.__qaLeaks=[];
    document.addEventListener('yueqi:chat-turn-progress',e=>{
      const d=e.detail;if(d.phase==='done')window.__qaProgress.push({phase:d.phase,persisted:(localStorage.getItem('yueqi.conversation.v2')||'').includes(d.visibleText),text:d.visibleText});
    });
    new MutationObserver(()=>{const text=document.querySelector('#messageList')?.textContent||'';if(/PRIVATE_|<\/?(?:think|yueqi-runtime)/i.test(text))window.__qaLeaks.push(true);}).observe(document.querySelector('#messageList'),{subtree:true,childList:true,characterData:true});
  });
  const history=()=>page.evaluate(async()=>{const {getChatFocus}=await import('/src/characters/session-context.js');const {resolveConversationBinding}=await import('/src/context/session-map.js');const {getSession,selectVisibleHistory}=await import('/src/conversation/index.js');const f=getChatFocus(),b=resolveConversationBinding({chatSessionId:f.sessionId,characterId:f.characterId});return selectVisibleHistory(getSession(b.conversationSessionId));});
  const queue=spec=>page.evaluate(spec=>window.__qaQueue.push(spec),spec);
  const count=()=>page.evaluate(()=>window.__qaTurnEvents.filter(x=>!x.skipped).length);
  const wait=before=>page.waitForFunction(n=>window.__qaTurnEvents.filter(x=>!x.skipped).length>n,before,{timeout:40000});
  const send=async(text,spec)=>{await page.waitForTimeout(500);const n=await count();await queue({...spec,expectedPrompt:text});await page.locator('#messageInput').fill(text);await page.locator('#messageInput').press('Enter');await wait(n);return page.evaluate(()=>window.__qaTurnEvents.filter(x=>!x.skipped).at(-1));};
  await run('normal envelope, hidden think prefixes, V2 before done, complete metadata',async()=>{
    const r=await send('我看见窗边有一束光。',{delay:80,bytewise:true,parts:[chunk('<thi'),chunk('nk>PRIVATE_INLINE_FIXTURE</think><yueqi-inner-state>想陪他静静看一会。</yueqi-inner-state>窗边那束光很好看。<yueqi-run'),chunk('time>{"version":1,"emotion":"warm","characterState":{"feeling":"安静","focus":"窗边的光","stance":"陪伴"}}</yueqi-runtime>'),'data: [DONE]\n\n']});
    assert.equal(r.content,'窗边那束光很好看');const h=await history();assert.equal(h.at(-1).meta.turnActivity.state,'complete');const obs=await page.evaluate(()=>({done:window.__qaProgress,leaks:window.__qaLeaks.length}));assert.equal(obs.leaks,0);assert.ok(obs.done.every(x=>x.persisted));return {content:r.content,completeAfterV2:true,privateLeak:false,affect:!!h.at(-1).meta.characterAffect};
  });
  for(const [name,spec] of [
    ['EOF',{parts:[chunk('NO_COMMIT_EOF')]}],
    ['error event',{parts:[chunk('NO_COMMIT_ERROR'),'event: error\ndata: {"message":"failure"}\n\n']}],
    ['truncated',{parts:[{choices:[{delta:{content:'NO_COMMIT_LENGTH'},finish_reason:'length'}]},'data: [DONE]\n\n']}],
    ['incomplete inner',{parts:[chunk('<yueqi-inner-state>只写了心里话'),'data: [DONE]\n\n']}],
    ['empty envelope',{parts:[chunk('<yueqi-inner-state>想了一下。</yueqi-inner-state>'),'data: [DONE]\n\n']}],
  ]) await run(`real submit rejects ${name} without assistant commit`,async()=>{const before=(await history()).filter(x=>x.role==='assistant').length;const r=await send(`这一轮测试${name}。`,spec);assert.equal(r.content,'');assert.equal((await history()).filter(x=>x.role==='assistant').length,before);return {rejected:true,noAssistantCommit:true};});
  await run('two real sends during active reply both receive one response',async()=>{
    await page.waitForTimeout(500);const n=await count();const first={...good('第一条的完整答复。'),delay:900,expectedPrompt:'第一条新消息。'};await queue(first);await queue({...good('第二条的完整答复。'),expectedPrompt:'第二条新消息。'});
    await page.locator('#messageInput').fill('第一条新消息。');await page.locator('#messageInput').press('Enter');await page.waitForTimeout(650);await page.locator('#messageInput').fill('第二条新消息。');await page.locator('#messageInput').press('Enter');
    await page.waitForFunction(n=>window.__qaTurnEvents.filter(x=>!x.skipped).length>=n+2,n,{timeout:40000});
    const h=await history();assert.equal(h.filter(x=>x.content==='第一条的完整答复').length,1);assert.equal(h.filter(x=>x.content==='第二条的完整答复').length,1);return {responses:2,duplicates:0};
  });
  await run('App stop button aborts and does not save partial',async()=>{
    await page.waitForTimeout(500);const n=await count();await queue({expectedPrompt:'请慢慢写一会。',delay:500,stall:10000,parts:[chunk('NO_COMMIT_CANCEL')]});await page.locator('#messageInput').fill('请慢慢写一会。');await page.locator('#messageInput').press('Enter');
    const stop=page.locator('[data-panel="chat"] [data-composer-speak]');await page.waitForFunction(()=>document.querySelector('[data-panel="chat"] [data-composer-speak]')?.classList.contains('is-busy'));assert.equal(await stop.isEnabled(),true);await page.evaluate(()=>document.querySelector('[data-panel="chat"] [data-composer-speak]')?.click());await wait(n);assert.equal(await page.evaluate(()=>window.__qaTurnEvents.filter(x=>!x.skipped).at(-1).cancelled),true);await page.waitForFunction(()=>!document.querySelector('[data-panel="chat"] [data-composer-speak]')?.classList.contains('is-busy'));assert.ok(!(await history()).some(x=>x.content.includes('NO_COMMIT_CANCEL')));return {buttonEnabled:true,cancelled:true};
  });
  const regenPrep = await send('准备测试重写。',good('这是一条应该保留的原回答。'));
  assert.equal(regenPrep.content,'这是一条应该保留的原回答');
  const regen=async spec=>{const n=await count();await queue({...spec,expectedPrompt:'准备测试重写。'});await page.evaluate(async()=>{const {getMessagesBySession}=await import('/src/storage/db.js');const {getChatFocus}=await import('/src/characters/session-context.js');const f=getChatFocus();const rows=await getMessagesBySession(f.sessionId,100);const message=rows.filter(x=>x.role==='assistant').at(-1);window.dispatchEvent(new CustomEvent('yueqi.character.regenerate',{detail:{message}}));});await wait(n);};
  await run('failed regeneration preserves old answer; success switches once retaining both candidates',async()=>{
    const before=(await history()).at(-1);await regen({parts:[chunk('NO_COMMIT_REGEN')]});const failed=(await history()).at(-1);assert.equal(failed.content,before.content);assert.equal(failed.candidateCount,before.candidateCount);
    await regen(good('这是完整的新候选回答。'));const success=(await history()).at(-1);assert.equal(success.id,before.id);assert.equal(success.content,'这是完整的新候选回答');assert.equal(success.candidateCount,before.candidateCount+1);assert.equal(success.meta.turnActivity.state,'complete');return {failurePreserved:true,candidateCount:success.candidateCount};
  });
  await run('phone stop button shares cancellation, final reply consistent after shell switch',async()=>{
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('yueqi.ui.switch-mode',{detail:{mode:'phone'}})));await page.waitForFunction(()=>document.body.dataset.appMode==='phone');await page.evaluate(async()=>{window.__yueqiPhone.openApp('pop');await window.__yueqiPhone.openDmThread((await import('/src/characters/store.js')).getActiveCharacterId());});await page.waitForTimeout(900);await page.screenshot({path:path.join(out,'phone-before-cancel.png')});const n=await count();await queue({delay:500,stall:10000,parts:[chunk('NO_COMMIT_PHONE_CANCEL')]});
    const inp=page.locator('[data-phone-chat-input]');await queue({expectedPrompt:'从小手机停止一次。',delay:500,stall:10000,parts:[chunk('NO_COMMIT_PHONE_CANCEL')]});await inp.fill('从小手机停止一次。');await inp.press('Enter');const stop=page.locator('[data-phone-speak-char]');await page.waitForFunction(()=>document.querySelector('[data-phone-speak-char]')?.classList.contains('is-busy'));assert.equal(await stop.isEnabled(),true);await page.evaluate(()=>document.querySelector('[data-phone-speak-char]')?.click());await wait(n);assert.equal(await page.evaluate(()=>window.__qaTurnEvents.filter(x=>!x.skipped).at(-1).cancelled),true);assert.ok(!(await history()).some(x=>x.content.includes('NO_COMMIT_PHONE_CANCEL')));await page.waitForTimeout(150);assert.ok((await page.locator('[data-phone-messages]').innerText()).includes('已停止生成'));await page.screenshot({path:path.join(out,'phone-cancel.png')});return {phoneCancelled:true};
  });
  await run('V2 projection failure recovers visibly on reload without duplicate candidate',async()=>{
    const r=await page.evaluate(async()=>{
      const {getChatFocus}=await import('/src/characters/session-context.js');const {writeCompanionTurn}=await import('/src/conversation/companion-write.js');const f=getChatFocus();
      return writeCompanionTurn({role:'assistant',text:'持久化投影恢复测试',companionId:f.characterId,chatSessionId:f.sessionId,messageId:'qa-projection-repair',saveChatMessage:()=>{throw Error('synthetic_idb_failure');}});
    });assert.equal(r.ok,true);assert.equal(r.projected,false);
    await page.reload({waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>window.__yueqiFullBootstrapState==='ready',null,{timeout:150000});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('yueqi.ui.switch-mode',{detail:{mode:'app'}})));await page.waitForFunction(()=>document.body.dataset.appMode==='app');
    await page.waitForFunction(()=>document.querySelector('#messageList')?.textContent.includes('持久化投影恢复测试'));const h=await history();assert.equal(h.filter(x=>x.content==='持久化投影恢复测试').length,1);assert.equal(h.at(-1).candidateCount,1);return {visibleAfterReload:true,duplicateCandidates:0};
  });
  await run('refresh recovers authoritative replies and candidate state',async()=>{
    const before=await history();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__yueqiFullBootstrapState==='ready',null,{timeout:150000});const after=await history();assert.deepEqual(after.map(x=>[x.id,x.content,x.candidateId]),before.map(x=>[x.id,x.content,x.candidateId]));return {rows:after.length,consistent:true};
  });
} finally {
  await writeFile(path.join(out,'stream-browser-results.json'),JSON.stringify({at:new Date().toISOString(),synthetic:true,realModelCalls:0,results,pageErrors:errors},null,2));
  await context.close();await browser.close();await vite.close();
}
if(results.some(x=>!x.pass))process.exitCode=1;

