import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
let failWrites = false;
const storage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) { if (failWrites) throw new Error('disk full'); values.set(key, String(value)); },
  removeItem: key => values.delete(key),
};
globalThis.window = { localStorage: storage, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = storage;
globalThis.document = { dispatchEvent() {} };
const conv = await import('../conversation/index.js');
const { applyMemoryDirectiveWithReceipt, readMemoryDirectiveReceipt, buildMemoryDirectiveReceiptMessage } = await import('./memory-directive-receipt.js');
const command = '忘掉关于咖啡的记忆，也忘掉台灯那件事。';
function fixture(text = command) {
  values.clear(); failWrites = false;
  conv.__setConversationStorageForTests(storage);
  const session = conv.getOrCreateActiveSession({ characterId: 'a' });
  const user = conv.sendUser(session.id, text);
  return { characterId: 'a', conversationSessionId: session.id, userEvidenceRef: user.node.id, userText: text };
}
const success = async () => ({ ok: true, source: 'forget_directive', results: [{ ok: true }] });

test('successful receipt persists, contains no targets and prevents duplicate execution after reload', async () => {
  const input = fixture(); let calls = 0;
  const receipt = await applyMemoryDirectiveWithReceipt(input, { extract: async () => { calls++; return success(); } });
  assert.equal(receipt.status, 'applied');
  conv.__setConversationStorageForTests(storage);
  assert.deepEqual(readMemoryDirectiveReceipt(input), receipt);
  assert.deepEqual(await applyMemoryDirectiveWithReceipt(input, { extract: async () => { calls++; return success(); } }), receipt);
  assert.equal(calls, 1);
  for (const lang of ['zh-CN', 'en']) {
    const message = buildMemoryDirectiveReceiptMessage(receipt, lang);
    assert.equal(message.provenance, 'runtime.memory_directive');
    assert.doesNotMatch(JSON.stringify({ receipt, message }), /咖啡|台灯/);
    assert.ok(buildMemoryDirectiveReceiptMessage(receipt, lang, 'regenerate'));
    assert.equal(buildMemoryDirectiveReceiptMessage(receipt, lang, 'continue'), null);
  }
});
test('partial failure and thrown failure never become successful receipts or silent retries', async () => {
  for (const extract of [async () => ({ ok: false, source: 'forget_directive', results: [{ ok: true }, { ok: false }] }), async () => { throw new Error('unavailable'); }]) {
    const input = fixture();
    const receipt = await applyMemoryDirectiveWithReceipt(input, { extract });
    assert.equal(receipt.status, 'failed');
    assert.match(buildMemoryDirectiveReceiptMessage(receipt, 'zh-CN').content, /没有全部成功/);
    assert.equal((await applyMemoryDirectiveWithReceipt(input, { extract: () => { throw new Error('must not run twice'); } })).status, 'failed');
  }
});
test('wrong scope, edited input and deleted source cannot reuse a receipt', async () => {
  const input = fixture(); await applyMemoryDirectiveWithReceipt(input, { extract: success });
  for (const patch of [{ characterId: 'b' }, { conversationSessionId: 'missing' }, { userEvidenceRef: 'missing' }, { userText: '不同的请求' }]) {
    assert.equal(readMemoryDirectiveReceipt({ ...input, ...patch }), null);
  }
  conv.editMessageContent(input.conversationSessionId, input.userEvidenceRef, '改成别的请求');
  assert.equal(readMemoryDirectiveReceipt(input), null);
  conv.deleteMessage(input.conversationSessionId, input.userEvidenceRef);
  assert.equal(readMemoryDirectiveReceipt(input), null);
});
test('receipt persistence failure is reported instead of presenting verified success', async () => {
  const input = fixture(); failWrites = true;
  await assert.rejects(applyMemoryDirectiveWithReceipt(input, { extract: success }), /memory_directive_receipt_write_failed/);
  failWrites = false;
  conv.__setConversationStorageForTests(storage);
  assert.equal(readMemoryDirectiveReceipt(input), null);
});

test('real correction receipt proves supersession without reinserting the superseded fact', async () => {
  const { extractAndApplyMemoryOperations } = await import('../context/extraction.js');
  const ledger = await import('../memory/candidate-ledger.js');
  const graph = await import('../context/store.js');
  const suppress = await import('../memory/suppression-ledger.js');
  const first = fixture('我不喝咖啡。');
  ledger.__setCandidateLedgerStorageForTests(storage);
  graph.__setContextStorageForTests(storage);
  suppress.__setSuppressionLedgerStorageForTests(storage);
  assert.equal((await extractAndApplyMemoryOperations(first)).ok, true);
  const text = '咖啡那句我说错了，改成我只是晚上不喝咖啡，白天可以喝。';
  const user = conv.sendUser(first.conversationSessionId, text);
  const input = { ...first, userEvidenceRef: user.node.id, userText: text };
  const receipt = await applyMemoryDirectiveWithReceipt(input);
  assert.equal(receipt.source, 'correction_directive');
  assert.equal(receipt.status, 'applied');
  assert.equal(receipt.supersededCount, 1);
  assert.match(buildMemoryDirectiveReceiptMessage(receipt, 'zh-CN').content, /在更正前确实存在/);
  assert.doesNotMatch(JSON.stringify(receipt), /咖啡/);
  conv.__setConversationStorageForTests(storage);
  assert.deepEqual(readMemoryDirectiveReceipt(input), receipt);
});

test('a pending or partially failed correction cannot claim stable persistence', async () => {
  for (const row of [{ ok: true, stage: 'candidate_pending' }, { ok: false }]) {
    const input = fixture('改成我只是晚上不喝咖啡。');
    const receipt = await applyMemoryDirectiveWithReceipt(input, {
      extract: async () => ({ ok: true, source: 'user_evidence', results: [row] }),
    });
    assert.equal(receipt.status, 'failed');
    assert.match(buildMemoryDirectiveReceiptMessage(receipt, 'zh-CN').content, /不能声称已保存/);
  }
});
