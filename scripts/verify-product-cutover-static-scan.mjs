/** Mutation fixture: test exclusions must never exempt production authority writes. */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const source = readFileSync(new URL("./product-cutover-static-scan.mjs", import.meta.url), "utf8");
const temp = mkdtempSync(join(tmpdir(), "yueqi-cutover-scan-test-"));
const cases = [
  { name: "test fixtures are excluded", file: "src/memory/manager.test.mjs", text: 'fileDrawer({ body: "fixture" });', exit: 0, key: "ungatedFileDrawerOutsideProjector", count: 0 },
  { name: "production fileDrawer is rejected", file: "src/features/unsafe-writer.js", text: 'fileDrawer({ body: "production" });', exit: 1, key: "ungatedFileDrawerOutsideProjector", count: 1 },
  { name: "production diary authority is rejected", file: "src/diary/unsafe-writer.js", text: 'updateMemory({ source: "diary.memory", body: "production" });', exit: 1, key: "ungatedDiaryMemoryAuthorityWrites", count: 1 },
  { name: "production accepted graph authority is rejected", file: "src/context/extraction.js", text: 'ingestCandidate({ memoryStatus: "accepted", body: "production" });', exit: 1, key: "ungatedGraphAcceptedAuthorityWrites", count: 1 },
];
try {
  for (const [index, item] of cases.entries()) {
    const root = join(temp, String(index));
    const script = join(root, "scripts/product-cutover-static-scan.mjs");
    const fixture = join(root, item.file);
    mkdirSync(dirname(script), { recursive: true });
    mkdirSync(dirname(fixture), { recursive: true });
    writeFileSync(script, source);
    writeFileSync(fixture, item.text);
    const result = spawnSync(process.execPath, [script, "--skip-unified", "--out", join(root, "result.json")], { encoding: "utf8", cwd: root, timeout: 30_000 });
    assert.equal(result.status, item.exit, `${item.name}: ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.productScan[item.key], item.count, item.name);
    assert.equal(report.summary.ok, item.exit === 0, item.name);
    console.log(`PASS ${item.name}`);
  }
  console.log(`PASS ${cases.length}/${cases.length} isolated scan mutation fixtures`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
