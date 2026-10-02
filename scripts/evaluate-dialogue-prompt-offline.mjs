/** Isolated diagnostic: never touches the app's persisted profile or a model. */
import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
const outputDirectory = "docs/qa/dialogue-repair";
const memory = new Map();
const storage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,String(v)), removeItem: k => memory.delete(k) };
globalThis.localStorage = storage;
globalThis.window = { localStorage: storage, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.document = { documentElement: {lang:"zh-CN", getAttribute:()=>null, setAttribute() {}}, querySelectorAll:()=>[], querySelector:()=>null, getElementById:()=>null, createElement:()=>({style:{},setAttribute(){},appendChild(){}}), body:{appendChild(){}} };
const { DEFAULT_FEATURES, defaultProfile, BUILTIN_CHARACTER_ID } = await import("../src/constants.js");
const { BUILTIN_NYRA_CHARACTER_PROMPT } = await import("../src/characters/builtin-nyra-prompt.js");
const { __setConversationStorageForTests, clearAllConversations } = await import("../src/conversation/index.js");
const { __setSessionMapStorageForTests } = await import("../src/context/session-map.js");
const { writeCompanionTurn } = await import("../src/conversation/companion-write.js");
const { assemblePrompt, buildModelMessages } = await import("../src/prompt/assemble.js");
const { finalizeModelRequest } = await import("../src/prompt/finalize.js");
const { compileCharacterCore } = await import("../src/prompt/character-identity-v2.js");
const { estimatePromptTokens } = await import("../src/prompt/budget.js");
const { buildRuntimeInstruction } = await import("../src/runtime/protocol.js");
const { normalizeContextRequest } = await import("../src/context/contract.js");
const { buildBuiltinNyraWorldbookEntries } = await import("../src/characters/builtin-nyra-initial-content.js");
__setConversationStorageForTests(storage);
__setSessionMapStorageForTests(storage);
const character = {id: BUILTIN_CHARACTER_ID, name:"Nyra", source:"builtin", profile:{...defaultProfile, promptSystem:BUILTIN_NYRA_CHARACTER_PROMPT,promptDeveloper:""}};
const sessionId = `dm:${character.id}`;
const query = "你好，今天在干嘛呢";
const scenarios = [];
const capacityRejections = [];
async function add(role,text) { return writeCompanionTurn({role,text,userId:"local",companionId:character.id,chatSessionId:sessionId,saveChatMessage:async m=>m}); }
async function run(name, {pairs=0,chars=0, platform=true, profile="balanced", lore=[], memories=[], prompt=query, appendCurrent=true}={}) {
  memory.clear(); clearAllConversations();
  for(let i=0;i<pairs;i++) {
    await add("user",`第${i+1}轮真实用户：我今天说的独特事实是蓝色纸鹤${i}。${"这是当天发生的具体对话。".repeat(Math.ceil(chars/12))}`);
    await add("assistant",`第${i+1}轮真实回复：我记得你说的蓝色纸鹤${i}。${"我在接着这一段真实话题。".repeat(Math.ceil(chars/12))}`);
  }
  if(appendCurrent) await add("user",prompt);
  const assemblyInput = { query:prompt, refreshDailyStatus:async()=>({mood:"平静",weather:{label:""},asleep:false,injectionEnabled:false}), searchMemories:async()=>memories, searchPalace:async()=>({results:memories,skipped:!memories.length,backend:"audit-fixture"}), getAllRecords:async table=>table==="worldbook"?lore:[], characterRecord:character,collectExternalContext:()=>[],sessionId,characterId:character.id,appId:"pop",purpose:"chat",turnIntent:"user_message",promptSettingsOverride:{platformAdditionsEnabled:platform,contextBudgetProfile:profile},runtimeInstruction:buildRuntimeInstruction({actionIds:["talking_default","idle_default"],expressionIds:[]})};
  const summaryBeforePreview = memory.get("yueqi.context.branchSummaries.v1");
  const previewCompiled = await assemblePrompt({...assemblyInput, preview:true});
  assert.equal(memory.get("yueqi.context.branchSummaries.v1"),summaryBeforePreview,`${name}: preview must not persist a summary`);
  const previewMessages = await buildModelMessages(previewCompiled,prompt,sessionId);
  const compiled = await assemblePrompt(assemblyInput);
  const messages = await buildModelMessages(compiled,prompt,sessionId);
  assert.deepEqual(previewMessages,messages,`${name}: preview and real assembly must use the same messages on the same snapshot`);
  messages.splice(messages.findLastIndex(m=>m.role==="user"),0,{role:"system",content:compiled.runtimeInstruction,blockId:"runtime_protocol",provenance:"runtime.protocol"});
  const final = finalizeModelRequest(messages,{totalContextTokens:compiled.contextEnvelope.request.profile.totalInputTokens,outputReserveTokens:compiled.contextEnvelope.request.profile.outputReserveTokens,providerMode:"chat"});
  const characterBlock = compiled.canonical.blocks.find(b=>b.id==="character");
  const fullCharacter = `[Character]\n${compileCharacterCore(character,{conversationLanguage:"zh-CN"},{platformAdditionsEnabled:platform})}`;
  const result={name,fixture:{pairs,bodyCharsTarget:chars,platform,requestedProfile:profile,loreCount:lore.length,memoryCount:memories.length},actualProfile:compiled.contextEnvelope.request.profile,firstSpokenTurn:compiled.firstSpokenTurn,historyMessages:compiled.historyMessages.length,historyTokens:compiled.contextEnvelope.trace.historyTokens,omittedMessageIds:compiled.contextEnvelope.trace.omittedMessageIds,activatedLore:compiled.worldbook?.map(row=>({id:row.id,title:row.title}))||[],character:{originalTokens:estimatePromptTokens(fullCharacter),includedTokens:characterBlock.tokens,includedRatio:Number((characterBlock.tokens/estimatePromptTokens(fullCharacter)).toFixed(3)),trimReason:characterBlock.trimReason,tail:characterBlock.text.slice(-260)},canonicalBudget:{...compiled.promptBudget,available:compiled.canonical.totalBudget,used:compiled.canonical.totalUsed},blocks:compiled.canonical.blocks.map(b=>({id:b.id,tokens:b.tokens,trimReason:b.trimReason})),finalLedger:final.ledger,finalUserCount:final.messages.filter(m=>m.role==="user"&&m.content===prompt).length,messages:final.messages};
  assert.equal(result.finalUserCount,1,`${name}: current user must appear exactly once`);
  assert.equal(characterBlock.text,fullCharacter,`${name}: immutable persona must remain complete`);
  assert.equal(final.messages.find(m=>m.provenance==="semantic.character")?.content,fullCharacter,`${name}: final transport must keep complete persona`);
  assert.equal(result.actualProfile.id,profile,`${name}: requested profile must survive normalization`);
  assert.equal(final.ledger.withinBudget,true,`${name}: final request must fit the declared window`);
  assert.equal(final.ledger.trimmedMessages,0,`${name}: no partial protected messages`);
  assert.equal(final.ledger.droppedMessages,0,`${name}: upstream allocation must fit without a second history eviction`);
  const prior = compiled.historyMessages.filter(row=>row.content!==prompt);
  if(pairs && prior.length) assert.equal(prior[0].role,"user",`${name}: no orphan assistant history`);
  const includedIds = new Set(compiled.historyMessages.map(row=>row.messageId || row.id));
  assert.ok(result.omittedMessageIds.every(id=>!includedIds.has(id)),`${name}: summary evidence cannot overlap retained history`);
  if(compiled.contextEnvelope.branchSummary && result.omittedMessageIds.length) {
    assert.deepEqual(compiled.contextEnvelope.branchSummary.sourceMessageIds,result.omittedMessageIds,`${name}: summary must cover the actual evicted IDs`);
  }
  scenarios.push(result);
}
await run("cold_start_default");
await run("cold_start_builtin_worldbook",{lore:buildBuiltinNyraWorldbookEntries()});
await run("cold_start_platform_off",{platform:false});
await run("short_10_turns",{pairs:10,chars:10});
await run("medium_10_turns",{pairs:10,chars:100});
await run("long_20_turns",{pairs:20,chars:160});
await run("long_20_turns_deep",{pairs:20,chars:160,profile:"deep"});
await run("long_20_turns_platform_off",{pairs:20,chars:160,platform:false});
await run("cold_with_author_canon",{prompt:"你记得以前的事情吗",memories:[{id:"audit-origin",characterId:character.id,companionId:character.id,source:"character.history",sourceType:"authored_origin_memory",rawText:"Nyra 在遇到任何用户之前，独自整理过一个空房间。这是角色作者设定。",createdAt:"2026-01-01T00:00:00.000Z"}]});
for (const profile of ["compact", "balanced", "deep"]) {
  await run(`matrix_cold_${profile}`, { profile });
  for (const pairs of [10, 30, 100]) {
    const name = `matrix_${pairs}_turns_${profile}`;
    if (profile === "compact") {
      await assert.rejects(() => run(name, { pairs, chars:100, profile }), error => {
        assert.equal(error.code,"PROMPT_RECENT_EXCHANGE_TOO_LARGE");
        capacityRejections.push({ name, expected:true, profile, pairs, code:error.code, details:error.details });
        return true;
      });
    } else await run(name, { pairs, chars:100, profile });
  }
}
const normalizedOnce = normalizeContextRequest({purpose:"chat",characterId:character.id,budgetProfile:"deep",currentInput:query});
const normalizedTwice = normalizeContextRequest(normalizedOnce);
const output = {generatedAt:new Date().toISOString(),evidenceType:"offline real assembly with isolated Conversation V2; synthetic histories; no model calls",defaultFlags:DEFAULT_FEATURES,profileNormalization:{once:normalizedOnce.profile,twice:normalizedTwice.profile},scenarios,capacityRejections};
fs.mkdirSync(outputDirectory,{recursive:true});
fs.writeFileSync(path.join(outputDirectory,"prompt-offline-results.json"),JSON.stringify(output,null,2)+"\n");
const fullCharacterForDiagnostic = `[Character]\n${compileCharacterCore(character,{conversationLanguage:"zh-CN"},{platformAdditionsEnabled:true})}`;
const diagnosticCases = scenarios.filter(s=>["cold_start_builtin_worldbook","medium_10_turns","long_20_turns"].includes(s.name)).map(s=>{
  const baseline = s.messages.map(m=>({...m}));
  const restored = baseline.map(m=>({...m}));
  const index = restored.findIndex(m=>m.provenance==="semantic.character" || m.content.startsWith("[Character]\n"));
  const row = {role:"system",content:fullCharacterForDiagnostic,provenance:"diagnostic.character_restored"};
  if(index>=0) restored[index]=row; else restored.splice(1,0,row);
  const psychology = baseline.map(m=>({...m,content:m.provenance==="runtime.protocol" ? m.content.split("\n").map(line=>line.startsWith("不要写成旁观者提问或意图鉴定") ? "不要写成旁观者提问或意图鉴定，不推测用户在试探你，也不暗示未经证实的前情。只写角色此刻自己的反应，例如「我有点想笑。先忍一下。」；没有具体反应时省略。" : line).join("\n") : m.content}));
  const variants = [
    {id:"baseline",kind:"actual_production_assembly_on_synthetic_data",messages:baseline},
    {id:"restore_full_character",kind:"request_only_diagnostic_bypasses_product_input_budget",messages:restored},
    {id:"remove_intent_guessing_example",kind:"request_only_diagnostic_changes_one_runtime_instruction_line",messages:psychology},
  ].map(v=>({...v,estimatedInputTokens:v.messages.reduce((n,m)=>n+estimatePromptTokens(m.content)+4,0)}));
  return {fixture:s.name,variants};
});
fs.writeFileSync(path.join(outputDirectory,"prompt-ab-requests.json"),JSON.stringify({generatedAt:output.generatedAt,warning:"Synthetic data only. No model call was made. Baseline is now the repaired assembly; original failing baselines remain in dialogue-evaluation. Other variants are request-only diagnostics, not production changes.",fullCharacterForDiagnostic,cases:diagnosticCases},null,2)+"\n");
console.log(JSON.stringify(scenarios.map(({name,character,historyTokens,historyMessages,finalLedger,firstSpokenTurn})=>({name,firstSpokenTurn,historyTokens,historyMessages,personaRetention:character.includedRatio,finalTokens:finalLedger.finalInputTokens,finalDropped:finalLedger.droppedMessages})),null,2));
