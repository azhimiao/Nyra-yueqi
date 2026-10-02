/**
 * CP-AV5 matting tests — fallback_matting + python preference wiring.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { writeFixturePng, matteGrayFixture } from "../src/fixture-art.mjs";
import {
  matteOne,
  matteSources,
  MATTING_MODES,
  resetPythonMatteCache,
  pythonMatteAvailable,
} from "../src/stages/matting.mjs";
import { measureAlphaBBox, readPng } from "../src/png-metrics.mjs";
import { buildQualityReport } from "../src/stages/quality.mjs";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-matting-"));

function fillGrayWithSubject(size = 128) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0xb8;
    png.data[i + 1] = 0xb8;
    png.data[i + 2] = 0xb8;
    png.data[i + 3] = 255;
  }
  // opaque red square in center
  for (let y = 40; y < 90; y++) {
    for (let x = 40; x < 90; x++) {
      const i = (y * size + x) * 4;
      png.data[i] = 200;
      png.data[i + 1] = 40;
      png.data[i + 2] = 40;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

{
  const inp = path.join(tmpRoot, "raw.png");
  const out = path.join(tmpRoot, "out-fallback.png");
  await fs.writeFile(inp, PNG.sync.write(fillGrayWithSubject()));
  resetPythonMatteCache();
  const r = await matteOne(inp, out, { preferPython: false });
  assert.equal(r.mode, MATTING_MODES.FALLBACK);
  assert.equal(r.ok, true);
  const m = measureAlphaBBox(await readPng(out));
  assert.ok(m, "subject remains after gray flood");
  assert.ok(m.coverage > 0.05 && m.coverage < 0.5, `coverage ${m.coverage}`);
  // corners should be transparent
  const png = await readPng(out);
  assert.equal(png.data[3], 0);
}

{
  // matteGrayFixture direct
  const inp = path.join(tmpRoot, "fx-in.png");
  const out = path.join(tmpRoot, "fx-out.png");
  await writeFixturePng(inp, { kind: "idle", characterId: "mattetest", size: 256 });
  await matteGrayFixture(inp, out);
  const m = measureAlphaBBox(await readPng(out));
  assert.ok(m?.height > 50);
}

{
  resetPythonMatteCache();
  const available = await pythonMatteAvailable({ probeTimeoutMs: 8000 });
  // Environment may or may not have rembg; both are valid. Prefer path must not throw.
  const inp = path.join(tmpRoot, "pref.png");
  const out = path.join(tmpRoot, "pref-out.png");
  await writeFixturePng(inp, { kind: "idle", characterId: "pref", size: 256 });
  const r = await matteOne(inp, out, { preferPython: true, timeoutMs: 30_000 });
  assert.ok(r.ok);
  assert.ok(r.mode === MATTING_MODES.FALLBACK || r.mode === MATTING_MODES.ISNET);
  if (!available) {
    assert.equal(r.mode, MATTING_MODES.FALLBACK);
    assert.ok(r.error);
  }
}

{
  const jobDir = path.join(tmpRoot, "job1");
  await fs.mkdir(path.join(jobDir, "actions", "idle"), { recursive: true });
  const src = path.join(jobDir, "actions", "idle", "frame-01.png");
  await writeFixturePng(src, { kind: "idle", characterId: "batch1", size: 256 });
  const report = await matteSources(jobDir, [src], { preferPython: false });
  assert.equal(report.primaryMode, MATTING_MODES.FALLBACK);
  assert.equal(report.usedFallback, 1);
  assert.equal(report.checkResult, "DEGRADED_PASS");
  assert.ok(await fs.access(path.join(jobDir, "processed", "actions", "idle", "frame-01.png")).then(() => true));
}

{
  const qa = buildQualityReport({
    isFixture: true,
    matting: { checkResult: "DEGRADED_PASS", primaryMode: "fallback_matting", usedIsnet: 0, usedFallback: 3 },
    registration: { result: "PASS", mode: "js_alpha_bbox", thresholds: { footPx: 4, centerPx: 8, heightPct: 3 }, actions: {} },
    duplicates: { result: "PASS", duplicates: [] },
    face: { qualityTier: "D", result: "DEGRADED_PASS", missing: [] },
  });
  assert.equal(qa.result, "DEGRADED_PASS");
  assert.equal(qa.checks.matting, "DEGRADED_PASS");
  assert.equal(qa.matting.primaryMode, "fallback_matting");
  assert.equal(qa.publishable, false);
  for (const code of ["PASS", "RETRYABLE_FAIL", "DEGRADED_PASS", "HARD_FAIL"]) {
    assert.ok(["PASS", "RETRYABLE_FAIL", "DEGRADED_PASS", "HARD_FAIL"].includes(code));
  }
}

{
  const qaReal = buildQualityReport({
    isFixture: false,
    matting: { checkResult: "PASS", primaryMode: "isnet-anime", usedIsnet: 3, usedFallback: 0 },
    registration: { result: "PASS", mode: "js_alpha_bbox", thresholds: { footPx: 4, centerPx: 8, heightPct: 3 }, actions: {} },
    duplicates: { result: "PASS", duplicates: [] },
    face: { qualityTier: "C", result: "DEGRADED_PASS", missing: [] },
  });
  assert.equal(qaReal.result, "DEGRADED_PASS");
  assert.equal(qaReal.publishable, true, "real DEGRADED_PASS packs are publishable candidates");
}

{
  const qaHard = buildQualityReport({
    isFixture: false,
    matting: { checkResult: "PASS", primaryMode: "isnet-anime", usedIsnet: 3, usedFallback: 0 },
    registration: { result: "PASS", mode: "js_alpha_bbox", thresholds: { footPx: 4, centerPx: 8, heightPct: 3 }, actions: {} },
    duplicates: { result: "HARD_FAIL", duplicates: [{ action: "idle" }] },
    face: { qualityTier: "C", result: "DEGRADED_PASS", missing: [] },
  });
  assert.equal(qaHard.publishable, false);
}

console.log("avatar-matting.test.mjs: PASS");
