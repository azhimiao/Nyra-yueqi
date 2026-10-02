#!/usr/bin/env node

import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PNG } from "pngjs";

const SOURCE_SIZE = 1536;
const SCALE = 0.5;
const LOGICAL_SIZE = SOURCE_SIZE * SCALE;
const PORTRAIT_SIZE = 384;
const ATLAS_MAX_WIDTH = 2048;
const ATLAS_GAP = 2;
const MAX_CLIPS = 64;
const MAX_FRAMES_PER_CLIP = 240;
const SAFE_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.png$/i;

const CLIP_BEHAVIOR = Object.freeze({
  idle_loop: { playback: "loop" },
  talk_loop: { playback: "loop" },
  sit_idle: { playback: "loop" },
  sleep_loop: { playback: "loop" },
  stand_to_sit: { playback: "once", returnClip: "sit_idle" },
  sit_to_sleep: { playback: "once", returnClip: "sleep_loop" },
  drag: { playback: "once", returnClip: "idle_loop" },
});

function usage() {
  return [
    "Usage: node scripts/import-xingli-pack.mjs <source-directory> [output-directory]",
    "",
    "The source directory must contain asset_manifest.json and clips/<clip>/<frame>.png.",
    "Default output: public/assets/characters/xingli",
  ].join("\n");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function resolveExistingInside(root, ...segments) {
  const candidate = path.resolve(root, ...segments);
  if (!isInside(root, candidate)) throw new Error(`Unsafe path outside source directory: ${segments.join("/")}`);
  const resolved = await realpath(candidate);
  if (!isInside(root, resolved)) throw new Error(`Symlink escapes source directory: ${segments.join("/")}`);
  return resolved;
}

function validatePngHeader(buffer, label) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 33 || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error(`${label}: not a PNG file`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  if (width !== SOURCE_SIZE || height !== SOURCE_SIZE) {
    throw new Error(`${label}: expected ${SOURCE_SIZE}x${SOURCE_SIZE}, got ${width}x${height}`);
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`${label}: expected 8-bit RGBA PNG (color type 6), got bitDepth=${bitDepth}, colorType=${colorType}`);
  }
}

function downsampleHalf(source) {
  const target = new PNG({ width: LOGICAL_SIZE, height: LOGICAL_SIZE, colorType: 6 });
  const sourceWidth = source.width;

  for (let y = 0; y < LOGICAL_SIZE; y += 1) {
    for (let x = 0; x < LOGICAL_SIZE; x += 1) {
      let alphaTotal = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let oy = 0; oy < 2; oy += 1) {
        for (let ox = 0; ox < 2; ox += 1) {
          const sourceIndex = (((y * 2 + oy) * sourceWidth) + (x * 2 + ox)) * 4;
          const alpha = source.data[sourceIndex + 3];
          alphaTotal += alpha;
          red += source.data[sourceIndex] * alpha;
          green += source.data[sourceIndex + 1] * alpha;
          blue += source.data[sourceIndex + 2] * alpha;
        }
      }
      const targetIndex = ((y * LOGICAL_SIZE) + x) * 4;
      const alpha = Math.round(alphaTotal / 4);
      target.data[targetIndex + 3] = alpha;
      if (alphaTotal > 0) {
        target.data[targetIndex] = Math.round(red / alphaTotal);
        target.data[targetIndex + 1] = Math.round(green / alphaTotal);
        target.data[targetIndex + 2] = Math.round(blue / alphaTotal);
      }
    }
  }
  return target;
}

function clearBakedCheckerboard(png) {
  const pixelCount = png.width * png.height;
  const backgroundCandidate = new Uint8Array(pixelCount);
  const barrier = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    // Already-transparent pixels must stay passable. Treating them as barriers
    // (common when RGB is leftover black under alpha=0) forces a solid black matte.
    if (png.data[offset + 3] < 16) {
      backgroundCandidate[index] = 1;
      continue;
    }
    const red = png.data[offset];
    const green = png.data[offset + 1];
    const blue = png.data[offset + 2];
    const min = Math.min(red, green, blue);
    const max = Math.max(red, green, blue);
    const looksLikeChecker = min >= 220 && max - min <= 14;
    if (looksLikeChecker) backgroundCandidate[index] = 1;
    else barrier[index] = 1;
  }

  // Close tiny antialias gaps so pale dress/skin interiors are not mistaken
  // for the checkerboard outside the character outline.
  const closedBarrier = new Uint8Array(barrier);
  for (let index = 0; index < pixelCount; index += 1) {
    if (!barrier[index]) continue;
    const x = index % png.width;
    const y = Math.floor(index / png.width);
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= 0 && nx < png.width && ny >= 0 && ny < png.height) {
          closedBarrier[ny * png.width + nx] = 1;
        }
      }
    }
  }

  const outside = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  const seed = (index) => {
    if (!closedBarrier[index] && !outside[index]) {
      outside[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < png.width; x += 1) {
    seed(x);
    seed((png.height - 1) * png.width + x);
  }
  for (let y = 0; y < png.height; y += 1) {
    seed(y * png.width);
    seed(y * png.width + png.width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % png.width;
    const y = Math.floor(index / png.width);
    let neighbor;
    if (x > 0) {
      neighbor = index - 1;
      if (!closedBarrier[neighbor] && !outside[neighbor]) {
        outside[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (x + 1 < png.width) {
      neighbor = index + 1;
      if (!closedBarrier[neighbor] && !outside[neighbor]) {
        outside[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (y > 0) {
      neighbor = index - png.width;
      if (!closedBarrier[neighbor] && !outside[neighbor]) {
        outside[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (y + 1 < png.height) {
      neighbor = index + png.width;
      if (!closedBarrier[neighbor] && !outside[neighbor]) {
        outside[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }

  const protectedInterior = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    if (backgroundCandidate[index] && !outside[index] && png.data[offset + 3] >= 16) {
      protectedInterior[index] = 1;
    }
    if (png.data[offset + 3] < 16) {
      png.data[offset] = 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
      png.data[offset + 3] = 0;
      continue;
    }
    if (!outside[index] || barrier[index]) {
      png.data[offset + 3] = 255;
    } else {
      png.data[offset] = 0;
      png.data[offset + 1] = 0;
      png.data[offset + 2] = 0;
      png.data[offset + 3] = 0;
    }
  }
  return protectedInterior;
}

function keepLargestAlphaComponent(png, protectedInterior = null) {
  const pixelCount = png.width * png.height;
  const visited = new Uint8Array(pixelCount);
  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components = [];
  let bestSize = 0;
  let bestId = 0;
  let foregroundPixels = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || png.data[start * 4 + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    const id = components.length + 1;
    let protectedCount = 0;
    let minX = png.width;
    let minY = png.height;
    let maxX = 0;
    let maxY = 0;
    visited[start] = 1;
    labels[start] = id;
    queue[tail++] = start;

    while (head < tail) {
      const index = queue[head++];
      const x = index % png.width;
      const y = Math.floor(index / png.width);
      if (protectedInterior?.[index]) protectedCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      let neighbor;
      if (x > 0) {
        neighbor = index - 1;
        if (!visited[neighbor] && png.data[neighbor * 4 + 3] > 0) {
          visited[neighbor] = 1;
          labels[neighbor] = id;
          queue[tail++] = neighbor;
        }
      }
      if (x + 1 < png.width) {
        neighbor = index + 1;
        if (!visited[neighbor] && png.data[neighbor * 4 + 3] > 0) {
          visited[neighbor] = 1;
          labels[neighbor] = id;
          queue[tail++] = neighbor;
        }
      }
      if (y > 0) {
        neighbor = index - png.width;
        if (!visited[neighbor] && png.data[neighbor * 4 + 3] > 0) {
          visited[neighbor] = 1;
          labels[neighbor] = id;
          queue[tail++] = neighbor;
        }
      }
      if (y + 1 < png.height) {
        neighbor = index + png.width;
        if (!visited[neighbor] && png.data[neighbor * 4 + 3] > 0) {
          visited[neighbor] = 1;
          labels[neighbor] = id;
          queue[tail++] = neighbor;
        }
      }
    }

    foregroundPixels += tail;
    components.push({ id, size: tail, protectedCount, minX, minY, maxX, maxY });
    if (tail > bestSize) {
      bestSize = tail;
      bestId = id;
    }
  }

  if (!bestId || bestSize < pixelCount * 0.005) {
    throw new Error("Frame has no credible foreground character component");
  }

  const main = components[bestId - 1];
  const keepComponents = new Uint8Array(components.length + 1);
  keepComponents[bestId] = 1;
  for (const component of components) {
    const insideMainBounds = component.minX >= main.minX - 2
      && component.maxX <= main.maxX + 2
      && component.minY >= main.minY - 2
      && component.maxY <= main.maxY + 2;
    if (component.protectedCount > 0 && insideMainBounds) keepComponents[component.id] = 1;
  }

  let keptPixels = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (keepComponents[labels[index]]) {
      keptPixels += 1;
      continue;
    }
    const offset = index * 4;
    png.data[offset] = 0;
    png.data[offset + 1] = 0;
    png.data[offset + 2] = 0;
    png.data[offset + 3] = 0;
  }
  return { keptPixels, discardedPixels: foregroundPixels - keptPixels };
}

function findAlphaBounds(png) {
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[((y * png.width) + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width: 1, height: 1, empty: true };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1, empty: false };
}

function cropPng(source, bounds) {
  const cropped = new PNG({ width: bounds.width, height: bounds.height, colorType: 6 });
  if (bounds.empty) return cropped;
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = (((bounds.y + y) * source.width) + bounds.x) * 4;
    const sourceEnd = sourceStart + bounds.width * 4;
    source.data.copy(cropped.data, y * bounds.width * 4, sourceStart, sourceEnd);
  }
  return cropped;
}

function packFrames(frames) {
  const placements = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let usedWidth = 1;

  for (const item of frames) {
    if (item.png.width > ATLAS_MAX_WIDTH) throw new Error(`${item.name}: cropped frame exceeds atlas width`);
    if (x > 0 && x + item.png.width > ATLAS_MAX_WIDTH) {
      x = 0;
      y += rowHeight + ATLAS_GAP;
      rowHeight = 0;
    }
    placements.push({ item, x, y });
    usedWidth = Math.max(usedWidth, x + item.png.width);
    rowHeight = Math.max(rowHeight, item.png.height);
    x += item.png.width + ATLAS_GAP;
  }

  const usedHeight = Math.max(1, y + rowHeight);
  if (usedHeight > 8192) {
    throw new Error(`Clip atlas exceeds the supported 8192px height (${usedHeight}px)`);
  }
  const atlas = new PNG({ width: usedWidth, height: usedHeight, colorType: 6 });
  for (const placement of placements) {
    const { item } = placement;
    for (let py = 0; py < item.png.height; py += 1) {
      const sourceStart = py * item.png.width * 4;
      const sourceEnd = sourceStart + item.png.width * 4;
      const targetStart = (((placement.y + py) * atlas.width) + placement.x) * 4;
      item.png.data.copy(atlas.data, targetStart, sourceStart, sourceEnd);
    }
  }
  return { atlas, placements };
}

function pngBytes(png) {
  return PNG.sync.write(png, {
    bitDepth: 8,
    colorType: 6,
    inputColorType: 6,
    inputHasAlpha: true,
    deflateLevel: 9,
    deflateStrategy: 3,
  });
}

function behaviorFor(clipId) {
  if (CLIP_BEHAVIOR[clipId]) return CLIP_BEHAVIOR[clipId];
  if (clipId.endsWith("_loop") || clipId.endsWith("_idle")) return { playback: "loop" };
  return { playback: "once", returnClip: "idle_loop" };
}

function fpsFromManifest(manifest) {
  const raw = String(manifest?.specs?.fps_target || "");
  const matches = raw.match(/\d+(?:\.\d+)?/g);
  const values = matches?.map(Number).filter((value) => value >= 1 && value <= 60) || [];
  return values.length ? Math.max(...values) : 12;
}

function numberInRange(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clipTiming(definition, fallbackFps) {
  const fps = numberInRange(definition?.fps, 1, 60, fallbackFps);
  const holdMs = numberInRange(definition?.hold_ms, 0, 10000, 0);
  const crossfadeMs = numberInRange(definition?.crossfade_ms, 0, 250, 96);
  const durations = Array.isArray(definition?.frame_durations_ms)
    ? definition.frame_durations_ms.map((value) => Math.round(numberInRange(value, 16, 5000, 1000 / fps)))
    : null;
  return { fps, holdMs, crossfadeMs, durations };
}

async function removeGeneratedEntry(target) {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink()) await unlink(target);
    else await rm(target, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function readSourceManifest(sourceRoot) {
  const manifestPath = await resolveExistingInside(sourceRoot, "asset_manifest.json");
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read asset_manifest.json: ${error.message}`);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("asset_manifest.json must contain an object");
  }
  const animations = manifest.animations;
  if (!animations || typeof animations !== "object" || Array.isArray(animations)) {
    throw new Error("asset_manifest.json must contain an animations object");
  }
  const clipIds = Object.keys(animations).sort();
  if (!clipIds.length || clipIds.length > MAX_CLIPS) {
    throw new Error(`Expected 1-${MAX_CLIPS} animation clips`);
  }
  return { manifest, clipIds };
}

export async function importXingliPack({ sourceDir, outputDir } = {}) {
  if (!sourceDir) throw new Error("sourceDir is required");
  if (!outputDir) throw new Error("outputDir is required");

  const sourceRoot = await realpath(path.resolve(sourceDir));
  const destination = path.resolve(outputDir);
  const { manifest: sourceManifest, clipIds } = await readSourceManifest(sourceRoot);
  const fps = fpsFromManifest(sourceManifest);
  const staging = path.join(path.dirname(destination), `.${path.basename(destination)}-import-${process.pid}`);
  await removeGeneratedEntry(staging);
  await mkdir(path.join(staging, "clips"), { recursive: true });

  const runtimeClips = {};
  let sourceBytes = 0;
  let outputBytes = 0;
  let totalFrames = 0;
  let portraitBuffer = null;
  let discardedAlphaPixels = 0;
  const processedFrameCache = new Map();
  const revisionHash = createHash("sha256");

  try {
    for (const clipId of clipIds) {
      if (!SAFE_ID.test(clipId)) throw new Error(`Unsafe clip id: ${clipId}`);
      const definition = sourceManifest.animations[clipId];
      if (!definition || typeof definition !== "object" || !Array.isArray(definition.frames)) {
        throw new Error(`${clipId}: frames must be an array`);
      }
      if (!definition.frames.length || definition.frames.length > MAX_FRAMES_PER_CLIP) {
        throw new Error(`${clipId}: expected 1-${MAX_FRAMES_PER_CLIP} frames`);
      }
      if (Number(definition.frame_count) !== definition.frames.length) {
        throw new Error(`${clipId}: frame_count does not match frames.length`);
      }
      if (new Set(definition.frames).size !== definition.frames.length) {
        throw new Error(`${clipId}: duplicate frame names are not allowed`);
      }
      const timing = clipTiming(definition, fps);
      if (timing.durations && timing.durations.length !== definition.frames.length) {
        throw new Error(`${clipId}: frame_durations_ms must match frames.length`);
      }

      const decodedFrames = [];
      for (let index = 0; index < definition.frames.length; index += 1) {
        const frameName = definition.frames[index];
        if (typeof frameName !== "string" || !SAFE_FILE.test(frameName) || path.basename(frameName) !== frameName) {
          throw new Error(`${clipId}: unsafe frame name at index ${index}`);
        }
        const framePath = await resolveExistingInside(sourceRoot, "clips", clipId, frameName);
        const bytes = await readFile(framePath);
        sourceBytes += bytes.length;
        validatePngHeader(bytes, `${clipId}/${frameName}`);
        let decoded;
        try {
          decoded = PNG.sync.read(bytes, { checkCRC: true });
        } catch (error) {
          throw new Error(`${clipId}/${frameName}: invalid PNG data (${error.message})`);
        }
        const digest = createHash("sha256").update(bytes).digest("hex");
        let processed = processedFrameCache.get(digest);
        if (!processed) {
          const protectedInterior = clearBakedCheckerboard(decoded);
          const cleanup = keepLargestAlphaComponent(decoded, protectedInterior);
          const scaled = downsampleHalf(decoded);
          processed = {
            scaled,
            bounds: findAlphaBounds(scaled),
            discardedPixels: cleanup.discardedPixels,
          };
          processedFrameCache.set(digest, processed);
        }
        const { scaled } = processed;
        const cleanup = { discardedPixels: processed.discardedPixels };
        discardedAlphaPixels += cleanup.discardedPixels;
        if (!portraitBuffer && clipId === "idle_loop" && index === 0) {
          portraitBuffer = pngBytes(cropPng(scaled, {
            x: Math.round((LOGICAL_SIZE - PORTRAIT_SIZE) / 2),
            y: 0,
            width: PORTRAIT_SIZE,
            height: PORTRAIT_SIZE,
            empty: false,
          }));
        }
        const bounds = processed.bounds;
        decodedFrames.push({
          index,
          name: frameName,
          sourceBounds: bounds,
          png: cropPng(scaled, bounds),
        });
      }

      const { atlas, placements } = packFrames(decodedFrames);
      const atlasName = `${clipId}.png`;
      const dataName = `${clipId}.json`;
      const atlasBuffer = pngBytes(atlas);
      revisionHash.update(clipId).update(atlasBuffer);
      outputBytes += atlasBuffer.length;
      await writeFile(path.join(staging, "clips", atlasName), atlasBuffer);

      const atlasData = {
        schemaVersion: 1,
        clipId,
        image: atlasName,
        size: { width: atlas.width, height: atlas.height },
        logicalSize: { width: LOGICAL_SIZE, height: LOGICAL_SIZE },
        frames: placements.map(({ item, x, y }) => ({
          id: `${clipId}_${String(item.index).padStart(3, "0")}`,
          index: item.index,
          atlas: { x, y, width: item.png.width, height: item.png.height },
          source: {
            x: item.sourceBounds.x,
            y: item.sourceBounds.y,
            width: item.sourceBounds.width,
            height: item.sourceBounds.height,
          },
          durationMs: timing.durations?.[item.index] || Math.round(1000 / timing.fps),
        })),
      };
      const atlasJson = `${JSON.stringify(atlasData, null, 2)}\n`;
      revisionHash.update(atlasJson);
      outputBytes += Buffer.byteLength(atlasJson);
      await writeFile(path.join(staging, "clips", dataName), atlasJson, "utf8");

      runtimeClips[clipId] = {
        id: clipId,
        atlas: `clips/${dataName}`,
        image: `clips/${atlasName}`,
        frameCount: decodedFrames.length,
        fps: timing.fps,
        crossfadeMs: timing.crossfadeMs,
        ...(timing.holdMs > 0 ? { holdMs: Math.round(timing.holdMs) } : {}),
        ...behaviorFor(clipId),
      };
      totalFrames += decodedFrames.length;
    }

    const defaultClip = runtimeClips.idle_loop ? "idle_loop" : clipIds[0];
    if (portraitBuffer) {
      outputBytes += portraitBuffer.length;
      await writeFile(path.join(staging, "portrait.png"), portraitBuffer);
    }
    const runtimeManifest = {
      schemaVersion: 1,
      id: String(sourceManifest.id || "xingli").trim() || "xingli",
      name: String(sourceManifest.character || "星梨").trim() || "星梨",
      version: String(sourceManifest.version || "1.0"),
      renderer: "canvas2d-atlas",
      portrait: portraitBuffer ? "portrait.png" : "",
      sourceCleanup: {
        method: "largest-alpha-component-4",
        discardedAlphaPixels,
      },
      logicalSize: { width: LOGICAL_SIZE, height: LOGICAL_SIZE },
      revision: revisionHash.digest("hex").slice(0, 16),
      defaultClip,
      totalFrames,
      clips: runtimeClips,
      ...((sourceManifest.idlePolicy || sourceManifest.idle_policy)
        ? { idlePolicy: sourceManifest.idlePolicy || sourceManifest.idle_policy }
        : {}),
      ...(sourceManifest.matte ? { matte: sourceManifest.matte } : {}),
    };
    const manifestJson = `${JSON.stringify(runtimeManifest, null, 2)}\n`;
    outputBytes += Buffer.byteLength(manifestJson);
    await writeFile(path.join(staging, "manifest.json"), manifestJson, "utf8");

    await mkdir(destination, { recursive: true });
    await removeGeneratedEntry(path.join(destination, "clips"));
    await removeGeneratedEntry(path.join(destination, "manifest.json"));
    await removeGeneratedEntry(path.join(destination, "portrait.png"));
    await rename(path.join(staging, "clips"), path.join(destination, "clips"));
    await rename(path.join(staging, "manifest.json"), path.join(destination, "manifest.json"));
    if (portraitBuffer) await rename(path.join(staging, "portrait.png"), path.join(destination, "portrait.png"));
    await rm(staging, { recursive: true, force: true });

    return {
      sourceDir: sourceRoot,
      outputDir: destination,
      clipCount: clipIds.length,
      frameCount: totalFrames,
      sourceBytes,
      outputBytes,
      manifest: runtimeManifest,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function main() {
  const [, , sourceArg, outputArg] = process.argv;
  if (!sourceArg || sourceArg === "--help" || sourceArg === "-h") {
    console.log(usage());
    process.exitCode = sourceArg ? 0 : 1;
    return;
  }
  const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const outputDir = outputArg || path.join(scriptRoot, "public", "assets", "characters", "xingli");
  const result = await importXingliPack({ sourceDir: sourceArg, outputDir });
  const ratio = result.sourceBytes > 0 ? ((result.outputBytes / result.sourceBytes) * 100).toFixed(1) : "0.0";
  console.log(`Imported ${result.clipCount} clips / ${result.frameCount} frames.`);
  console.log(`Output: ${result.outputDir}`);
  console.log(`Atlas payload: ${(result.outputBytes / 1024 / 1024).toFixed(2)} MiB (${ratio}% of source frame bytes)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`Xingli import failed: ${error.message}`);
    process.exitCode = 1;
  });
}
