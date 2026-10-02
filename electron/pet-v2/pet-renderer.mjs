/**
 * Pet V2 Canvas renderer: multi-frame playback + hit-test + drag + tap_react.
 * Uses existing sprite_motion_pack folders (individual PNGs).
 */
import { loopFrameIndex, onceFinished, onceFrameIndex } from "./frame-timing.mjs";

const status = document.getElementById("status");
const select = document.getElementById("char");
const hud = document.getElementById("hud");
const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

let catalog = null;
let manifest = null;
let baseDir = "";
/** @type {Map<string, HTMLImageElement>} */
const frameCache = new Map();
/** @type {{ x: number, y: number, w: number, h: number } | null} */
let drawRect = null;
let state = { mode: "idle", emotion: "neutral", intensity: 0.3, gazeX: 0, gazeY: 0, mouthOpen: 0 };
let actionId = "idle";
let frameIndex = 0;
let actionStartedAt = performance.now();
let onceDone = false;
let clickThrough = null;
let pointerOverHud = false;
let dragging = false;
let dragMoved = false;
let lastPointer = null;
const DRAG_THRESHOLD = 4;
const modes = ["idle", "listening", "thinking", "speaking", "sleeping"];

function modeAction(mode) {
  return (
    {
      idle: "idle",
      listening: "listening",
      thinking: "thinking",
      speaking: "speaking",
      sleeping: "sleeping",
    }[mode] || "idle"
  );
}

function toFileUrl(rel) {
  const abs = `${baseDir}\\${rel}`.replace(/\//g, "\\");
  return "file:///" + abs.replace(/\\/g, "/") + `?h=${manifest?.assetsHash || ""}`;
}

function loadImage(rel) {
  if (frameCache.has(rel)) return Promise.resolve(frameCache.get(rel));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      frameCache.set(rel, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error("frame load failed " + rel));
    img.src = toFileUrl(rel);
  });
}

async function prefetchAction(action) {
  const clip = manifest?.actions?.[action];
  if (!clip?.frames?.length) return;
  await Promise.all(clip.frames.map((f) => loadImage(f)));
}

async function loadCatalog() {
  catalog = await window.petV2.readCatalog();
  const avatars = (catalog.avatars || []).slice().sort((a, b) => Number(a.fixture) - Number(b.fixture));
  select.innerHTML = "";
  for (const a of avatars) {
    const opt = document.createElement("option");
    opt.value = a.characterId;
    opt.textContent = `${a.characterId}${a.fixture ? " (fixture)" : ""}`;
    select.appendChild(opt);
  }
  const first = avatars[0];
  if (first) await setCharacter(first.characterId);
}

async function setCharacter(characterId) {
  frameCache.clear();
  drawRect = null;
  const opened = await window.petV2.openCharacter(characterId);
  manifest = opened.manifest;
  baseDir = opened.baseDir;
  state = { ...state, mode: "idle", mouthOpen: 0, artifact: null };
  await playAction("idle");
  status.textContent = `${manifest.characterId} · idle · tier ${manifest.qualityTier}`;
}

async function playAction(nextAction) {
  const id = String(nextAction || "").trim();
  if (!manifest?.actions?.[id]) return;
  actionId = id;
  frameIndex = 0;
  actionStartedAt = performance.now();
  onceDone = false;
  await prefetchAction(id);
  const clip = manifest.actions[id];
  status.textContent = `${manifest.characterId} · ${id} · ${clip.frames.length}f`;
}

function currentFrameRel() {
  const clip = manifest?.actions?.[actionId];
  if (!clip?.frames?.length) return null;
  return clip.frames[Math.min(frameIndex, clip.frames.length - 1)];
}

function advanceFrames(now) {
  const clip = manifest?.actions?.[actionId];
  if (!clip?.frames?.length) return;
  const fps = Math.max(1, clip.fps || 8);
  const elapsed = (now - actionStartedAt) / 1000;
  if (clip.playback === "loop") {
    frameIndex = loopFrameIndex(elapsed, clip.frames.length, fps);
    return;
  }
  // once
  frameIndex = onceFrameIndex(elapsed, clip.frames.length, fps);
  if (!onceDone && onceFinished(elapsed, clip.frames.length, fps)) {
    onceDone = true;
    const ret = clip.returnAction || "idle";
    playAction(ret);
  }
}

function layoutDraw(img) {
  const mp = manifest?.motionProfile || {};
  const t = (performance.now() - actionStartedAt) / 1000;
  const breath = 1 + Math.sin(t * 2.2) * (mp.breathAmp || 0.01);
  const sway = Math.sin(t * 1.1) * ((mp.swayAmp || 0.004) * 40);
  const w = canvas.width * 0.9;
  const h = (img.naturalHeight / img.naturalWidth) * w * breath;
  const x = (canvas.width - w) / 2 + sway;
  const y = canvas.height - h - 8;
  return { x, y, w, h };
}

function draw(now) {
  advanceFrames(now);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rel = currentFrameRel();
  const img = rel ? frameCache.get(rel) : null;
  if (img?.complete && img.naturalWidth) {
    const r = layoutDraw(img);
    drawRect = r;
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  } else {
    drawRect = null;
  }
  requestAnimationFrame(draw);
}

function canvasCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

function hitBody(cx, cy) {
  if (!drawRect) return false;
  const { x, y, w, h } = drawRect;
  if (cx < x || cy < y || cx > x + w || cy > y + h) return false;
  // Sample alpha so transparent margins don't steal clicks
  const sx = Math.max(0, Math.min(canvas.width - 1, Math.floor(cx)));
  const sy = Math.max(0, Math.min(canvas.height - 1, Math.floor(cy)));
  try {
    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
    return pixel[3] > 16;
  } catch {
    return true;
  }
}

function setClickThroughSafe(enabled) {
  if (clickThrough === enabled) return;
  clickThrough = enabled;
  window.petV2.setClickThrough?.(enabled);
}

function syncClickThrough(clientX, clientY) {
  if (dragging || pointerOverHud) {
    setClickThroughSafe(false);
    return;
  }
  const p = canvasCoords(clientX, clientY);
  setClickThroughSafe(!hitBody(p.x, p.y));
}

hud.addEventListener("pointerenter", () => {
  pointerOverHud = true;
  setClickThroughSafe(false);
});
hud.addEventListener("pointerleave", () => {
  pointerOverHud = false;
});

canvas.addEventListener("pointermove", (e) => {
  if (dragging && lastPointer) {
    const dx = e.screenX - lastPointer.screenX;
    const dy = e.screenY - lastPointer.screenY;
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      if (Math.hypot(e.clientX - lastPointer.originX, e.clientY - lastPointer.originY) >= DRAG_THRESHOLD) {
        dragMoved = true;
      }
      window.petV2.dragBy?.(dx, dy);
      lastPointer.screenX = e.screenX;
      lastPointer.screenY = e.screenY;
    }
    return;
  }
  syncClickThrough(e.clientX, e.clientY);
});

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const p = canvasCoords(e.clientX, e.clientY);
  if (!hitBody(p.x, p.y)) {
    syncClickThrough(e.clientX, e.clientY);
    return;
  }
  setClickThroughSafe(false);
  dragging = true;
  dragMoved = false;
  lastPointer = {
    screenX: e.screenX,
    screenY: e.screenY,
    originX: e.clientX,
    originY: e.clientY,
  };
  canvas.classList.add("dragging");
  canvas.setPointerCapture?.(e.pointerId);
});

function endPointer(e) {
  if (!dragging) return;
  dragging = false;
  canvas.classList.remove("dragging");
  try {
    canvas.releasePointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
  const wasTap = !dragMoved;
  lastPointer = null;
  if (wasTap) {
    playAction("tap_react");
  }
  syncClickThrough(e.clientX, e.clientY);
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("lostpointercapture", () => {
  dragging = false;
  canvas.classList.remove("dragging");
});

window.addEventListener("blur", () => {
  dragging = false;
  canvas.classList.remove("dragging");
});

select.addEventListener("change", () => setCharacter(select.value));
document.getElementById("cycle").addEventListener("click", async () => {
  const i = modes.indexOf(state.mode);
  state.mode = modes[(i + 1) % modes.length];
  state.mouthOpen = state.mode === "speaking" ? 0.5 : 0;
  await playAction(modeAction(state.mode));
});

window.petV2.onCharacterChanged((id) => setCharacter(id));
window.petV2.onEmbodimentStateChanged(async (s) => {
  state = { ...state, ...s };
  const action = state.artifact ? "show_artifact" : modeAction(state.mode);
  await playAction(action);
});
window.petV2.onSpeechAmplitude((n) => {
  const x = Math.max(0, Math.min(1, Number(n) || 0));
  state.mouthOpen = x < 0.12 ? 0 : x < 0.3 ? 0.25 : x < 0.6 ? 0.55 : 0.85;
  state.mode = "speaking";
  if (actionId !== "speaking") playAction("speaking");
});
window.petV2.onArtifactReady(async (a) => {
  state.artifact = a;
  await playAction("show_artifact");
});
window.petV2.onPlayAction?.(async (id) => {
  await playAction(String(id || "").trim());
});

// Start click-through so empty chrome doesn't block the desktop
setClickThroughSafe(true);

loadCatalog()
  .then(() => requestAnimationFrame(draw))
  .catch((e) => {
    status.textContent = String(e.message || e);
  });
