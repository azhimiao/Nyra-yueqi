/**
 * W0 — Export LocalStorage / IndexedDB schema key samples for open-experience migration fixtures.
 * Uses mock storage describing known keys from the codebase (no browser required).
 *
 * Run: node scripts/export-open-experience-baseline.mjs
 * Writes: docs/qa/open-experience/baseline/STORAGE_SAMPLE.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs/qa/open-experience/baseline");
const outFile = join(outDir, "STORAGE_SAMPLE.md");

/** Known keys grounded in src/conversation, src/scenario, src/worldbook, src/constants, src/storage/db.js */
const FIXTURE = {
  exportedAt: new Date().toISOString(),
  productGrade: "Product RED / Architecture Prototype",
  localStorage: {
    "yueqi.conversation.v1": {
      source: "src/conversation/schema.js + store.js",
      schemaVersion: 1,
      bagKeys: ["schemaVersion", "sessions", "activeByCharacter"],
      sessionKeys: [
        "id",
        "characterId",
        "createdAt",
        "updatedAt",
        "mode",
        "turns",
        "scenarioRunId",
        "loreEntryIds",
        "meta",
      ],
      turnKeys: ["id", "role", "text", "mode", "createdAt", "meta"],
      sample: {
        schemaVersion: 1,
        sessions: {
          "conv-sample": {
            id: "conv-sample",
            characterId: "char-xingli",
            createdAt: "2026-07-27T00:00:00.000Z",
            updatedAt: "2026-07-27T00:00:00.000Z",
            mode: "chat",
            turns: [
              {
                id: "turn-sample",
                role: "user",
                text: "雨里等车",
                mode: "chat",
                createdAt: "2026-07-27T00:00:00.000Z",
                meta: {},
              },
            ],
            scenarioRunId: "run-sample",
            loreEntryIds: ["wb-sample"],
            meta: {},
          },
        },
        activeByCharacter: { "char-xingli": "conv-sample" },
      },
    },
    "yueqi.scenario.v1": {
      source: "src/scenario/store.js",
      bagKeys: ["scripts", "runs"],
      runKeys: [
        "id",
        "scriptId",
        "status",
        "phase",
        "cast",
        "memoryCommitted",
        "loreEntryIds",
        "beats",
        "directorState",
        "startedAt",
        "updatedAt",
        "endedAt",
        "summary",
      ],
      directorStateKeys: [
        "tension",
        "intimacy",
        "trust",
        "lastBeatType",
        "beatCursor",
        "beatNodeId",
        "backgroundId",
        "phase",
        "flags",
        "lastBeatId",
        "lastActionId",
        "lastExpressionId",
        "lastEmotion",
        "memoryCandidate",
        "resumePhase",
        "lastGenerationSource",
        "lastGenerationReason",
      ],
      sample: {
        scripts: [],
        runs: [
          {
            id: "run-sample",
            scriptId: "script-rain-station",
            status: "active",
            phase: "waiting_choice",
            cast: { leadId: "char-xingli", memberIds: [] },
            memoryCommitted: false,
            loreEntryIds: ["wb-sample"],
            beats: [
              {
                id: "beat-sample",
                at: 0,
                kind: "narration",
                text: "夜雨车站开幕。",
              },
            ],
            directorState: {
              tension: 1,
              intimacy: 0,
              trust: 0,
              lastBeatType: "narration",
              beatCursor: 0,
              beatNodeId: "",
              backgroundId: "",
              phase: "waiting_choice",
              flags: {},
              lastGenerationSource: "offline_fixed",
              lastGenerationReason: "missing_provider_config",
            },
            startedAt: "2026-07-27T00:00:00.000Z",
            updatedAt: "2026-07-27T00:00:00.000Z",
          },
        ],
      },
    },
    "yueqi.worldbook.v1": {
      source: "src/constants.js LOCAL_KEYS.worldKey — LS mirror / IDB fallback path in storage/db.js",
      note: "Primary worldbook rows live in IndexedDB objectStore `worldbook`; LS key may mirror legacy.",
      entryKeys: [
        "id",
        "title",
        "category",
        "triggers",
        "content",
        "injectSlot",
        "priority",
        "enabled",
        "scopeApps",
        "linkedCharacterIds",
        "updatedAt",
      ],
    },
  },
  indexedDB: {
    name: "yueqi-companion-local",
    version: 7,
    source: "src/constants.js MEMORY_DB + src/storage/db.js REQUIRED_STORES",
    objectStores: [
      "memories",
      "worldbook",
      "settings",
      "media",
      "messages",
      "conversations",
      "palace_kg",
      "characters",
      "sidewrite_payloads",
    ],
    worldbook: {
      keyPath: "id",
      entryKeys: [
        "id",
        "title",
        "category",
        "triggers",
        "content",
        "injectSlot",
        "priority",
        "enabled",
        "scopeApps",
        "linkedCharacterIds",
        "updatedAt",
      ],
      sample: {
        id: "wb-sample",
        title: "夜雨车站·氛围",
        category: "氛围",
        triggers: ["夜雨", "车站", "伞"],
        content: "雨声贴着站台铁皮，伞下只有你们两个人。",
        injectSlot: "world_context",
        priority: 50,
        enabled: true,
        scopeApps: [],
        linkedCharacterIds: ["char-xingli"],
        updatedAt: "2026-07-27T00:00:00.000Z",
      },
    },
  },
  telemetry: {
    event: "yueqi:director-generation",
    sources: ["model", "offline_fixed", "offline_fallback"],
    persistField: "run.directorState.lastGenerationSource",
    reasonField: "run.directorState.lastGenerationReason",
    note: "offline_fallback is W0-loud and becomes illegal on the formal path in W2.",
  },
  migrationNotes: [
    "Conversation V1 bag is linear turns[]; W1 migrates to V2 graph with branch/candidate (do not wipe this key).",
    "ScenarioRun.beats[] is dual-write today; later becomes migration input only — preserve runs for fixtures.",
    "Worldbook IDB rows must round-trip via normalizeWorldbookEntry keys above.",
    "lastGenerationSource is additive W0 telemetry; migrators should copy or default to empty string.",
  ],
};

function collectKeys(obj, prefix = "") {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    keys.push(path);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectKeys(v, path));
    }
  }
  return keys;
}

function renderMarkdown(fixture) {
  const conv = fixture.localStorage["yueqi.conversation.v1"];
  const scen = fixture.localStorage["yueqi.scenario.v1"];
  const wbLs = fixture.localStorage["yueqi.worldbook.v1"];
  const idb = fixture.indexedDB;

  return `# Open Experience · STORAGE_SAMPLE (W0)

> Auto-generated by \`scripts/export-open-experience-baseline.mjs\`  
> Exported: \`${fixture.exportedAt}\`  
> Grade: **${fixture.productGrade}** — not green; migration fixture only.

## Purpose

Freeze known LocalStorage / IndexedDB schema keys so W1+ migrations have a reproducible sample.  
This dump is **mock-derived from codebase contracts**, not a live browser dump.

## LocalStorage keys

| Key | Source | Top-level bag keys |
|-----|--------|-------------------|
| \`yueqi.conversation.v1\` | ${conv.source} | ${conv.bagKeys.map((k) => `\`${k}\``).join(", ")} |
| \`yueqi.scenario.v1\` | ${scen.source} | ${scen.bagKeys.map((k) => `\`${k}\``).join(", ")} |
| \`yueqi.worldbook.v1\` | constants LOCAL_KEYS.worldKey | (mirror / legacy; see IDB) |

### Conversation V1 session / turn keys

- Session: ${conv.sessionKeys.map((k) => `\`${k}\``).join(", ")}
- Turn: ${conv.turnKeys.map((k) => `\`${k}\``).join(", ")}

\`\`\`json
${JSON.stringify(conv.sample, null, 2)}
\`\`\`

### Scenario runs / directorState keys

- Run: ${scen.runKeys.map((k) => `\`${k}\``).join(", ")}
- directorState: ${scen.directorStateKeys.map((k) => `\`${k}\``).join(", ")}

\`\`\`json
${JSON.stringify(scen.sample, null, 2)}
\`\`\`

### Worldbook LS note

${wbLs.note}

- Entry keys: ${wbLs.entryKeys.map((k) => `\`${k}\``).join(", ")}

## IndexedDB

- Name: \`${idb.name}\` (version **${idb.version}**)
- Object stores: ${idb.objectStores.map((s) => `\`${s}\``).join(", ")}
- \`worldbook\` keyPath: \`${idb.worldbook.keyPath}\`
- Entry keys: ${idb.worldbook.entryKeys.map((k) => `\`${k}\``).join(", ")}

\`\`\`json
${JSON.stringify(idb.worldbook.sample, null, 2)}
\`\`\`

## Telemetry (W0)

| Field | Value |
|-------|-------|
| Event | \`${fixture.telemetry.event}\` |
| Sources | ${fixture.telemetry.sources.map((s) => `\`${s}\``).join(" / ")} |
| Persist | \`${fixture.telemetry.persistField}\` |
| Reason | \`${fixture.telemetry.reasonField}\` |

${fixture.telemetry.note}

Payload shape:

\`\`\`json
{
  "source": "model|offline_fixed|offline_fallback",
  "scriptId": "script-rain-station",
  "reason": "missing_provider_config|model_call_failed:…|invalid_or_unparseable_model_output|…",
  "runId": "run-…"
}
\`\`\`

## Migration notes

${fixture.migrationNotes.map((n) => `- ${n}`).join("\n")}

## Flattened sample key paths (conversation bag)

${collectKeys(conv.sample).map((k) => `- \`${k}\``).join("\n")}

## Flattened sample key paths (scenario bag)

${collectKeys(scen.sample).map((k) => `- \`${k}\``).join("\n")}
`;
}

mkdirSync(outDir, { recursive: true });
const md = renderMarkdown(FIXTURE);
writeFileSync(outFile, md, "utf8");

const jsonPath = join(outDir, "STORAGE_SAMPLE.json");
writeFileSync(jsonPath, `${JSON.stringify(FIXTURE, null, 2)}\n`, "utf8");

console.log(`Wrote ${outFile}`);
console.log(`Wrote ${jsonPath}`);
console.log(
  `Keys: conversation=${FIXTURE.localStorage["yueqi.conversation.v1"].bagKeys.length} ` +
    `scenario=${FIXTURE.localStorage["yueqi.scenario.v1"].bagKeys.length} ` +
    `idbStores=${FIXTURE.indexedDB.objectStores.length}`,
);
