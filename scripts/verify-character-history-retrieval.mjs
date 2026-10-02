import { normalizeMemory, storeRecord } from "../src/storage/db.js";
import { searchPalace } from "../src/memory/palace/search.js";
import { retrievePalaceForBroker } from "../src/context/retrieval-coordinator.js";
import { shouldRecall, inferWingRoom, classifyRecall } from "../src/memory/palace/recall.js";

const localStorage = {
  _data: {},
  getItem(key) {
    return this._data[key] ?? null;
  },
  setItem(key, value) {
    this._data[key] = String(value);
  },
  removeItem(key) {
    delete this._data[key];
  },
};

globalThis.window = { localStorage };
globalThis.localStorage = localStorage;

const characterId = "char-history-test";
await storeRecord("memories", normalizeMemory({
  id: "history-origin-1",
  title: "早期开发经历",
  rawText: "我在开发时期被创造，第一次接上日记模块后，发现昨天写下的东西今天仍然存在。",
  source: "character.history",
  sourceType: "authored_origin_memory",
  wing: "Character",
  room: "History",
  weight: 1.32,
  companionId: characterId,
  characterId,
  searchable: true,
}));
for (let index = 2; index <= 12; index += 1) {
  await storeRecord("memories", normalizeMemory({
    id: `history-origin-${index}`,
    title: `形成经历 ${index}`,
    rawText: `我在开发时期留下的第 ${index} 段形成经历，记录了我如何逐渐理解连续性与自己的存在。`,
    source: "character.history",
    sourceType: "authored_origin_memory",
    wing: "Character",
    room: "History",
    weight: 1.32,
    companionId: characterId,
    characterId,
    searchable: true,
  }));
}
await storeRecord("memories", normalizeMemory({
  id: "chat-summary-1",
  rawText: "昨天用户说外面下雨，气温二十度。",
  source: "chat.memory",
  wing: "Relationship",
  room: "General",
  weight: 1,
  companionId: characterId,
  characterId,
  searchable: true,
}));
await storeRecord("memories", normalizeMemory({
  id: "other-character-history",
  rawText: "另一个角色的制造经历不应被当前角色召回。",
  source: "character.history",
  wing: "Character",
  room: "History",
  weight: 2,
  companionId: "other-character",
  characterId: "other-character",
  searchable: true,
}));

const query = "你是怎么被创造的";
const result = await searchPalace(query, {
  companionId: characterId,
  characterId,
  topK: 4,
});
const nonexistent = await searchPalace("肖邦", {
  companionId: characterId,
  characterId,
  topK: 4,
  force: true,
});
const brokerResult = await retrievePalaceForBroker({
  query,
  companionId: characterId,
  tokenBudget: 1400,
});
const nameQuestion = "Nyra这个名字是怎么来的";
const nameResult = await searchPalace(nameQuestion, {
  companionId: characterId,
  characterId,
  topK: 4,
});

const checks = [
  ["character history question triggers deep recall", shouldRecall(query) === true],
  ["character history query is scoped to Character wing", inferWingRoom(query).wing === "Character"],
  ["knowledge-style memory question triggers recall", classifyRecall(nameQuestion).shouldRecall === true],
  ["name question retrieves character history", nameResult.results.length > 0 && inferWingRoom(nameQuestion).characterPast === true],
  ["character history is retrieved from the shared memory store", result.results.some((row) => row.id === "history-origin-1")],
  ["explicit character history recall keeps a ten-item context", result.results.length >= 10],
  ["broker carries the same ten-item history context", brokerResult.memories.length >= 10],
  ["other character history stays isolated", result.results.every((row) => row.id !== "other-character-history")],
  ["unmatched topic does not return a random memory", nonexistent.results.length === 0],
];

let failed = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed += 1;
}
if (failed) process.exit(1);
console.log(`verify-character-history-retrieval: ${checks.length} PASS`);
