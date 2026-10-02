import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Actual goBack implementation with browser DOM fixtures; not a device claim.
const source = await readFile(new URL('../src/phone-shell/phone-shell.js', import.meta.url), 'utf8');
const start = source.indexOf('  function goBack() {');
const end = source.indexOf('  function exitToHome(', start);
assert.ok(start >= 0 && end > start, 'phone goBack source boundary exists');
const backSource = source.slice(start, end);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage();
  const run = async (id, markup, state, verify) => {
    await page.setContent('<main id="root">' + markup + '</main>');
    const result = await page.evaluate(({ backSource, state }) => {
      const setup = [
        'const calls = []; const authoringSurfaces = {};',
        'let currentView = state.view || "pop"; let popChatMode = state.mode || "thread";',
        'let appViewStack = state.stack || []; const editMode = false; const phoneShop = null;',
        'const setEditMode = () => {};',
        'const closeFolderSheet = () => { root.querySelector("[data-folder-sheet]").hidden = true; calls.push("folder"); };',
        'const closeMomentCompose = () => { root.querySelector("[data-moment-compose-sheet]").hidden = true; calls.push("moment"); };',
        'const closeContactSheets = () => { root.querySelectorAll("[data-pop-add-friend-sheet], [data-pop-contact-card-sheet]").forEach(n => n.hidden = true); };',
        'const closeAllComposeSheets = () => { root.querySelectorAll("[data-pop-compose-sheet], [data-pop-dm-sheet], [data-pop-group-sheet]").forEach(n => n.hidden = true); };',
        'const popChatPlugins = { closeAllSheets() { root.querySelectorAll("[data-pop-game-sheet], [data-pop-plugin-sheet]").forEach(n => n.hidden = true); calls.push("pop-sheets"); } };',
        'const setPopChatMode = mode => { popChatMode = mode; calls.push("mode:" + mode); };',
        'const paintView = view => { currentView = view; calls.push("view:" + view); };',
        'const osNav = { exitToHome() { calls.push("home"); } };',
      ].join('\n');
      const tail = 'goBack(); if (state.twice) goBack(); return { calls, currentView, popChatMode, sheets: [...root.querySelectorAll(".mini-pop-sheet")].map(n => ({ id: n.id, hidden: n.hidden })) };';
      return new Function('root', 'state', setup + '\n' + backSource + '\n' + tail)(document.querySelector('#root'), state);
    }, { backSource, state });
    verify(result);
    results.push({ id, status: 'PASS', ...result });
    console.log('PASS ' + id);
  };
  const pop = '<section data-phone-screen="pop"></section>';
  await run('hidden_memory_sheet_does_not_trap_pop', pop + '<section data-phone-screen="memory" hidden><div class="mini-pop-sheet" id="memory"></div></section>', {}, r => {
    assert.equal(r.popChatMode, 'list');
    assert.deepEqual(r.calls, ['mode:list']);
    assert.equal(r.sheets[0].hidden, false);
  });
  await run('pop_game_closes_before_thread_navigation', '<section data-phone-screen="pop"><div class="mini-pop-sheet" data-pop-game-sheet id="game"></div></section>', {}, r => {
    assert.equal(r.popChatMode, 'thread');
    assert.equal(r.sheets[0].hidden, true);
    assert.deepEqual(r.calls, ['pop-sheets']);
  });
  await run('next_back_reaches_session_list', '<section data-phone-screen="pop"><div class="mini-pop-sheet" data-pop-plugin-sheet id="plugin"></div></section>', { twice: true }, r => {
    assert.equal(r.popChatMode, 'list');
    assert.deepEqual(r.calls, ['pop-sheets', 'mode:list']);
  });
  await run('shared_moment_sheet_closes_on_pop_back', pop + '<div class="mini-pop-sheet" data-moment-compose-sheet id="moment"></div>', {}, r => {
    assert.equal(r.popChatMode, 'thread');
    assert.equal(r.sheets[0].hidden, true);
    assert.deepEqual(r.calls, ['moment']);
  });
  await run('shared_moment_sheet_closes_on_moments_back', '<section data-phone-screen="moments"></section><div class="mini-pop-sheet" data-moment-compose-sheet id="moment"></div>', { view: 'moments' }, r => {
    assert.equal(r.currentView, 'moments');
    assert.deepEqual(r.calls, ['moment']);
  });
  await run('list_back_returns_to_previous_screen', pop + '<section data-phone-screen="settings" hidden></section><section data-phone-screen="memory" hidden><div class="mini-pop-sheet" id="memory"></div></section>', { mode: 'list', stack: ['settings'] }, r => {
    assert.equal(r.currentView, 'settings');
    assert.deepEqual(r.calls, ['view:settings']);
  });
} finally { await browser.close(); }
const dir = new URL('../docs/qa/release-cost-20260928/', import.meta.url);
await mkdir(dir, { recursive: true });
await writeFile(new URL('phone-back-results.json', dir), JSON.stringify({ generatedAt: new Date().toISOString(), scope: 'actual phone goBack function, synthetic Chromium DOM fixtures; not full-app or Android validation', passed: results.length, results }, null, 2) + '\n');
