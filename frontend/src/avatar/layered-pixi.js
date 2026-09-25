/**
 * Optional PixiJS (MIT) backend for layered 2D.
 * Dynamically imported; Canvas remains default / fallback.
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

export async function createPixiLayeredRenderer({
  host,
  resolveMediaUrl,
} = {}) {
  if (!host) return null;
  let PIXI;
  try {
    PIXI = await import("pixi.js");
  } catch {
    return null;
  }

  const app = new PIXI.Application();
  await app.init({
    width: 512,
    height: 512,
    backgroundAlpha: 0,
    antialias: true,
    preference: "webgl",
  });
  host.innerHTML = "";
  host.appendChild(app.canvas);

  let model = normalizeLayeredModel();
  const sprites = new Map();
  let actionId = "idle_default";
  let expressionId = "idle";
  let lipOpen = 0;
  let lipEnabled = false;
  let particles = [];
  let blink = createBlinkController();
  let tickerFn = null;
  let destroyed = false;

  async function rebuildSprites() {
    for (const sprite of sprites.values()) {
      sprite.destroy();
    }
    sprites.clear();
    app.stage.removeChildren();

    const byId = new Map(model.parts.map((p) => [p.id, p]));
    for (const part of [...model.parts].sort((a, b) => (a.z || 0) - (b.z || 0))) {
      const container = new PIXI.Container();
      container.label = part.id;
      container.visible = part.visible !== false;
      container.alpha = part.opacity ?? 1;
      container.x = part.x;
      container.y = part.y;
      container.rotation = (part.rotation * Math.PI) / 180;
      container.scale.set(part.scale);

      if (part.mediaId) {
        try {
          const url = await resolveMediaUrl?.(part.mediaId);
          if (url) {
            const texture = await PIXI.Assets.load(url);
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(part.anchorX, part.anchorY);
            container.addChild(sprite);
          }
        } catch {
          /* skip */
        }
      }
      sprites.set(part.id, container);
    }

    // Parent hierarchy
    for (const part of model.parts) {
      const node = sprites.get(part.id);
      if (!node) continue;
      const parent = part.parentId ? sprites.get(part.parentId) : null;
      if (parent) parent.addChild(node);
      else {
        node.x += app.screen.width / 2;
        node.y += app.screen.height / 2;
        app.stage.addChild(node);
      }
    }
  }

  function applyFrame(nowMs) {
    const binding = resolveActionBinding(model, actionId);
    const expr = model.expressions?.[expressionId] || {};
    const motionIds = new Set(binding.motions || []);

    for (const part of model.parts) {
      const node = sprites.get(part.id);
      if (!node) continue;
      node.visible = part.visible !== false && !(expr.hidden || []).includes(part.id);
      let scaleX = part.scale;
      let scaleY = part.scale;
      let rot = (part.rotation * Math.PI) / 180;
      let x = part.x;
      let y = part.y;

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
        rot += (swayRotation(nowMs, model.motions.sway) * Math.PI) / 180;
      }
      if (motionIds.has("blink") && model.motions?.blink?.enabled !== false
        && part.id === (model.motions.blink.target || "eyes")) {
        scaleY *= blink.sample(nowMs);
      }
      if (lipEnabled && binding.lipSync && part.id === (model.lipSync?.mouthPartId || "mouth")) {
        scaleY *= volumeToLip(lipOpen, model.lipSync).scaleY;
      }

      const parented = Boolean(part.parentId);
      node.x = parented ? x : x + app.screen.width / 2;
      node.y = parented ? y : y + app.screen.height / 2;
      node.rotation = rot;
      node.scale.set(scaleX, scaleY);
    }

    // Simple particle overlay via Graphics
    particles = stepParticles(particles, 16);
  }

  async function setModel(next) {
    model = normalizeLayeredModel(next);
    blink = createBlinkController(model.motions?.blink || {});
    app.renderer.resize(model.canvas.width, model.canvas.height);
    await rebuildSprites();
  }

  function setAction(nextActionId = "idle_default") {
    actionId = String(nextActionId || "idle_default");
    const binding = resolveActionBinding(model, actionId);
    expressionId = binding.expression || "idle";
    lipEnabled = Boolean(binding.lipSync && model.lipSync?.enabled !== false);
    for (const name of binding.particles || []) {
      const def = model.particles?.[name];
      if (def) particles = particles.concat(createParticleBurst(def));
    }
  }

  function setExpression(id) {
    if (id) expressionId = String(id);
  }

  function setLipOpen(open) {
    lipOpen = Math.max(0, Math.min(1, Number(open) || 0));
  }

  function start() {
    if (destroyed || tickerFn) return;
    tickerFn = () => applyFrame(performance.now());
    app.ticker.add(tickerFn);
  }

  function stop() {
    if (tickerFn) {
      app.ticker.remove(tickerFn);
      tickerFn = null;
    }
  }

  function destroy() {
    destroyed = true;
    stop();
    app.destroy(true);
    sprites.clear();
  }

  return {
    backend: "pixi",
    setModel,
    setAction,
    setExpression,
    setLipOpen,
    start,
    stop,
    destroy,
    reloadImages: rebuildSprites,
    getActionId: () => actionId,
  };
}
