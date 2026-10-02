#!/usr/bin/env node
import assert from "node:assert/strict";
import { BUILTIN_CHARACTER_ID } from "../src/constants.js";
import {
  buildBuiltinNyraHistoryMemories,
  buildBuiltinNyraWorldbookEntries,
  ensureBuiltinNyraInitialContent,
} from "../src/characters/builtin-nyra-initial-content.js";
import { entryInScope, matchWorldbookEntries } from "../src/worldbook/match.js";
import { inferWingRoom } from "../src/memory/palace/recall.js";
import { getAllRecords } from "../src/storage/db.js";

const world = buildBuiltinNyraWorldbookEntries();
const history = buildBuiltinNyraHistoryMemories();

assert.equal(world.length, 20);
assert.equal(history.length, 36);
assert.ok(world.every((row) => row.scope === "character"));
assert.ok(world.every((row) => row.characterId === BUILTIN_CHARACTER_ID));
assert.ok(history.every((row) => row.characterId === BUILTIN_CHARACTER_ID));
assert.ok(history.every((row) => row.sourceType === "authored_origin_memory"));
assert.ok(history.every((row) => row.searchable && !row.pinned));
assert.ok(world.every((row) => entryInScope(row, { characterId: BUILTIN_CHARACTER_ID })));
assert.ok(world.every((row) => !entryInScope(row, { characterId: "char-user-created" })));
assert.ok(matchWorldbookEntries(world, "我想看看你的日记", {
  characterId: BUILTIN_CHARACTER_ID,
}).some((row) => row.title === "日记"));
assert.equal(matchWorldbookEntries(world, "普通闲聊", {
  characterId: BUILTIN_CHARACTER_ID,
}).length, 0);
assert.equal(inferWingRoom("你第一次写日记是什么时候").wing, "Character");
assert.equal(inferWingRoom("你对雨有什么记忆").wing, "Character");
assert.equal(inferWingRoom("我们以前一起做过什么").wing, "Relationship");
assert.equal(inferWingRoom("你记得我喜欢什么吗").wing, "Relationship");
assert.ok(
  world.every((row) => !/她(?!们)/.test(`${row.title}\n${row.content}`)),
  "world book seed must not assume 她",
);
assert.ok(
  history.every((row) => !/她(?!们)/.test(row.rawText)),
  "character history seed must not assume 她",
);
assert.ok(
  history.some((row) => row.rawText.includes("她们")),
  "plural 她们 about other people may remain",
);

const bag = {};
globalThis.window = {
  localStorage: {
    getItem(key) { return bag[key] ?? null; },
    setItem(key, value) { bag[key] = String(value); },
    removeItem(key) { delete bag[key]; },
  },
};
globalThis.localStorage = globalThis.window.localStorage;
const firstSeed = await ensureBuiltinNyraInitialContent();
const secondSeed = await ensureBuiltinNyraInitialContent();
assert.deepEqual(firstSeed.worldbook, { total: 20, added: 20 });
assert.deepEqual(firstSeed.history, { total: 36, added: 36 });
assert.deepEqual(secondSeed.worldbook, { total: 20, added: 0 });
assert.deepEqual(secondSeed.history, { total: 36, added: 0 });
assert.equal((await getAllRecords("worldbook")).length, 20);
assert.equal((await getAllRecords("memories")).length, 36);

console.log("verify-nyra-initial-content: 25 PASS");
