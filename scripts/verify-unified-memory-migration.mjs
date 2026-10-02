/**
 * Unified memory M9 — triple-idempotent migration verify on fixtures.
 *
 * Run: npm run verify:unified-memory-migration
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { LOCAL_KEYS } from "../src/constants.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(root, "docs/qa/unified-memory");
const fixturesDir = join(evidenceDir, "fixtures");
mkdirSync(fixturesDir, { recursive: true });

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

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

function setFlags(partial = {}) {
  memory.set(LOCAL_KEYS.featuresKey, JSON.stringify(partial));
}

const FIXTURE_MEMORIES = [
  {
    id: "diary-m9-a",
    source: "diary.memory",
    rawText: "雨停在窗沿，我们没说话。",
    title: "雨夜",
    companionId: "companion-m9",
    characterId: "companion-m9",
    userId: "local",
    diaryDay: "2026-08-07",
    tags: ["diary"],
  },
  {
    id: "diary-m9-b",
    source: "diary.memory",
    rawText: "第二篇日记，幂等用。",
    title: "次日",
    companionId: "companion-m9",
    characterId: "companion-m9",
    userId: "local",
    diaryDay: "2026-08-08",
    tags: ["diary"],
  },
  {
    id: "book-m9-c0",
    source: "book.chunk",
    rawText: "第一章节选，无 sourceRef 的孤儿样例。",
    companionId: "companion-m9",
    characterId: "companion-m9",
    title: "样例书",
  },
  {
    id: "orphan-m9",
    source: "chat.memory",
    rawText: "无 companion 的旧行",
    companionId: "",
  },
];

const memoriesPath = join(fixturesDir, "m9-memories.json");
const storagePath = join(fixturesDir, "m9-storage.json");
writeFileSync(memoriesPath, `${JSON.stringify(FIXTURE_MEMORIES, null, 2)}\n`, "utf8");
writeFileSync(
  storagePath,
  `${JSON.stringify(
    {
      [LOCAL_KEYS.featuresKey]: JSON.stringify({ diaryRepositoryV1: true }),
      "yueqi.context.graph.v1": JSON.stringify({
        schemaVersion: 1,
        items: [
          {
            id: "cg-accepted-nosrc",
            memoryStatus: "accepted",
            content: "accepted without sourceRef",
            characterId: "companion-m9",
          },
          {
            id: "cg-with-src",
            memoryStatus: "accepted",
            content: "has source",
            characterId: "companion-m9",
            sourceRef: "stable:abc",
          },
        ],
      }),
      "yueqi.cohabit.timeline.v1": JSON.stringify({
        events: [
          { id: "coh-legacy", summary: "旧同栖行", characterId: "companion-m9", appId: "listen" },
          {
            id: "coh-bound",
            summary: "已绑定",
            characterId: "companion-m9",
            appId: "listen",
            sourceEventId: "event-1",
            projection: true,
          },
        ],
      }),
      "yueqi.timeline.events.v1": JSON.stringify({
        schemaVersion: 1,
        events: [{ eventId: "event-1", eventType: "cohabit.note", companionId: "companion-m9" }],
      }),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const {
  __setDiaryStorageForTests,
  __clearDiaryRepositoryForTests,
  migrateLegacyDiaryMemories,
  listDiaryEntries,
} = await import("../src/diary/repository.js");

const { __setTimelineStorageForTests } = await import("../src/timeline/repository.js");
const { appendCohabitEvent, __setCohabitStorageForTests, listCohabitEvents } = await import(
  "../src/memory/cohabit-timeline.js"
);
const { BACKUP_AUTHORITY_MANIFEST } = await import("../src/memory/backup-authority.js");
const { DEFAULT_FEATURES } = await import("../src/constants.js");

function reset() {
  memory.clear();
  __setDiaryStorageForTests(memStorage);
  __setTimelineStorageForTests(memStorage);
  __setCohabitStorageForTests(memStorage);
  __clearDiaryRepositoryForTests();
  setFlags({ diaryRepositoryV1: true, unifiedMemoryAdaptersV1: true });
}

async function main() {
  // --- 1. Triple idempotent migrate on fixtures ---
  {
    reset();
    const r1 = await migrateLegacyDiaryMemories({ memories: FIXTURE_MEMORIES });
    const total1 = listDiaryEntries({ includeDeleted: true }).length;
    const r2 = await migrateLegacyDiaryMemories({ memories: FIXTURE_MEMORIES });
    const total2 = listDiaryEntries({ includeDeleted: true }).length;
    const r3 = await migrateLegacyDiaryMemories({ memories: FIXTURE_MEMORIES });
    const total3 = listDiaryEntries({ includeDeleted: true }).length;

    const pass =
      r1.ok
      && r1.imported === 2
      && total1 === 2
      && r2.imported === 0
      && r2.skipped >= 2
      && total2 === total1
      && r3.imported === 0
      && total3 === total1;
    record(
      "triple_idempotent_diary_migrate",
      pass,
      `r1.imported=${r1.imported} totals=${total1}/${total2}/${total3} r2.imported=${r2.imported} r3.imported=${r3.imported}`,
    );
  }

  // --- 2. Dry-run CLI does not grow diary when storage empty ---
  {
    const dry = spawnSync(
      process.execPath,
      [
        join(root, "scripts/unified-memory-migrate-run.mjs"),
        "--memories-json",
        memoriesPath,
        "--storage-json",
        storagePath,
        "--out",
        join(evidenceDir, "M9_MIGRATE_RUN_DRY.json"),
      ],
      { encoding: "utf8", cwd: root },
    );
    const report = JSON.parse(dry.stdout || "{}");
    const pass =
      dry.status === 0
      && report.mode === "dry-run"
      && report.destructive === false
      && report.diary?.plan?.wouldImport === 2
      && report.diary?.apply == null;
    record("migrate_run_dry_default", pass, `status=${dry.status} wouldImport=${report.diary?.plan?.wouldImport}`);
  }

  // --- 3. Apply CLI three times — totals stable ---
  {
    const outStorage = join(fixturesDir, "m9-storage-after-apply.json");
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      const storageIn = i === 0 ? storagePath : outStorage;
      const result = spawnSync(
        process.execPath,
        [
          join(root, "scripts/unified-memory-migrate-run.mjs"),
          "--apply",
          "--memories-json",
          memoriesPath,
          "--storage-json",
          storageIn,
          "--out-storage",
          outStorage,
          "--out",
          join(evidenceDir, `M9_MIGRATE_RUN_APPLY_${i + 1}.json`),
          "--palace-rebuild",
        ],
        { encoding: "utf8", cwd: root },
      );
      runs.push(JSON.parse(result.stdout || "{}"));
      assert.equal(result.status, 0, `apply run ${i + 1} exit`);
    }
    const t1 = runs[0].diary.afterTotal;
    const t2 = runs[1].diary.afterTotal;
    const t3 = runs[2].diary.afterTotal;
    const pass =
      runs[0].diary.apply?.imported === 2
      && runs[1].diary.apply?.imported === 0
      && runs[2].diary.apply?.imported === 0
      && t1 === t2
      && t2 === t3
      && t1 === 2
      && runs[0].palaceRebuild?.dryRun === true;
    record(
      "triple_apply_cli_idempotent",
      pass,
      `imported=${runs.map((r) => r.diary.apply?.imported).join("/")} totals=${t1}/${t2}/${t3}`,
    );
  }

  // --- 4. Migrate report census on fixtures ---
  {
    const result = spawnSync(
      process.execPath,
      [
        join(root, "scripts/unified-memory-migrate-report.mjs"),
        "--memories-json",
        memoriesPath,
        "--storage-json",
        storagePath,
        "--out",
        join(evidenceDir, "M9_MIGRATE_REPORT.json"),
      ],
      { encoding: "utf8", cwd: root },
    );
    const report = JSON.parse(result.stdout || "{}");
    const pass =
      result.status === 0
      && report.palace?.counts?.["diary.memory"] === 2
      && report.palace?.counts?.orphansWithoutSourceRef >= 1
      && report.contextGraph?.acceptedWithoutSourceRef === 1
      && report.cohabitDualKeys?.cohabitMissingSourceEventId === 1;
    record(
      "migrate_report_fixture_census",
      pass,
      `diary.memory=${report.palace?.counts?.["diary.memory"]} orphans=${report.palace?.counts?.orphansWithoutSourceRef} graph=${report.contextGraph?.acceptedWithoutSourceRef}`,
    );
  }

  // --- 5. Static scan emits JSON (non-strict) ---
  {
    const result = spawnSync(
      process.execPath,
      [
        join(root, "scripts/unified-memory-static-scan.mjs"),
        "--out",
        join(evidenceDir, "M9_STATIC_SCAN.json"),
      ],
      { encoding: "utf8", cwd: root },
    );
    const report = JSON.parse(result.stdout || "{}");
    const pass =
      result.status === 0
      && typeof report.fileDrawer?.totalHits === "number"
      && typeof report.scenarioIngestCandidate?.totalCallSites === "number"
      && existsSync(join(evidenceDir, "M9_STATIC_SCAN.json"));
    record(
      "static_scan_emits_json",
      pass,
      `fileDrawerHits=${report.fileDrawer?.totalHits} scenarioSites=${report.scenarioIngestCandidate?.totalCallSites}`,
    );
  }

  // --- 6. Cohabit projection:true when adapters on ---
  {
    reset();
    setFlags({ unifiedMemoryAdaptersV1: true });
    const event = appendCohabitEvent({
      appId: "listen",
      kind: "track.played",
      summary: "一起听了一首歌",
      characterId: "companion-m9",
      meta: { trackId: "track-m9-1" },
    });
    const listed = listCohabitEvents({ characterId: "companion-m9", limit: 5 });
    const pass =
      event?.projection === true
      && event?.authority === "projection"
      && listed.some((e) => e.projection === true && e.summary.includes("歌"));
    record("cohabit_projection_flag_on", pass, `projection=${event?.projection}`);
  }

  // --- 7. Cohabit flag off: no projection field ---
  {
    reset();
    setFlags({ unifiedMemoryAdaptersV1: false });
    const event = appendCohabitEvent({
      appId: "listen",
      kind: "track.played",
      summary: "legacy cohabit row",
      characterId: "companion-m9",
      meta: { trackId: "track-m9-2" },
    });
    const pass = event && event.projection !== true;
    record("cohabit_projection_flag_off", pass, `projection=${event?.projection}`);
  }

  // --- 8. Backup authority manifest present ---
  {
    const pass =
      BACKUP_AUTHORITY_MANIFEST?.schemaVersion === 1
      && Array.isArray(BACKUP_AUTHORITY_MANIFEST.rebuildableKeys)
      && BACKUP_AUTHORITY_MANIFEST.rebuildableKeys.includes("memories")
      && BACKUP_AUTHORITY_MANIFEST.rebuildableKeys.includes("cohabitTimeline")
      && BACKUP_AUTHORITY_MANIFEST.authorityKeys.includes("conversationV2");
    record("backup_authority_manifest", pass, `rebuildable=${BACKUP_AUTHORITY_MANIFEST.rebuildableKeys?.length}`);
  }

  // --- 9. DEFAULT_FEATURES stay false ---
  {
    const keys = [
      "unifiedMemoryAdaptersV1",
      "memoryProjectionOutboxV1",
      "diaryRepositoryV1",
      "palaceProjectionOnlyV1",
      "contextGraphProjectionOnlyV1",
      "singleBrokerRetrievalV1",
      "unifiedMemoryForgetV1",
    ];
    const pass = keys.every((k) => DEFAULT_FEATURES[k] === false);
    record("defaults_remain_false", pass, keys.map((k) => `${k}=${DEFAULT_FEATURES[k]}`).join(", "));
  }

  // --- 10. Evidence docs exist ---
  {
    const docs = [
      "docs/qa/unified-memory/M9_CUTOVER.md",
      "docs/qa/unified-memory/README.md",
      "scripts/unified-memory-migrate-report.mjs",
      "scripts/unified-memory-migrate-run.mjs",
      "scripts/unified-memory-static-scan.mjs",
      "src/memory/backup-authority.js",
    ];
    const missing = docs.filter((p) => !existsSync(join(root, p)));
    record("m9_artifacts_present", missing.length === 0, missing.join(", ") || "all present");
  }

  const failed = cases.filter((c) => !c.pass);
  const verify = {
    wave: "M9",
    script: "scripts/verify-unified-memory-migration.mjs",
    passed: failed.length === 0,
    total: cases.length,
    failed: failed.map((c) => c.id),
    cases,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "M9_VERIFY.json"), `${JSON.stringify(verify, null, 2)}\n`, "utf8");

  console.log(`\n${failed.length ? "FAIL" : "OK"}  ${cases.length - failed.length}/${cases.length} unified-memory migration / M9`);
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
