import assert from "node:assert/strict";

const values = new Map();
let failWriteKey = "";
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    if (key === failWriteKey) { failWriteKey = ""; throw new Error("fixture_write_failed"); }
    return values.set(key, String(value));
  },
  removeItem: (key) => values.delete(key),
};
globalThis.window = { localStorage: storage };
globalThis.document = { dispatchEvent() {} };

const { openMemoryDb, getAllRecords, normalizeMemory, storeRecord } = await import("../storage/db.js");
const { listManagedMemories, readManagedMemorySource, saveManagedMemory, deleteManagedMemory, setManagedMemoryRecall } = await import("./manager.js");
const { searchMemories } = await import("./rag.js");
const { embedPalaceText } = await import("./palace/embeddings.js");
const { fileDrawer } = await import("./palace/drawer.js");
const { filterPalaceHitsBySourceRef } = await import("./palace/source-validator.js");
const { ensureSession, __setConversationStorageForTests, __reloadConversationBagFromStorage } = await import("../conversation/store.js");
const { sendUser, appendAssistantCandidate } = await import("../conversation/runtime.js");
const { buildOriginMemoryRecord, listOriginMemories } = await import("../characters/origin-memories.js");
const { appendCohabitEvent } = await import("./cohabit-timeline.js");
const { listSuppressionKeys, exportSuppressionLedger, importSuppressionLedger, clearSuppressionLedgerForTests } = await import("./suppression-ledger.js");
const { formatPalaceMemoriesBlock } = await import("../context/retrieval-coordinator.js");
const { LOCAL_KEYS } = await import("../constants.js");
const { getMemoryRecallPolicy } = await import("./recall-policy.js");
const { SUPPRESSION_LEDGER_KEY } = await import("./suppression-ledger.js");
await openMemoryDb();
__setConversationStorageForTests(storage);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }

await test("manual memory persists with explicit provenance and character isolation", async () => {
  const row = await saveManagedMemory("a", { title: "火山旅行", rawText: "计划去看火山", tagsText: "火山, 旅行", pinned: true });
  assert.equal(row.source, "manual.memory");
  assert.equal(row.sourceRef.truthDomain, "user_asserted");
  assert.equal((await listManagedMemories("a", { layer: "core" })).length, 1);
  assert.equal((await listManagedMemories("b")).length, 0);
  assert.equal((await listManagedMemories("a", { query: "火山" }))[0].id, row.id);
  assert.ok((await getAllRecords("memories")).some((item) => item.id === row.id));
  await assert.rejects(saveManagedMemory("b", { id: row.id, rawText: "篡改" }), /memory_not_found/);
  await assert.rejects(deleteManagedMemory("b", row.id), /memory_not_found/);
});

await test("edits rebuild embeddings and replace the text seen by recall", async () => {
  const row = (await listManagedMemories("a"))[0];
  const updated = await saveManagedMemory("a", { id: row.id, title: "海边灯塔", rawText: "海边灯塔亮起", tagsText: "灯塔", searchable: true });
  assert.deepEqual(updated.embedding, embedPalaceText("海边灯塔亮起"));
  assert.notDeepEqual(updated.embedding, row.embedding);
  const recalled = await searchMemories("海边灯塔", { companionId: "a", topK: 5 });
  assert.equal(recalled[0]?.rawText, "海边灯塔亮起");
  assert.equal((await searchMemories("海边灯塔", { companionId: "b" })).length, 0);
});

await test("recall pause survives a projection rewrite and can be reenabled", async () => {
  const row = (await listManagedMemories("a"))[0];
  await setManagedMemoryRecall("a", row.id, false);
  assert.equal((await searchMemories("海边灯塔", { companionId: "a" })).some((item) => item.sourceId === row.sourceId), false);
  await storeRecord("memories", { ...row, searchable: true });
  assert.equal((await listManagedMemories("a"))[0].searchable, false);
  assert.equal((await searchMemories("海边灯塔", { companionId: "a" })).some((item) => item.sourceId === row.sourceId), false);
  assert.equal(filterPalaceHitsBySourceRef([row], { flagOn: false }).length, 0);
  await setManagedMemoryRecall("a", row.id, true);
  assert.equal((await searchMemories("海边灯塔", { companionId: "a" })).length, 1);
});

await test("short term comes only from Conversation V2, excluding source-only IDB rows", async () => {
  await storeRecord("messages", { id: "legacy-only", characterId: "a", role: "user", content: "假的消息" });
  const session = ensureSession({ characterId: "a", id: "chat-a" }).value;
  assert.equal(sendUser(session.id, "真实消息").ok, true);
  assert.equal(appendAssistantCandidate(session.id, "收到").ok, true);
  const other = ensureSession({ characterId: "b", id: "chat-b" }).value;
  sendUser(other.id, "别人的消息");
  __reloadConversationBagFromStorage();
  const rows = await listManagedMemories("a", { layer: "recent" });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.rawText === "真实消息"));
  assert.ok(rows.every((row) => row.readonly && row.source === "conversation.v2"));
  assert.ok(!rows.some((row) => row.rawText.includes("假的") || row.rawText.includes("别人")));
});

await test("shared events dedupe canonical timeline and cohabit mirror", async () => {
  appendCohabitEvent({ characterId: "a", appId: "listen", summary: "一起听潮声", kind: "listened", idempotencyKey: "listen-a" });
  const rows = await listManagedMemories("a", { layer: "shared" });
  assert.equal(rows.filter((row) => row.rawText === "一起听潮声").length, 1);
  assert.equal((await listManagedMemories("b", { layer: "shared" })).length, 0);
});

await test("reading stream combines saved memories and real activities but excludes raw turns and origins", async () => {
  const note = await saveManagedMemory("stream-cid", { title: "手动补记", rawText: "今天留下一条补记" });
  await storeRecord("memories", buildOriginMemoryRecord("stream-cid", { id: "stream-origin", title: "故乡", rawText: "作者设定的故乡" }));
  appendCohabitEvent({ characterId: "stream-cid", appId: "listen", summary: "一起听雨声", kind: "listened", idempotencyKey: "stream-listen" });
  const session = ensureSession({ characterId: "stream-cid", id: "stream-chat" }).value;
  sendUser(session.id, "这只是聊天原文");
  const rows = await listManagedMemories("stream-cid", { layer: "stream" });
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.id === note.id));
  assert.ok(rows.some((row) => row.rawText === "一起听雨声"));
  assert.ok(rows.every((row) => row.kind !== "history" && row.sourceLabel !== "origin"));
  assert.equal((await listManagedMemories("stream-cid", { layer: "stream", query: "雨声" })).length, 1);
  assert.deepEqual(rows.map((row) => row.createdAt), rows.map((row) => row.createdAt).sort().reverse());
});

await test("source reader resolves exact visible Conversation V2 messages and rejects cross-character refs", async () => {
  const history = await listManagedMemories("a", { layer: "recent" });
  const refs = history.map((row) => row.sourceRef.messageIds[0]);
  const memory = { characterId: "a", sourceRef: { conversationId: "chat-a", messageIds: refs } };
  const source = readManagedMemorySource("a", memory);
  assert.equal(source.messages.length, 2);
  assert.equal(source.missingCount, 0);
  assert.ok(source.messages.some((row) => row.rawText === "真实消息"));
  assert.equal(readManagedMemorySource("b", memory).messages.length, 0);
  assert.equal(readManagedMemorySource("a", { ...memory, sourceRef: { ...memory.sourceRef, characterId: "b" } }).messages.length, 0);
  assert.equal(readManagedMemorySource("a", { ...memory, sourceRef: { ...memory.sourceRef, conversationId: "chat-b" } }).messages.length, 0);
  assert.equal(readManagedMemorySource("a", { ...memory, sourceLabel: "origin" }).messages.length, 0);
  const partial = readManagedMemorySource("a", { ...memory, sourceRef: { ...memory.sourceRef, messageIds: [...refs, "missing", "legacy-only"] } });
  assert.equal(partial.messages.length, 2);
  assert.equal(partial.missingCount, 2);
  assert.deepEqual(readManagedMemorySource("a", { characterId: "a", sourceRef: {} }), { messages: [], linkedCount: 0, missingCount: 0 });
});

await test("reading chronology compares actual instants across timestamp offsets", async () => {
  await storeRecord("memories", normalizeMemory({ id: "time-early", characterId: "time-cid", rawText: "Earlier", createdAt: "2026-09-27T13:00:00+08:00" }));
  await storeRecord("memories", normalizeMemory({ id: "time-later", characterId: "time-cid", rawText: "Later", createdAt: "2026-09-27T06:00:00Z" }));
  assert.deepEqual((await listManagedMemories("time-cid", { layer: "stream" })).map((row) => row.id), ["time-later", "time-early"]);
});

await test("origin stays separate from lived and pinned core memories", async () => {
  await storeRecord("memories", buildOriginMemoryRecord("a", { id: "nyra-origin-v1-manager-test", title: "故乡", rawText: "童年在山里", weightLevel: "high", pinned: true }));
  assert.equal((await listManagedMemories("a", { layer: "origin" })).length, 1);
  const edited = await saveManagedMemory("a", { id: "nyra-origin-v1-manager-test", title: "故乡", rawText: "童年在山里生活", pinned: true });
  assert.equal(edited.weight, 1.8);
  assert.equal(edited.sourceRef.truthDomain, "character_canon");
  assert.ok((await listManagedMemories("a", { layer: "core" })).every((row) => row.source !== "character.history"));
  assert.ok((await listManagedMemories("a", { layer: "long" })).every((row) => row.source !== "character.history"));
});

await test("deletion retains tombstone, preserves chat, and rejects retry of same source", async () => {
  const before = await listManagedMemories("a", { layer: "recent" });
  const row = (await listManagedMemories("a"))[0];
  await deleteManagedMemory("a", row.id);
  assert.ok((await getAllRecords("memories")).find((item) => item.id === row.id).tombstone);
  assert.equal((await listManagedMemories("a")).length, 0);
  assert.equal((await searchMemories("海边灯塔", { companionId: "a" })).some((item) => item.sourceId === row.sourceId), false);
  assert.equal(await fileDrawer({ ...row, id: "retry-fresh-projection", sourceId: row.sourceId }), null);
  await storeRecord("memories", { ...row, id: "retry-other-id", sourceId: row.sourceId, searchable: true });
  assert.equal((await searchMemories("海边灯塔", { companionId: "a" })).some((item) => item.sourceId === row.sourceId), false);
  assert.deepEqual(await listManagedMemories("a", { layer: "recent" }), before);
  assert.ok(listSuppressionKeys().some((key) => key.startsWith("memory-control:a:")));
});

await test("chunked notes edit as one note without stale sibling recall", async () => {
  for (let index = 0; index < 2; index++) await storeRecord("memories", normalizeMemory({ id: `chunk-${index}`, drawerId: "chunk-group", parentDrawerId: "chunk-group", chunkIndex: index, chunkTotal: 2, sourceId: "chunk-source", sourceType: "stable_memory", characterId: "a", rawText: `旧花园片段${index}`, title: "花园" }));
  const group = (await listManagedMemories("a")).find((row) => row.id === "chunk-0");
  assert.equal(group.rowIds.length, 2);
  await saveManagedMemory("a", { id: group.id, title: "森林", rawText: "新的森林记录", searchable: true });
  assert.equal((await listManagedMemories("a")).filter((row) => row.sourceId === "chunk-source").length, 1);
  assert.equal((await searchMemories("花园", { companionId: "a" })).some((item) => item.rawText.includes("旧花园")), false);
});

await test("manual edits of chat memory keep source links but never assert lived chat truth", async () => {
  await storeRecord("memories", normalizeMemory({ id: "summary-to-edit", source: "chat.memory", sourceType: "stable_memory", sourceId: "summary-source", sourceRef: { sourceType: "stable_memory", sourceId: "summary-source", messageIds: ["original-message"] }, characterId: "a", rawText: "原始总结" }));
  const edited = await saveManagedMemory("a", { id: "summary-to-edit", rawText: "用户修改后的文字" });
  assert.deepEqual(edited.sourceRef.messageIds, ["original-message"]);
  assert.equal(edited.sourceRef.truthDomain, "user_asserted");
  const block = formatPalaceMemoriesBlock([edited]);
  assert.match(block, /truth=user_asserted/);
  assert.doesNotMatch(block, /truth=lived_product_fact/);
});

await test("deleted origin remains hidden from both origin editor and library after policy restore", async () => {
  const origin = (await listManagedMemories("a", { layer: "origin" }))[0];
  await deleteManagedMemory("a", origin.id);
  assert.equal((await listOriginMemories("a")).length, 0);
  const snapshot = JSON.parse(JSON.stringify(exportSuppressionLedger()));
  clearSuppressionLedgerForTests();
  importSuppressionLedger(snapshot);
  await storeRecord("memories", { ...origin, searchable: true, tombstone: null, invalidatedAt: null });
  assert.equal((await listOriginMemories("a")).length, 0);
  assert.equal((await listManagedMemories("a", { layer: "origin" })).length, 0);
  assert.equal((await searchMemories("童年", { companionId: "a" })).some((row) => row.id === origin.id), false);
});

await test("failed edit/delete/recall writes preserve records and effective recall policy", async () => {
  const row = await saveManagedMemory("failure-cid", { title: "Unchanged", rawText: "Keep this original fact", searchable: true });
  for (const [name, action] of [
    ["edit", () => saveManagedMemory("failure-cid", { id: row.id, rawText: "Uncommitted replacement", searchable: false })],
    ["delete", () => deleteManagedMemory("failure-cid", row.id)],
    ["recall", () => setManagedMemoryRecall("failure-cid", row.id, false)],
  ]) {
    for (const failAt of [LOCAL_KEYS.memoryKey, SUPPRESSION_LEDGER_KEY]) {
      const beforeRows = JSON.stringify(await getAllRecords("memories"));
      const beforePolicy = getMemoryRecallPolicy(row);
      failWriteKey = failAt;
      await assert.rejects(action, /fixture_write_failed/, `${name} must report persistence failure`);
      assert.equal(JSON.stringify(await getAllRecords("memories")), beforeRows, `${name}: no partial record writes`);
      assert.deepEqual(getMemoryRecallPolicy(row), beforePolicy, `${name}: no silent recall policy changes`);
      assert.equal((await listManagedMemories("failure-cid"))[0].rawText, row.rawText);
      assert.equal((await listManagedMemories("failure-cid"))[0].searchable, true);
    }
  }
  await setManagedMemoryRecall("failure-cid", row.id, false);
  assert.equal((await listManagedMemories("failure-cid"))[0].searchable, false, "retry succeeds after failure");
});

await test("same drawer identifier cannot edit or delete a different source", async () => {
  const first = normalizeMemory({ id: "collision-a", drawerId: "shared-drawer", sourceType: "source-a", sourceId: "one", characterId: "collision-cid", rawText: "first source" });
  const other = normalizeMemory({ id: "collision-b", drawerId: "shared-drawer", sourceType: "source-b", sourceId: "two", characterId: "collision-cid", rawText: "different source" });
  await storeRecord("memories", first);
  await storeRecord("memories", other);
  await deleteManagedMemory("collision-cid", first.id);
  const surviving = (await listManagedMemories("collision-cid"));
  assert.equal(surviving.length, 1);
  assert.equal(surviving[0].id, other.id);
  assert.equal(surviving[0].searchable, true);
});

console.log(`memory manager passed: ${passed}`);
