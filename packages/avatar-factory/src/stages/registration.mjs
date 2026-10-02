/**
 * Registration: align action frames to canonical via alpha bbox metrics.
 * Thresholds: foot≤4px, center≤8px, height≤3%. Auto-translate; retry; degrade keyframes.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  compareToCanonical,
  measureAlphaBBox,
  readPng,
  REG_THRESHOLDS,
  translatePng,
  writePng,
} from "../png-metrics.mjs";
import { ACTION_META, V1_ACTIONS } from "../../../avatar-contract/src/index.mjs";

export { REG_THRESHOLDS };

const RANK = { PASS: 0, DEGRADED_PASS: 1, RETRYABLE_FAIL: 2, HARD_FAIL: 3 };

function worse(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * Register one frame against canonical metrics. Auto-translates foot/center.
 */
export async function registerFrame(srcPath, destPath, canonicalMetrics, thresholds = REG_THRESHOLDS) {
  let png = await readPng(srcPath);
  let metrics = measureAlphaBBox(png);
  if (!metrics || !canonicalMetrics) {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
    return {
      result: "HARD_FAIL",
      reason: "no_alpha_subject",
      translated: false,
      retry: false,
      metrics: null,
      comparison: null,
    };
  }

  let comparison = compareToCanonical(metrics, canonicalMetrics, thresholds);
  let translated = false;
  const dx = comparison.translateDx;
  const dy = comparison.translateDy;
  if (!comparison.ok && (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5)) {
    png = translatePng(png, dx, dy);
    translated = true;
    metrics = measureAlphaBBox(png);
    comparison = compareToCanonical(metrics, canonicalMetrics, thresholds);
  }

  await writePng(destPath, png);

  const heightFail = comparison.heightDeltaPct > thresholds.heightPct;
  const posFail =
    comparison.footDelta > thresholds.footPx || comparison.centerDelta > thresholds.centerPx;

  if (!heightFail && !posFail) {
    return {
      result: "PASS",
      reason: null,
      translated,
      retry: false,
      metrics,
      comparison,
      dx: translated ? dx : 0,
      dy: translated ? dy : 0,
    };
  }

  return {
    result: "RETRYABLE_FAIL",
    reason: heightFail ? "height_out_of_tolerance" : "position_out_of_tolerance_after_translate",
    translated,
    retry: true,
    metrics,
    comparison,
    dx: translated ? dx : 0,
    dy: translated ? dy : 0,
  };
}

async function copyTree(from, to) {
  let entries;
  try {
    entries = await fs.readdir(from, { withFileTypes: true });
  } catch {
    return;
  }
  await fs.mkdir(to, { recursive: true });
  for (const e of entries) {
    const src = path.join(from, e.name);
    const dest = path.join(to, e.name);
    if (e.isDirectory()) await copyTree(src, dest);
    else {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }
  }
}

/**
 * Prefer PASS frames; if none, keep retryable as DEGRADED_PASS (degrade keyframe count).
 * Renumber surviving frames to frame-01..
 */
async function finalizeActionFrames(registeredActionDir, reports, suggestedCount) {
  const pass = reports.filter((r) => r.result === "PASS");
  let chosen = pass;
  let degraded = false;
  let actionResult = "PASS";

  if (chosen.length === 0) {
    chosen = reports.filter((r) => r.result === "RETRYABLE_FAIL");
    for (const r of chosen) r.result = "DEGRADED_PASS";
    degraded = true;
    actionResult = chosen.length ? "DEGRADED_PASS" : "HARD_FAIL";
  } else if (chosen.length < reports.length || chosen.length < suggestedCount) {
    degraded = true;
    actionResult = "DEGRADED_PASS";
  }

  // Remove non-chosen files
  const chosenNames = new Set(chosen.map((r) => r.frame));
  for (const r of reports) {
    if (!chosenNames.has(r.frame)) {
      await fs.rm(path.join(registeredActionDir, r.frame), { force: true }).catch(() => {});
    }
  }

  // Renumber
  const ordered = [...chosen].sort((a, b) => a.frame.localeCompare(b.frame));
  const finalNames = [];
  for (let i = 0; i < ordered.length; i++) {
    const target = `frame-0${i + 1}.png`;
    const from = path.join(registeredActionDir, ordered[i].frame);
    const to = path.join(registeredActionDir, target);
    if (ordered[i].frame !== target) {
      if (await exists(to) && to !== from) await fs.rm(to, { force: true });
      await fs.rename(from, to).catch(async () => {
        await fs.copyFile(from, to);
        await fs.rm(from, { force: true });
      });
    }
    ordered[i].frame = target;
    finalNames.push(target);
  }

  return {
    keyframes: finalNames.length,
    degraded,
    result: actionResult,
    frames: finalNames,
    retryFlags: reports.filter((r) => r.retry).map((r) => r.frame),
  };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Run registration for a job directory.
 */
export async function runRegistrationStage(jobDir, opts = {}) {
  const thresholds = { ...REG_THRESHOLDS, ...(opts.thresholds || {}) };
  const processed = path.join(jobDir, "processed");
  const registered = path.join(jobDir, "registered");
  await fs.rm(registered, { recursive: true, force: true });
  await fs.mkdir(registered, { recursive: true });

  const canonPath = path.join(processed, "canonical", "full-body.png");
  let canonicalMetrics = null;
  try {
    canonicalMetrics = measureAlphaBBox(await readPng(canonPath));
  } catch {
    canonicalMetrics = null;
  }
  if (!canonicalMetrics) {
    return {
      mode: "js_alpha_bbox",
      thresholds,
      result: "HARD_FAIL",
      reason: "canonical_missing_subject",
      frames: [],
      actions: {},
    };
  }

  await copyTree(path.join(processed, "face"), path.join(registered, "face"));
  await copyTree(path.join(processed, "canonical"), path.join(registered, "canonical"));

  const frameReports = [];
  const actionsOut = {};
  let worst = "PASS";

  for (const action of V1_ACTIONS) {
    const meta = ACTION_META[action];
    const actionDir = path.join(processed, "actions", action);
    const reports = [];
    for (let i = 1; i <= meta.keyframes; i++) {
      const name = `frame-0${i}.png`;
      const src = path.join(actionDir, name);
      if (!(await exists(src))) continue;
      const dest = path.join(registered, "actions", action, name);
      const r = await registerFrame(src, dest, canonicalMetrics, thresholds);
      const entry = { action, frame: name, ...r };
      reports.push(entry);
      frameReports.push(entry);
      worst = worse(worst, r.result);
    }

    const finalized = await finalizeActionFrames(
      path.join(registered, "actions", action),
      reports,
      meta.keyframes,
    );
    actionsOut[action] = finalized;
    worst = worse(worst, finalized.result);
  }

  // Retained degraded frames → pack-level DEGRADED_PASS (not stuck on RETRYABLE)
  if (worst === "RETRYABLE_FAIL") worst = "DEGRADED_PASS";

  return {
    mode: "js_alpha_bbox",
    thresholds,
    canonical: {
      footBottom: canonicalMetrics.footBottom,
      centerX: canonicalMetrics.centerX,
      height: canonicalMetrics.height,
    },
    result: worst,
    frames: frameReports,
    actions: actionsOut,
  };
}
