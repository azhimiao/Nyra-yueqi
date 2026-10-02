#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { XINGLI_ACTION_IDS } from "../src/avatar/xingli-action-map.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE = path.join(ROOT, "assets", "characters", "xingli-source");
const SIZE = 1536;
const EXPECTED_COUNTS = Object.freeze({
  comfort: 1,
  drag: 1,
  greet: 3,
  idle_loop: 1,
  lean_close: 1,
  listen: 1,
  react_tap: 2,
  selfie: 1,
  shy_look_away: 1,
  sit_idle: 1,
  sit_to_sleep: 3,
  sleep_loop: 1,
  stand_to_sit: 3,
  talk_loop: 2,
  thinking: 1,
  welcome_home: 1,
});

function parseSource(argv) {
  const index = argv.indexOf("--source");
  if (index >= 0 && argv[index + 1]) return path.resolve(argv[index + 1]);
  const positional = argv.find((value) => !value.startsWith("-"));
  return positional ? path.resolve(positional) : DEFAULT_SOURCE;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function analyze(png) {
  let foreground = 0;
  let transparent = 0;
  let magenta = 0;
  let dirtyTransparentRgb = 0;
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = ((y * png.width) + x) * 4;
      const alpha = png.data[offset + 3];
      if (alpha < 16) {
        transparent += 1;
        if (alpha === 0 && (png.data[offset] || png.data[offset + 1] || png.data[offset + 2])) dirtyTransparentRgb += 1;
      }
      if (alpha <= 24) continue;
      foreground += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const red = png.data[offset];
      const green = png.data[offset + 1];
      const blue = png.data[offset + 2];
      if (alpha > 96 && red > 150 && blue > 150 && green < 85
        && Math.abs(red - blue) < 50 && ((red + blue) / 2 - green) > 85) magenta += 1;
    }
  }
  const total = png.width * png.height;
  return {
    foregroundRatio: foreground / total,
    transparentRatio: transparent / total,
    magentaRatio: magenta / Math.max(1, foreground),
    dirtyTransparentRgb,
    bounds: { minX, minY, maxX, maxY },
    centerX: (minX + maxX) / 2,
    bottom: maxY,
  };
}

function check(condition, message, failures) {
  if (condition) console.log(`PASS  ${message}`);
  else {
    console.error(`FAIL  ${message}`);
    failures.push(message);
  }
}

async function main() {
  const source = parseSource(process.argv.slice(2));
  const manifestPath = path.join(source, "asset_manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`No completed Xingli source pack at ${source}. Run the lock and poses generation stages first (${error.code || error.message}).`);
  }

  const failures = [];
  const warnings = [];
  const requiresStrictMatte = String(manifest?.id || "").startsWith("yueqi-");
  const isCuratedKeyPosePack = manifest?.specs?.asset_kind === "curated-key-pose-pack";
  const clipIds = Object.keys(manifest.animations || {}).sort();
  const expectedIds = [...XINGLI_ACTION_IDS].sort();
  check(JSON.stringify(clipIds) === JSON.stringify(expectedIds), "manifest exactly covers the 16 runtime actions", failures);
  check(Number(manifest.total_frames) === 24, "manifest declares 24 intentional key-pose frames", failures);
  if (requiresStrictMatte) {
    check(
      manifest?.matte?.method === "anime trimap plus GrabCut refinement"
        || manifest?.matte?.segmentation === "rembg-isnet-anime",
      "manifest records an anime-aware matte pipeline",
      failures,
    );
    check(manifest?.matte?.hiddenRgbCleared === true
      || manifest?.matte?.edge_cleanup === "straight-alpha-neutral-despill",
    "manifest records transparent-edge cleanup", failures);
  } else if (!manifest?.matte) {
    warnings.push("Legacy source pack has no matte metadata; regenerate it before modifying legacy frames.");
  }

  const hashes = new Map();
  const metricsByFrame = new Map();
  const standing = [];
  let totalFrames = 0;
  for (const clipId of clipIds) {
    const definition = manifest.animations[clipId];
    const frames = Array.isArray(definition?.frames) ? definition.frames : [];
    const expectedCount = EXPECTED_COUNTS[clipId];
    check(frames.length === expectedCount && Number(definition?.frame_count) === expectedCount,
      `${clipId} has ${expectedCount} planned frame${expectedCount === 1 ? "" : "s"}`, failures);
    check(Number.isFinite(Number(definition?.fps)) && Number(definition.fps) > 0,
      `${clipId} defines playback fps`, failures);
    check(Array.isArray(definition?.frame_durations_ms)
      && definition.frame_durations_ms.length === frames.length
      && definition.frame_durations_ms.every((value) => Number.isFinite(Number(value)) && Number(value) >= 16),
    `${clipId} defines a duration for every frame`, failures);

    for (const frameName of frames) {
      totalFrames += 1;
      const safeName = typeof frameName === "string"
        && /^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/i.test(frameName)
        && path.basename(frameName) === frameName;
      check(safeName, `${clipId}/${String(frameName)} uses a safe PNG name`, failures);
      if (!safeName) continue;
      const framePath = path.resolve(source, "clips", clipId, frameName);
      if (!isInside(source, framePath)) {
        check(false, `${clipId}/${frameName} remains inside the source pack`, failures);
        continue;
      }
      let bytes;
      let png;
      try {
        bytes = await readFile(framePath);
        png = PNG.sync.read(bytes, { checkCRC: true });
      } catch (error) {
        check(false, `${clipId}/${frameName} is a readable PNG (${error.code || error.message})`, failures);
        continue;
      }
      const signature = bytes.subarray(0, 8).toString("hex");
      check(signature === "89504e470d0a1a0a" && png.width === SIZE && png.height === SIZE
        && (png.colorType === 6 || png.alpha === true),
      `${clipId}/${frameName} is 1536x1536 RGBA`, failures);
      const metrics = analyze(png);
      metricsByFrame.set(`${clipId}/${frameName}`, metrics);
      check(metrics.foregroundRatio >= 0.025 && metrics.foregroundRatio <= 0.72,
        `${clipId}/${frameName} has a credible foreground`, failures);
      check(metrics.transparentRatio >= 0.2,
        `${clipId}/${frameName} has a transparent background`, failures);
      check(metrics.bounds.minX > 1 && metrics.bounds.minY > 1
        && metrics.bounds.maxX < SIZE - 2 && metrics.bounds.maxY < SIZE - 2,
      `${clipId}/${frameName} does not touch the canvas edge`, failures);
      check(metrics.magentaRatio <= 0.01,
        `${clipId}/${frameName} has no material magenta residue`, failures);
      check(metrics.dirtyTransparentRgb === 0,
        `${clipId}/${frameName} clears hidden RGB under alpha=0`, failures);
      if (Math.abs(metrics.centerX - SIZE / 2) > 250) {
        warnings.push(`${clipId}/${frameName}: subject center is ${Math.round(metrics.centerX - SIZE / 2)}px from canvas center`);
      }
      if (["idle_loop", "talk_loop", "listen", "thinking", "greet", "react_tap", "comfort", "welcome_home", "lean_close", "shy_look_away", "selfie"].includes(clipId)) {
        standing.push({ clipId, frameName, bottom: metrics.bottom });
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      hashes.set(`${clipId}/${frameName}`, digest);
    }
  }

  check(totalFrames === 24, "all 24 source frames are present", failures);
  check(
    new Set(hashes.values()).size >= (isCuratedKeyPosePack ? 5 : 18),
    `source pack contains at least ${isCuratedKeyPosePack ? 5 : 18} distinct rendered poses`,
    failures,
  );
  const talkFirst = metricsByFrame.get("talk_loop/talk_000.png");
  const talkSecond = metricsByFrame.get("talk_loop/talk_001.png");
  if (talkFirst && talkSecond) {
    const firstHeight = talkFirst.bounds.maxY - talkFirst.bounds.minY + 1;
    const secondHeight = talkSecond.bounds.maxY - talkSecond.bounds.minY + 1;
    check(Math.abs(firstHeight - secondHeight) / Math.max(firstHeight, secondHeight) <= 0.01,
      "talk-loop subject height drift stays within 1%", failures);
    check(Math.abs(talkFirst.centerX - talkSecond.centerX) <= 4,
      "talk-loop horizontal registration stays within 4px", failures);
    check(Math.abs(talkFirst.bottom - talkSecond.bottom) <= 4,
      "talk-loop foot baseline drift stays within 4px", failures);
  }
  if (standing.length) {
    const bottoms = standing.map((item) => item.bottom);
    const spread = Math.max(...bottoms) - Math.min(...bottoms);
    check(spread <= 260, "standing-pose baseline drift stays within 260px", failures);
    if (spread > 120) warnings.push(`Standing baseline drift is ${spread}px; inspect the contact sheet before import.`);
  }

  for (const warning of warnings) console.warn(`WARN  ${warning}`);
  console.log(`\nXingli source verification: ${failures.length ? "FAILED" : "PASSED"} (${clipIds.length} clips / ${totalFrames} frames / ${new Set(hashes.values()).size} unique payloads).`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Xingli source verification failed: ${error.message}`);
  process.exitCode = 1;
});
