/**
 * CP-AV5 registration + duplicate + face degrade tests (fixture PNGs).
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { writeFixturePng, matteGrayFixture } from "../src/fixture-art.mjs";
import {
  compareToCanonical,
  measureAlphaBBox,
  readPng,
  REG_THRESHOLDS,
  translatePng,
  writePng,
} from "../src/png-metrics.mjs";
import { registerFrame, runRegistrationStage } from "../src/stages/registration.mjs";
import {
  detectDuplicateActionFrames,
  evaluateFacePack,
  FACE_TIER_FILES,
  buildQualityReport,
  worstResult,
  QA_RESULTS,
} from "../src/stages/quality.mjs";
import { V1_ACTIONS, ACTION_META } from "../../avatar-contract/src/index.mjs";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-reg-"));

assert.deepEqual(REG_THRESHOLDS, { footPx: 4, centerPx: 8, heightPct: 3 });
assert.deepEqual(QA_RESULTS, ["PASS", "RETRYABLE_FAIL", "DEGRADED_PASS", "HARD_FAIL"]);

function solidSubjectPng({ size = 128, x0, y0, x1, y1 }) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  png.data.fill(0);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * size + x) * 4;
      png.data[i] = 80;
      png.data[i + 1] = 120;
      png.data[i + 2] = 200;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

{
  const canon = solidSubjectPng({ x0: 40, y0: 20, x1: 80, y1: 100 });
  const frame = solidSubjectPng({ x0: 50, y0: 20, x1: 90, y1: 100 }); // shifted +10 in X
  const cm = measureAlphaBBox(canon);
  const fm = measureAlphaBBox(frame);
  const cmp = compareToCanonical(fm, cm);
  assert.ok(cmp.centerDelta > REG_THRESHOLDS.centerPx);
  assert.ok(Math.abs(cmp.translateDx - (cm.centerX - fm.centerX)) < 0.01);

  const moved = translatePng(frame, cmp.translateDx, cmp.translateDy);
  const after = measureAlphaBBox(moved);
  const cmp2 = compareToCanonical(after, cm);
  assert.ok(cmp2.ok, `expected aligned after translate, got ${JSON.stringify(cmp2)}`);
  assert.ok(cmp2.footDelta <= 4);
  assert.ok(cmp2.centerDelta <= 8);
  assert.ok(cmp2.heightDeltaPct <= 3);
}

{
  const dir = path.join(tmpRoot, "reg1");
  await fs.mkdir(dir, { recursive: true });
  const canonP = path.join(dir, "canon.png");
  const frameP = path.join(dir, "frame.png");
  const destP = path.join(dir, "out.png");
  await writePng(canonP, solidSubjectPng({ x0: 40, y0: 20, x1: 80, y1: 100 }));
  await writePng(frameP, solidSubjectPng({ x0: 55, y0: 25, x1: 95, y1: 105 }));
  const cm = measureAlphaBBox(await readPng(canonP));
  const r = await registerFrame(frameP, destP, cm);
  assert.equal(r.translated, true);
  assert.ok(r.result === "PASS" || r.result === "RETRYABLE_FAIL" || r.result === "DEGRADED_PASS");
  // height same → should PASS after translate
  assert.equal(r.result, "PASS");
}

{
  // height mismatch → RETRYABLE_FAIL
  const dir = path.join(tmpRoot, "reg-h");
  await fs.mkdir(dir, { recursive: true });
  const canonP = path.join(dir, "canon.png");
  const frameP = path.join(dir, "frame.png");
  const destP = path.join(dir, "out.png");
  await writePng(canonP, solidSubjectPng({ x0: 40, y0: 10, x1: 80, y1: 110 })); // h=101
  await writePng(frameP, solidSubjectPng({ x0: 40, y0: 40, x1: 80, y1: 90 })); // h=51 → >3%
  const cm = measureAlphaBBox(await readPng(canonP));
  const r = await registerFrame(frameP, destP, cm);
  assert.equal(r.result, "RETRYABLE_FAIL");
  assert.equal(r.retry, true);
}

{
  // Mini job: fixture mattes + register stage
  const jobDir = path.join(tmpRoot, "job-reg");
  await writeFixturePng(path.join(jobDir, "canonical", "full-body.png"), {
    kind: "idle",
    characterId: "regcanon",
    size: 256,
  });
  for (const action of V1_ACTIONS) {
    const n = ACTION_META[action].keyframes;
    for (let i = 1; i <= n; i++) {
      const p = path.join(jobDir, "actions", action, `frame-0${i}.png`);
      await writeFixturePng(p, { kind: action, characterId: `reg-${action}-${i}`, size: 256 });
    }
  }
  await writeFixturePng(path.join(jobDir, "face", "base.png"), {
    kind: "face",
    characterId: "regface",
    size: 256,
  });

  // matte into processed/
  for (const rel of [
    "canonical/full-body.png",
    ...V1_ACTIONS.flatMap((a) =>
      Array.from({ length: ACTION_META[a].keyframes }, (_, i) => `actions/${a}/frame-0${i + 1}.png`),
    ),
    "face/base.png",
  ]) {
    await matteGrayFixture(path.join(jobDir, rel), path.join(jobDir, "processed", rel));
  }

  const report = await runRegistrationStage(jobDir);
  assert.equal(report.mode, "js_alpha_bbox");
  assert.ok(["PASS", "DEGRADED_PASS"].includes(report.result), report.result);
  assert.equal(report.thresholds.footPx, 4);
  for (const action of V1_ACTIONS) {
    assert.ok(report.actions[action].keyframes >= 1, action);
  }
}

{
  // Duplicate frames → HARD_FAIL for action
  const root = path.join(tmpRoot, "dups", "actions");
  for (const action of V1_ACTIONS) {
    const n = ACTION_META[action].keyframes;
    for (let i = 1; i <= n; i++) {
      const p = path.join(root, action, `frame-0${i}.png`);
      await writeFixturePng(p, {
        kind: action,
        // force identical bytes for idle's two frames
        characterId: action === "idle" ? "same-idle" : `uniq-${action}-${i}`,
        size: 128,
      });
    }
  }
  const dup = await detectDuplicateActionFrames(root);
  assert.equal(dup.result, "HARD_FAIL");
  assert.equal(dup.actions.idle.result, "HARD_FAIL");
  assert.ok(dup.duplicates.some((d) => d.action === "idle"));
}

{
  // Face degrade A→B→C→D
  const faceDir = path.join(tmpRoot, "face-tiers");
  // only base → D
  await writeFixturePng(path.join(faceDir, "base.png"), { kind: "face", characterId: "t", size: 64 });
  let ev = await evaluateFacePack(faceDir);
  assert.equal(ev.qualityTier, "D");
  assert.equal(ev.result, "DEGRADED_PASS");

  // add C requirements
  for (const rel of FACE_TIER_FILES.C) {
    await writeFixturePng(path.join(faceDir, rel), {
      kind: rel.includes("eyes") ? "eyes_open" : rel.includes("mouth") ? "mouth_closed" : "face",
      characterId: `c-${rel}`,
      size: 64,
    });
  }
  ev = await evaluateFacePack(faceDir);
  assert.equal(ev.qualityTier, "C");
  assert.equal(ev.result, "DEGRADED_PASS");

  // full A
  for (const rel of FACE_TIER_FILES.A) {
    await writeFixturePng(path.join(faceDir, rel), {
      kind: rel.includes("eyes")
        ? "eyes_open"
        : rel.includes("mouth")
          ? "mouth_open"
          : rel.includes("brows")
            ? "eyes_closed"
            : "face",
      characterId: `a-${rel}`,
      size: 64,
    });
  }
  ev = await evaluateFacePack(faceDir);
  assert.equal(ev.qualityTier, "A");
  assert.equal(ev.result, "PASS");
}

{
  assert.equal(worstResult("PASS", "DEGRADED_PASS", "RETRYABLE_FAIL"), "RETRYABLE_FAIL");
  assert.equal(worstResult("DEGRADED_PASS", "HARD_FAIL"), "HARD_FAIL");
  const qa = buildQualityReport({
    isFixture: false,
    matting: { checkResult: "PASS", primaryMode: "isnet-anime", usedIsnet: 1, usedFallback: 0 },
    registration: { result: "PASS", mode: "js_alpha_bbox", thresholds: REG_THRESHOLDS, actions: {} },
    duplicates: { result: "HARD_FAIL", duplicates: [{ action: "idle" }] },
    face: { qualityTier: "A", result: "PASS", missing: [] },
  });
  assert.equal(qa.result, "HARD_FAIL");
  assert.equal(qa.checks.duplicate_frames, "HARD_FAIL");
  assert.equal(qa.publishable, false);
}

console.log("avatar-registration.test.mjs: PASS");
