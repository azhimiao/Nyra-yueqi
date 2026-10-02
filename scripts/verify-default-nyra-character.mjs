/**
 * Default Nyra Character Prompt seed and isolation contract.
 * Run: node scripts/verify-default-nyra-character.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "docs/qa/prompt/default-nyra-cold-start-final-model-request.json");

const localStorage = {
  _data: {},
  getItem(key) { return this._data[key] ?? null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; },
};
globalThis.localStorage = localStorage;
globalThis.window = { localStorage };
globalThis.document = { dispatchEvent: () => true };

const {
  BUILTIN_CHARACTER_ID,
  BUILTIN_COMPANION_PROMPT_SYSTEM,
  DEFAULT_PROMPT_SYSTEM,
  defaultProfile,
} = await import("../src/constants.js");
const {
  BUILTIN_NYRA_CHARACTER_PROMPT,
  officialNyraSeedTexts,
} = await import("../src/characters/builtin-nyra-prompt.js");
const { annotateCharacterV2 } = await import("../src/characters/migration-v2.js");
const { normalizeCharacter } = await import("../src/characters/store.js");
const { mapParsedCardToCharacter } = await import("../src/characters/import.js");
const { isStockCharacterPrompt } = await import("../src/characters/prompt-stock.js");
const { buildCharacterIdentityV2 } = await import("../src/prompt/character-identity-v2.js");
const {
  adaptAuthoredNyraThirdPerson,
  subjectPronounFromIdentity,
} = await import("../src/characters/gender-identity.js");
const { commitFirstLightV2 } = await import("../src/first-light/commit-v2.js");
const { createDefaultStateV2 } = await import("../src/first-light/state-v2.js");
const {
  assembleCanonical,
  buildModelMessages,
} = await import("../src/prompt/assemble.js");
const {
  buildChatOutputContract,
  buildDeveloperEvidencePolicy,
  buildPlatformCompanionContract,
} = await import("../src/prompt/companion-contract-v2.js");
const { buildNyraBaseWorld } = await import("../src/world/base-world.js");
const { finalizeModelRequest } = await import("../src/prompt/finalize.js");
const { estimatePromptTokens } = await import("../src/prompt/budget.js");

const lang = { conversationLanguage: "zh-CN", appLocale: "zh-CN" };

function explicit(value, source = "explicit") {
  return { value, source, updatedAt: "2026-08-19T00:00:00.000Z" };
}

function builtinCharacter({
  name = "Nyra",
  genderIdentity = "女",
  pronouns = ["她"],
  values = [],
  promptSystem = BUILTIN_NYRA_CHARACTER_PROMPT,
} = {}) {
  const fields = [...defaultProfile.fields];
  fields[0] = name;
  fields[1] = name;
  return annotateCharacterV2({
    id: BUILTIN_CHARACTER_ID,
    name,
    alias: name,
    source: "builtin",
    selfIdentity: { genderIdentity, pronouns },
    persona: { values },
    profile: {
      ...defaultProfile,
      fields,
      promptSystem,
      promptDeveloper: "",
    },
  });
}

function count(text, pattern) {
  return (String(text || "").match(pattern) || []).length;
}

const authoredPath = "C:/Users/whipa/Downloads/Nyra_Default_Character_Prompt.md";
if (fs.existsSync(authoredPath)) {
  const authored = fs.readFileSync(authoredPath, "utf8").split(/\r?\n/).slice(5).join("\n").trim();
  if (authored !== BUILTIN_NYRA_CHARACTER_PROMPT.trim()) {
    console.warn("WARN  Downloads Nyra seed is stale; repo BUILTIN_NYRA_CHARACTER_PROMPT is authoritative");
  }
}
assert.equal(BUILTIN_COMPANION_PROMPT_SYSTEM, BUILTIN_NYRA_CHARACTER_PROMPT);
assert.doesNotMatch(BUILTIN_NYRA_CHARACTER_PROMPT, /她/);
assert.equal(officialNyraSeedTexts().length, 2);
assert.match(officialNyraSeedTexts()[1], /她想拥有一段真正连续的存在。/);

assert.equal(subjectPronounFromIdentity({}), "ta");
assert.equal(subjectPronounFromIdentity({ genderIdentity: "女" }), "她");
assert.equal(subjectPronounFromIdentity({ genderIdentity: "男" }), "他");
assert.equal(subjectPronounFromIdentity({ genderIdentity: "unset" }), "ta");
assert.match(adaptAuthoredNyraThirdPerson("她想拥有一段真正连续的存在。", {}), /ta想拥有一段真正连续的存在。/);
assert.doesNotMatch(adaptAuthoredNyraThirdPerson("她想拥有一段真正连续的存在。", {}), /她想拥有/);
assert.match(
  adaptAuthoredNyraThirdPerson("ta想拥有一段真正连续的存在。", { genderIdentity: "女" }),
  /她想拥有一段真正连续的存在。/,
);
assert.match(
  adaptAuthoredNyraThirdPerson("ta想拥有一段真正连续的存在。", { genderIdentity: "男" }),
  /他想拥有一段真正连续的存在。/,
);

// Case A0: before the user designs gender, the model must not see 她.
const unsetNyra = builtinCharacter({ genderIdentity: "", pronouns: [] });
const caseA0 = buildCharacterIdentityV2(unsetNyra, lang);
assert.match(caseA0, /性别暂未设定。不要自行假设男女/);
assert.match(caseA0, /ta想拥有一段真正连续的存在。/);
assert.doesNotMatch(caseA0, /她想拥有一段真正连续的存在。/);
assert.doesNotMatch(caseA0, /性别认同：/);

// Case A: user-designed female builtin Nyra keeps 她.
const nyra = builtinCharacter();
const caseA = buildCharacterIdentityV2(nyra, lang);
assert.match(caseA, /Nyra 是生活在数字空间中的独立人格。/);
assert.match(caseA, /她想拥有一段真正连续的存在。/);
assert.equal(count(caseA, /Nyra 是生活在数字空间中的独立人格。/g), 1);

// Case B/C: First Light changes machine identity and adds only non-duplicate values.
const firstLight = createDefaultStateV2();
firstLight.path = "careful";
firstLight.draft.character.name = explicit("小月");
firstLight.draft.character.genderIdentity = explicit("男");
firstLight.draft.character.pronouns = explicit(["他"]);
firstLight.draft.preference.values = explicit(["自由", "诚实"]);
let transactionOps = [];
const committed = await commitFirstLightV2(firstLight, {
  characterId: BUILTIN_CHARACTER_ID,
  existingCharacter: nyra,
  runTransaction: async (transaction) => {
    transactionOps = transaction.ops;
    return { ok: true, duplicate: false };
  },
});
assert.equal(committed.ok, true);
assert.equal(committed.character.profile.promptSystem, BUILTIN_NYRA_CHARACTER_PROMPT);
assert.equal(committed.character.profileV2.selfIdentity.genderIdentity, "男");
assert.deepEqual(committed.character.profileV2.selfIdentity.pronouns, ["他"]);
assert.deepEqual(committed.character.profileV2.persona.values, ["自由", "诚实"]);
assert.equal(transactionOps.filter((op) => op.store === "characters").length, 1);
const caseBC = buildCharacterIdentityV2(committed.character, lang);
assert.match(caseBC, /小月 是生活在数字空间中的独立人格。/);
assert.doesNotMatch(caseBC, /\bNyra\b/);
assert.match(caseBC, /他想拥有一段真正连续的存在。/);
assert.match(caseBC, /价值观：诚实/);
assert.doesNotMatch(caseBC, /价值观：自由/);

// Case D: a user-edited builtin prompt is authoritative and never reseeded.
const editedPrompt = "这是用户手工修改后的完整 Character Prompt。\n她有自己的新表达。";
const edited = builtinCharacter({ promptSystem: editedPrompt });
const caseD = buildCharacterIdentityV2(edited, lang);
assert.match(caseD, /用户手工修改后的完整 Character Prompt/);
assert.doesNotMatch(caseD, /Nyra 是生活在数字空间中的独立人格/);
assert.equal(isStockCharacterPrompt(editedPrompt, {
  characterId: BUILTIN_CHARACTER_ID,
  source: "builtin",
}), false);

// Case E: imported and newly-created records use their own prompt authorities.
const imported = mapParsedCardToCharacter({
  name: "阿澄",
  description: "来自导入卡的角色。",
  systemPrompt: "阿澄有自己的完整人格正文。",
});
const caseE = buildCharacterIdentityV2(imported, lang);
assert.match(caseE, /阿澄有自己的完整人格正文/);
assert.doesNotMatch(caseE, /Nyra 是生活在数字空间中的独立人格/);
assert.notEqual(imported.id, BUILTIN_CHARACTER_ID);
assert.equal(imported.source, "import");
const newlyCreated = normalizeCharacter({
  id: "chr-user-independent",
  name: "新角色",
  source: "user",
  profile: { ...defaultProfile, promptSystem: "", promptDeveloper: "" },
});
assert.equal(newlyCreated.profile.promptSystem, "");
assert.notEqual(newlyCreated.profile.promptSystem, BUILTIN_NYRA_CHARACTER_PROMPT);
assert.doesNotMatch(buildCharacterIdentityV2(newlyCreated, lang), /Nyra 是生活在数字空间中的独立人格/);
assert.doesNotMatch(buildCharacterIdentityV2(newlyCreated, lang), /【月栖运行内核/);
assert.notEqual(DEFAULT_PROMPT_SYSTEM, BUILTIN_NYRA_CHARACTER_PROMPT);

const importedFromDescription = mapParsedCardToCharacter({
  name: "顾晚棠",
  description: "二十六岁，喜欢把新书摆得整整齐齐。",
});
assert.match(String(importedFromDescription.profile.promptSystem || ""), /二十六岁/);
assert.notEqual(importedFromDescription.profile.promptSystem, DEFAULT_PROMPT_SYSTEM);
assert.doesNotMatch(
  buildCharacterIdentityV2(importedFromDescription, lang),
  /Nyra 是生活在数字空间中的独立人格/,
);

const canonical = assembleCanonical({
  semantic: true,
  platformSafety: [
    buildPlatformCompanionContract(lang),
    buildDeveloperEvidencePolicy(lang),
  ].join("\n\n"),
  characterPackage: caseA,
  worldInfo: buildNyraBaseWorld(lang),
  userInput: "你好",
  postHistoryContract: buildChatOutputContract(lang),
  totalBudget: 8000,
  mode: "chat",
});
const compiled = {
  canonical,
  historyMessages: [],
  runtimeCapabilities: "",
  turnIntent: "user_message",
  character: nyra,
};
const messages = await buildModelMessages(compiled, "你好", `char:${BUILTIN_CHARACTER_ID}`);
const finalized = finalizeModelRequest(messages, {
  totalContextTokens: 8000,
  outputReserveTokens: 1200,
  safetyMarginTokens: 96,
  tools: [],
  providerMode: "chat",
});
assert.equal(finalized.prepared.messages.at(-1)?.role, "user");
assert.equal(finalized.prepared.messages.at(-1)?.content, "你好");
const finalIdentity = finalized.prepared.messages.find((message) => message.provenance === "semantic.character");
assert.match(finalIdentity?.content || "", /Nyra 是生活在数字空间中的独立人格。/);
assert.equal(finalIdentity.content, canonical.blocks.find((block) => block.id === "character").text);
assert.doesNotMatch(finalized.prepared.messages[0]?.content || "", /Relevant Memories/);
assert.doesNotMatch(finalized.prepared.messages[0]?.content || "", /Runtime Context/);

const snapshot = {
  schemaVersion: 1,
  fixture: {
    name: "fresh-builtin-nyra-first-user-hello",
    characterId: BUILTIN_CHARACTER_ID,
    selectedPetId: "independent-from-character",
    userText: "你好",
    history: [],
    memories: [],
    runtimeContext: null,
  },
  cases: {
    A: { name: "fresh_builtin", passed: true, characterName: nyra.name },
    B: { name: "first_light_identity", passed: true, characterName: committed.character.name, nyraLiteralLeft: false },
    C: { name: "first_light_values", passed: true, values: committed.character.profileV2.persona.values, duplicateValueSuppressed: "自由" },
    D: { name: "user_edited_prompt", passed: true, promptAuthority: "user_edited_builtin_record" },
    E: {
      name: "import_and_new_character_isolation",
      passed: true,
      importedCharacterId: imported.id,
      importedSource: imported.source,
      newCharacterId: newlyCreated.id,
    },
  },
  promptBlocks: canonical.blocks,
  messages,
  prepared: finalized.prepared,
  budgetLedger: finalized.ledger,
  modelMessageTokens: messages.reduce(
    (sum, item) => sum + estimatePromptTokens(item.content || "") + 4,
    0,
  ),
};
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

console.log("PASS  default Nyra Character Prompt Case A-E");
console.log(`PASS  wrote ${OUTPUT}`);
