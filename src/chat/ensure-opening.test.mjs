import assert from "node:assert/strict";
import { ensureCharacterOpeningMessage, openingSeedMessageId } from "./ensure-opening.js";

let passed = 0;
function test(name, fn) {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`PASS ${name}`);
  });
}

await test("card first_mes is the spoken line", async () => {
  const writes = [];
  const result = await ensureCharacterOpeningMessage({
    character: {
      id: "char-imported",
      name: "艾拉",
      greetings: { primary: "你来了。" },
    },
    sessionId: "char:char-imported",
    messages: [],
    writeCompanionTurn: async (payload) => {
      writes.push(payload);
      return { ok: true };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.wrote, true);
  assert.equal(result.text, "你来了。");
  assert.equal(writes[0].text, "你来了。");
  assert.equal(writes[0].messageId, openingSeedMessageId("char-imported"));
  assert.equal(writes[0].meta.notLivedExperience, true);
});

await test("empty custom character still lives in Yueqi", async () => {
  const result = await ensureCharacterOpeningMessage({
    character: { id: "char-user", name: "宝钗" },
    messages: [],
    writeCompanionTurn: async () => ({ ok: true }),
  });
  assert.match(result.text, /我是宝钗/);
  assert.match(result.text, /月栖/);
});

await test("placeholder greeting is not a first spoken line", async () => {
  const result = await ensureCharacterOpeningMessage({
    character: {
      id: "char-user",
      name: "宝钗",
      greetings: { primary: "我在。你可以直接说今天发生了什么。" },
    },
    messages: [{ id: "seed-greeting", role: "assistant", content: "我在。你可以直接说今天发生了什么。" }],
    writeCompanionTurn: async () => ({ ok: true }),
  });
  assert.equal(result.wrote, true);
  assert.match(result.text, /我是宝钗/);
  assert.match(result.text, /月栖/);
});

await test("does not rewrite a lived transcript", async () => {
  let called = 0;
  const result = await ensureCharacterOpeningMessage({
    character: { id: "char-user", name: "宝钗", greetings: { primary: "你来了。" } },
    messages: [{ role: "user", content: "你好" }],
    writeCompanionTurn: async () => {
      called += 1;
      return { ok: true };
    },
  });
  assert.equal(result.wrote, false);
  assert.equal(called, 0);
});

console.log(`ensure-opening: ${passed} PASS`);
