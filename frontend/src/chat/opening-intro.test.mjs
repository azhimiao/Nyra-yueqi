import assert from "node:assert/strict";
import {
  DEFAULT_OPENING_NAME,
  buildOpeningIntroLines,
  buildOpeningIntroText,
  isChatIntroNoteCollapsed,
  isOpeningIntroMessage,
  openingIntroLetterCopy,
  shouldPinChatIntroNote,
  openingIntroSetupCta,
  isPlatformPlaceholderGreeting,
  resolveCallCharacterAs,
  resolveCallUserAs,
  resolveCharacterName,
  resolveCharacterOpeningLine,
  setChatIntroNoteCollapsed,
  transcriptHasLivedChat,
} from "./opening-intro.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("official name does not accept brand, alias leftovers, or empty labels", () => {
  assert.equal(resolveCharacterName(""), DEFAULT_OPENING_NAME);
  assert.equal(resolveCharacterName("未命名"), DEFAULT_OPENING_NAME);
  assert.equal(resolveCharacterName("月栖"), DEFAULT_OPENING_NAME);
  assert.equal(resolveCharacterName("Yueqi"), DEFAULT_OPENING_NAME);
  assert.equal(resolveCharacterName("林黛玉"), "林黛玉");
});

test("callUserAs is only how the character addresses the user", () => {
  assert.equal(resolveCallUserAs("宝玉"), "宝玉");
  assert.equal(resolveCallUserAs("你"), "");
  assert.equal(resolveCallUserAs(""), "");
});

test("legacy name key is not an official character name", () => {
  const text = buildOpeningIntroText({ name: "宝玉" }, "zh-CN");
  assert.match(text, /我是\s*Nyra/);
  assert.doesNotMatch(text, /我是宝玉|来自宝玉/);
});

test("alias copied from the character name is not a user address", () => {
  const text = buildOpeningIntroText({
    characterName: "林黛玉",
    callUserAs: "林黛玉",
  }, "zh-CN");
  assert.match(text, /我是林黛玉/);
  assert.doesNotMatch(text, /我叫你林黛玉/);
});

test("callCharacterAs is only how the user addresses the character", () => {
  assert.equal(resolveCallCharacterAs("小栖", "Nyra"), "小栖");
  assert.equal(resolveCallCharacterAs("林黛玉", "林黛玉"), "");
  assert.equal(resolveCallCharacterAs("月栖", "Nyra"), "");
});

test("default opening uses Nyra as the character, Yueqi as the world", () => {
  const text = buildOpeningIntroText({}, "zh-CN");
  assert.match(text, /我是\s*Nyra/);
  assert.match(text, /月栖/);
  assert.doesNotMatch(text, /我是月栖|我是 Yueqi|我叫你Nyra|你叫我Nyra/);
});

test("the three names never swap places", () => {
  const text = buildOpeningIntroText({
    characterName: "林黛玉",
    callCharacterAs: "颦儿",
    callUserAs: "宝玉",
    relationshipType: "lover",
    relationshipStart: "now",
  }, "zh-CN");
  assert.match(text, /我是林黛玉/);
  assert.match(text, /你叫我颦儿就好/);
  assert.match(text, /我叫你宝玉/);
  assert.doesNotMatch(text, /过来一点|你不用每次都先想好/);
  assert.doesNotMatch(text, /被调用的工具|想找我的时候/);
  assert.doesNotMatch(text, /我是宝玉|我是颦儿|来自宝玉|我叫你林黛玉|你叫我宝玉/);
});

test("v1 appearance name is the user's name for the character, not the official name", () => {
  const text = buildOpeningIntroText({
    characterName: "Nyra",
    callCharacterAs: "小栖",
  }, "zh-CN");
  assert.match(text, /我是\s*Nyra/);
  assert.match(text, /你叫我小栖就好/);
  assert.doesNotMatch(text, /我是小栖/);
});

test("opening does not retell shared history", () => {
  const text = buildOpeningIntroText({
    relationshipType: "lover",
    relationshipStart: "long",
    sharedHistory: "我们一起走过一个雨季",
  }, "zh-CN");
  assert.match(text, /我住在月栖/);
  assert.doesNotMatch(text, /雨季/);
});

test("english opening does not add a closeness pitch", () => {
  const text = buildOpeningIntroText({
    relationshipType: "lover",
    relationshipStart: "now",
  }, "en");
  assert.match(text, /I live in Yueqi/);
  assert.doesNotMatch(text, /Come a little closer|When you want me|rehearse what to say/i);
  assert.doesNotMatch(text, /过来一点|我是/);
});

test("letter is signed by the character name, not the user's address", () => {
  const copy = openingIntroLetterCopy({
    characterName: "Nyra",
    callUserAs: "宝玉",
  }, "zh-CN");
  assert.match(copy.from, /Nyra/);
  assert.doesNotMatch(copy.from, /宝玉/);
  assert.match(copy.title, /欢迎来到月栖/);
  assert.match(copy.lead, /我叫你宝玉/);
  assert.match(copy.lead, /这里不只有聊天/);
  assert.equal(copy.notes.length, 5);
  assert.match(copy.notes[0].title, /选我用的大脑/);
  assert.match(copy.lead, /和我一起说话/);
  assert.doesNotMatch(copy.lead, /和ta一起|选择ta|让ta/);
  assert.doesNotMatch(copy.notes.map((note) => `${note.title}${note.body}`).join(""), /选择ta|让ta|和ta/);
  assert.ok(copy.sign.some((part) => part.label === "栖机助手"));
  assert.ok(copy.sign.some((part) => part.label === "联系开发团队"));
  assert.equal(copy.setup.action, "customize");
  assert.equal(copy.setup.label, "自己设定角色");
});

test("setup CTA is offered after the introduction, not as a name", () => {
  assert.equal(openingIntroSetupCta("zh-CN").label, "自己设定角色");
  assert.equal(openingIntroSetupCta("en").label, "Set up this character");
  assert.equal(isOpeningIntroMessage({ kind: "first_light_opening" }, ""), true);
  assert.equal(isOpeningIntroMessage({}, "fl-first-char-xingli"), true);
  assert.equal(isOpeningIntroMessage({ kind: "sticker" }, "msg-1"), false);
  assert.equal(shouldPinChatIntroNote([]), true);
  assert.equal(shouldPinChatIntroNote([{ metadata: { kind: "first_light_opening" } }]), true);
  assert.equal(shouldPinChatIntroNote([
    { metadata: { kind: "first_light_opening" } },
    { role: "user", content: "你好" },
  ]), true);
  assert.equal(shouldPinChatIntroNote([], { skipOpeningIntro: true }), true);
  assert.equal(shouldPinChatIntroNote([], { character: { skipOpeningIntro: true } }), true);
});

test("card greeting wins; otherwise the character lives in Yueqi", () => {
  assert.equal(resolveCharacterOpeningLine({
    name: "艾拉",
    greetings: { primary: "你来了。" },
  }), "你来了。");
  const fallback = resolveCharacterOpeningLine({ name: "宝钗" }, {}, "zh-CN");
  assert.match(fallback, /我是宝钗/);
  assert.match(fallback, /月栖/);
  assert.match(resolveCharacterOpeningLine({
    name: "宝钗",
    greetings: { primary: "我在。你可以直接说今天发生了什么。" },
  }, {}, "zh-CN"), /我是宝钗/);
  assert.equal(isPlatformPlaceholderGreeting("我在。你可以直接说今天发生了什么。"), true);
  assert.equal(isPlatformPlaceholderGreeting({ id: "seed-greeting", content: "hello" }), true);
  assert.equal(transcriptHasLivedChat([
    { id: "seed-greeting", role: "assistant", content: "我在。你可以直接说今天发生了什么。" },
  ]), false);
});

test("lived chat keeps the intro at the top and folds by default", () => {
  const lived = [
    { metadata: { kind: "first_light_opening" }, role: "assistant", content: "开场" },
    { role: "user", content: "你好" },
  ];
  assert.equal(transcriptHasLivedChat([]), false);
  assert.equal(transcriptHasLivedChat(lived), true);
  assert.equal(isChatIntroNoteCollapsed("char-test", { messages: [] }), false);
  assert.equal(isChatIntroNoteCollapsed("char-test", { messages: lived }), true);
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  setChatIntroNoteCollapsed("char-test", false);
  assert.equal(isChatIntroNoteCollapsed("char-test", { messages: lived }), false);
  setChatIntroNoteCollapsed("char-test", true);
  assert.equal(isChatIntroNoteCollapsed("char-test", { messages: [] }), true);
});

console.log(`\n${passed} PASS`);
