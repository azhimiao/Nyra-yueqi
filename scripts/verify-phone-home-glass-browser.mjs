/** Isolated real-app regression. Ordinary input; no force clicks or model calls. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as portProbe } from 'node:net';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/qa/phone-home-glass');
const results = [], runtimeErrors = [], blocked = [];
const filter = process.env.HOME_GLASS_CASE || '';
await mkdir(out, { recursive: true });
const port = await new Promise((resolve, reject) => {
  const server = portProbe(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close((error) => error ? reject(error) : resolve(p)); });
});
const vite = await createServer({ root, logLevel: 'error', cacheDir: path.join(out, '.vite-cache'), server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null } });
let browser;
const pause = (page, ms = 330) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), animations: 'disabled' });

async function freshPage(options = {}) {
  const { width = 390, height = 844, desktop = false, mode = 'phone', locale = 'zh-CN', wallpaper = 'dawn', cardStyle = 'system', widgets = {}, widgetOrder, longContent = false } = options;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: !desktop, hasTouch: !desktop });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const paid = ['model', 'voice', 'image', 'billing'].some((p) => url.pathname === '/' + p || url.pathname.startsWith('/' + p + '/'));
    if ((url.hostname === '127.0.0.1' && url.port === String(port) && !paid) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    blocked.push({ host: url.host, path: url.pathname, paid }); return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => runtimeErrors.push(error.stack || error.message));
  await page.addInitScript(({ mode, locale, wallpaper, cardStyle, widgets, widgetOrder, longContent }) => {
    if (localStorage.getItem('phone-home-glass-fixture')) return;
    const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem('phone-home-glass-fixture', '1');
    set('yueqi.settings.v1', { locale, localeChosen: true, appearance: { customized: cardStyle !== 'system', cardStyle, cardRadius: 20 } });
    localStorage.setItem('yueqi.app.mode', mode); localStorage.setItem('yueqi.app.mode.chosen', '1');
    set('yueqi.firstLight.v1', { done: true, paused: false, stage: 'COMPLETED', migratedFromLegacy: true, version: 1 });
    set('yueqi.firstLight.v2', { schemaVersion: 2, stage: 'COMPLETED', done: true, paused: false });
    set('yueqi.onboarding.v1', { done: true, accountMode: 'offline', productMode: 'developer', productModeChosen: true, uiModeChosen: true });
    set('yueqi.ecosystem.v1', { loggedIn: false, token: '', authMode: 'offline', productMode: 'developer' });
    set('yueqi.autonomy.v1', { onboardingComplete: true, preset: 'quiet' });
    set('yueqi.phone.os.v1', { wallpaper: { lockScreen: wallpaper, homeScreen: wallpaper }, widgets, widgetOrder, homePageIndex: 0 });
    if (longContent) set('yueqi.coListenState.v1', { title: 'QA 雨停后一起听一首很长很长的歌 — ExtraordinaryUnbrokenTrackTitleForNarrowPhone', playlist: '一起收藏的很长很长的歌单名称', positionSec: 30, durationSec: 120, paused: true });
  }, { mode, locale, wallpaper, cardStyle, widgets, widgetOrder, longContent });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('app-boot-ready') && window.__yueqiPhone, null, { timeout: 60000 });
  await page.waitForFunction((m) => document.body.dataset.appMode === m, mode);
  if (mode === 'phone') {
    await page.waitForFunction(() => document.querySelector('.mini-phone[data-phone-view=home]'));
    await page.locator('.mini-home__page:first-child [data-widget]:not([hidden])').first().waitFor();
    if (longContent) {
      // Repository fixture only, not user-interaction evidence. The long song
      // title is enough to exercise narrow text layout without mutating a character.
      await page.waitForFunction(() => document.querySelector('[data-home-listen-title]')?.textContent.includes('ExtraordinaryUnbroken'));
    }
  } else await page.locator('.app-shell').waitFor();
  await pause(page); return page;
}

async function measure(page) {
  return page.evaluate(() => {
    const visible = (el) => el && !el.closest('[hidden]') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width && el.getBoundingClientRect().height;
    const rect = (el) => el?.getBoundingClientRect().toJSON();
    const home = document.querySelector('[data-phone-screen=home]');
    const page0 = home.querySelector('.mini-home__page:first-child');
    const selectors = ['.mini-home-greeting', '[data-widget-clock]', '.mini-home-greeting > strong', '[data-home-presence-copy]', '.mini-today__head', '[data-home-today-title]', '[data-home-presence-status]', '.mini-today__empty', '.mini-today__action-label', '.mini-home-widget-title', '.mini-vinyl', '.mini-vinyl__meta', '[data-home-listen-title]', '[data-home-listen-meta]', '.mini-home-widget-action', '.mini-cal-widget__label', '.mini-cal-widget__body'];
    return {
      viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth },
      phone: rect(document.querySelector('.mini-phone')), pager: rect(home.querySelector('[data-home-pager]')), dock: rect(home.querySelector('[data-home-dock]')),
      scroll: { top: page0.scrollTop, clientHeight: page0.clientHeight, scrollHeight: page0.scrollHeight, overflowY: getComputedStyle(page0).overflowY },
      tone: document.querySelector('.mini-phone').dataset.wallpaperTone,
      widgets: [...page0.querySelectorAll('[data-widget]')].filter(visible).map((card) => {
        const style = getComputedStyle(card);
        return { id: card.dataset.widget, rect: rect(card), background: style.backgroundColor, image: style.backgroundImage, filter: style.backdropFilter || style.webkitBackdropFilter, radius: style.borderRadius,
          content: selectors.flatMap((selector) => [...card.querySelectorAll(selector)].filter(visible).map((el) => { const cs = getComputedStyle(el); return { selector, rect: rect(el), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: cs.overflowY, textOverflow: cs.textOverflow, clamp: cs.webkitLineClamp }; })) };
      }),
    };
  });
}
function inside(inner, outer, label, axes = 'xy') {
  const t = 1.5;
  if (axes.includes('x')) assert.ok(inner.left >= outer.left - t && inner.right <= outer.right + t, `${label}: x ${inner.left.toFixed(1)}..${inner.right.toFixed(1)} outside ${outer.left.toFixed(1)}..${outer.right.toFixed(1)}`);
  if (axes.includes('y')) assert.ok(inner.top >= outer.top - t && inner.bottom <= outer.bottom + t, `${label}: y ${inner.top.toFixed(1)}..${inner.bottom.toFixed(1)} outside ${outer.top.toFixed(1)}..${outer.bottom.toFixed(1)}`);
}
function assertBounds(info) {
  assert.ok(info.viewport.scrollWidth <= info.viewport.width + 1, 'document horizontal overflow');
  inside(info.phone, { left: 0, right: info.viewport.width, top: 0, bottom: info.viewport.height }, 'phone inside viewport');
  inside(info.dock, info.phone, 'dock inside phone');
  assert.ok(info.pager.bottom <= info.dock.top + 1.5, 'pager overlaps dock');
  for (const card of info.widgets) {
    assert.ok(card.rect.width > 0 && card.rect.height > 0, `${card.id} has area`);
    inside(card.rect, info.pager, `${card.id} in pager`, 'x');
    if (!['auto', 'scroll'].includes(info.scroll.overflowY)) inside(card.rect, info.pager, `${card.id} in fixed pager`, 'y');
    assert.ok(card.rect.height <= info.pager.height + 1.5, `${card.id} taller than reachable viewport`);
    for (const child of card.content) {
      inside(child.rect, card.rect, `${card.id} ${child.selector}`);
      const truncation = child.textOverflow === 'ellipsis' || Number(child.clamp) > 0;
      if (!truncation && ['hidden', 'clip'].includes(child.overflowY)) assert.ok(child.scrollHeight <= child.clientHeight + 2, `${card.id} ${child.selector} clips content (${child.scrollHeight}/${child.clientHeight})`);
    }
  }
  for (let a = 0; a < info.widgets.length; a++) for (let b = a + 1; b < info.widgets.length; b++) {
    const x = info.widgets[a].rect, y = info.widgets[b].rect;
    assert.ok(Math.min(x.right, y.right) - Math.max(x.left, y.left) < 1.5 || Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) < 1.5, `${info.widgets[a].id} overlaps ${info.widgets[b].id}`);
  }
}
async function assertReachable(page, ids) {
  const reached = [];
  for (const id of ids) {
    for (let attempt = 0; attempt < 18; attempt++) {
      const info = await measure(page), target = info.widgets.find((item) => item.id === id)?.rect; assert.ok(target, `missing ${id}`);
      if (target.top >= info.pager.top - 1.5 && target.bottom <= info.pager.bottom + 1.5) break;
      await page.mouse.move(info.pager.left + info.pager.width / 2, info.pager.top + info.pager.height / 2);
      await page.mouse.wheel(0, target.bottom > info.pager.bottom ? 100 : -100); await pause(page, 110);
      const next = await measure(page); assert.notEqual(next.scroll.top, info.scroll.top, `${id} clipped and ordinary wheel cannot reach it`);
    }
    const info = await measure(page), target = info.widgets.find((item) => item.id === id); inside(target.rect, info.pager, `${id} reachable`);
    const hit = await page.evaluate((id) => {
      const el = document.querySelector(`[data-widget=${id}]`), r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === el || el.contains(hit);
    }, id);
    assert.ok(hit, `${id} center covered`); reached.push({ id, scrollTop: info.scroll.top, rect: target.rect });
  }
  return reached;
}
function alpha(color) {
  if (color === 'transparent') return 0;
  if (color.includes('/')) { const tail = color.split('/').at(-1).replace(')', '').trim(); return parseFloat(tail) / (tail.includes('%') ? 100 : 1); }
  if (color.startsWith('rgba(')) return parseFloat(color.split(',').at(-1));
  return 1;
}
function assertGlass(info) {
  for (const card of info.widgets.filter((item) => item.id !== 'clock')) {
    assert.ok(alpha(card.background) > 0 && alpha(card.background) < .9, `${card.id} needs translucent background: ${card.background}`);
    assert.ok(card.filter && card.filter.includes('blur(') && !card.filter.includes('blur(0px)'), `${card.id} needs blur: ${card.filter}`);
  }
}
async function selectedPage(page) { return Number(await page.locator('[data-home-dot].is-active').getAttribute('data-page')); }
async function drag(page, from, to, steps = 10, stepMs = 18) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await pause(page, stepMs); }
  await page.mouse.up(); await pause(page);
}
async function run(name, options, verify) {
  if (filter && !name.includes(filter)) return;
  let page; const errorStart = runtimeErrors.length;
  try {
    page = await freshPage(options); const detail = await verify(page);
    assert.equal(runtimeErrors.length, errorStart, runtimeErrors.slice(errorStart).join(String.fromCharCode(10)));
    results.push({ name, pass: true, detail }); console.log(`PASS ${name}`);
  } catch (error) {
    const bounds = page && options.mode !== 'app' ? await measure(page).catch(() => null) : null;
    if (page) await shot(page, `${name}-FAIL`).catch(() => {});
    results.push({ name, pass: false, error: error.stack, bounds }); console.error(`FAIL ${name}: ${error.message}`);
  } finally { await page?.context().close(); }
}

try {
  await vite.listen(); browser = await chromium.launch();
  for (const [width, height, desktop] of [[320, 568, false], [360, 640, false], [390, 844, false], [412, 915, false], [1440, 1000, true]]) {
    const name = `layout-${width}x${height}${desktop ? '-desktop' : ''}`;
    await run(name, { width, height, desktop }, async (page) => {
      const info = await measure(page); await shot(page, name); assertBounds(info); assertGlass(info);
      if (desktop) assert.ok(info.phone.width < width * .6, 'measure actual desktop mini-phone, not viewport width');
      const reachable = await assertReachable(page, info.widgets.map((item) => item.id)); await shot(page, `${name}-reachable`);
      await page.locator('[data-cal-open-full]').click();
      await page.waitForFunction(() => document.querySelector('.mini-phone')?.dataset.phoneView === 'calendar');
      return { initial: info, reachable, calendarOpenedWithOrdinaryClick: true };
    });
  }
  await run('wallpaper-dark', { wallpaper: 'ink' }, async (page) => {
    const info = await measure(page); assert.equal(info.tone, 'dark'); assertBounds(info); assertGlass(info); await shot(page, 'wallpaper-dark'); return info;
  });
  for (const cardStyle of ['soft', 'outline', 'glass']) await run(`saved-${cardStyle}`, { cardStyle }, async (page) => {
    assert.equal(await page.locator('html').getAttribute('data-appearance-cards'), cardStyle);
    const info = await measure(page); assertBounds(info);
    for (const card of info.widgets.filter((item) => item.id !== 'clock')) assert.equal(card.radius, '20px', `${card.id} saved radius`);
    if (cardStyle === 'glass') assertGlass(info);
    else for (const card of info.widgets.filter((item) => item.id !== 'clock')) assert.equal(alpha(card.background), 1, `${card.id} explicit ${cardStyle} must remain opaque`);
    await shot(page, `saved-${cardStyle}`); return info;
  });
  await run('long-content-320', { width: 320, height: 568, longContent: true, locale: 'en' }, async (page) => {
    const info = await measure(page); assertBounds(info); assertGlass(info);
    const reachable = await assertReachable(page, info.widgets.map((item) => item.id));
    assert.match(await page.locator('[data-home-listen-title]').textContent(), /ExtraordinaryUnbroken/);
    await shot(page, 'long-content-320'); return { initial: info, reachable };
  });
  await run('hidden-reordered-320', { width: 320, height: 568, widgets: { clock: false, listen: false }, widgetOrder: ['calendar', 'today', 'listen', 'clock'] }, async (page) => {
    const info = await measure(page); assert.deepEqual(info.widgets.map((item) => item.id), ['calendar', 'today']); assertBounds(info);
    assert.equal(await page.locator('[data-widget=today]').getAttribute('data-widget-span'), 'wide');
    const reachable = await assertReachable(page, ['calendar', 'today']); await shot(page, 'hidden-reordered-320'); return { initial: info, reachable };
  });
  await run('pager-mouse-gestures', {}, async (page) => {
    const p = (await measure(page)).pager, from = { x: p.left + p.width * .75, y: p.top + 36 };
    await drag(page, from, { x: p.left + p.width * .25, y: from.y });
    assert.equal(await selectedPage(page), 1, 'horizontal drag must advance');
    assert.equal(await page.locator('.mini-phone').getAttribute('data-phone-view'), 'home', 'swipe must not click through into an app');
    await drag(page, { x: p.left + p.width * .25, y: from.y }, from); assert.equal(await selectedPage(page), 0, 'reverse drag must return');
    await drag(page, from, { x: from.x - 17, y: from.y }, 10, 35); assert.equal(await selectedPage(page), 0, 'short slow drag must cancel');
    await drag(page, from, { x: from.x, y: from.y + 95 }); assert.equal(await selectedPage(page), 0, 'vertical drag must not page');
    const c = await page.locator('[data-cal-week-swipe]').boundingBox();
    if (c) { await drag(page, { x: c.x + c.width * .8, y: c.y + c.height / 2 }, { x: c.x + c.width * .2, y: c.y + c.height / 2 }); assert.equal(await selectedPage(page), 0, 'calendar swipe retains ownership'); }
    await shot(page, 'pager-mouse-gestures');
    return { ordinaryMouseInput: true, forward: 1, reverse: 0, shortDragCancelled: true, verticalDidNotPage: true, calendarOwnerRetained: true, osPointerCancelNotCovered: true };
  });
  await run('app-mode-isolation', { mode: 'app' }, async (page) => {
    const info = await page.evaluate(() => {
      const shell = document.querySelector('.app-shell'), chat = shell.querySelector('[data-panel=chat]');
      const summarize = (el) => { const cs = getComputedStyle(el); return { rect: el.getBoundingClientRect().toJSON(), background: cs.backgroundColor, filter: cs.backdropFilter, display: cs.display }; };
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, shell: summarize(shell), chat: summarize(chat), visiblePhone: [...document.querySelectorAll('.mini-phone')].some((el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none') };
    });
    assert.ok(info.shell.rect.width > 0 && info.shell.rect.width <= info.width + 1, 'App shell actual mobile width');
    assert.equal(info.visiblePhone, false, 'mini-phone stays hidden in App mode');
    assert.ok(!info.chat.filter || info.chat.filter === 'none', 'home blur must not leak into App chat');
    assert.ok(info.scrollWidth <= info.width + 1, 'App document overflow');
    await shot(page, 'app-mode-isolation'); return info;
  });
} finally {
  await browser?.close(); await vite.close();
  const report = { generatedAt: new Date().toISOString(), evidence: 'Chromium real application with isolated local fixtures. No force clicks. Not Android/device evidence. OS pointercancel interruption not covered.', caseFilter: filter || null, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, runtimeErrors, blockedRequestCount: blocked.length, paidRequestsBlocked: blocked.filter((r) => r.paid).length, results };
  await writeFile(path.join(out, 'VERIFY.json'), JSON.stringify(report, null, 2));
  const nl = String.fromCharCode(10);
  await writeFile(path.join(out, 'README.md'), ['# Compact glass home browser regression', '', `Generated: ${report.generatedAt}`, '', `${report.passed} passed; ${report.failed} failed.`, '', report.evidence, '', 'Run: node scripts/verify-phone-home-glass-browser.mjs', '', 'Optional HOME_GLASS_CASE selects a case-name substring.', '', ...results.map((item) => `- ${item.pass ? 'PASS' : 'FAIL'} ${item.name}${item.pass ? '' : `: ${item.error?.split(nl)[0]}`}`), '', 'Usability evidence uses ordinary clicks, mouse drags and wheel. Repository writes only arrange fixtures. Explicit soft/outline remain opaque.'].join(nl));
}
assert.ok(results.length > 0, 'no selected cases ran');
assert.equal(runtimeErrors.length, 0, runtimeErrors.join(String.fromCharCode(10)));
assert.equal(results.filter((r) => !r.pass).length, 0, 'See docs/qa/phone-home-glass/VERIFY.json');
