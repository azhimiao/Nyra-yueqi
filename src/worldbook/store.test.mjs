import assert from "node:assert/strict";
import {
  bindWorldbookToCharacter,
  filterWorldbookForCharacter,
  worldbookCharacterId,
  worldbookVisibleForCharacter,
} from "./store.js";

const bound = bindWorldbookToCharacter(
  { id: "wb-1", title: "雨天", content: "会撑伞", triggers: ["雨"] },
  "char-xingli",
);
assert.equal(worldbookCharacterId(bound), "char-xingli");
assert.equal(bound.scope, "character");
assert.deepEqual(bound.linkedCharacterIds, ["char-xingli"]);
assert.equal(worldbookVisibleForCharacter(bound, "char-xingli"), true);
assert.equal(worldbookVisibleForCharacter(bound, "char-other"), false);

const legacy = { id: "wb-old", title: "旧条目", content: "未绑角色" };
assert.equal(worldbookCharacterId(legacy), "");
assert.equal(worldbookVisibleForCharacter(legacy, "char-xingli"), true);

const filtered = filterWorldbookForCharacter(
  [bound, legacy, { id: "wb-other", characterId: "char-other" }],
  "char-xingli",
);
assert.deepEqual(filtered.map((row) => row.id), ["wb-1", "wb-old"]);

console.log("worldbook store character scope: ok");
