import assert from "node:assert/strict";
import {
  characterRecordFromParsedCard,
  messageForImportIntake,
  parseImportedCharacterText,
  splitPastedPersona,
} from "./import-intake.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

test("JSON character card keeps the card name and persona", () => {
  const result = parseImportedCharacterText(JSON.stringify({
    spec: "chara_card_v2",
    data: {
      name: "艾拉",
      description: "一位住在海边的旅人，说话很慢。",
      first_mes: "你来了。",
    },
  }));
  assert.equal(result.ok, true);
  assert.equal(result.kind, "json");
  assert.equal(result.parsed.name, "艾拉");
  assert.match(result.parsed.description, /海边/);
  const record = characterRecordFromParsedCard(result.parsed);
  assert.equal(record.name, "艾拉");
  assert.notEqual(record.skipOpeningIntro, true);
  assert.equal(record.greetings.primary, "你来了。");
  assert.equal(record.source, "import");
});

test("prose uses the first line as the name", () => {
  const result = parseImportedCharacterText("林黛玉\n金陵人，说话细，心里有自己的分寸。");
  assert.equal(result.ok, true);
  assert.equal(result.kind, "persona");
  assert.equal(result.parsed.name, "林黛玉");
  assert.match(result.parsed.description, /金陵人/);
});

test("explicit name does not require a first-line format", () => {
  const result = parseImportedCharacterText("一位住在海边的旅人，说话很慢，不太爱凑热闹。", { name: "艾拉" });
  assert.equal(result.ok, true);
  assert.equal(result.parsed.name, "艾拉");
  assert.match(result.parsed.description, /海边/);
});

test("explicit name keeps the full persona body", () => {
  const result = parseImportedCharacterText("沉静\n会看人脸色，但不轻易把话说满。", { name: "宝钗" });
  assert.equal(result.ok, true);
  assert.equal(result.parsed.name, "宝钗");
  assert.match(result.parsed.description, /^沉静/);
});

test("need_name copy asks for the name field", () => {
  assert.equal(messageForImportIntake("need_name"), "请填写角色的名字。");
  assert.doesNotMatch(messageForImportIntake("need_name"), /第一行/);
  assert.equal(messageForImportIntake("empty"), "请上传角色文件，或填写角色名字和人设。");
});

test("name labeled inside the body is enough", () => {
  const result = parseImportedCharacterText("性格沉静。\n名字：宝钗\n会看人脸色，但不轻易把话说满。");
  assert.equal(result.ok, true);
  assert.equal(result.parsed.name, "宝钗");
});

test("name: prefix is stripped from the first line", () => {
  const split = splitPastedPersona("名字：宝钗\n会看人脸色，但不轻易把话说满。");
  assert.equal(split.name, "宝钗");
  assert.match(split.body, /会看人脸色/);
});

test("empty paste and nameless prose are rejected", () => {
  assert.equal(parseImportedCharacterText("").reason, "empty");
  assert.equal(parseImportedCharacterText("只是一段没有名字的人设正文，不够当身份。").reason, "need_name");
  assert.equal(parseImportedCharacterText("{not json").reason, "invalid_json");
  assert.equal(parseImportedCharacterText("艾拉\n短").reason, "too_short");
  assert.equal(parseImportedCharacterText("", { name: "艾拉" }).reason, "too_short");
});

console.log(`import-intake: ${passed} PASS`);
