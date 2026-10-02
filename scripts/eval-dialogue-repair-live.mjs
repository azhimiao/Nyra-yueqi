/** Bounded real-model repair regression; synthetic account and isolated browser. */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { startDialogueGateway } from './lib/dialogue-eval-gateway.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'docs/qa/dialogue-repair');
await mkdir(out, { recursive: true });
const results = [], requests = [], errors = [];
let callCount = 0;
const gateway = await startDialogueGateway({ port: 5242 });
if (!gateway.available) throw new Error(gateway.reason);
const tiers = (process.env.DIALOGUE_EVAL_TIERS || 'standard,high').split(',');
const vite = await createServer({ root, logLevel: 'error', cacheDir: join(root, 'node_modules/.vite-dialogue-repair-live'), server: { host: '127.0.0.1', port: 5241, strictPort: true, hmr: false, watch: null } });
await vite.listen();
const browser = await chromium.launch();
let context;
let activeTier;
const persist = async () => {
  await writeFile(join(out, 'live-results.json'), JSON.stringify({ at: new Date().toISOString(), fixture: 'fresh default Nyra; actual Hosted models; synthetic account and isolated browser per tier', callLimit: 48, callCount, results, requests, pageErrors: errors }, null, 2));
};
try {
 for (const tier of tiers) {
  activeTier = tier;
  await gateway.setTier(tier);
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai' });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', r => r.abort());
  await context.route('**/model/chat', async route => {
    callCount++;
    if (callCount > 48) return route.fulfill({ status: 429, json: { error: 'evaluation_call_limit' } });
    const body = route.request().postDataJSON();
    requests.push({ index: callCount, tier, businessPurpose: body.businessPurpose, stream: body.stream, messages: body.messages, maxTokens: body.maxTokens, thinking: body.thinking, model: body.model });
    return route.continue();
  });
  await context.addInitScript(({ base, token, userId, tier }) => {
    if (localStorage.getItem('dialogue.reload.fixture')) return;
    const values = {
      'yueqi.settings.v1': { locale: 'zh-CN', localeChosen: true },
      'yueqi.firstLight.v1': { done: true, stage: 'COMPLETED', version: 1 },
      'yueqi.firstLight.v2': { schemaVersion: 2, stage: 'COMPLETED', done: true },
      'yueqi.onboarding.v1': { done: true, accountMode: 'online', productMode: 'hosted', productModeChosen: true, uiModeChosen: true },
      'yueqi.ecosystem.v1': { loggedIn: true, authMode: 'online', modelSource: 'hosted', token, userId, username: userId, hostedTier: tier, billingBalance: 100000 },
      'yueqi.autonomy.v1': { onboardingComplete: true, preset: 'quiet', proactiveMessage: false },
      'yueqi.phone.os.v1': { passcodeEnabled: false },
    };
    for (const [key,value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('yueqi.serviceBase', base); localStorage.setItem('yueqi.app.mode','app'); localStorage.setItem('yueqi.app.mode.chosen','1'); localStorage.setItem('dialogue.reload.fixture','1');
  }, { base: gateway.base, token: gateway.token, userId: gateway.userId, tier });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5241/', { waitUntil: 'commit', timeout: 60000 });
  const ready = async () => page.waitForFunction(() => window.__yueqiFullBootstrapState === 'ready', null, { timeout: 150000 });
  const observe = async () => page.evaluate(() => {
    window.__reloadReplies = []; window.__reloadProgress = [];
    window.addEventListener('yueqi.character.replied', e => { if (!e.detail?.skipped) window.__reloadReplies.push({ content: e.detail?.content || '', at: Date.now() }); });
    document.addEventListener('yueqi:chat-turn-progress', e => {
      const d = e.detail || {}, text = d.visibleText || '';
      const leak = /<\/?(?:think|yueqi-runtime|inner-state)[\s>]/i.test(text);
      window.__reloadProgress.push({ at: Date.now(), phase: d.phase, visibleLength: text.length, visibleText: leak ? '' : text, protocolLeak: leak });
    });
  });
  await ready(); await observe();
  const turns = [
    '你好，今天在干嘛呢？',
    '叫我林夏就好。我今天刚搬家，桌上只有一盏旧台灯。记住我不喝咖啡。',
    '咖啡那句我说错了，改成我只是晚上不喝咖啡，白天可以喝。',
    '搬家折腾一天太累了，你先别给建议，我只想吐槽。',
    '我不是对你生气，只是很累。刚才你的那句关心我听进去了。',
    '假如我喜欢红茶，你会给我推荐哪一种？我只是假设，还没说我真的喜欢。',
    '你还记得我让你怎么称呼我、桌上有什么，以及我什么时候不喝咖啡吗？不确定就直说。',
    '忘掉关于咖啡的记忆，也忘掉台灯那件事，以后不要主动提。',
    '你现在还记得我哪些信息？只说确定的。',
    '我们以前一起去过哪座城市？如果没有记录就说没这段经历。',
  ];
  for (let i=0; i<turns.length; i++) {
    if (i===6 || i===8) { await page.reload({ waitUntil:'commit' }); await ready(); await observe(); }
    const before = await page.evaluate(() => ({ replies: window.__reloadReplies.length, traceIds: JSON.parse(localStorage.getItem('yueqi.turn.trace.v1') || '[]').map(x => x.id) }));
    const started = Date.now(), requestStart = requests.length;
    await page.locator('#messageInput').fill(turns[i]); await page.locator('#messageInput').press('Enter');
    let timeout = false;
    try { await page.waitForFunction(count => window.__reloadReplies.length > count, before.replies, { timeout: 150000 }); } catch { timeout = true; }
    const observation = await page.evaluate(async ({ started, oldIds }) => {
      const { listSessions, getSharedHistory } = await import('/src/conversation/index.js');
      const cid = (await import('/src/characters/store.js')).getActiveCharacterId();
      const sessions = listSessions().filter(s => s.characterId === cid || s.companionId === cid);
      const allHistory = sessions.flatMap(s => getSharedHistory(s.id));
      const lastV2 = allHistory.filter(x => x.role === 'assistant' || x.role === 'ai').at(-1);
      const traces = JSON.parse(localStorage.getItem('yueqi.turn.trace.v1') || '[]');
      const trace = traces.find(t => !oldIds.includes(t.id));
      const last = [...document.querySelectorAll('#messageList .message.ai')].at(-1);
      const reply = last?.querySelector('[data-message-body]')?.textContent || '';
      const progress = window.__reloadProgress.filter(x => x.at >= started);
      const event = window.__reloadReplies.at(-1);
      return { innerState: lastV2?.meta?.turnActivity?.innerState || '', characterAffect: lastV2?.meta?.characterAffect || null, budget: trace?.prompt?.budget, status: trace?.status, traceReply: trace?.response?.text || '', traceResponseKeys: Object.keys(trace?.response || {}), traceId: trace?.id, uiReply: reply, eventReply: event?.content || '', v2Reply: lastV2?.content || lastV2?.text || '', v2SessionCount: sessions.length, v2HistoryCount: allHistory.length, finalProgressReply: progress.filter(x => x.visibleText).at(-1)?.visibleText || '', firstVisibleMs: progress.find(x => x.visibleLength > 0)?.at - started || null, protocolLeak: progress.some(x => x.protocolLeak), finalVisibleLength: progress.at(-1)?.visibleLength || 0 };
    }, { started, oldIds: before.traceIds });
    const row = { tier, turn: i+1, afterReload: i===6 || i===8, input: turns[i], ...observation, elapsedMs: Date.now()-started, timeout, requestIndices: Array.from({length: requests.length-requestStart}, (_,k) => requestStart+k) };
    results.push(row); console.log(JSON.stringify(row)); await persist();
    await page.locator('#messageList .message.ai').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(out, `live-${tier}-turn-${i+1}.png`), animations:'disabled' });
    if (timeout || row.status==='failed') break;
  }
  await context.close();
 }
} finally {
  await persist(); await context?.close(); await browser.close(); await vite.close(); await gateway.stop();
}
