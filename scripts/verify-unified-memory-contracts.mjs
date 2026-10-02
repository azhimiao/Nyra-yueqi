/**
 * Unified memory M1 — SourceRef / MemoryIndexEntry contracts + projection outbox infra.
 *
 * Run: npm run verify:unified-memory-contracts
 * Aggregated: npm run verify:unified-memory-m1
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSourceRefV1,
  validateSourceRefV1,
  formatSourceRefForInspector,
  createMemoryIndexEntryV1,
  validateMemoryIndexEntryV1,
  SOURCE_REF_TYPES,
} from "../src/contracts/index.js";
import { normalizeMemory } from "../src/storage/db.js";
import {
  enqueueProjectionJob,
  listProjectionJobs,
  __clearProjectionOutboxForTests,
  registerProjector,
  __clearProjectionRegistryForTests,
  processProjectionQueue,
  rebuildProjectionsFromSources,
  LEGACY_PALACE_PROJECTION_PATH,
} from "../src/projections/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = join(root, "docs/qa/unified-memory");
mkdirSync(evidenceDir, { recursive: true });

const cases = [];
function record(id, pass, detail = "") {
  cases.push({ id, pass: Boolean(pass), detail: String(detail || "") });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
}

function sampleSourceRef(overrides = {}) {
  return createSourceRefV1({
    sourceType: "diary",
    sourceId: "diary-m1-1",
    sourceVersion: 1,
    companionId: "companion-a",
    relationshipId: "rel-a",
    userId: "user-a",
    realityNamespace: "reality",
    occurredAt: "2026-08-08T00:00:00.000Z",
    visibility: "private",
    contentHash: "abc123",
    ...overrides,
  });
}

async function main() {
  __clearProjectionOutboxForTests();
  __clearProjectionRegistryForTests();

  {
    const ref = sampleSourceRef();
    const v = validateSourceRefV1(ref);
    record("source_ref_valid", v.ok, v.errors.join(",") || "ok");

    const bad = validateSourceRefV1({ ...ref, sourceType: "not_a_type", sourceId: "" });
    record(
      "source_ref_rejects_bad",
      !bad.ok && bad.errors.includes("sourceType") && bad.errors.includes("sourceId"),
      bad.errors.join(","),
    );

    record(
      "source_ref_types_cover_plan",
      SOURCE_REF_TYPES.includes("diary") &&
        SOURCE_REF_TYPES.includes("conversation_turn") &&
        SOURCE_REF_TYPES.includes("stable_memory"),
      `count=${SOURCE_REF_TYPES.length}`,
    );

    const label = formatSourceRefForInspector(ref);
    record(
      "format_source_ref_for_inspector",
      label.includes("diary:diary-m1-1") && label.includes("v1") && label.includes("c=companion-a"),
      label,
    );
  }

  {
    const entry = createMemoryIndexEntryV1({
      indexId: "idx-1",
      sourceRef: sampleSourceRef(),
      projectionKind: "palace_text",
      title: "t",
      text: "body",
      summary: "sum",
      tags: ["a"],
      wing: "Relationship",
      room: "General",
      embeddingVersion: "e1",
      projectionVersion: 1,
      contentHash: "abc123",
      stale: false,
      tombstone: null,
    });
    const v = validateMemoryIndexEntryV1(entry);
    record("memory_index_entry_valid", v.ok, v.errors.join(",") || "ok");

    const missing = createMemoryIndexEntryV1({
      indexId: "idx-2",
      sourceRef: null,
      projectionKind: "palace_text",
      projectionVersion: 1,
      contentHash: "x",
      stale: false,
    });
    const bad = validateMemoryIndexEntryV1(missing);
    record(
      "memory_index_entry_rejects_missing_source_ref",
      !bad.ok && bad.errors.includes("sourceRef"),
      bad.errors.join(","),
    );
  }

  {
    __clearProjectionOutboxForTests();
    const payload = {
      sourceRef: sampleSourceRef(),
      projectionKind: "palace_text",
      operations: ["palace"],
    };
    const a = enqueueProjectionJob(payload, { force: true });
    const b = enqueueProjectionJob(payload, { force: true });
    const c = enqueueProjectionJob(payload, { force: true });
    const jobs = listProjectionJobs();
    record(
      "outbox_idempotent_triple_enqueue",
      a.ok && b.ok && c.ok && a.deduped === false && b.deduped === true && c.deduped === true && jobs.length === 1,
      `jobs=${jobs.length} deduped=${[a.deduped, b.deduped, c.deduped].join(",")}`,
    );

    const otherVersion = enqueueProjectionJob(
      {
        ...payload,
        sourceRef: sampleSourceRef({ sourceVersion: 2, contentHash: "abc124" }),
      },
      { force: true },
    );
    record(
      "outbox_new_source_version_new_job",
      otherVersion.ok && otherVersion.deduped === false && listProjectionJobs().length === 2,
      `jobs=${listProjectionJobs().length}`,
    );

    const otherCompanion = enqueueProjectionJob(
      {
        sourceRef: sampleSourceRef({ companionId: "companion-b", sourceId: "diary-m1-2" }),
        projectionKind: "palace_text",
        operations: ["palace"],
      },
      { force: true },
    );
    record(
      "outbox_companion_isolation_key",
      otherCompanion.ok && listProjectionJobs().length === 3,
      `jobs=${listProjectionJobs().length}`,
    );
  }

  {
    __clearProjectionOutboxForTests();
    __clearProjectionRegistryForTests();
    const calls = [];
    registerProjector("palace_text", (job) => {
      calls.push(job.jobId);
      return { projected: true, sourceId: job.sourceRef.sourceId };
    });
    enqueueProjectionJob(
      {
        sourceRef: sampleSourceRef({ sourceId: "diary-worker-1" }),
        projectionKind: "palace_text",
        operations: ["palace"],
      },
      { force: true },
    );
    const result = await processProjectionQueue({ limit: 10 });
    const ok =
      result.processed === 1 &&
      calls.length === 1 &&
      result.results[0]?.ok === true &&
      result.results[0]?.job?.status === "complete";
    record("worker_calls_registered_projector", ok, `calls=${calls.length} processed=${result.processed}`);
  }

  {
    const sourceRef = sampleSourceRef();
    const normalized = normalizeMemory({
      id: "mem-m1",
      title: "hello",
      rawText: "body text",
      source: "diary.memory",
      sourceRef,
      projectionKind: "palace_text",
      projectionVersion: 3,
      stale: true,
      tombstone: { reason: "deleted", at: "2026-08-08T01:00:00.000Z" },
      contentHash: "hash-m1",
    });
    const ok =
      normalized.sourceRef?.sourceId === "diary-m1-1" &&
      normalized.projectionKind === "palace_text" &&
      normalized.projectionVersion === 3 &&
      normalized.stale === true &&
      normalized.tombstone?.reason === "deleted" &&
      normalized.contentHash === "hash-m1";
    record("normalize_memory_preserves_projection_fields", ok, ok ? "passthrough" : "lost fields");

    const legacy = normalizeMemory({ id: "mem-legacy", rawText: "x", source: "chat.memory" });
    record(
      "normalize_memory_backward_compatible",
      legacy.sourceRef === undefined &&
        legacy.projectionKind === undefined &&
        legacy.stale === undefined &&
        Boolean(legacy.id) &&
        Boolean(legacy.rawText),
      "legacy ok",
    );
  }

  {
    __clearProjectionOutboxForTests();
    __clearProjectionRegistryForTests();
    registerProjector("palace_text", () => ({ ok: true }));
    const result = await rebuildProjectionsFromSources({
      listSources: () => [
        sampleSourceRef({ sourceId: "rebuild-1" }),
        sampleSourceRef({ sourceId: "rebuild-2", companionId: "companion-b" }),
      ],
      projectionKinds: ["palace_text"],
      process: true,
    });
    const ok = result.sourceCount === 2 && result.enqueuedCount === 2 && result.processResult?.processed >= 1;
    record("rebuild_from_injectable_sources", ok, `enqueued=${result.enqueuedCount}`);
  }

  record(
    "coexistence_legacy_palace_path_documented",
    LEGACY_PALACE_PROJECTION_PATH === "src/memory/projection" &&
      existsSync(join(root, "src/memory/projection/index.js")) &&
      existsSync(join(root, "src/projections/index.js")),
    "W5 + M1 both present",
  );

  // assert unused import kept for intentional strictness in future
  assert.equal(typeof createSourceRefV1, "function");

  const failed = cases.filter((c) => !c.pass);
  const summary = {
    wave: "M1",
    ok: failed.length === 0,
    passed: cases.filter((c) => c.pass).length,
    failed: failed.length,
    cases,
    at: new Date().toISOString(),
  };
  writeFileSync(join(evidenceDir, "M1_VERIFY.json"), `${JSON.stringify(summary, null, 2)}\n`);

  if (failed.length) {
    console.error(`\nFAILED ${failed.length}/${cases.length}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nOK ${cases.length}/${cases.length} unified-memory contracts / M1 infra`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
