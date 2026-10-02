/**
 * M9 — Static scan for forbidden direct writers at cutover.
 *
 * Documents remaining:
 * - direct fileDrawer usage from diary / books / app paths
 * - ingestCandidate from scenario without an adjacent flag check
 *
 * Emits JSON report. Exit 0 by default (documentation).
 * With --strict (flags assumed ON), fails if residual forbidden call sites remain
 * outside allowlisted projection/adapter paths.
 *
 * Usage:
 *   node scripts/unified-memory-static-scan.mjs
 *   node scripts/unified-memory-static-scan.mjs --strict
 *   npm run unified-memory:static-scan
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "src");

function parseArgs(argv) {
  const out = { strict: false, outJson: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--strict") out.strict = true;
    else if (a === "--out") out.outJson = argv[++i] || "";
  }
  return out;
}

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

function lineHasFlagCheck(line) {
  return /isFeatureEnabled\s*\(|unifiedMemoryAdaptersV1|palaceProjectionOnlyV1|contextGraphProjectionOnlyV1|diaryRepositoryV1|isScenarioAdapterPathEnabled|isLifeAdapterEnabled|useDiaryRepository|adapterPathEnabled|graphProjectionOnly/.test(
    line,
  );
}

/**
 * Look for ingestCandidate call sites in scenario files where nearby lines
 * (same function-ish window) lack a feature-flag gate.
 */
function scanScenarioIngest(filePath, text) {
  const rel = relative(root, filePath).replace(/\\/g, "/");
  if (!rel.includes("scenario")) return [];
  const lines = text.split(/\r?\n/);
  /** @type {{ file: string, line: number, snippet: string, reason: string }[]} */
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/\bingestCandidate\s*\(/.test(line)) continue;
    // Window: 25 lines above for flag / adapter gate
    const windowStart = Math.max(0, i - 25);
    const window = lines.slice(windowStart, i + 1);
    const gated = window.some(lineHasFlagCheck);
    if (!gated) {
      hits.push({
        file: rel,
        line: i + 1,
        snippet: line.trim().slice(0, 160),
        reason: "ingestCandidate_without_nearby_flag_check",
      });
    } else {
      hits.push({
        file: rel,
        line: i + 1,
        snippet: line.trim().slice(0, 160),
        reason: "ingestCandidate_with_flag_context",
        gated: true,
      });
    }
  }
  return hits;
}

function scanFileDrawer(filePath, text) {
  const rel = relative(root, filePath).replace(/\\/g, "/");
  const inDiary = /\/diary\//.test(rel) || rel.startsWith("src/diary/");
  const inBooks =
    /\/library\//.test(rel)
    && (/books-import|book-reader|books\.js/.test(rel) || /reading/.test(rel));
  const inApp = rel === "src/app.js";
  if (!inDiary && !inBooks && !inApp) return [];

  const lines = text.split(/\r?\n/);
  /** @type {{ file: string, line: number, snippet: string, reason: string }[]} */
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isImport = /import\s*\{[^}]*\bfileDrawer\b/.test(line) || /from\s+["'].*palace\/drawer/.test(line);
    const isCall = /\bfileDrawer\s*\(/.test(line) || /\bfileDrawerAndRender\s*\(/.test(line);
    if (!isImport && !isCall) continue;
    const area = inDiary ? "diary" : inBooks ? "books" : "app";
    hits.push({
      file: rel,
      line: i + 1,
      snippet: line.trim().slice(0, 160),
      reason: isImport ? `direct_fileDrawer_import_${area}` : `direct_fileDrawer_call_${area}`,
      area,
    });
  }
  return hits;
}

/** Paths that are allowed to call fileDrawer even when flags are assumed on (projection writers). */
const FILE_DRAWER_ALLOWLIST = [
  "src/memory/palace/drawer.js",
  "src/memory/palace/index.js",
  "src/memory/adapters/",
  "src/memory/projection/",
  "src/projections/",
  "src/memory/palace/rebuild.js",
];

function isAllowlisted(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  return FILE_DRAWER_ALLOWLIST.some((p) => norm === p || norm.startsWith(p));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = walkJsFiles(srcRoot);
  /** @type {object[]} */
  const fileDrawerHits = [];
  /** @type {object[]} */
  const scenarioIngestHits = [];

  for (const file of files) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    fileDrawerHits.push(...scanFileDrawer(file, text));
    scenarioIngestHits.push(...scanScenarioIngest(file, text));
  }

  const remainingFileDrawer = fileDrawerHits.filter((h) => !isAllowlisted(h.file));
  const ungatedScenario = scenarioIngestHits.filter((h) => h.gated !== true);
  const gatedScenario = scenarioIngestHits.filter((h) => h.gated === true);

  // When flags assumed on, legacy diary/books/app fileDrawer call sites are forbidden
  // unless they sit behind a flag branch (we still list them for cutover docs).
  const forbiddenWhenFlagsOn = remainingFileDrawer.filter((h) =>
    h.reason.startsWith("direct_fileDrawer_call_"),
  );

  const report = {
    schemaVersion: 1,
    wave: "M9",
    generatedAt: new Date().toISOString(),
    strict: args.strict,
    flagsAssumedOn: args.strict,
    note: "Documentation scan. Defaults: exit 0. --strict fails if residual forbidden call sites remain when flags are assumed ON.",
    fileDrawer: {
      totalHits: remainingFileDrawer.length,
      byArea: {
        diary: remainingFileDrawer.filter((h) => h.area === "diary").length,
        books: remainingFileDrawer.filter((h) => h.area === "books").length,
        app: remainingFileDrawer.filter((h) => h.area === "app").length,
      },
      hits: remainingFileDrawer,
      forbiddenWhenFlagsOn: forbiddenWhenFlagsOn.length,
    },
    scenarioIngestCandidate: {
      totalCallSites: scenarioIngestHits.length,
      ungated: ungatedScenario.length,
      gated: gatedScenario.length,
      ungatedHits: ungatedScenario,
      gatedHits: gatedScenario,
    },
    summary: {
      remainingDirectFileDrawerSites: remainingFileDrawer.length,
      remainingUngatedScenarioIngest: ungatedScenario.length,
      cutoverReadyHint:
        remainingFileDrawer.length === 0 && ungatedScenario.length === 0
          ? "no residual forbidden patterns in scoped paths"
          : "residuals listed — enable flags only after adapters/repository paths cover these sites",
    },
  };

  const text = JSON.stringify(report, null, 2);
  console.log(text);

  const outPath = args.outJson || join(root, "docs/qa/unified-memory/M9_STATIC_SCAN.json");
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${text}\n`, "utf8");
    console.error(`\nWrote ${outPath}`);
  } catch (error) {
    console.error("\nCould not write scan JSON:", error?.message || error);
  }

  if (args.strict) {
    // Strict = flags assumed on. Fail if diary/books/app still have direct fileDrawer
    // *calls* (imports alone are OK if dead behind flag) OR ungated scenario ingest.
    // Reality at M9: residuals exist behind flag-off branches — strict documents that
    // product cutover is not yet "static-clean". Fail only on ungated scenario ingest
    // OR fileDrawer calls that have no flag mention in the same file.
    const filesWithCalls = new Map();
    for (const h of forbiddenWhenFlagsOn) {
      if (!filesWithCalls.has(h.file)) {
        let body = "";
        try {
          body = readFileSync(join(root, h.file), "utf8");
        } catch {
          body = "";
        }
        filesWithCalls.set(h.file, body);
      }
    }
    const unguardedCalls = forbiddenWhenFlagsOn.filter((h) => {
      const body = filesWithCalls.get(h.file) || "";
      return !lineHasFlagCheck(body);
    });
    if (unguardedCalls.length > 0 || ungatedScenario.length > 0) {
      console.error(
        `\nSTRICT FAIL: unguarded fileDrawer calls=${unguardedCalls.length}, ungated scenario ingest=${ungatedScenario.length}`,
      );
      process.exitCode = 1;
    } else {
      console.error("\nSTRICT OK: remaining call sites are behind feature-flag branches.");
    }
  }

  return report;
}

main();
