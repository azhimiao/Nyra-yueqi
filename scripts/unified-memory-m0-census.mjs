/**
 * M0 optional helper — prints static writer/reader inventory for reproducibility.
 * Does not open IndexedDB; live palace rows need a browser harness (see M0_LEGACY_CENSUS.md).
 *
 * Run: node scripts/unified-memory-m0-census.mjs
 */

const INVENTORY = {
  headNote: "Embedded from docs/qa/unified-memory/M0_DIRECT_WRITERS.md (M0 freeze)",
  naming: {
    appendMemory: "absent",
    upsertMemory: "absent",
    palaceWritePath: "fileDrawer -> ingestMemory",
  },
  flagOverlap: {
    palaceProjectionV1: "companion-intelligence (existing)",
    palaceProjectionOnlyV1: "unified-memory §14 (new, not an alias)",
  },
  writers: [
    { system: "MemPalace", api: "fileDrawer", file: "src/memory/palace/drawer.js", authorityIssue: true },
    { system: "MemPalace", api: "ingestMemory", file: "src/storage/db.js", authorityIssue: false },
    { system: "MemPalace", api: "updateMemory/deleteMemory", file: "src/memory/rag-ops.js", authorityIssue: true },
    { system: "Diary", api: "saveDiary", file: "src/diary/records.js", authorityIssue: true, note: "diary-in-palace" },
    { system: "Scenario", api: "saveDiary", file: "src/scenario/runtime/persistence.js", authorityIssue: true },
    { system: "Reading", api: "ingestBookChunks", file: "src/library/books-import.js", authorityIssue: true },
    { system: "Proactive", api: "ingestMemoryAndRender", file: "src/proactive/pipeline.js", authorityIssue: true },
    { system: "ContextGraph", api: "putItem", file: "src/context/store.js", authorityIssue: false },
    { system: "ContextGraph", api: "ingestCandidate", file: "src/context/pipeline.js", authorityIssue: false },
    { system: "CandidateLedger", api: "submitCandidate", file: "src/memory/candidate-ledger.js", authorityIssue: false },
    { system: "StableMemory", api: "promoteCandidateToStable", file: "src/memory/candidate-ledger.js", authorityIssue: false },
    { system: "Consolidator", api: "consolidateSessionMemory", file: "src/companion/memory-consolidator.js", authorityIssue: true },
    { system: "ScenarioBridge", api: "ingestCandidate", file: "src/companion/scenario-memory-bridge.js", authorityIssue: false },
    { system: "Timeline", api: "appendTimelineEvent", file: "src/timeline/repository.js", authorityIssue: false },
    { system: "Cohabit", api: "appendCohabitEvent", file: "src/memory/cohabit-timeline.js", authorityIssue: true, note: "dual-run timeline+life" },
    { system: "Life", api: "saveDayPack", file: "src/life/store.js", authorityIssue: false },
    { system: "Listen", api: "appendCohabitEvent", file: "src/phone-shell/phone-listen.js", authorityIssue: false },
    { system: "Reader", api: "appendCohabitEvent", file: "src/phone-shell/phone-reader.js", authorityIssue: false },
    { system: "Experience", api: "commitCandidateProjection", file: "src/experience/memory.js", authorityIssue: true },
  ],
  readers: [
    { system: "MemPalace", api: "searchPalace", file: "src/memory/palace/search.js", usedBy: "assemble.js" },
    { system: "MemPalace", api: "searchMemories", file: "src/memory/rag.js", usedBy: "assemble fallback" },
    { system: "ContextGraph", api: "retrieveContext", file: "src/context/retrieve.js", usedBy: "broker" },
    { system: "Broker", api: "buildContextEnvelope", file: "src/context/broker.js", usedBy: "assemble, diary, proactive, scenario, adventure, cocreate, skills" },
    { system: "Stable", api: "recallStableMemory", file: "src/memory/candidate-ledger.js", usedBy: "broker" },
    { system: "Timeline", api: "listTimelineEvents", file: "src/timeline/repository.js", usedBy: "assemble today-context" },
    { system: "Cohabit", api: "projectCohabitContext", file: "src/context/cohabit-projector.js", usedBy: "broker" },
  ],
  assembleDualPath: {
    palaceSearch: "src/prompt/assemble.js:667-676",
    broker: "src/prompt/assemble.js:766-815",
    palaceBlockId: "palace_memory",
  },
};

function main() {
  console.log(JSON.stringify(INVENTORY, null, 2));
  console.log(`\nwriters=${INVENTORY.writers.length} readers=${INVENTORY.readers.length}`);
}

main();
