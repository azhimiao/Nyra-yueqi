/** Diagnostic only. Synthetic SSE, isolated browser; never calls a real model. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('docs/qa/dialogue-evaluation');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [], results = [];
await context.route('**/*', r => {
  const url = new URL(r.request().url());
  if (url.hostname === '127.0.0.1' && url.port === '5225') return r.continue();
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
  try { const detail = await work(); results.push({ name, completed: true, ...detail }); console.log(JSON.stringify(results.at(-1))); }
  catch(e) { results.push({ name, completed: false, error: e.stack }); console.log(JSON.stringify(results.at(-1))); }
};
try {
  await page.goto('http://127.0.0.1:5225/', { waitUntil: 'domcontentloaded' });
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
        window.__qaCalls.push({ stream: body.stream, purpose: body.businessPurpose || '', messages: body.messages, signalAborted: opts.signal?.aborted || false });
        if (body.businessPurpose && body.businessPurpose !== 'chat.companion_reply' && body.businessPurpose !== 'qa.stream') {
          return Response.json({ ok: true, content: '{"operations":[]}', choices: [{ message: { content: '{"operations":[]}' } }] });
        }
        const spec = window.__qaQueue.shift();
        if (!spec) throw new Error('missing_synthetic_response');
        if (spec.json) return Response.json(spec.json);
        if (spec.status) return Response.json({ error: 'synthetic_rate_limit' }, { status: spec.status });
        return window.__qaStream(spec, opts.signal);
      }
      if (value.endsWith('/local/session')) return Response.json({ token: 'qa-local-synthetic' });
      return window.__qaOriginalFetch(url, opts);
    };
  });

  await run('client: split UTF-8 bytes and SSE events', async () => page.evaluate(async () => {
    const { callModelStream } = await import('/src/model/client.js');
    window.__qaQueue.push({ bytewise: true, parts: [
      { choices: [{ delta: { reasoning_content: 'SYNTHETIC_PRIVATE_MARKER' } }] },
      { choices: [{ delta: { content: '你好，窗边的风' } }] },
      { choices: [{ delta: { content: '很轻。🌙' } }] }, 'data: [DONE]\n\n',
    ] });
    const deltas = [], reasoning = [];
    const r = await callModelStream({ model: 'qa' }, [], { businessPurpose: 'qa.stream', onDelta: x => deltas.push(x), onReasoning: x => reasoning.push(x.text.length) });
    return { intact: r.content === '你好，窗边的风很轻。🌙', deltaCount: deltas.length, privateReasoningLength: r.reasoning.length, reasonEvents: reasoning.length };
  }));
  await run('client: final data without newline', async () => page.evaluate(async () => {
    const { callModelStream } = await import('/src/model/client.js');
    window.__qaQueue.push({ parts: [{ choices: [{ delta: { content: '开头' } }] }, 'data: {"choices":[{"delta":{"content":"结尾"}}]}'] });
    const r = await callModelStream({ model: 'qa' }, [], { businessPurpose: 'qa.stream' });
    return { intact: r.content === '开头结尾', returnedLength: r.content.length, expectedLength: 4 };
  }));
  await run('client: provider error event after partial content', async () => page.evaluate(async () => {
    const { callModelStream } = await import('/src/model/client.js');
    window.__qaQueue.push({ parts: [{ choices: [{ delta: { content: '这是尚未完成的半句话' } }] }, { error: { message: 'synthetic_upstream_failure', code: 'upstream_error' } }] });
    try { const r = await callModelStream({ model: 'qa' }, [], { businessPurpose: 'qa.stream' }); return { rejected: false, returnedOk: r.ok, returnedLength: r.content.length }; }
    catch(e) { return { rejected: true, error: e.message }; }
  }));
  await run('client: timeout and caller cancellation cover body', async () => page.evaluate(async () => {
    const { callModelStream } = await import('/src/model/client.js');
    window.__qaQueue.push({ stall: 280, parts: [{ choices: [{ delta: { content: '回答尚未传完' } }] }] });
    const controller = new AbortController(); setTimeout(() => controller.abort(), 50);
    const start = performance.now();
    try { const r = await callModelStream({ model: 'qa' }, [], { businessPurpose: 'qa.stream', timeoutMs: 80, signal: controller.signal }); return { rejected: false, elapsedMs: Math.round(performance.now() - start), returnedOk: r.ok }; }
    catch(e) { return { rejected: true, elapsedMs: Math.round(performance.now() - start), error: e.name }; }
  }));
  await run('client: 429 retry count', async () => page.evaluate(async () => {
    const { callModelStream } = await import('/src/model/client.js');
    const count = window.__qaCalls.length;
    window.__qaQueue.push({ status: 429 }, { parts: [{ choices: [{ delta: { content: '重试成功' } }] }] });
    const r = await callModelStream({ model: 'qa' }, [], { businessPurpose: 'qa.stream' });
    return { calls: window.__qaCalls.length - count, intact: r.content === '重试成功' };
  }));
  await run('client: offline BYOK stream option', async () => page.evaluate(async () => {
    const { callModel } = await import('/src/model/client.js');
    window.__qaQueue.push({ json: { choices: [{ message: { content: '离线接口合成答复' } }] } });
    let deltas = 0;
    const r = await callModel({ kind: 'custom', baseUrl: 'https://qa.invalid/v1', apiKey: 'qa-synthetic', model: 'qa' }, [], { stream: true, onDelta: () => deltas++ });
    return { requestedStream: true, actualWireStream: window.__qaCalls.at(-1).stream, deltaCount: deltas, success: Boolean(r.content) };
  }));

  await page.evaluate(() => {
    localStorage.setItem('yueqi.ecosystem.v1', JSON.stringify({ loggedIn: true, token: 'qa-synthetic', authMode: 'online', modelSource: 'hosted', userId: 'qa-isolated' }));
    document.querySelector('[data-tab="chat"]')?.click();
    window.__qaVisibleSamples = [];
    new MutationObserver(() => {
      const rows = [...document.querySelectorAll('[data-panel="chat"] .message.ai')];
      const text = rows.at(-1)?.textContent || '';
      window.__qaVisibleSamples.push({ privateMarker: text.includes('SYNTHETIC_PRIVATE_MARKER'), thinkMarker: text.includes('SYNTHETIC_THINK_MARKER'), runtimeMarker: text.includes('yueqi-runtime'), heartMarker: text.includes('[心声]'), chars: text.length });
    }).observe(document.querySelector('[data-panel="chat"]'), { childList: true, subtree: true, characterData: true });
  });
  const send = async (text, spec) => {
    // Composer has an intentional 450 ms anti-double-tap lock.
    await page.waitForTimeout(500);
    const before = await page.evaluate(spec => { window.__qaQueue.push(spec); window.__qaVisibleSamples = []; return window.__qaTurnEvents.length; }, spec);
    await page.locator('#messageInput').fill(text);
    await page.locator('#messageInput').press('Enter');
    await page.waitForFunction(() => document.querySelector('#messageInput')?.value === '');
    await page.waitForFunction(before => window.__qaTurnEvents.length > before && !window.__qaTurnEvents.at(-1).skipped, before, { timeout: 45000 });
    return page.evaluate(() => ({
      event: window.__qaTurnEvents.at(-1), samples: window.__qaVisibleSamples,
      final: document.querySelector('[data-panel="chat"] .message.ai:last-child')?.textContent || [...document.querySelectorAll('[data-panel="chat"] .message.ai')].at(-1)?.textContent || '',
      stored: localStorage.getItem('yueqi.conversation.v2') || '',
    }));
  };
  await run('real send: private reasoning stays out of UI and Conversation V2', async () => {
    const r = await send('你好，今天看到一只小猫。', { delay: 60, parts: [
      { choices: [{ delta: { reasoning_content: 'SYNTHETIC_PRIVATE_MARKER' } }] },
      { choices: [{ delta: { content: '它是不是躲在树下？' } }] }, 'data: [DONE]\n\n',
    ] });
    return { visibleLeak: r.samples.some(x => x.privateMarker), storedLeak: r.stored.includes('SYNTHETIC_PRIVATE_MARKER'), response: r.event.content, stored: r.stored.includes('它是不是躲在树下？') };
  });
  await run('real send: think tags across chunks', async () => {
    const r = await send('刚才的小猫又跑回来了。', { delay: 100, parts: [
      { choices: [{ delta: { content: '<thi' } }] },
      { choices: [{ delta: { content: 'nk>SYNTHETIC_THINK_MARKER' } }] },
      { choices: [{ delta: { content: '</think>它看起来喜欢这里。' } }] }, 'data: [DONE]\n\n',
    ] });
    return { streamedLeak: r.samples.some(x => x.thinkMarker), finalLeak: r.final.includes('SYNTHETIC_THINK_MARKER'), storedLeak: r.stored.includes('SYNTHETIC_THINK_MARKER'), response: r.event.content };
  });
  await run('real send: supported character inner state and runtime across chunks', async () => {
    const r = await send('我有一点想把它抱回家。', { delay: 60, parts: [
      { choices: [{ delta: { content: '<yueqi-in' } }] },
      { choices: [{ delta: { content: 'ner-state>有点担心它是不是有主人。</yueqi-inner-state>先看看它有没有项圈。' } }] },
      { choices: [{ delta: { content: '<yueqi-run' } }] },
      { choices: [{ delta: { content: 'time>{"version":1,"emotion":"warm"}</yueqi-runtime>' } }] }, 'data: [DONE]\n\n',
    ] });
    await page.screenshot({ path: path.join(out, 'stream-supported-envelope.png') });
    return { response: r.event.content, runtimeLeak: r.samples.some(x => x.runtimeMarker), storedHasInnerState: r.stored.includes('有点担心它是不是有主人'), characterInnerStateShown: r.final.includes('有点担心它是不是有主人'), storedReply: r.stored.includes('先看看它有没有项圈') };
  });
  await run('real send: unrecognized heart label', async () => {
    const r = await send('先不抱走，我就在旁边看它。', { delay: 70, parts: [
      { choices: [{ delta: { content: '[心声]它慢慢放松下来了。\n那就在旁边陪它一会儿。' } }] }, 'data: [DONE]\n\n',
    ] });
    return { labelInReply: r.event.content.includes('[心声]'), labelStored: r.stored.includes('[心声]'), response: r.event.content };
  });
  await run('real send: clean EOF before done is treated as complete', async () => {
    const r = await send('那你陪我看一会儿吧。', { parts: [{ choices: [{ delta: { content: '我就在这里，等你说完然后' } }] }] });
    return { partialSaved: r.stored.includes('我就在这里，等你说完然后'), response: r.event.content, noFailure: !r.final.includes('没有完成') };
  });
  await run('real send: connection reset preserves user, not partial assistant', async () => {
    const r = await send('它刚才打了个哈欠。', { delay: 60, throwAtEnd: true, parts: [{ choices: [{ delta: { content: 'SYNTHETIC_UNCOMMITTED_PARTIAL' } }] }] });
    return { successReplyEmpty: r.event.content === '', partialPersisted: r.stored.includes('SYNTHETIC_UNCOMMITTED_PARTIAL'), userPersisted: r.stored.includes('它刚才打了个哈欠'), failureVisible: /synthetic_connection_reset/.test(r.final) };
  });
  await run('real send: error event after text is committed as success', async () => {
    const r = await send('它好像准备睡觉了。', { delay: 60, parts: [
      { choices: [{ delta: { content: '它闭上眼睛的时候你可以' } }] },
      { error: { message: 'synthetic_upstream_failure' } },
    ] });
    return { incompleteSaved: r.stored.includes('它闭上眼睛的时候你可以'), successReply: Boolean(r.event.content), response: r.event.content };
  });
  await run('real send: unfinished character envelope becomes filler', async () => {
    const r = await send('那我就安静一点。', { parts: [
      { choices: [{ delta: { content: '<yueqi-inner-state>这一会儿安静得让人舍不得打破。' } }] },
    ] });
    return { generatedSpokenText: false, fillerSaved: r.event.content === '嗯。' && r.stored.includes('嗯。'), response: r.event.content };
  });
  await run('real send: double Enter does not create duplicate reply', async () => {
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => {
      window.__qaQueue.push({ delay: 90, parts: [{ choices: [{ delta: { content: '我们就坐在这儿看一会儿。' } }] }] });
      return { events: window.__qaTurnEvents.length, calls: window.__qaCalls.filter(x => x.purpose === 'chat.companion_reply').length };
    });
    await page.locator('#messageInput').fill('树荫底下还挺凉快的。');
    await page.locator('#messageInput').press('Enter');
    await page.locator('#messageInput').press('Enter');
    await page.waitForFunction(before => window.__qaTurnEvents.length > before, before.events);
    return page.evaluate(before => ({ replyCalls: window.__qaCalls.filter(x => x.purpose === 'chat.companion_reply').length - before.calls, replyEvents: window.__qaTurnEvents.length - before.events, userBubbleCount: [...document.querySelectorAll('[data-panel="chat"] .message.user')].filter(x => x.textContent.includes('树荫底下还挺凉快的')).length }), before);
  });
  await run('real regenerate: failed replacement keeps previous reply visible', async () => {
    await page.waitForTimeout(500);
    const article = page.locator('[data-panel="chat"] .message.ai').filter({ hasText: '我们就坐在这儿看一会儿' });
    await article.locator('[data-message-menu-trigger]').click();
    const before = await page.evaluate(() => { window.__qaQueue.push({ throwAtEnd: true, parts: [] }); return window.__qaTurnEvents.length; });
    await article.locator('[data-message-action="regenerate"]').click();
    await page.waitForFunction(before => window.__qaTurnEvents.length > before, before);
    return page.evaluate(() => {
      const text = document.querySelector('[data-panel="chat"]').textContent;
      const stored = JSON.parse(localStorage.getItem('yueqi.conversation.v2'));
      return { previousReplyVisible: text.includes('我们就坐在这儿看一会儿'), failureVisible: text.includes('synthetic_connection_reset'), oldReplyStillInStore: JSON.stringify(stored).includes('我们就坐在这儿看一会儿') };
    });
  });
  await run('real send: second user message while first reply streams drains queue', async () => {
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => {
      window.__qaQueue.push(
        { delay: 1200, parts: [{ choices: [{ delta: { content: '我在听你说。' } }] }] },
        { parts: [{ choices: [{ delta: { content: '第二句话我也听见了。' } }] }] },
      );
      return { events: window.__qaTurnEvents.length, calls: window.__qaCalls.filter(x => x.purpose === 'chat.companion_reply').length };
    });
    await page.locator('#messageInput').fill('我还有第一件小事想说。');
    await page.locator('#messageInput').press('Enter');
    await page.waitForFunction(count => window.__qaCalls.filter(x => x.purpose === 'chat.companion_reply').length > count, before.calls);
    await page.waitForTimeout(500);
    await page.locator('#messageInput').fill('我还有第二件小事想说。');
    await page.locator('#messageInput').press('Enter');
    await page.waitForTimeout(1800);
    return page.evaluate(before => {
      const stored = localStorage.getItem('yueqi.conversation.v2') || '';
      const result = { replyCalls: window.__qaCalls.filter(x => x.purpose === 'chat.companion_reply').length - before.calls, completedReplies: window.__qaTurnEvents.slice(before.events).filter(x => !x.skipped).length, secondUserPersisted: stored.includes('我还有第二件小事想说'), secondReplyPersisted: stored.includes('第二句话我也听见了'), unusedResponses: window.__qaQueue.length };
      window.__qaQueue = []; return result;
    }, before);
  });
  await run('shell switch: persisted App replies appear in phone', async () => {
    await page.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('yueqi.ui.switch-mode', { detail: { mode: 'phone' } }));
      await window.__yueqiPhone.openDmThread((await import('/src/characters/store.js')).getActiveCharacterId());
    });
    await page.waitForFunction(() => document.body.dataset.appMode === 'phone');
    await page.waitForFunction(() => document.querySelector('[data-phone-screen="pop"]')?.textContent.includes('先看看它有没有项圈'));
    await page.screenshot({ path: path.join(out, 'stream-phone-persistence.png') });
    return await page.evaluate(() => {
      const text = document.querySelector('[data-phone-screen="pop"]').textContent;
      return { supportedReplyPresent: text.includes('先看看它有没有项圈'), nativeReasoningLeak: text.includes('SYNTHETIC_PRIVATE_MARKER'), thinkLeak: text.includes('SYNTHETIC_THINK_MARKER'), heartLabelPresent: text.includes('[心声]') };
    });
  });
  await run('refresh: V2 persisted messages survive reload', async () => {
    const before = await page.evaluate(() => localStorage.getItem('yueqi.conversation.v2'));
    // Do not let fixture auth tokens reach any external endpoint on reload.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__yueqiPhone && window.__yueqiFullBootstrapState === 'ready', null, { timeout: 150000 });
    const stored = await page.evaluate(() => localStorage.getItem('yueqi.conversation.v2'));
    return { evidenceUnchanged: stored === before, validReplyPresent: stored?.includes('先看看它有没有项圈'), privateReasoningPersisted: stored?.includes('SYNTHETIC_PRIVATE_MARKER'), failedPartialPersisted: stored?.includes('SYNTHETIC_UNCOMMITTED_PARTIAL') };
  });
} finally {
  await writeFile(path.join(out, 'stream-browser-results.json'), JSON.stringify({ syntheticOnly: true, at: new Date().toISOString(), results, pageErrors: errors }, null, 2));
  await context.close(); await browser.close();
}
assert(results.every(x => x.completed), 'Some diagnostic cases did not finish; inspect report');
