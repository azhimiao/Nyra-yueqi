import assert from 'node:assert/strict';
import test from 'node:test';
import * as conv from './index.js';
import { __setSessionMapStorageForTests } from '../context/session-map.js';

function fixture() {
  const values = new Map();
  let failKey = '';
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (key === failKey) throw new Error('quota'); values.set(key, String(value)); },
    removeItem: key => values.delete(key),
  };
  conv.__setConversationStorageForTests(storage);
  const session = conv.getOrCreateActiveSession({ characterId: 'persistence-test' });
  conv.sendUser(session.id, 'saved question');
  const answer = conv.appendAssistantCandidate(session.id, 'saved answer');
  conv.__resetConversationEventsForTests();
  return { storage, session, answer, fail: key => { failKey = key; } };
}

for (const suffix of ['.tmp', '']) {
  test(`failed ${suffix || 'primary'} write preserves authority, events and reload state`, () => {
    const f = fixture();
    const before = conv.exportConversationBag();
    f.fail(conv.CONVERSATION_STORE_KEY + suffix);
    for (const mutate of [
      () => conv.sendUser(f.session.id, 'unsaved question'),
      () => conv.appendAssistantCandidate(f.session.id, 'unsaved answer'),
      () => conv.regenerate(f.session.id, 'unsaved replacement'),
      () => conv.updateMessageMeta(f.session.id, f.answer.node.id, { accepted: true }),
    ]) {
      assert.deepEqual(mutate(), { ok: false, reason: 'conversation_storage_write_failed' });
      assert.deepEqual(conv.exportConversationBag(), before);
      assert.deepEqual(conv.getConversationAuditLog(), []);
      conv.__reloadConversationBagFromStorage();
      assert.deepEqual(conv.exportConversationBag(), before);
    }
    f.fail('');
    assert.equal(conv.regenerate(f.session.id, 'durable replacement').ok, true);
    conv.__reloadConversationBagFromStorage();
    assert.equal(conv.getSharedHistory(f.session.id).at(-1).content, 'durable replacement');
  });
}

test('failed import or session activation cannot change cached authority', () => {
  const f = fixture();
  const second = conv.ensureSession({ characterId: 'persistence-test', id: 'second' });
  assert.equal(second.ok, true);
  const before = conv.exportConversationBag();
  f.fail(conv.CONVERSATION_STORE_KEY);
  assert.equal(conv.importConversationBag({ sessions: {}, activeByCharacter: {} }).ok, false);
  assert.equal(conv.ensureSession({ characterId: 'persistence-test', id: f.session.id }).ok, false);
  assert.deepEqual(conv.exportConversationBag(), before);
  conv.__reloadConversationBagFromStorage();
  assert.deepEqual(conv.exportConversationBag(), before);
});

test('unavailable browser storage refuses durable writes', () => {
  globalThis.window = {};
  conv.__setConversationStorageForTests(null);
  try {
    assert.deepEqual(conv.ensureSession({ characterId: 'no-storage' }), { ok: false, reason: 'conversation_storage_unavailable' });
    assert.deepEqual(conv.listSessions(), []);
  } finally { delete globalThis.window; }
});

test('companion write refuses the IDB projection when the V2 commit fails', async () => {
  const f = fixture();
  __setSessionMapStorageForTests(f.storage);
  const scope = { companionId: 'persistence-test', chatSessionId: 'char:persistence-test' };
  assert.equal((await conv.writeCompanionTurn({ ...scope, role: 'user', text: 'last durable input' })).ok, true);
  const before = conv.exportConversationBag();
  f.fail(conv.CONVERSATION_STORE_KEY);
  let mirrored = false;
  const result = await conv.writeCompanionTurn({
    ...scope, role: 'assistant', text: 'must not appear as saved',
    saveChatMessage() { mirrored = true; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.refusedIdbProjection, true);
  assert.equal(mirrored, false);
  assert.deepEqual(conv.exportConversationBag(), before);
});
