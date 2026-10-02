/**
 * Unified memory M8 — Context Broker single retrieval entry.
 *
 * Run: npm run verify:unified-memory-broker
 * Alias: npm run verify:unified-memory-m8
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_KEYS } from "../src/constants.js";
import { setCutoverProfile } from "../src/features/cutover-profile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(root, "docs/qa/unified-memory");
mkdirSync(evidenceDir, { recursive: true });

const memory = new Map();
const memStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage = memStorage;
globalThis.window = {
  localStorage: memStorage,
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = {
  documentElement: { lang: "zh-CN", getAttribute: () => null, setAttribute() {} },
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {} },
};

function setFlags(partial = {}) {
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(partial));
}

function resetAll() {
  memory.clear();
  setFlags({});
  // This harness explicitly exercises the new broker flag. The product
  // default remains legacy; the test must opt into the internal profile first.
  setCutoverProfile("internal_v1");
}

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

const {
  dedupeBlocksBySourceRef,
  coordinateBrokerRetrieval,
  retrievePalaceForBroker,
} = await import("../src/context/retrieval-coordinator.js");

const { buildContextEnvelope } = await import("../src/context/broker.js");
const { getPurposePolicy } = await import("../src/context/purpose-policy.js");
const { CONTEXT_PURPOSES } = await import("../src/context/contract.js");

const {
  __setConversationStorageForTests,
  clearAllConversations,
} = await import("../src/conversation/index.js");
const { writeCompanionTurn } = await import("../src/conversation/companion-write.js");
const { relationshipIdFor } = await import("../src/memory/companion-scope.js");

__setConversationStorageForTests(memStorage);

const companionId = "m8-companion";
const userId = "local";
const relId = relationshipIdFor(userId, companionId);

async function seedConversation() {
  clearAllConversations();
  await writeCompanionTurn({
    role: "user",
    text: "你好",
    userId,
    companionId,
    chatSessionId: `dm:${companionId}`,
    saveChatMessage: async (m) => m,
  });
  await writeCompanionTurn({
    role: "assistant",
    text: "我在。",
    userId,
    companionId,
    chatSessionId: `dm:${companionId}`,
    saveChatMessage: async (m) => m,
  });
}

// --- 1. duplicate sourceRef collapsed ---
{
  const blocks = [
    {
      id: "stable_memory",
      text: "【稳定理解】\n- 用户讨厌临时改计划",
      source: "memory.stable",
      priority: 88,
      sourceRef: "pref:hate-reschedule",
    },
    {
      id: "palace_memory",
      text: "宫殿检索：用户讨厌临时改计划",
      source: "memory.palace",
      priority: 85,
      sourceRef: "pref:hate-reschedule",
    },
    {
      id: "context_graph",
      text: "【图谱】别的事实",
      source: "context.graph",
      priority: 90,
      sourceRef: "graph:other",
    },
  ];
  const out = dedupeBlocksBySourceRef(blocks);
  const refs = out.map((b) => b.sourceRef);
  const pass =
    out.length === 2
    && refs.filter((r) => r === "pref:hate-reschedule").length === 1
    && out.some((b) => b.id === "stable_memory")
    && !out.some((b) => b.id === "palace_memory");
  record("duplicate_sourceRef_collapsed", pass, `kept=${out.map((b) => b.id).join(",")}`);
}

// --- 2. purpose policy light extensions ---
{
  const reading = getPurposePolicy("reading");
  const listening = getPurposePolicy("listening");
  const calendar = getPurposePolicy("calendar");
  const pass =
    CONTEXT_PURPOSES.includes("reading")
    && CONTEXT_PURPOSES.includes("listening")
    && CONTEXT_PURPOSES.includes("calendar")
    && reading.includePalace === true
    && listening.includePalace === false
    && calendar.includePalace === false
    && getPurposePolicy("proactive").includePalace === false;
  record("purpose_policy_reading_listening_calendar", pass);
}

// --- 3. broker flag on: envelope + coordinator palace via injected search ---
{
  resetAll();
  setFlags({ singleBrokerRetrievalV1: true });
  let palaceCalls = 0;
  const searchPalace = async () => {
    palaceCalls += 1;
    return {
      results: [{
        id: "mem-1",
        wing: "Relationship",
        room: "prefs",
        source: "drawer",
        rawText: "喜欢晚一点回消息",
        companionId,
        sourceRef: "diary:night-reply",
        contentHash: "hash-night",
      }],
      skipped: false,
      backend: "mock",
      kgBlock: "",
    };
  };

  const envelope = await buildContextEnvelope({
    purpose: "chat",
    userId,
    characterId: companionId,
    activeCompanionId: companionId,
    relationshipId: relId,
    currentInput: "你还记得我的习惯吗",
    includeHistory: false,
    includeWorldbook: false,
    includeCohabit: false,
    includeMoments: false,
    includeContextGraph: false,
    includePalace: true,
    searchPalace,
  });

  const palaceBlock = (envelope.blocks || []).find((b) => b.id === "palace_memory");
  const pass =
    envelope
    && envelope.blocks
    && palaceCalls >= 1
    && Boolean(palaceBlock)
    && envelope.trace?.singleBrokerRetrievalV1 === true
    && envelope.trace?.retrievalCoordinator?.palaceBackend === "mock";
  record("broker_flag_on_returns_envelope_with_palace", pass, `calls=${palaceCalls} blocks=${envelope.blocks?.length}`);
}

// --- 4. broker flag on: duplicate sourceRef across additional + palace collapsed ---
{
  resetAll();
  setFlags({ singleBrokerRetrievalV1: true });
  const searchPalace = async () => ({
    results: [{
      id: "mem-dup",
      wing: "Relationship",
      room: "prefs",
      source: "drawer",
      rawText: "同一偏好",
      companionId,
      sourceRef: "same-ref-m8",
      contentHash: "h1",
    }],
    skipped: false,
    backend: "mock",
  });

  const envelope = await buildContextEnvelope({
    purpose: "chat",
    userId,
    characterId: companionId,
    activeCompanionId: companionId,
    relationshipId: relId,
    currentInput: "偏好",
    includeHistory: false,
    includeWorldbook: false,
    includeCohabit: false,
    includeMoments: false,
    includeContextGraph: false,
    includePalace: true,
    searchPalace,
    additionalImplicitBlocks: [{
      id: "stable_memory",
      text: "【稳定理解】\n- 同一偏好",
      source: "memory.stable",
      priority: 88,
      companionId,
      sourceRef: "same-ref-m8",
    }],
  });

  const withRef = (envelope.blocks || []).filter((b) => {
    const refs = [
      b.sourceRef,
      ...(Array.isArray(b.sourceRefs) ? b.sourceRefs : []),
      ...(Array.isArray(b.provenance) ? b.provenance.map((p) => p.sourceRef || p.evidenceRef) : []),
    ].filter(Boolean);
    return refs.some((r) => String(r).includes("same-ref-m8"));
  });
  const pass = withRef.length === 1 && withRef[0].source === "memory.stable";
  record("broker_envelope_dedupes_sourceRef", pass, `survivors=${withRef.map((b) => b.id).join(",")}`);
}

// --- 5. broker flag off: does not call injected searchPalace ---
{
  resetAll();
  setFlags({ singleBrokerRetrievalV1: false });
  let palaceCalls = 0;
  const searchPalace = async () => {
    palaceCalls += 1;
    return { results: [], skipped: true, backend: "mock" };
  };
  const envelope = await buildContextEnvelope({
    purpose: "chat",
    userId,
    characterId: companionId,
    currentInput: "hello",
    includeHistory: false,
    includeWorldbook: false,
    includeCohabit: false,
    includeMoments: false,
    includeContextGraph: false,
    includePalace: true,
    searchPalace,
  });
  const pass = palaceCalls === 0 && Boolean(envelope) && !envelope.trace?.singleBrokerRetrievalV1;
  record("broker_flag_off_skips_coordinator_palace", pass, `calls=${palaceCalls}`);
}

// --- 6–7. assemblePrompt: flag on skips searchPalace; flag off invokes it ---
{
  await seedConversation();
  const { assemblePrompt } = await import("../src/prompt/assemble.js");

  async function runAssemble(flagOn) {
    resetAll();
    // Keep memoryRag / worldbook defaults from DEFAULT_FEATURES via merge; only toggle broker flag.
    setFlags({
      singleBrokerRetrievalV1: flagOn,
      memoryRag: true,
      worldbook: false,
      external: false,
      temporalContextV1: false,
      relationshipContinuityV1: false,
    });
    await seedConversation();

    let calls = 0;
    const searchPalace = async () => {
      calls += 1;
      return {
        results: [{
          id: "a1",
          wing: "Relationship",
          room: "chat",
          source: "drawer",
          rawText: "assemble spy hit",
          companionId,
          sourceRef: "assemble:spy",
        }],
        skipped: false,
        backend: "spy",
        kgBlock: "",
      };
    };

    const compiled = await assemblePrompt({
      query: "还记得吗",
      refreshDailyStatus: async () => ({
        mood: "平静",
        weather: { label: "晴" },
        asleep: false,
        injectionEnabled: false,
      }),
      searchMemories: async () => [],
      searchPalace,
      getAllRecords: async () => [],
      collectCharacterProfile: () => ({ id: companionId, name: "M8", alias: "" }),
      collectExternalContext: () => [],
      collectPromptTexts: () => ({ promptSystem: "sys", promptDeveloper: "" }),
      sessionId: `dm:${companionId}`,
      characterId: companionId,
      purpose: "chat",
      appId: "pop",
    });
    return { calls, compiled };
  }

  const on = await runAssemble(true);
  const passOn =
    on.calls === 0
    && Boolean(on.compiled?.contextEnvelope)
    && on.compiled.contextEnvelope.trace?.singleBrokerRetrievalV1 === true;
  record("assemble_flag_on_does_not_call_searchPalace", passOn, `calls=${on.calls}`);

  const off = await runAssemble(false);
  const passOff =
    off.calls >= 1
    && Boolean(off.compiled?.contextEnvelope)
    && !off.compiled.contextEnvelope.trace?.singleBrokerRetrievalV1;
  record("assemble_flag_off_still_calls_searchPalace", passOff, `calls=${off.calls}`);
}

// --- 8. coordinateBrokerRetrieval unit: palace + dedupe ---
{
  const result = await coordinateBrokerRetrieval({
    blocks: [{
      id: "stable_memory",
      text: "stable",
      source: "memory.stable",
      priority: 88,
      sourceRef: "coord-1",
    }],
    includePalace: true,
    query: "q",
    companionId,
    searchPalace: async () => ({
      results: [{
        id: "p",
        wing: "W",
        room: "R",
        source: "drawer",
        rawText: "palace",
        companionId,
        sourceRef: "coord-1",
      }],
      skipped: false,
      backend: "mock",
    }),
  });
  const pass =
    result.blocks.length === 1
    && result.blocks[0].id === "stable_memory"
    && result.droppedCount >= 1;
  record("coordinator_dedupes_palace_against_stable", pass, `blocks=${result.blocks.length}`);
}

// --- 9. retrievePalaceForBroker scopes companion ---
{
  const result = await retrievePalaceForBroker({
    query: "x",
    companionId: "c-a",
    searchPalace: async () => ({
      results: [
        { id: "1", wing: "W", room: "R", source: "d", rawText: "a", companionId: "c-a", sourceRef: "r1" },
        { id: "2", wing: "W", room: "R", source: "d", rawText: "b", companionId: "c-b", sourceRef: "r2" },
      ],
      skipped: false,
      backend: "mock",
    }),
  });
  const pass = result.memories.length === 1 && result.memories[0].id === "1";
  record("palace_broker_retrieval_companion_scoped", pass, `n=${result.memories.length}`);
}

const failed = cases.filter((c) => !c.pass);
const report = {
  wave: "M8",
  script: "scripts/verify-unified-memory-broker.mjs",
  passed: failed.length === 0,
  total: cases.length,
  failed: failed.map((c) => c.id),
  cases,
  at: new Date().toISOString(),
};

writeFileSync(join(evidenceDir, "M8_VERIFY.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const md = `# M8 — Context Broker single entry

Wave: **M8**  
Plan: [UNIFIED_MEMORY_FEATURE_CONTEXT_CURSOR_PLAN.md](../../UNIFIED_MEMORY_FEATURE_CONTEXT_CURSOR_PLAN.md) §10 / §M8  
Date: 2026-08-08

## Goal

When \`singleBrokerRetrievalV1\` is on, \`assemblePrompt\` must not call \`searchPalace\`/\`searchMemories\` directly. Context Broker + Retrieval Coordinator is the sole Prompt retrieval entry. Duplicate \`sourceRef\` collapsed in envelope blocks.

## Delivered

| Artifact | Path |
|----------|------|
| Retrieval Coordinator | \`src/context/retrieval-coordinator.js\` |
| Broker palace + dedupe (flag on) | \`src/context/broker.js\` |
| Assemble dual-path gate | \`src/prompt/assemble.js\` |
| Purpose policy reading/listening/calendar | \`src/context/purpose-policy.js\` |
| Verify | \`scripts/verify-unified-memory-broker.mjs\` |

## Feature flag

| Flag | Default | M8 role |
|------|---------|---------|
| \`singleBrokerRetrievalV1\` | **false** | Assemble skips direct palace search; broker runs coordinator + sourceRef dedupe |

Flag-off: legacy assemble → \`searchPalace\` → \`palace_memory\` additional block (unchanged).

## Acceptance

| Condition | Case |
|-----------|------|
| Duplicate sourceRef collapsed | \`duplicate_sourceRef_collapsed\` / \`broker_envelope_dedupes_sourceRef\` |
| Flag on: assemble does not call searchPalace | \`assemble_flag_on_does_not_call_searchPalace\` |
| Flag off: searchPalace still invoked | \`assemble_flag_off_still_calls_searchPalace\` |
| Broker returns envelope with coordinator palace | \`broker_flag_on_returns_envelope_with_palace\` |
| Purpose policy extensions | \`purpose_policy_reading_listening_calendar\` |

## Verify

\`\`\`bash
npm run verify:unified-memory-broker
npm run verify:unified-memory-m8
\`\`\`

## Result

${failed.length === 0 ? "**PASS**" : "**FAIL**"} — ${cases.filter((c) => c.pass).length}/${cases.length} cases.

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;

writeFileSync(join(evidenceDir, "M8_BROKER.md"), md, "utf8");

if (failed.length) {
  console.error(`\nM8 FAIL: ${failed.map((c) => c.id).join(", ")}`);
  process.exit(1);
}
console.log(`\nM8 PASS: ${cases.length}/${cases.length}`);
assert.equal(failed.length, 0);
