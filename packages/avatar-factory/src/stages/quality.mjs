/**
 * QA: duplicate-frame detection, face-pack A→B→C→D degradation, quality-report enum.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { hashFile } from "../job-store.mjs";
import { V1_ACTIONS, ACTION_META } from "../../../avatar-contract/src/index.mjs";

export const QA_RESULTS = Object.freeze([
  "PASS",
  "RETRYABLE_FAIL",
  "DEGRADED_PASS",
  "HARD_FAIL",
]);

const RANK = Object.freeze({
  PASS: 0,
  DEGRADED_PASS: 1,
  RETRYABLE_FAIL: 2,
  HARD_FAIL: 3,
});

export function worstResult(...results) {
  let worst = "PASS";
  for (const r of results) {
    if (r && RANK[r] > RANK[worst]) worst = r;
  }
  return worst;
}

export function assertQaResult(value) {
  if (!QA_RESULTS.includes(value)) {
    throw new Error(`quality-report result must be one of ${QA_RESULTS.join("|")}, got ${value}`);
  }
  return value;
}

/** Face pack tier requirements (A richest → D minimal). */
export const FACE_TIER_FILES = Object.freeze({
  A: [
    "base.png",
    "eyes/open.png",
    "eyes/closed.png",
    "eyes/half.png",
    "eyes/happy.png",
    "brows/neutral.png",
    "brows/happy.png",
    "brows/concerned.png",
    "brows/annoyed.png",
    "mouth/closed.png",
    "mouth/small.png",
    "mouth/medium.png",
    "mouth/open.png",
    "mouth/smile.png",
    "blush/soft.png",
  ],
  B: [
    "base.png",
    "eyes/open.png",
    "eyes/closed.png",
    "brows/neutral.png",
    "brows/happy.png",
    "mouth/closed.png",
    "mouth/open.png",
    "mouth/smile.png",
  ],
  C: ["base.png", "eyes/open.png", "eyes/closed.png", "mouth/closed.png", "mouth/open.png"],
  D: ["base.png"],
});

async function fileOk(p) {
  try {
    const st = await fs.stat(p);
    return st.isFile() && st.size > 32;
  } catch {
    return false;
  }
}

/**
 * Evaluate face pack; degrade A→B→C→D without failing the whole pack.
 * @returns {{ qualityTier: 'A'|'B'|'C'|'D', result: string, missing: string[], present: string[] }}
 */
export async function evaluateFacePack(faceDir) {
  const present = [];
  const missing = [];
  const allNeeded = new Set(FACE_TIER_FILES.A);
  for (const rel of allNeeded) {
    const ok = await fileOk(path.join(faceDir, rel));
    if (ok) present.push(rel);
    else missing.push(rel);
  }

  for (const tier of ["A", "B", "C", "D"]) {
    const req = FACE_TIER_FILES[tier];
    const unmet = [];
    for (const rel of req) {
      if (!(await fileOk(path.join(faceDir, rel)))) unmet.push(rel);
    }
    if (unmet.length === 0) {
      return {
        qualityTier: tier,
        result: tier === "A" ? "PASS" : "DEGRADED_PASS",
        missing,
        present,
        unmetForHigher: tier === "A" ? [] : missing,
      };
    }
  }

  // Even without base — still D + DEGRADED_PASS (do not HARD_FAIL pack for face)
  return {
    qualityTier: "D",
    result: "DEGRADED_PASS",
    missing,
    present,
    note: "face_pack_incomplete_forced_D",
  };
}

/**
 * Detect duplicate hashes among frames that claim to be different keyframes of an action.
 * @returns {{ result: string, actions: Record<string, object>, duplicates: array }}
 */
export async function detectDuplicateActionFrames(actionsRoot) {
  const duplicates = [];
  const actions = {};
  let result = "PASS";

  for (const action of V1_ACTIONS) {
    const dir = path.join(actionsRoot, action);
    let names = [];
    try {
      names = (await fs.readdir(dir)).filter((n) => /\.png$/i.test(n)).sort();
    } catch {
      actions[action] = { result: "HARD_FAIL", reason: "missing_action_dir", frames: [] };
      result = "HARD_FAIL";
      continue;
    }

    const byHash = new Map();
    const frames = [];
    for (const name of names) {
      const fp = path.join(dir, name);
      const hash = await hashFile(fp);
      frames.push({ name, hash });
      if (!byHash.has(hash)) byHash.set(hash, []);
      byHash.get(hash).push(name);
    }

    const dups = [...byHash.entries()].filter(([, list]) => list.length > 1);
    if (dups.length) {
      const detail = dups.map(([hash, list]) => ({ hash: hash.slice(0, 16), frames: list }));
      duplicates.push({ action, detail });
      actions[action] = {
        result: "HARD_FAIL",
        reason: "duplicate_frame_hashes",
        frames,
        duplicateGroups: detail,
      };
      result = "HARD_FAIL";
    } else {
      const expected = ACTION_META[action].keyframes;
      actions[action] = {
        result: names.length >= 1 ? "PASS" : "HARD_FAIL",
        frames,
        keyframeCount: names.length,
        expectedKeyframes: expected,
      };
      if (names.length < 1) result = "HARD_FAIL";
    }
  }

  return { result, actions, duplicates };
}

/**
 * Build canonical quality-report.json payload.
 */
export function buildQualityReport({
  isFixture,
  matting,
  registration,
  duplicates,
  face,
  extraChecks = {},
  note = "",
}) {
  const mattingResult = matting?.checkResult || matting?.result || "PASS";
  const registrationResult = registration?.result || "PASS";
  const dupResult = duplicates?.result || "PASS";
  const faceResult = face?.result || "DEGRADED_PASS";
  const faceTier = face?.qualityTier || "D";

  let overall = worstResult(mattingResult, registrationResult, dupResult, faceResult);

  // Fixture packs are never publishable; mark overall DEGRADED_PASS unless HARD_FAIL
  if (isFixture && overall !== "HARD_FAIL" && overall !== "RETRYABLE_FAIL") {
    overall = "DEGRADED_PASS";
  }

  // Pack policy: duplicate HARD_FAIL wins
  if (dupResult === "HARD_FAIL") overall = "HARD_FAIL";

  // Real packs: publishable candidate when QA did not hard/retry fail (face may be DEGRADED_PASS tier).
  // Fixture packs are never publishable regardless of checks.
  const publishable =
    !isFixture && overall !== "HARD_FAIL" && overall !== "RETRYABLE_FAIL";

  const report = {
    result: assertQaResult(overall),
    qualityTier: faceTier,
    publishable,
    checks: {
      fixture_marked: Boolean(isFixture),
      duplicate_frames: assertQaResult(dupResult),
      matting: assertQaResult(mattingResult),
      registration: assertQaResult(
        registrationResult === "RETRYABLE_FAIL" && overall === "DEGRADED_PASS"
          ? "DEGRADED_PASS"
          : registrationResult,
      ),
      face_pack: assertQaResult(faceResult),
      ...extraChecks,
    },
    matting: {
      primaryMode: matting?.primaryMode || null,
      usedIsnet: matting?.usedIsnet ?? 0,
      usedFallback: matting?.usedFallback ?? 0,
    },
    registration: {
      mode: registration?.mode || null,
      thresholds: registration?.thresholds || null,
      actions: registration?.actions || {},
    },
    duplicates: duplicates?.duplicates || [],
    face: {
      qualityTier: faceTier,
      missing: face?.missing || [],
    },
    note:
      note ||
      (isFixture
        ? "Fixture packs are never publishable"
        : overall === "HARD_FAIL"
          ? "Hard QA failure"
          : ""),
  };
  return report;
}
