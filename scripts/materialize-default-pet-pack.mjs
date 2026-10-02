#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getPetGenerationProfile } from "./pet-character-profiles.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profileIndex = process.argv.indexOf("--profile");
const profileId = String(profileIndex >= 0 ? process.argv[profileIndex + 1] : "").trim();
if (!new Set(["yueqi-female", "yueqi-male"]).has(profileId)) {
  throw new Error("Usage: node scripts/materialize-default-pet-pack.mjs --profile yueqi-female|yueqi-male");
}

const profile = getPetGenerationProfile(profileId);
const source = path.join(ROOT, ...profile.sourceDir);
const characterLock = path.join(source, "character", "character_lock.png");
const pose = (name) => path.join(source, "poses", `${name}.png`);

const clipPlan = {
  idle_loop: { frames: [characterLock], durations: [1800], loop: true },
  talk_loop: { frames: [pose("talk_0"), characterLock], durations: [520, 480], loop: true },
  listen: { frames: [characterLock], durations: [1400] },
  thinking: { frames: [characterLock], durations: [1600] },
  greet: { frames: [characterLock, pose("greet_0"), characterLock], durations: [240, 520, 260] },
  react_tap: { frames: [characterLock, pose("greet_0")], durations: [220, 560] },
  comfort: { frames: [characterLock], durations: [1700] },
  welcome_home: { frames: [pose("greet_0")], durations: [1600] },
  lean_close: { frames: [characterLock], durations: [1500] },
  shy_look_away: { frames: [characterLock], durations: [1500] },
  selfie: { frames: [characterLock], durations: [1700] },
  sit_idle: { frames: [pose("sit")], durations: [1800], loop: true },
  sleep_loop: { frames: [pose("sleep")], durations: [2200], loop: true },
  drag: { frames: [characterLock], durations: [1200] },
  stand_to_sit: { frames: [characterLock, pose("sit"), pose("sit")], durations: [260, 460, 340] },
  sit_to_sleep: { frames: [pose("sit"), pose("sleep"), pose("sleep")], durations: [280, 580, 440] },
};

for (const [clipId, clip] of Object.entries(clipPlan)) {
  const clipDirectory = path.join(source, "clips", clipId);
  await fs.rm(clipDirectory, { recursive: true, force: true });
  await fs.mkdir(clipDirectory, { recursive: true });
  for (let index = 0; index < clip.frames.length; index += 1) {
    await fs.access(clip.frames[index]);
    await fs.copyFile(clip.frames[index], path.join(clipDirectory, `${clipId}_${String(index).padStart(3, "0")}.png`));
  }
}

const animations = Object.fromEntries(Object.entries(clipPlan).map(([clipId, clip]) => [clipId, {
  frame_count: clip.frames.length,
  frames: clip.frames.map((_, index) => `${clipId}_${String(index).padStart(3, "0")}.png`),
  fps: clip.frames.length > 1 ? 4 : 1,
  frame_durations_ms: clip.durations,
  hold_ms: clip.loop ? 0 : Math.max(...clip.durations),
  crossfade_ms: clip.frames.length > 1 ? 80 : 0,
}]));

const manifest = {
  id: profile.id,
  character: profile.runtimeName,
  version: "1.0",
  specs: {
    canvas_size: "1536x1536",
    transparent: true,
    style: "reference-locked chibi 2D companion",
    fps_target: "4fps",
    asset_kind: "curated-key-pose-pack",
  },
  selected_lock: "character/lock_candidate_1.png",
  character_files: {
    "character_lock.png": { dimensions: "1536x1536", mode: "RGBA" },
    "lock_candidate_1.png": { dimensions: "1536x1536", mode: "RGBA" },
  },
  animations,
  total_frames: Object.values(clipPlan).reduce((total, clip) => total + clip.frames.length, 0),
  idlePolicy: {
    base: "idle_loop",
    intervalMs: 14000,
    jitterMs: 8000,
    ambient: ["thinking", "shy_look_away"],
    activeOverridesAmbient: true,
  },
  matte: {
    method: "anime trimap plus GrabCut refinement",
    semanticSegmentationAllowed: true,
    hiddenRgbCleared: true,
  },
};

await fs.writeFile(path.join(source, "asset_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Materialized ${profile.label}: ${manifest.total_frames} curated runtime frames across ${Object.keys(animations).length} clips.`);
