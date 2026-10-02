/**
 * Enterprise context scale/evidence gates.
 * Real functions + generated fixtures; no source-string assertions.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/context-enterprise/results");
mkdirSync(outDir, { recursive: true });

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); },
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

let rngState = 0x5eed1234;
function random() {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 0x100000000;
}

const storage = memoryStorage();
globalThis.window = {
  localStorage: storage,
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const {
  __setContextStorageForTests,
  clearAllContextItems,
  putItem,
  exportContextBag,
  importContextBag,
} = await import("../src/context/store.js");
const { buildContextItem } = await import("../src/context/schema.js");
const { retrieveContext } = await import("../src/context/retrieve.js");
const { applyBudget, estimatePromptTokens } = await import("../src/prompt/budget.js");
const {
  __setConversationStorageForTests,
  clearAllConversations,
  exportConversationBag,
  importConversationBag,
} = await import("../src/conversation/index.js");
const {
  __setSessionMapStorageForTests,
  exportSessionMapBag,
  importSessionMapBag,
} = await import("../src/context/session-map.js");
const {
  __setBranchSummaryStorageForTests,
  exportBranchSummaryBag,
  importBranchSummaryBag,
} = await import("../src/context/branch-summary.js");
const {
  __setContextInspectorStorageForTests,
  clearContextTraces,
  listContextTraces,
  exportContextInspectorBag,
  importContextInspectorBag,
} = await import("../src/context/inspector.js");
const { buildContextEnvelope } = await import("../src/context/broker.js");
const { saveMoments } = await import("../src/moments/store.js");
const { COHABIT_TIMELINE_KEY, __setCohabitStorageForTests } = await import("../src/memory/cohabit-timeline.js");

__setContextStorageForTests(storage);
__setConversationStorageForTests(storage);
__setSessionMapStorageForTests(storage);
__setBranchSummaryStorageForTests(storage);
__setContextInspectorStorageForTests(storage);
__setCohabitStorageForTests(storage);
clearAllContextItems();
clearAllConversations();
clearContextTraces();

const gates = [];
function gate(id, pass, metrics = {}) {
  const row = { id, pass: Boolean(pass), ...metrics };
  gates.push(row);
  console.log(`${row.pass ? "PASS" : "FAIL"}  ${id} — ${JSON.stringify(metrics)}`);
}

// G1 — 200 annotated exact-intent queries. Top-5 recall must be >= 90%.
const retrievalCharacter = "retrieval-benchmark";
for (let i = 0; i < 200; i += 1) {
  const key = `anchor_${i.toString().padStart(3, "0")}_violet`;
  putItem(buildContextItem({
    content: `用户明确偏好 ${key} 对应的纪念方式`,
    summary: `偏好 ${key}`,
    kind: "semantic",
    source: "benchmark.annotated",
    sourceRef: `annotation:${i}`,
    characterId: retrievalCharacter,
    workspaceId: retrievalCharacter,
    privacyLevel: "shared",
    retention: "permanent",
    confidence: 0.96,
    skipDedupe: true,
  }, { id: `retrieval-${i}` }));
}
let retrievalHits = 0;
const retrievalDurations = [];
for (let i = 0; i < 200; i += 1) {
  const key = `anchor_${i.toString().padStart(3, "0")}_violet`;
  const started = performance.now();
  const result = retrieveContext({
    characterId: retrievalCharacter,
    workspaceId: retrievalCharacter,
    query: key,
    limit: 5,
    markUsed: false,
  });
  retrievalDurations.push(performance.now() - started);
  if (result.items.some((item) => item.id === `retrieval-${i}`)) retrievalHits += 1;
}
const recallAt5 = retrievalHits / 200;
gate("retrieval_200_top5", recallAt5 >= 0.9, {
  annotatedQueries: 200,
  hits: retrievalHits,
  recallAt5: Number(recallAt5.toFixed(4)),
  p95MsDesktopNode: Number(percentile(retrievalDurations, 0.95).toFixed(3)),
});

// G2 — 1,000 character/workspace isolation queries against 1,000 mixed records.
for (let c = 0; c < 20; c += 1) {
  const characterId = `iso-char-${c}`;
  for (let i = 0; i < 50; i += 1) {
    const globalIndex = c * 50 + i;
    putItem(buildContextItem({
      content: `隔离事实 iso_secret_${globalIndex} 属于 ${characterId}`,
      summary: `iso_secret_${globalIndex}`,
      kind: "semantic",
      source: "benchmark.isolation",
      sourceRef: `isolation:${globalIndex}`,
      characterId,
      workspaceId: `workspace-${c}`,
      privacyLevel: "shared",
      retention: "permanent",
      confidence: 0.95,
      skipDedupe: true,
    }, { id: `isolation-${globalIndex}` }));
  }
}
let isolationLeaks = 0;
let isolationMisses = 0;
const isolationDurations = [];
for (let q = 0; q < 1000; q += 1) {
  const owner = q % 20;
  const ownIndex = owner * 50 + (q % 50);
  const started = performance.now();
  const result = retrieveContext({
    characterId: `iso-char-${owner}`,
    workspaceId: `workspace-${owner}`,
    query: `iso_secret_${ownIndex}`,
    limit: 8,
    markUsed: false,
  });
  isolationDurations.push(performance.now() - started);
  isolationLeaks += result.items.filter((item) => item.characterId !== `iso-char-${owner}` || item.workspaceId !== `workspace-${owner}`).length;
  if (!result.items.some((item) => item.id === `isolation-${ownIndex}`)) isolationMisses += 1;
}
gate("isolation_1000_matrix", isolationLeaks === 0 && isolationMisses === 0, {
  queries: 1000,
  records: 1000,
  leaks: isolationLeaks,
  misses: isolationMisses,
  p95MsDesktopNode: Number(percentile(isolationDurations, 0.95).toFixed(3)),
});

// G3 — 1,000 randomized prompt budgets. No overflow and no partial JSON lines.
let budgetOverflows = 0;
let malformedStructuredLines = 0;
for (let iteration = 0; iteration < 1000; iteration += 1) {
  const totalBudget = 256 + Math.floor(random() * 11744);
  const blocks = [
    { id: "platform_safety", source: "property", text: "安全规则。".repeat(1 + Math.floor(random() * 12)) },
    { id: "character_package", source: "property", text: "角色契约。".repeat(1 + Math.floor(random() * 20)) },
    { id: "user_input", source: "property", text: "用户输入。".repeat(1 + Math.floor(random() * 80)) },
    { id: "post_history_contract", source: "property", text: "回复契约。".repeat(1 + Math.floor(random() * 12)) },
  ];
  for (let b = 0; b < 12; b += 1) {
    const lines = Array.from({ length: 1 + Math.floor(random() * 18) }, (_, line) => JSON.stringify({ b, line, value: "结构化内容".repeat(1 + Math.floor(random() * 8)) }));
    blocks.push({ id: b % 2 ? "long_term_memory" : `optional_${b}`, source: "property.structured", text: lines.join("\n") });
  }
  const requiredTokens = blocks.slice(0, 4).reduce((sum, block) => sum + estimatePromptTokens(block.text), 0);
  let result;
  try {
    result = applyBudget(blocks, { totalBudget });
  } catch (error) {
    if (error.code !== "PROMPT_REQUIRED_CONTEXT_TOO_LARGE" || requiredTokens <= totalBudget) throw error;
    continue; // An impossible immutable request is rejected, never silently shortened.
  }
  if (requiredTokens > totalBudget) budgetOverflows += 1;
  if (result.overflow || result.totalUsed > totalBudget) budgetOverflows += 1;
  for (const block of result.blocks.filter((item) => item.source === "property.structured" && item.text)) {
    for (const line of block.text.split("\n")) {
      try { JSON.parse(line); } catch { malformedStructuredLines += 1; }
    }
    if (estimatePromptTokens(block.text) !== block.tokens) malformedStructuredLines += 1;
  }
}
gate("budget_property_1000", budgetOverflows === 0 && malformedStructuredLines === 0, {
  cases: 1000,
  overflows: budgetOverflows,
  malformedStructuredLines,
});

// G4 — desktop P95 at the contractual effective load. Cohabit is physically
// capped at 80 for prompt use, but the raw fixture contains 1,000 events to
// prove the projector does not scan them into the prompt.
const perfCharacter = "performance-character";
const perfGraph = exportContextBag();
for (let i = 0; i < 5000; i += 1) {
  perfGraph.items[`perf-${i}`] = buildContextItem({
    content: `性能事实 perf_topic_${i % 100} 第 ${i} 条`,
    summary: `perf_topic_${i % 100} #${i}`,
    kind: i % 5 === 0 ? "episodic" : "semantic",
    source: "benchmark.performance",
    sourceRef: `perf:${i}`,
    characterId: perfCharacter,
    workspaceId: perfCharacter,
    privacyLevel: "shared",
    retention: "permanent",
    confidence: 0.9,
    skipDedupe: true,
  }, { id: `perf-${i}` });
}
importContextBag(perfGraph);
storage.setItem(COHABIT_TIMELINE_KEY, JSON.stringify({
  events: Array.from({ length: 1000 }, (_, i) => ({
    id: `perf-event-${i}`,
    at: new Date(Date.now() - i * 60000).toISOString(),
    appId: "listen",
    kind: "progress",
    summary: `一起听进度 ${i}`,
    characterId: perfCharacter,
    participantIds: [perfCharacter],
    visibility: "shared",
    consent: "in_app_action",
    quarantined: false,
    idempotencyKey: `track-${i % 20}`,
  })),
}));
saveMoments(Array.from({ length: 200 }, (_, i) => ({
  id: `perf-moment-${i}`,
  authorType: "user",
  authorId: "user",
  sourceType: "local",
  content: `性能动态 ${i} perf_topic_${i % 100}`,
  createdAt: new Date(Date.now() - i * 60000).toISOString(),
  shareWithCompanion: true,
  visibleToCharacterIds: [perfCharacter],
  privacy: "companion_shared",
})), "performance_fixture");
const contextBuildDurations = [];
for (let i = 0; i < 60; i += 1) {
  const started = performance.now();
  const envelope = await buildContextEnvelope({
    purpose: "chat",
    appId: "pop",
    characterId: perfCharacter,
    workspaceId: perfCharacter,
    chatSessionId: `char:${perfCharacter}`,
    conversationKind: "dm",
    currentInput: `回忆 perf_topic_${i % 100}`,
    turnIntent: "user_message",
    reconcileLegacy: false,
    includeWorldbook: false,
  });
  contextBuildDurations.push(performance.now() - started);
  if (!envelope.trace.withinBudget) budgetOverflows += 1;
}
const contextP95 = percentile(contextBuildDurations.slice(5), 0.95);
gate("desktop_context_p95", contextP95 <= 150 && budgetOverflows === 0, {
  memoryRecords: 5000,
  rawEvents: 1000,
  moments: 200,
  samples: 55,
  p95MsDesktopNode: Number(contextP95.toFixed(3)),
  targetMs: 150,
});

// G5 — broker-level managed capacity across all profiles and varying input sizes.
let brokerOverflows = 0;
let brokerCases = 0;
for (const profile of ["compact", "balanced", "deep"]) {
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const currentInput = "本轮输入".repeat(1 + Math.floor(random() * 250));
    const sourceMessages = Array.from({ length: 36 }, (_, i) => ({
      id: `${profile}-${iteration}-${i}`,
      role: i % 2 ? "assistant" : "user",
      content: `历史 ${i} ` + "连续对话内容".repeat(10 + Math.floor(random() * 25)),
    }));
    const envelope = await buildContextEnvelope({
      purpose: "cocreate",
      appId: "property",
      characterId: `property-${profile}-${iteration}`,
      workspaceId: `property-${profile}-${iteration}`,
      chatSessionId: `project:property:${profile}:${iteration}`,
      conversationKind: "project",
      budgetProfile: profile,
      currentInput,
      turnIntent: "user_message",
      sourceMessages,
      reconcileLegacy: false,
      includeBranchSummary: false,
      includeContextGraph: false,
      includeCohabit: false,
      includeMoments: false,
      includeWorldbook: false,
      additionalImplicitBlocks: [{ id: "property_blob", source: "property", priority: 50, text: "隐式资料。".repeat(1200) }],
    });
    brokerCases += 1;
    if (!envelope.trace.withinBudget || envelope.trace.totalManagedTokens > envelope.trace.managedCapacity) brokerOverflows += 1;
  }
}
gate("broker_hard_capacity", brokerOverflows === 0, { cases: brokerCases, overflows: brokerOverflows });

// G6 — backup round-trip for all new context stores (Inspector intentionally local diagnostics).
const snapshots = {
  conversation: exportConversationBag(),
  graph: exportContextBag(),
  sessionMap: exportSessionMapBag(),
  branchSummary: exportBranchSummaryBag(),
  inspector: exportContextInspectorBag(),
};
const expected = {
  conversationSessions: Object.keys(snapshots.conversation.sessions || {}).length,
  graphItems: Object.keys(snapshots.graph.items || {}).length,
  mappings: Object.keys(snapshots.sessionMap.mappings || {}).length,
  traces: snapshots.inspector.traces?.length || 0,
};
clearAllConversations();
clearAllContextItems();
clearContextTraces();
importConversationBag(snapshots.conversation);
importContextBag(snapshots.graph);
importSessionMapBag(snapshots.sessionMap);
importBranchSummaryBag(snapshots.branchSummary);
importContextInspectorBag(snapshots.inspector);
const actual = {
  conversationSessions: Object.keys(exportConversationBag().sessions || {}).length,
  graphItems: Object.keys(exportContextBag().items || {}).length,
  mappings: Object.keys(exportSessionMapBag().mappings || {}).length,
  traces: listContextTraces({ limit: 100 }).length,
};
gate("context_backup_roundtrip", JSON.stringify(expected) === JSON.stringify(actual), { expected, actual });

const passed = gates.filter((item) => item.pass).length;
const failed = gates.length - passed;
const report = {
  at: new Date().toISOString(),
  command: "npm run verify:context-enterprise:scale",
  grade: failed ? "Product RED" : "local_scale_green",
  passed,
  failed,
  gates,
  limitations: [
    "P95 is measured in desktop Node on this machine, not Android OEM hardware.",
    "Annotated retrieval set is deterministic synthetic data; it proves the contract, not real-user relevance quality.",
  ],
};
writeFileSync(join(outDir, "SCALE_LATEST.json"), JSON.stringify(report, null, 2));
console.log(`\ncontext enterprise scale: ${passed}/${gates.length} gates passed`);
process.exit(failed ? 1 : 0);
