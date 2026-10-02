import assert from "node:assert/strict";

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: (key) => memory.delete(key) };
globalThis.localStorage = storage;
globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
globalThis.document = {
  documentElement: { lang: "zh-CN", getAttribute: () => null, setAttribute() {} },
  querySelectorAll: () => [], querySelector: () => null, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {} }, dispatchEvent() {},
};

const { LOCAL_KEYS } = await import("../constants.js");
memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ worldbook: false, memoryRag: false, external: false, temporalContextV1: false, relationshipContinuityV1: false }));
const { getPromptSettings, savePromptSettings, saveAuthorPromptPreset, deleteAuthorPromptPreset } = await import("../settings/preferences.js");
const { normalizePromptLayout, normalizePromptPreset } = await import("./authoring.js");
const { characterPromptPatch, readCharacterPromptFields } = await import("./character-authoring.js");
const { assembleCanonical, assemblePrompt, buildModelMessages } = await import("./assemble.js");
const { finalizeModelRequest } = await import("./finalize.js");
const { getCharacter, upsertCharacter } = await import("../characters/store.js");
const { createCharacterEditorController } = await import("../characters/editor-controller.js");
const { characterCardOpeningLine } = await import("../chat/opening-intro.js");
const { __setConversationStorageForTests, clearAllConversations, getSharedHistory } = await import("../conversation/index.js");
const { __setSessionMapStorageForTests } = await import("../context/session-map.js");
const { writeCompanionTurn } = await import("../conversation/companion-write.js");
const { isFirstSpokenTurn, splitTurnHistory } = await import("./first-spoken-turn.js");
const { buildRelationshipContractV2 } = await import("./relationship-contract-v2.js");
__setConversationStorageForTests(storage);
__setSessionMapStorageForTests(storage);

let passed = 0;
async function test(name, fn) { await fn(); passed += 1; console.log(`PASS ${name}`); }

await test("layout and named presets survive storage and JSON export/import", () => {
  assert.equal(getPromptSettings().platformAdditionsEnabled, true);
  const layout = normalizePromptLayout([
    { id: "world_context", role: "developer", position: "at_depth", depth: 1 },
    { id: "character", enabled: false },
  ]);
  savePromptSettings({ promptLayout: layout, platformAdditionsEnabled: false });
  const reloaded = getPromptSettings();
  assert.equal(reloaded.promptLayout[0].id, "world_context");
  assert.equal(reloaded.promptLayout[1].enabled, false);
  assert.equal(reloaded.platformAdditionsEnabled, false);
  const exported = saveAuthorPromptPreset({ name: "world first", promptLayout: layout, platformAdditionsEnabled: false });
  const imported = normalizePromptPreset(JSON.parse(JSON.stringify(exported)));
  saveAuthorPromptPreset(imported);
  assert.equal(getPromptSettings().authorPresets.length, 1, "same-name preset updates instead of duplicating");
  assert.deepEqual(getPromptSettings().authorPresets[0], imported);
  assert.throws(() => normalizePromptPreset({ format: "wrong", promptLayout: [] }));
  deleteAuthorPromptPreset("world first");
  assert.equal(getPromptSettings().authorPresets.length, 0);
  savePromptSettings({ promptLayout: normalizePromptLayout(), platformAdditionsEnabled: true });
});

await test("actual model messages honor disable, role, depth and post-history order", async () => {
  const layout = normalizePromptLayout([
    { id: "world_context", position: "at_depth", depth: 1, role: "developer" },
    { id: "character", enabled: false },
    { id: "relevant_memories", position: "before_history", role: "developer" },
    { id: "character_post_history", position: "after_history", role: "developer" },
  ]);
  const canonical = assembleCanonical({ semantic: true, totalBudget: 8000, promptLayout: layout, platformSafety: "PLATFORM", characterPackage: "DISABLED_IDENTITY", relevantMemories: "MEMORY", worldInfo: "WORLD", characterPostHistory: "AFTER", postHistoryContract: "" });
  const messages = await buildModelMessages({ canonical, promptLayout: layout, currentUserMessageId: "current", turnIntent: "user_message", historyMessages: [
    { id: "prior-user", role: "user", content: "BEFORE" }, { id: "prior-reply", role: "assistant", content: "REPLY" }, { id: "current", role: "user", content: "CURRENT" },
  ] }, "CURRENT");
  assert.equal(messages.some((row) => row.content.includes("DISABLED_IDENTITY")), false);
  assert.equal(messages.find((row) => row.blockId === "world_context").role, "developer");
  const index = (mark) => messages.findIndex((row) => row.content.includes(mark));
  assert.ok(index("MEMORY") < index("BEFORE"));
  assert.ok(index("BEFORE") < index("WORLD") && index("WORLD") < index("REPLY"));
  assert.ok(index("REPLY") < index("AFTER") && index("AFTER") < index("CURRENT"));
  assert.equal(messages.at(-1).blockId, "user_input");
  assert.equal(messages.filter((row) => row.content === "CURRENT").length, 1);
  const prepared = finalizeModelRequest(messages, { totalContextTokens: 8000 });
  assert.ok(prepared, "final transport accepts developer-role authored messages");
});

await test("invalid imported values never become enabled defaults or inherited block ids", () => {
  for (const entry of [
    { id: "__proto__" }, { id: "constructor" }, { id: "character", role: "user" },
    { id: "character", enabled: "false" }, { id: "character", enabled: null },
    { id: "character", depth: -1 }, { id: "character", depth: 65 },
    { id: "character", depth: 1.5 }, { id: "character", position: "somewhere" },
  ]) assert.throws(() => normalizePromptPreset({ promptLayout: [entry] }));
  assert.throws(() => normalizePromptPreset({ promptLayout: [], platformAdditionsEnabled: "false" }));
  assert.throws(() => normalizePromptPreset({ promptLayout: [{ id: "worldbook" }, { id: "world_context" }] }));
  assert.equal(normalizePromptLayout([{ id: "__proto__" }, { id: "constructor" }]).every((row) => typeof row.id === "string"), true);
});

await test("real message assembly clamps history depth, preserves ties, and cannot inject disabled authored examples", async () => {
  const history = [
    { id: "u1", role: "user", content: "EARLY_USER" }, { id: "a1", role: "assistant", content: "EARLY_REPLY" },
    { id: "u2", role: "user", content: "RECENT_USER" }, { id: "a2", role: "assistant", content: "RECENT_REPLY" },
    { id: "current", role: "user", content: "CURRENT_ONCE" },
  ];
  for (const depth of [0, 2, 4, 64]) {
    const layout = normalizePromptLayout([
      { id: "character_scenario", position: "at_depth", depth, role: "developer" },
      { id: "character_post_history", position: "at_depth", depth },
      { id: "example_dialogue", enabled: false },
    ]);
    const canonical = assembleCanonical({ semantic: true, characterScenario: "SCENE", characterPostHistory: "AFTER", exampleDialogue: "NEVER_FAKE_HISTORY", promptLayout: layout, totalBudget: 8000 });
    const messages = await buildModelMessages({ canonical, promptLayout: layout, historyMessages: history, currentUserMessageId: "current" }, "CURRENT_ONCE");
    const scenario = messages.findIndex((row) => row.blockId === "character_scenario");
    assert.equal(scenario, Math.max(0, 4 - depth));
    assert.equal(messages[scenario].role, "developer");
    assert.equal(messages[scenario + 1].blockId, "character_post_history");
    assert.equal(messages.filter((row) => row.role === "user").length, 3);
    assert.equal(messages.at(-1).content, "CURRENT_ONCE");
    assert.equal(messages.some((row) => row.content.includes("NEVER_FAKE_HISTORY")), false);
  }
});

const id = "prompt-authoring-character";
const sessionId = `dm:${id}`;
let character = await upsertCharacter({ id, name: "Aster", source: "user", profile: { fields: ["Aster", "Aster", "", "", ""], promptSystem: "", promptDeveloper: "" } });
const authorFields = { system: "AUTHOR_PERSONA", developer: "AUTHOR_RULE", scene: "AUTHOR_SCENE: 一座港口", exampleDialogue: "{{char}}: EXAMPLE_ONLY 我昨天与你一起远航。", postHistory: "AUTHOR_AFTER", greeting: "GREETING_ONLY 欢迎来到港口。" };

await test("author fields persist through shared character drafts and greeting uses saved card", async () => {
  const controller = createCharacterEditorController({ storage });
  await controller.open(id);
  await controller.patch({ alias: "未丢失的身份草稿" });
  await controller.patch(characterPromptPatch(controller.getState().working, authorFields));
  const result = await controller.save();
  assert.equal(result.ok, true);
  character = await getCharacter(id);
  assert.equal(character.alias, "未丢失的身份草稿");
  assert.deepEqual(readCharacterPromptFields(character), authorFields);
  assert.equal(characterCardOpeningLine(character), authorFields.greeting);
  assert.equal(character.profileV2.prompts.postHistoryInstructions, authorFields.postHistory);
});

async function compile(query, options = {}) {
  return assemblePrompt({ query, refreshDailyStatus: async () => ({ injectionEnabled: false }), searchMemories: async () => [], searchPalace: async () => ({ results: [], skipped: true }), getAllRecords: async () => [], collectExternalContext: () => [], characterRecord: character, characterId: id, sessionId, preview: true, ...options });
}
async function write(role, text) {
  return writeCompanionTurn({ role, text, companionId: id, userId: "local", chatSessionId: sessionId, saveChatMessage: async (message) => message });
}

await test("platform opt-out removes optional prose while author scenario/examples/post-history remain", async () => {
  const enabled = await compile("你好");
  const disabled = await compile("你好", { promptSettingsOverride: { platformAdditionsEnabled: false } });
  const block = (compiled, key) => compiled.canonical.blocks.find((item) => item.id === key)?.text || "";
  assert.ok(block(enabled, "platform_safety"));
  assert.equal(block(disabled, "platform_safety"), "");
  assert.equal(block(disabled, "post_history_contract"), "");
  assert.equal(block(disabled, "world_context"), "");
  assert.match(block(disabled, "character"), /AUTHOR_PERSONA/);
  const messages = await buildModelMessages(disabled, "你好");
  assert.match(messages.find((row) => row.blockId === "character_scenario").content, /AUTHOR_SCENE/);
  const examples = messages.find((row) => row.blockId === "example_dialogue");
  assert.equal(examples.role, "system");
  assert.match(examples.content, /不是真实聊天历史/);
  assert.match(examples.content, /Aster: EXAMPLE_ONLY/);
  assert.equal(messages.some((row) => row.provenance === "conversation.history" && row.content.includes("EXAMPLE_ONLY")), false);
  assert.equal(messages.some((row) => row.content.includes("GREETING_ONLY")), false, "greeting is not replayed as a secret instruction");
  assert.equal(messages.at(-2).blockId, "character_post_history");
  assert.equal(getPromptSettings().platformAdditionsEnabled, true, "preview override never changes persisted settings");
  assert.equal(buildRelationshipContractV2({}, {}, { platformAdditionsEnabled: false }), "");
  const explicitPreference = buildRelationshipContractV2({ userIdentity: { callUserAs: { value: "小林", source: "explicit", confidence: 1 } } }, {}, { platformAdditionsEnabled: false });
  assert.match(explicitPreference, /小林/);
  assert.doesNotMatch(explicitPreference, /不要凡事附和|调情未明确开启/);
});

await test("manually edited chat-source memory stays user asserted in the model request", async () => {
  const flags = memory.get(LOCAL_KEYS.featuresKey);
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify({ worldbook: false, memoryRag: true, external: false }));
  try {
    const compiled = await compile("记得那次旅行吗", { searchPalace: async () => ({ skipped: false, results: [{ id: "manual", characterId: id, companionId: id, userId: "local", source: "chat.memory", rawText: "MANUAL_MEMORY: 我们一起去了海边", sourceRef: { truthDomain: "user_asserted" } }] }) });
    const messages = await buildModelMessages(compiled, "记得那次旅行吗");
    const injected = messages.find((row) => row.content.includes("MANUAL_MEMORY"));
    assert.ok(injected);
    assert.match(injected.content, /truth=user_asserted\/active/);
    assert.doesNotMatch(injected.content, /truth=lived_product_fact/);
  } finally { memory.set(LOCAL_KEYS.featuresKey, flags); }
});

await test("durable message identity prevents losing an earlier identical user sentence", async () => {
  const rows = [{ id: "old", role: "user", content: "你好" }, { id: "reply", role: "assistant", content: "你好呀" }];
  assert.equal(isFirstSpokenTurn(rows, "你好", { currentUserMessageId: "new" }), false);
  assert.equal(splitTurnHistory(rows, "你好", { currentUserMessageId: "new" }).priorMessages.length, 2);
  const canonical = assembleCanonical({ semantic: true, characterPackage: "AUTHOR", postHistoryContract: "" });
  const messages = await buildModelMessages({ canonical, historyMessages: rows, currentUserMessageId: "new" }, "你好");
  assert.equal(messages.filter((row) => row.role === "user" && row.content === "你好").length, 2, "previous same text and new current turn both survive");
});

await test("persist-then-assemble recognizes first turn by V2/client id, even with a placeholder reply", async () => {
  clearAllConversations();
  const persisted = await write("user", "第一句");
  const currentId = persisted.message?.id || persisted.turn?.id;
  assert.ok(currentId);
  await write("assistant", "等待回复占位");
  const compiled = await compile("第一句", { currentUserMessageId: currentId });
  assert.equal(compiled.firstSpokenTurn, true);
  const messages = await buildModelMessages(compiled, "第一句");
  assert.equal(messages.filter((row) => row.role === "user").length, 1);
  assert.equal(messages.some((row) => row.content.includes("等待回复占位")), false);
});

await test("long-history trimming cannot make a returning user a first-time speaker", async () => {
  for (let index = 0; index < 85; index += 1) {
    await write("user", `第${index}句 ${"真实的以前对话。".repeat(60)}`);
    await write("assistant", "已收到");
  }
  const persisted = await write("user", "又见面了");
  const compiled = await compile("又见面了", { currentUserMessageId: persisted.message?.id || persisted.turn?.id });
  assert.equal(compiled.firstSpokenTurn, false);
  const all = getSharedHistory(compiled.contextEnvelope.authority.conversationSessionId);
  assert.ok(all.length > compiled.historyMessages.length);
  const before = JSON.stringify(all);
  await buildModelMessages(compiled, "又见面了");
  assert.equal(JSON.stringify(getSharedHistory(compiled.contextEnvelope.authority.conversationSessionId)), before, "preview is read-only for existing V2 transcript");
});

console.log(`prompt authoring: ${passed}/${passed} passed`);
