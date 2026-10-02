const PLAYBACK_MODES = new Set(["loop", "once", "reverse-return"]);
const MAX_RUNTIME_FRAMES = 240;
const MAX_ATLAS_EDGE = 8192;
const DEFAULT_CROSSFADE_MS = 36;

/**
 * Mount a lazy Canvas2D sprite-atlas character.
 *
 * @param {Element|ShadowRoot|string} root
 * @param {{
 *   manifestUrl: string,
 *   size?: number|string,
 *   autoPlay?: boolean,
 *   initialClip?: string,
 *   crossfadeMs?: number,
 *   reducedMotion?: boolean,
 *   label?: string,
 *   matteColor?: string,
 *   onReady?: Function,
 *   onClipChange?: Function,
 *   onFrame?: Function,
 *   onComplete?: Function,
 *   onError?: Function,
 * }} options
 */
export function mountSpriteCharacter(root, options = {}) {
  const target = resolveMountTarget(root);
  if (!options.manifestUrl) throw new TypeError("mountSpriteCharacter: manifestUrl is required");

  const element = document.createElement("div");
  element.className = "sprite-character";
  element.dataset.status = "loading";
  element.dataset.clip = "";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", options.label || "动态桌宠");
  applySize(element, options.size);

  const canvas = document.createElement("canvas");
  canvas.className = "sprite-character__canvas";
  canvas.setAttribute("aria-hidden", "true");
  element.append(canvas);
  target.append(element);

  // Keep alpha; avoid desynchronized — on Windows/WebView it often composites
  // transparent pixels as an opaque black rectangle around the sprite.
  const context = canvas.getContext("2d", { alpha: true, desynchronized: false });
  if (!context) {
    element.remove();
    throw new Error("Canvas2D is not available");
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const manifestUrl = new URL(options.manifestUrl, document.baseURI).href;
  const clipCache = new Map();
  const listeners = new Set();
  const mediaQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

  let manifest = null;
  let current = null;
  let previousFrame = null;
  let transitionStartedAt = 0;
  let frameIndex = 0;
  let direction = 1;
  let playback = "loop";
  let returnClip = "";
  let frameAccumulator = 0;
  let lastTimestamp = 0;
  let animationFrame = 0;
  let completionTimer = 0;
  let requestGeneration = 0;
  let destroyed = false;
  let status = "loading";
  let reducedMotion = options.reducedMotion == null
    ? Boolean(mediaQuery?.matches)
    : Boolean(options.reducedMotion);
  let crossfadeMs = clampNumber(options.crossfadeMs, 0, 250, DEFAULT_CROSSFADE_MS);

  function versionedAssetUrl(value) {
    const url = new URL(value, manifestUrl);
    if (manifest?.revision) url.searchParams.set("v", manifest.revision);
    return url.href;
  }

  function snapshot() {
    return {
      status,
      clipId: current?.id || "",
      frameIndex,
      frameCount: current?.frames.length || 0,
      playback,
      direction,
      returnClip,
      holdMs: current?.definition?.holdMs || 0,
      reducedMotion,
      loadedClips: [...clipCache.keys()].sort(),
      destroyed,
    };
  }

  function emit(type, callback, detail = {}) {
    const state = { ...snapshot(), ...detail };
    callback?.(state);
    for (const listener of listeners) listener(type, state);
    try {
      element.dispatchEvent(new CustomEvent(`sprite-character:${type}`, { detail: state }));
    } catch {
      // CustomEvent is unavailable in some test and server-side environments.
    }
  }

  function reportError(error, context = "runtime") {
    if (destroyed) return;
    status = "error";
    element.dataset.status = status;
    emit("error", options.onError, { error, context });
  }

  function renderFrame(frame, image, alpha = 1) {
    if (!frame || !image || alpha <= 0) return;
    const atlas = frame.atlas;
    const source = frame.source;
    context.globalAlpha = alpha;
    context.drawImage(
      image,
      atlas.x,
      atlas.y,
      atlas.width,
      atlas.height,
      source.x,
      source.y,
      source.width,
      source.height,
    );
  }

  function draw(timestamp = performance.now()) {
    if (!current) return;
    const frame = current.frames[frameIndex];
    context.save();
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.width, canvas.height);

    const elapsed = Math.max(0, timestamp - transitionStartedAt);
    const blendDuration = Math.min(crossfadeMs, frame.durationMs * 0.72);
    const mix = previousFrame && blendDuration > 0
      ? Math.min(1, elapsed / blendDuration)
      : 1;
    // Crossfade the two clips together.  Do not fade the old clip fully out
    // before drawing the new one: that creates a visible blank flash whenever
    // a single-frame pose changes, which is especially obvious on a desktop pet.
    if (previousFrame && mix < 1) renderFrame(previousFrame.frame, previousFrame.image, 1 - mix);
    renderFrame(frame, current.image, mix);

    // Embedded hosts (phone pet page, etc.) can composite canvas alpha as black.
    // Paint an opaque matte behind the sprite so transparent texels stay the page color.
    const matte = typeof options.matteColor === "string" ? options.matteColor.trim() : "";
    if (matte && matte !== "transparent") {
      context.globalAlpha = 1;
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = matte;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "source-over";
    }

    context.restore();
    if (mix >= 1) previousFrame = null;
  }

  function schedule() {
    const needsAnimation = current
      && (current.frames.length > 1 || (previousFrame && crossfadeMs > 0));
    if (!destroyed && !reducedMotion && needsAnimation && !animationFrame && status !== "complete") {
      animationFrame = window.requestAnimationFrame(tick);
    }
  }

  function moveToFrame(nextIndex, timestamp) {
    if (!current || nextIndex === frameIndex) return;
    previousFrame = { frame: current.frames[frameIndex], image: current.image, clipId: current.id };
    frameIndex = nextIndex;
    transitionStartedAt = timestamp;
    draw(timestamp);
    emit("frame", options.onFrame);
  }

  function completeCurrent(timestamp) {
    if (!current) return;
    const completedClip = current.id;
    status = "complete";
    element.dataset.status = status;
    draw(timestamp);
    emit("complete", options.onComplete, { completedClip });
    const targetClip = returnClip;
    if (targetClip && targetClip !== completedClip && !destroyed) {
      void startClip(targetClip, { reason: "return", force: true }).catch((error) => reportError(error, "return-clip"));
    }
  }

  function advance(timestamp) {
    if (!current || current.frames.length <= 1) return;
    const last = current.frames.length - 1;

    if (playback === "loop") {
      moveToFrame((frameIndex + 1) % current.frames.length, timestamp);
      return;
    }
    if (playback === "once") {
      if (frameIndex >= last) completeCurrent(timestamp);
      else moveToFrame(frameIndex + 1, timestamp);
      return;
    }
    if (direction > 0 && frameIndex >= last) {
      direction = -1;
      moveToFrame(Math.max(0, last - 1), timestamp);
      return;
    }
    if (direction < 0 && frameIndex <= 0) {
      completeCurrent(timestamp);
      return;
    }
    moveToFrame(frameIndex + direction, timestamp);
  }

  function tick(timestamp) {
    animationFrame = 0;
    if (destroyed || reducedMotion || !current || status === "complete") return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    frameAccumulator += Math.min(250, Math.max(0, timestamp - lastTimestamp));
    lastTimestamp = timestamp;

    let guard = 0;
    while (current && status !== "complete" && guard < 4) {
      const frameDuration = current.frames[frameIndex]?.durationMs || Math.round(1000 / current.fps);
      if (frameAccumulator < frameDuration) break;
      frameAccumulator -= frameDuration;
      advance(timestamp);
      guard += 1;
    }
    draw(timestamp);
    schedule();
  }

  async function loadClip(clipId) {
    if (!manifest?.clips?.[clipId]) throw new Error(`Unknown sprite clip: ${clipId}`);
    if (clipCache.has(clipId)) return clipCache.get(clipId);

    const definition = manifest.clips[clipId];
    const promise = (async () => {
      const atlasUrl = versionedAssetUrl(definition.atlas);
      const response = await fetch(atlasUrl, { credentials: "same-origin", cache: "no-cache" });
      if (!response.ok) throw new Error(`Unable to load ${clipId} atlas metadata (${response.status})`);
      const atlas = validateAtlas(await response.json(), clipId, manifest.logicalSize, definition.frameCount);
      const imageUrl = versionedAssetUrl(definition.image || atlas.image);
      const image = await loadImage(imageUrl);
      if (image.naturalWidth !== atlas.size.width || image.naturalHeight !== atlas.size.height) {
        throw new Error(`${clipId}: atlas image dimensions do not match metadata`);
      }
      return {
        id: clipId,
        image,
        frames: atlas.frames,
        fps: clampNumber(definition.fps, 1, 60, 12),
        definition,
      };
    })();
    clipCache.set(clipId, promise);
    try {
      return await promise;
    } catch (error) {
      clipCache.delete(clipId);
      throw error;
    }
  }

  async function startClip(clipId, settings = {}) {
    if (destroyed) return snapshot();
    if (!manifest) await ready;
    if (destroyed) return snapshot();

    const id = String(clipId || manifest.defaultClip || "").trim();
    if (!id || !manifest.clips[id]) throw new Error(`Unknown sprite clip: ${id}`);
    const requestedDefinition = manifest.clips[id];
    const requestedPlayback = normalizePlayback(settings.playback || settings.mode || requestedDefinition.playback);
    const requestedReturnClip = settings.returnClip === false
      ? ""
      : String(settings.returnClip || requestedDefinition.returnClip || "");
    const canKeepPlaying = current?.id === id
      && status !== "complete"
      && settings.force !== true
      && settings.startFrame == null
      && !settings.reverse
      && playback === requestedPlayback
      && returnClip === requestedReturnClip;
    if (canKeepPlaying) return snapshot();

    const generation = ++requestGeneration;
    if (completionTimer) window.clearTimeout(completionTimer);
    completionTimer = 0;
    status = "loading";
    element.dataset.status = status;
    const loaded = await loadClip(id);
    if (destroyed || generation !== requestGeneration) return snapshot();

    const definition = loaded.definition;
    const outgoingFrame = current
      ? { frame: current.frames[frameIndex], image: current.image, clipId: current.id }
      : null;
    current = loaded;
    frameIndex = clampInteger(settings.startFrame, 0, loaded.frames.length - 1, 0);
    direction = settings.reverse ? -1 : 1;
    if (settings.reverse && settings.startFrame == null) frameIndex = loaded.frames.length - 1;
    playback = requestedPlayback;
    returnClip = requestedReturnClip;
    crossfadeMs = clampNumber(settings.crossfadeMs, 0, 250,
      clampNumber(definition.crossfadeMs, 0, 250,
        clampNumber(options.crossfadeMs, 0, 250, DEFAULT_CROSSFADE_MS)));
    frameAccumulator = 0;
    lastTimestamp = 0;
    transitionStartedAt = performance.now();
    previousFrame = reducedMotion ? null : outgoingFrame;
    status = reducedMotion ? "paused" : "playing";
    element.dataset.status = status;
    element.dataset.clip = id;
    element.dataset.playback = playback;
    draw(transitionStartedAt);
    emit("clipchange", options.onClipChange, { reason: settings.reason || "play" });
    emit("frame", options.onFrame);
    if (loaded.frames.length === 1 && playback !== "loop") {
      const holdMs = clampNumber(definition.holdMs, 0, 10000, 0);
      const complete = () => {
        completionTimer = 0;
        if (!destroyed && generation === requestGeneration && current?.id === id) {
          completeCurrent(performance.now());
        }
      };
      if (holdMs > 0) completionTimer = window.setTimeout(complete, holdMs);
      else queueMicrotask(complete);
    }
    schedule();
    return snapshot();
  }

  function handleReducedMotion(event) {
    if (options.reducedMotion != null || destroyed) return;
    reducedMotion = Boolean(event.matches);
    if (reducedMotion) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      status = current ? "paused" : status;
      element.dataset.status = status;
      frameIndex = 0;
      previousFrame = null;
      draw();
    } else if (current) {
      status = "playing";
      element.dataset.status = status;
      lastTimestamp = 0;
      schedule();
    }
    emit("motionchange", null);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    requestGeneration += 1;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    if (completionTimer) window.clearTimeout(completionTimer);
    animationFrame = 0;
    completionTimer = 0;
    if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener("change", handleReducedMotion);
    else mediaQuery?.removeListener?.(handleReducedMotion);
    listeners.clear();
    clipCache.clear();
    current = null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    element.remove();
  }

  const controller = {
    element,
    canvas,
    ready: null,
    setClip: (clipId, settings = {}) => startClip(clipId, settings),
    play: (clipId, settings = {}) => startClip(clipId, settings),
    getState: snapshot,
    getClips: () => manifest ? Object.keys(manifest.clips) : [],
    getClipMeta: () => {
      if (!manifest?.clips) return {};
      return Object.fromEntries(
        Object.entries(manifest.clips).map(([id, clip]) => [
          id,
          {
            placeholder: Boolean(clip?.placeholder),
            frameCount: Number(clip?.frameCount) || 0,
            fps: Number(clip?.fps) || 0,
            holdMs: Number(clip?.holdMs) || 0,
            playback: String(clip?.playback || ""),
          },
        ]),
      );
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("subscribe(listener): listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy,
  };

  const ready = (async () => {
    try {
      const response = await fetch(manifestUrl, { credentials: "same-origin", cache: "no-cache" });
      if (!response.ok) throw new Error(`Unable to load sprite manifest (${response.status})`);
      manifest = validateManifest(await response.json());
      if (destroyed) return controller;
      canvas.width = manifest.logicalSize.width;
      canvas.height = manifest.logicalSize.height;
      element.style.aspectRatio = `${manifest.logicalSize.width} / ${manifest.logicalSize.height}`;
      element.setAttribute("aria-label", options.label || `${manifest.name}动态桌宠`);
      if (mediaQuery?.addEventListener) mediaQuery.addEventListener("change", handleReducedMotion);
      else mediaQuery?.addListener?.(handleReducedMotion);
      status = "ready";
      element.dataset.status = status;
      emit("ready", options.onReady);
      if (options.autoPlay !== false) {
        await startClip(options.initialClip || manifest.defaultClip, { reason: "initial" });
      }
      return controller;
    } catch (error) {
      reportError(error, "manifest");
      throw error;
    }
  })();
  controller.ready = ready;

  return controller;
}

function validateManifest(raw) {
  if (!raw || raw.schemaVersion !== 1 || raw.renderer !== "canvas2d-atlas") {
    throw new Error("Unsupported sprite manifest");
  }
  const logicalSize = normalizeSize(raw.logicalSize, "manifest logicalSize");
  const clips = raw.clips;
  if (!clips || typeof clips !== "object" || Array.isArray(clips) || !Object.keys(clips).length) {
    throw new Error("Sprite manifest has no clips");
  }
  if (!clips[raw.defaultClip]) throw new Error("Sprite manifest defaultClip is missing");
  for (const [id, clip] of Object.entries(clips)) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id) || !clip || typeof clip !== "object") {
      throw new Error(`Invalid sprite clip definition: ${id}`);
    }
    if (!isSafeRelativeAssetPath(clip.atlas) || !isSafeRelativeAssetPath(clip.image)) {
      throw new Error(`${id}: unsafe atlas asset path`);
    }
    if (!Number.isInteger(clip.frameCount) || clip.frameCount < 1 || clip.frameCount > MAX_RUNTIME_FRAMES) {
      throw new Error(`${id}: invalid frameCount`);
    }
    if (clip.holdMs != null && (!Number.isFinite(Number(clip.holdMs)) || Number(clip.holdMs) < 0 || Number(clip.holdMs) > 10000)) {
      throw new Error(`${id}: invalid holdMs`);
    }
  }
  return { ...raw, logicalSize, clips };
}

function validateAtlas(raw, clipId, expectedLogicalSize, expectedFrameCount) {
  if (!raw || raw.schemaVersion !== 1 || raw.clipId !== clipId || !Array.isArray(raw.frames)) {
    throw new Error(`${clipId}: invalid atlas metadata`);
  }
  if (raw.frames.length !== expectedFrameCount || raw.frames.length > MAX_RUNTIME_FRAMES) {
    throw new Error(`${clipId}: atlas frame count mismatch`);
  }
  const size = normalizeSize(raw.size, `${clipId} atlas size`, MAX_ATLAS_EDGE);
  const logicalSize = normalizeSize(raw.logicalSize, `${clipId} logical size`);
  if (logicalSize.width !== expectedLogicalSize.width || logicalSize.height !== expectedLogicalSize.height) {
    throw new Error(`${clipId}: logical size mismatch`);
  }
  const frames = raw.frames.map((frame, index) => {
    if (!frame || frame.index !== index) throw new Error(`${clipId}: frames must have contiguous indexes`);
    const atlas = normalizeRect(frame.atlas, `${clipId} frame ${index} atlas`);
    const source = normalizeRect(frame.source, `${clipId} frame ${index} source`);
    if (atlas.x + atlas.width > size.width || atlas.y + atlas.height > size.height) {
      throw new Error(`${clipId}: frame ${index} exceeds atlas bounds`);
    }
    if (source.x + source.width > logicalSize.width || source.y + source.height > logicalSize.height) {
      throw new Error(`${clipId}: frame ${index} exceeds logical bounds`);
    }
    if (atlas.width !== source.width || atlas.height !== source.height) {
      throw new Error(`${clipId}: frame ${index} dimensions disagree`);
    }
    return {
      ...frame,
      atlas,
      source,
      durationMs: clampNumber(frame.durationMs, 16, 1000, 83),
    };
  });
  return { ...raw, size, logicalSize, frames };
}

function normalizeSize(value, label, max = 4096) {
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > max || height > max) {
    throw new Error(`${label}: invalid dimensions`);
  }
  return { width, height };
}

function normalizeRect(value, label) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  const width = Number(value?.width);
  const height = Number(value?.height);
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1) {
    throw new Error(`${label}: invalid rectangle`);
  }
  return { x, y, width, height };
}

function isSafeRelativeAssetPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0")) return false;
  if (value.startsWith("/") || value.includes(":") || value.split("/").some((part) => part === ".." || part === "")) return false;
  return /^[A-Za-z0-9._/-]+$/.test(value);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load sprite atlas image: ${url}`));
    image.src = url;
  });
}

function resolveMountTarget(root) {
  const target = typeof root === "string" ? document.querySelector(root) : root;
  if (!target || typeof target.append !== "function") {
    throw new TypeError("mountSpriteCharacter(root): root must be an Element, ShadowRoot, or selector");
  }
  return target;
}

function normalizePlayback(value) {
  const normalized = String(value || "loop");
  return PLAYBACK_MODES.has(normalized) ? normalized : "loop";
}

function applySize(element, rawSize) {
  if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
    element.style.setProperty("--sprite-character-size", `${Math.min(720, Math.max(48, rawSize))}px`);
  } else if (typeof rawSize === "string" && /^(?:\d+(?:\.\d+)?)(?:px|rem|em|vw|vh|vmin|vmax|%)$/.test(rawSize.trim())) {
    element.style.setProperty("--sprite-character-size", rawSize.trim());
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}
