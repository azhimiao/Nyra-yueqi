/**
 * Canvas2D layered 2D renderer — default Phase 4 backend.
 * Low-end / missing parts → caller falls back to sprite <img>.
 */

import {
  normalizeLayeredModel,
  resolveActionBinding,
} from "./layered-model.js";
import {
  breatheOffset,
  swayRotation,
  createBlinkController,
  volumeToLip,
  createParticleBurst,
  stepParticles,
} from "./layered-motion.js";

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("layer_image_failed"));
    img.src = url;
  });
}

export function createCanvasLayeredRenderer({
  canvas,
  resolveMediaUrl,
} = {}) {
  if (!canvas?.getContext) {
    return null;
  }
  const ctx = canvas.getContext("2d");
  let model = normalizeLayeredModel();
  let images = new Map();
  let actionId = "idle_default";
  let expressionId = "idle";
  let lipOpen = 0;
  let lipEnabled = false;
  let particles = [];
  let running = false;
  let raf = 0;
  let lastTs = 0;
  let blink = createBlinkController(model.motions?.blink || {});
  let destroyed = false;

  function resize() {
    const w = model.canvas.width || 512;
    const h = model.canvas.height || 512;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  async function loadPartImages() {
    const next = new Map();
    await Promise.all(model.parts.map(async (part) => {
      if (!part.mediaId) return;
      try {
        const url = await resolveMediaUrl?.(part.mediaId);
        if (!url) return;
        const img = await loadImage(url);
        if (img) next.set(part.id, img);
      } catch {
        /* skip missing */
      }
    }));
    images = next;
  }

  function childrenOf(parentId) {
    return model.parts
      .filter((p) => (p.parentId || "") === (parentId || ""))
      .sort((a, b) => (a.z || 0) - (b.z || 0));
  }

  function drawPart(part, _parentMatrix, nowMs, binding) {
    if (!part.visible) return;
    const expr = model.expressions?.[expressionId] || {};
    if ((expr.hidden || []).includes(part.id)) return;

    const img = images.get(part.id);
    const motionIds = new Set(binding.motions || []);
    let scaleX = part.scale;
    let scaleY = part.scale;
    let x = part.x;
    let y = part.y;
    let rot = part.rotation;
    let opacity = part.opacity ?? 1;

    if (expr.opacity?.[part.id] != null) opacity *= Number(expr.opacity[part.id]) || 1;
    if (expr.scale?.[part.id] != null) {
      const s = Number(expr.scale[part.id]) || 1;
      scaleX *= s;
      scaleY *= s;
    }

    if (motionIds.has("breathe") && model.motions?.breathe?.enabled !== false
      && part.id === (model.motions.breathe.target || "body")) {
      const b = breatheOffset(nowMs, model.motions.breathe);
      scaleY *= b.scaleY;
      y += b.y;
    }
    if (motionIds.has("sway") && model.motions?.sway?.enabled !== false
      && part.id === (model.motions.sway.target || "body")) {
      rot += swayRotation(nowMs, model.motions.sway);
    }
    if (motionIds.has("blink") && model.motions?.blink?.enabled !== false
      && part.id === (model.motions.blink.target || "eyes")) {
      scaleY *= blink.sample(nowMs);
    }

    if (lipEnabled && binding.lipSync && part.id === (model.lipSync?.mouthPartId || "mouth")) {
      const lip = volumeToLip(lipOpen, model.lipSync);
      scaleY *= lip.scaleY;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));

    if (img) {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const ax = part.anchorX * iw * scaleX;
      const ay = part.anchorY * ih * scaleY;
      ctx.drawImage(img, -ax, -ay, iw * scaleX, ih * scaleY);
    }

    for (const child of childrenOf(part.id)) {
      drawPart(child, null, nowMs, binding);
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x + canvas.width / 2, p.y + canvas.height / 2, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(ts) {
    if (destroyed || !running) return;
    const nowMs = ts || performance.now();
    const dt = lastTs ? Math.min(48, nowMs - lastTs) : 16;
    lastTs = nowMs;
    particles = stepParticles(particles, dt);

    const binding = resolveActionBinding(model, actionId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    for (const root of childrenOf("")) {
      drawPart(root, null, nowMs, binding);
    }
    ctx.restore();
    drawParticles();
    raf = window.requestAnimationFrame(frame);
  }

  async function setModel(nextModel) {
    model = normalizeLayeredModel(nextModel);
    blink = createBlinkController(model.motions?.blink || {});
    resize();
    await loadPartImages();
  }

  function setAction(nextActionId = "idle_default") {
    actionId = String(nextActionId || "idle_default");
    const binding = resolveActionBinding(model, actionId);
    expressionId = binding.expression || "idle";
    lipEnabled = Boolean(binding.lipSync && model.lipSync?.enabled !== false);
    for (const name of binding.particles || []) {
      const def = model.particles?.[name];
      if (def) particles = particles.concat(createParticleBurst(def, { x: 0, y: -40 }));
    }
  }

  function setExpression(id) {
    if (id) expressionId = String(id);
  }

  function setLipOpen(open) {
    lipOpen = Math.max(0, Math.min(1, Number(open) || 0));
  }

  function start() {
    if (destroyed) return;
    running = true;
    lastTs = 0;
    if (!raf) raf = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) {
      window.cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function destroy() {
    destroyed = true;
    stop();
    images.clear();
  }

  return {
    backend: "canvas",
    setModel,
    setAction,
    setExpression,
    setLipOpen,
    start,
    stop,
    destroy,
    reloadImages: loadPartImages,
    getActionId: () => actionId,
  };
}
