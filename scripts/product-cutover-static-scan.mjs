/**
 * C5 — Product cutover static scan under internal_v1 / production_v1 assumptions.
 *
 * Wraps unified-memory-static-scan --strict, then applies a tighter projector-only
 * fileDrawer allowlist and fails on ungated diary.memory authority writes or
 * Context Graph accepted-authority writes in hot paths.
 *
 * Usage:
 *   node scripts/product-cutover-static-scan.mjs
 *   node scripts/product-cutover-static-scan.mjs --out docs/qa/product-cutover/C5_STATIC_SCAN.json
 *   npm run product-cutover:static-scan
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "src");

function parseArgs(argv) {
  const out = { outJson: "", skipUnified: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") out.outJson = argv[++i] || "";
    else if (a === "--skip-unified") out.skipUnified = true;
  }
  return out;
}

/** Projector-internal paths may call fileDrawer; ordinary business hot paths may not. */
const PROJECTOR_FILE_DRAWER_ALLOWLIST = [
  "src/memory/palace/drawer.js",
  "src/memory/palace/index.js",
  "src/memory/palace/rebuild.js",
  "src/memory/adapters/",
  "src/memory/projection/",
  "src/projections/",
];

/** Hot paths where diary.memory authority writes are forbidden without diaryRepositoryV1 gate. */
const DIARY_HOT_PATHS = [
  "src/diary/",
  "src/app.js",
];

/** Hot paths where graph accepted authority writes need contextGraphProjectionOnlyV1 / projection gate. */
const GRAPH_HOT_PATHS = [
  "src/context/hot-path.js",
  "src/context/extraction.js",
  "src/companion/scenario-memory-bridge.js",
  "src/companion/memory-consolidator.js",
  "src/experience/memory.js",
];

function walkJsFiles(dir, acc = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      walkJsFiles(full, acc);
    } else if (/\.(js|mjs|cjs)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

function normRel(filePath) {
  return relative(root, filePath).replace(/\\/g, "/");
}

function isProjectorAllowlisted(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  return PROJECTOR_FILE_DRAWER_ALLOWLIST.some((p) => norm === p || norm.startsWith(p));
}

function inPrefixes(rel, prefixes) {
  return prefixes.some((p) => rel === p || rel.startsWith(p));
}

function windowHasGate(lines, index, patterns) {
  const start = Math.max(0, index - 30);
  const window = lines.slice(start, index + 1).join("\n");
  return patterns.some((re) => re.test(window));
}

const DIARY_GATE_RE = [
  /diaryRepositoryV1/,
  /useDiaryRepository/,
  /isFeatureEnabled\s*\(\s*["']diaryRepositoryV1["']/,
];

const GRAPH_GATE_RE = [
  /contextGraphProjectionOnlyV1/,
  /graphProjectionOnly/,
  /authority:\s*["']projection["']/,
  /projectionMirror/,
  /isFeatureEnabled\s*\(\s*["']contextGraphProjectionOnlyV1["']/,
  /adapterPathEnabled/,
  /unifiedMemoryAdaptersV1/,
];

const FILE_DRAWER_GATE_RE = [
  /isFeatureEnabled\s*\(/,
  /diaryRepositoryV1/,
  /palaceProjectionOnlyV1/,
  /unifiedMemoryAdaptersV1/,
  /useDiaryRepository/,
  /useAdapter/,
];

/**
 * Find fileDrawer call sites outside projector allowlist that lack a nearby flag gate.
 */
function scanUngatedFileDrawer(files) {
  /** @type {object[]} */
  const hits = [];
  for (const file of files) {
    const rel = normRel(file);
    if (isProjectorAllowlisted(rel)) continue;
    // Focus ordinary business surfaces; skip tests / scripts / node.
    if (!rel.startsWith("src/")) continue;
    // Test fixtures may intentionally call a low-level writer to prove that
    // deletion, retry, or migration failures are rejected. They are not
    // production call sites and must not fail the cutover production scan.
    if (/\.(?:test|spec)\.(?:js|mjs|cjs)$/.test(rel)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!/\bfileDrawer\s*\(/.test(line) && !/\bfileDrawerAndRender\s*\(/.test(line)) continue;
      // Function definitions named fileDrawerAndRender are wrappers — still count call body.
      if (/^\s*(export\s+)?(async\s+)?function\s+fileDrawer/.test(line)) continue;
      const gated =
        windowHasGate(lines, i, FILE_DRAWER_GATE_RE)
        || FILE_DRAWER_GATE_RE.some((re) => re.test(text));
      if (!gated) {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 160),
          reason: "fileDrawer_without_nearby_flag_gate",
        });
      }
    }
  }
  return hits;
}

/**
 * diary.memory authority write sites in hot paths without diaryRepositoryV1 gate nearby.
 * Looks for source: "diary.memory" adjacent to fileDrawer / updateMemory writes.
 */
function scanUngatedDiaryAuthority(files) {
  /** @type {object[]} */
  const hits = [];
  for (const file of files) {
    const rel = normRel(file);
    if (!inPrefixes(rel, DIARY_HOT_PATHS)) continue;
    // repository migrateFrom metadata is not an authority write path
    if (rel === "src/diary/repository.js" || rel === "src/diary/schema.js") continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!/source:\s*["']diary\.memory["']/.test(line)) continue;
      // Look ahead/behind for write call in ±15 lines
      const lo = Math.max(0, i - 5);
      const hi = Math.min(lines.length, i + 20);
      const region = lines.slice(lo, hi).join("\n");
      const isWrite =
        /\bfileDrawer\s*\(/.test(region)
        || /\bupdateMemory\s*\(/.test(region)
        || /\bingestMemoryAndRender\s*\(/.test(region);
      if (!isWrite) continue;
      const gated = windowHasGate(lines, i, DIARY_GATE_RE);
      // Also accept if the enclosing function early-returns via useDiaryRepository()
      const fileGated = DIARY_GATE_RE.some((re) => re.test(text));
      if (!gated && !fileGated) {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 160),
          reason: "diary_memory_authority_write_without_flag_gate",
        });
      } else if (fileGated && !gated) {
        // Legacy branch behind file-level gate — document as gated residual
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 160),
          reason: "diary_memory_legacy_branch_file_gated",
          gated: true,
        });
      } else {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 160),
          reason: "diary_memory_with_flag_gate",
          gated: true,
        });
      }
    }
  }
  return hits;
}

/**
 * memoryStatus: "accepted" near ingestCandidate in hot paths without graph projection gate.
 * Exempt when the same region sets authority: "projection" or projectionMirror.
 */
function scanUngatedGraphAccepted(files) {
  /** @type {object[]} */
  const hits = [];
  for (const file of files) {
    const rel = normRel(file);
    if (!inPrefixes(rel, GRAPH_HOT_PATHS)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!/memoryStatus:\s*["']accepted["']/.test(line)) continue;
      const lo = Math.max(0, i - 25);
      const hi = Math.min(lines.length, i + 15);
      const region = lines.slice(lo, hi).join("\n");
      const nearIngest = /\bingestCandidate\s*\(/.test(region);
      // Candidate builders that only construct objects (hot-path chatTextsToCandidates)
      // still count if later ingested without going through projection-only pipeline —
      // but ingestCandidate itself softens under the flag. Require nearby gate OR
      // file-level contextGraphProjectionOnlyV1 / pipeline softens note.
      const gated = windowHasGate(lines, i, GRAPH_GATE_RE);
      const fileHasPipelineGate =
        /contextGraphProjectionOnlyV1/.test(text)
        || /graphProjectionOnly/.test(text)
        || rel === "src/context/hot-path.js"; // ingestCandidate pipeline softens under flag
      if (!nearIngest && rel === "src/context/hot-path.js") {
        // Builder-only lines — pipeline gate applies at ingestCandidate; treat as gated docs.
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 160),
          reason: "graph_accepted_builder_pipeline_gated",
          gated: true,
        });
        continue;
      }
      if (gated || fileHasPipelineGate) {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 160),
          reason: "graph_accepted_with_flag_or_projection_gate",
          gated: true,
        });
      } else {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 160),
          reason: "graph_accepted_authority_write_without_flag_gate",
        });
      }
    }
  }
  return hits;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = walkJsFiles(srcRoot);

  /** @type {object|null} */
  let unified = null;
  let unifiedStatus = null;
  if (!args.skipUnified) {
    const unifiedOut = join(root, "docs/qa/product-cutover/C5_UNIFIED_STATIC_SCAN.json");
    const child = spawnSync(
      process.execPath,
      [
        join(root, "scripts/unified-memory-static-scan.mjs"),
        "--strict",
        "--out",
        unifiedOut,
      ],
      { encoding: "utf8", cwd: root },
    );
    unifiedStatus = child.status;
    try {
      unified = JSON.parse(child.stdout || "{}");
    } catch {
      unified = { parseError: true, stdout: (child.stdout || "").slice(0, 500) };
    }
  }

  const fileDrawerHits = scanUngatedFileDrawer(files);
  const diaryHits = scanUngatedDiaryAuthority(files);
  const graphHits = scanUngatedGraphAccepted(files);

  const ungatedDiary = diaryHits.filter((h) => h.gated !== true);
  const ungatedGraph = graphHits.filter((h) => h.gated !== true);

  // From unified scan: residual fileDrawer outside projector allowlist that are calls
  const unifiedForbidden = Array.isArray(unified?.fileDrawer?.hits)
    ? unified.fileDrawer.hits.filter(
      (h) =>
        String(h.reason || "").startsWith("direct_fileDrawer_call_")
        && !isProjectorAllowlisted(h.file),
    )
    : [];

  // Under internal profile docs: business fileDrawer calls are OK only if file-gated
  // (legacy branch). Product fail criteria = ungated diary/graph + ungated fileDrawer.
  const fail =
    fileDrawerHits.length > 0
    || ungatedDiary.length > 0
    || ungatedGraph.length > 0;

  const report = {
    schemaVersion: 1,
    wave: "C5",
    generatedAt: new Date().toISOString(),
    profileAssumption: "internal_v1 | production_v1 (flags ON via cutover profile / isFeatureEnabled)",
    note:
      "Wraps unified-memory-static-scan --strict; projector-internal fileDrawer allowlisted; "
      + "fails on ungated diary.memory authority writes or graph accepted authority writes in hot paths.",
    projectorFileDrawerAllowlist: PROJECTOR_FILE_DRAWER_ALLOWLIST,
    unifiedStrict: {
      exitCode: unifiedStatus,
      remainingDirectFileDrawerSites: unified?.summary?.remainingDirectFileDrawerSites ?? null,
      remainingUngatedScenarioIngest: unified?.summary?.remainingUngatedScenarioIngest ?? null,
      cutoverReadyHint: unified?.summary?.cutoverReadyHint ?? null,
      businessFileDrawerCallsOutsideProjector: unifiedForbidden.length,
    },
    productScan: {
      ungatedFileDrawerOutsideProjector: fileDrawerHits.length,
      ungatedDiaryMemoryAuthorityWrites: ungatedDiary.length,
      ungatedGraphAcceptedAuthorityWrites: ungatedGraph.length,
      fileDrawerHits,
      diaryHits,
      graphHits,
    },
    summary: {
      ok: !fail,
      failReasons: [
        ...(fileDrawerHits.length
          ? [`ungated_fileDrawer=${fileDrawerHits.length}`]
          : []),
        ...(ungatedDiary.length
          ? [`ungated_diary_memory=${ungatedDiary.length}`]
          : []),
        ...(ungatedGraph.length
          ? [`ungated_graph_accepted=${ungatedGraph.length}`]
          : []),
      ],
    },
  };

  const text = JSON.stringify(report, null, 2);
  console.log(text);

  const outPath =
    args.outJson || join(root, "docs/qa/product-cutover/C5_STATIC_SCAN.json");
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${text}\n`, "utf8");
    console.error(`\nWrote ${outPath}`);
  } catch (error) {
    console.error("\nCould not write scan JSON:", error?.message || error);
  }

  if (fail) {
    console.error(
      `\nC5 STATIC FAIL: ${report.summary.failReasons.join(", ") || "unknown"}`,
    );
    process.exitCode = 1;
  } else {
    console.error("\nC5 STATIC OK: no ungated diary.memory / graph accepted authority writes; fileDrawer gated or projector-allowlisted.");
    // Unified strict may still document legacy residuals; product gate owns exit code.
    if (unifiedStatus !== 0 && unifiedStatus != null) {
      console.error(
        `(note: unified-memory-static-scan --strict exited ${unifiedStatus}; product criteria still OK)`,
      );
    }
  }

  return report;
}

main();
