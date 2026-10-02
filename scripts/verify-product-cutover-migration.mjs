/**
 * C5 — Product cutover migration ledger + dual-write closure verify.
 *
 * Run: npm run verify:product-cutover-migration
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { LOCAL_KEYS } from "../src/constants.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(root, "docs/qa/product-cutover");
const fixturesDir = join(evidenceDir, "fixtures");
const fixturePath = join(fixturesDir, "c5-browser-dump.json");
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

const {
  MIGRATION_LEDGER_KEY,
  MIGRATION_LEDGER_VERSION,
  LEGACY_UNVERIFIED,
  beginMigrationRun,
  finalizeMigrationRun,
  readMigrationLedger,
  quarantineOrphanPalaceRows,
  __setMigrationLedgerStorageForTests,
  __clearMigrationLedgerForTests,
} = await import("../src/memory/migration-ledger.js");

const {
  __setDiaryStorageForTests,
  __clearDiaryRepositoryForTests,
  migrateLegacyDiaryMemories,
  listDiaryEntries,
} = await import("../src/diary/repository.js");

const { CUTOVER_NEW_PATH_FLAGS, resolveEffectiveFlags } = await import(
  "../src/features/cutover-profile.js"
);

function reset() {
  memory.clear();
  __setMigrationLedgerStorageForTests(memStorage);
  __setDiaryStorageForTests(memStorage);
  __clearDiaryRepositoryForTests();
  __clearMigrationLedgerForTests();
  memory.set(LOCAL_KEYS.cutoverProfileKey, JSON.stringify("internal_v1"));
  memory.set(
    LOCAL_KEYS.featuresKey,
    JSON.stringify({
      diaryRepositoryV1: true,
      unifiedMemoryAdaptersV1: true,
      palaceProjectionOnlyV1: true,
      contextGraphProjectionOnlyV1: true,
    }),
  );
}

function loadFixtureMemories() {
  assert.ok(existsSync(fixturePath), `fixture missing: ${fixturePath}`);
  const dump = JSON.parse(readFileSync(fixturePath, "utf8"));
  const memories = dump?.indexedDB?.memories;
  assert.ok(Array.isArray(memories) && memories.length >= 4, "fixture memories");
  return memories.map((r) => ({ ...r }));
}

async function main() {
  // --- 1. Ledger key + begin/finalize persistence ---
  {
    reset();
    assert.equal(MIGRATION_LEDGER_KEY, "yueqi.memory.migration.ledger.v1");
    assert.equal(LOCAL_KEYS.migrationLedgerKey, MIGRATION_LEDGER_KEY);
    const begun = beginMigrationRun({
      mode: "apply",
      profile: "internal_v1",
      sourceSummary: { fixture: "unit", diaryLegacyCount: 3 },
    });
    assert.equal(begun.ok, true);
    const finalized = finalizeMigrationRun(begun.run.id, {
      result: { diary: { imported: 3 } },
      quarantine: [{ id: "x", quarantineStatus: LEGACY_UNVERIFIED }],
      failures: [],
    });
    assert.equal(finalized.ok, true);
    const bag = readMigrationLedger();
    const pass =
      bag.schemaVersion === MIGRATION_LEDGER_VERSION
      && bag.runs.length === 1
      && bag.runs[0].startedAt
      && bag.runs[0].endedAt
      && bag.runs[0].sourceSummary?.diaryLegacyCount === 3
      && bag.runs[0].result?.diary?.imported === 3
      && bag.runs[0].quarantine?.length === 1
      && Array.isArray(bag.runs[0].failures)
      && memStorage.getItem(MIGRATION_LEDGER_KEY) != null;
    record(
      "ledger_written",
      pass,
      `runs=${bag.runs.length} key=${MIGRATION_LEDGER_KEY}`,
    );
  }

  // --- 2. Triple idempotent migrate on fixture (in-process) ---
  {
    reset();
    const memories = loadFixtureMemories();
    const r1 = await migrateLegacyDiaryMemories({ memories });
    const t1 = listDiaryEntries({ includeDeleted: true }).length;
    const r2 = await migrateLegacyDiaryMemories({ memories });
    const t2 = listDiaryEntries({ includeDeleted: true }).length;
    const r3 = await migrateLegacyDiaryMemories({ memories });
    const t3 = listDiaryEntries({ includeDeleted: true }).length;
    const diaryLegacy = memories.filter((m) => m.source === "diary.memory").length;
    const pass =
      r1.ok
      && r1.imported === diaryLegacy
      && t1 === diaryLegacy
      && r2.imported === 0
      && r3.imported === 0
      && t2 === t1
      && t3 === t1
      && diaryLegacy >= 3;
    record(
      "triple_idempotent_fixture_diary",
      pass,
      `imported=${r1.imported}/${r2.imported}/${r3.imported} totals=${t1}/${t2}/${t3}`,
    );
  }

  // --- 3. Quarantine orphan palace without sourceRef ---
  {
    reset();
    const memories = loadFixtureMemories();
    const q = quarantineOrphanPalaceRows(memories, { apply: true });
    const orphans = q.quarantined;
    const tagged = q.rows.filter((r) => r.quarantineStatus === LEGACY_UNVERIFIED);
    const boundUntouched = q.rows.find((r) => r.id === "palace-bound-c5");
    const diaryUntouched = q.rows.filter((r) => r.source === "diary.memory");
    const pass =
      q.orphanCount === 2
      && orphans.every((o) => o.quarantineStatus === LEGACY_UNVERIFIED)
      && tagged.length === q.orphanCount
      && tagged.every((r) => r.memoryStatus === LEGACY_UNVERIFIED && r.searchable === false)
      && diaryUntouched.every((r) => r.quarantineStatus !== LEGACY_UNVERIFIED)
      && boundUntouched
      && boundUntouched.quarantineStatus !== LEGACY_UNVERIFIED
      && boundUntouched.sourceRef;
    record(
      "quarantine_orphan_palace_legacy_unverified",
      pass,
      `orphans=${q.orphanCount} tagged=${tagged.length} diarySkipped=${diaryUntouched.length}`,
    );
  }

  // --- 4. CLI migrate --apply --triple writes ledger + 0 new on 2nd/3rd ---
  {
    const outJson = join(evidenceDir, "C5_MIGRATE_RUN.json");
    const outStorage = join(fixturesDir, "c5-storage-after-apply.json");
    const outMemories = join(fixturesDir, "c5-memories-after-apply.json");
    const result = spawnSync(
      process.execPath,
      [
        join(root, "scripts/product-cutover-migrate.mjs"),
        "--fixture",
        fixturePath,
        "--apply",
        "--triple",
        "--palace-rebuild",
        "--out",
        outJson,
        "--out-storage",
        outStorage,
        "--out-memories",
        outMemories,
      ],
      { encoding: "utf8", cwd: root },
    );
    let report = {};
    try {
      report = JSON.parse(result.stdout || "{}");
    } catch {
      report = {};
    }
    const passes = Array.isArray(report.passes) ? report.passes : [];
    const ledgerRuns = report.ledger?.runs || [];
    const pass =
      result.status === 0
      && report.idempotent === true
      && passes.length === 3
      && passes[0]?.newImported >= 3
      && passes[1]?.newImported === 0
      && passes[2]?.newImported === 0
      && ledgerRuns.length >= 3
      && ledgerRuns.every((r) => r.startedAt && r.endedAt && r.sourceSummary)
      && passes[0]?.quarantineCount >= 2
      && existsSync(outJson)
      && existsSync(outStorage);
    record(
      "cli_triple_migrate_ledger",
      pass,
      `status=${result.status} imported=${passes.map((p) => p.newImported).join("/")} ledgerRuns=${ledgerRuns.length}`,
    );
  }

  // --- 5. Static scan under simulated internal profile documentation ---
  {
    const outScan = join(evidenceDir, "C5_STATIC_SCAN.json");
    const result = spawnSync(
      process.execPath,
      [
        join(root, "scripts/product-cutover-static-scan.mjs"),
        "--out",
        outScan,
      ],
      { encoding: "utf8", cwd: root },
    );
    let report = {};
    try {
      report = JSON.parse(result.stdout || "{}");
    } catch {
      report = {};
    }
    const internalFlags = resolveEffectiveFlags("internal_v1");
    const productionFlags = resolveEffectiveFlags("production_v1");
    const flagsOn =
      CUTOVER_NEW_PATH_FLAGS.every((k) => internalFlags[k] === true)
      && CUTOVER_NEW_PATH_FLAGS.every((k) => productionFlags[k] === true);
    const pass =
      result.status === 0
      && report.summary?.ok === true
      && report.profileAssumption?.includes("internal_v1")
      && report.productScan?.ungatedDiaryMemoryAuthorityWrites === 0
      && report.productScan?.ungatedGraphAcceptedAuthorityWrites === 0
      && Array.isArray(report.projectorFileDrawerAllowlist)
      && report.projectorFileDrawerAllowlist.some((p) => p.includes("memory/projection"))
      && flagsOn
      && existsSync(outScan);
    record(
      "static_scan_internal_profile_docs",
      pass,
      `status=${result.status} diaryUngated=${report.productScan?.ungatedDiaryMemoryAuthorityWrites} graphUngated=${report.productScan?.ungatedGraphAcceptedAuthorityWrites}`,
    );
  }

  // --- 6. Gate flags present for internal/production (C1 already) ---
  {
    const required = [
      "diaryRepositoryV1",
      "palaceProjectionOnlyV1",
      "contextGraphProjectionOnlyV1",
      "turnUnderstandingV1",
      "singleBrokerRetrievalV1",
    ];
    const internal = resolveEffectiveFlags("internal_v1");
    const production = resolveEffectiveFlags("production_v1");
    const pass = required.every((k) => internal[k] === true && production[k] === true);
    record("cutover_profile_gates_on", pass, required.join(","));
  }

  // --- 7. Artifacts present ---
  {
    const docs = [
      "src/memory/migration-ledger.js",
      "scripts/product-cutover-migrate.mjs",
      "scripts/product-cutover-static-scan.mjs",
      "docs/qa/product-cutover/fixtures/c5-browser-dump.json",
      "docs/qa/product-cutover/C5_MIGRATION.md",
    ];
    const missing = docs.filter((p) => !existsSync(join(root, p)));
    record("c5_artifacts_present", missing.length === 0, missing.join(", ") || "all present");
  }

  const failed = cases.filter((c) => !c.pass);
  const verify = {
    wave: "C5",
    script: "scripts/verify-product-cutover-migration.mjs",
    passed: failed.length === 0,
    total: cases.length,
    failed: failed.map((c) => c.id),
    cases,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "C5_VERIFY.json"), `${JSON.stringify(verify, null, 2)}\n`, "utf8");

  console.log(
    `\n${failed.length ? "FAIL" : "OK"}  ${cases.length - failed.length}/${cases.length} product-cutover migration / C5`,
  );
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
