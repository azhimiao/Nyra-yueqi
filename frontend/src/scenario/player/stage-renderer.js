/** Scene renderer — environment layers only. Characters live in the transcript. */

import { resolveBackground } from "../runtime/action-mapper.js";

/** @type {Map<string, object>} */
const sceneCache = new Map();

async function loadSceneManifest(sceneId) {
  const id = String(sceneId || "").trim();
  if (!id) return null;
  if (sceneCache.has(id)) return sceneCache.get(id);
  try {
    const res = await fetch(`/assets/scenes/${id}/scene.json`, { cache: "force-cache" });
    if (!res.ok) {
      sceneCache.set(id, null);
      return null;
    }
    const json = await res.json();
    sceneCache.set(id, json);
    return json;
  } catch {
    sceneCache.set(id, null);
    return null;
  }
}

/**
 * @param {HTMLElement} host
 */
export function createStageRenderer(host) {
  if (!host) {
    return { render() {}, setEntering() {}, destroy() {} };
  }

  host.innerHTML = `
    <div class="scenario-stage-plane" data-stage-plane>
      <div class="scenario-stage-bg" data-stage-bg aria-hidden="true"></div>
      <div class="scenario-stage-layers" data-stage-layers hidden aria-hidden="true"></div>
      <div class="scenario-stage-rain" data-stage-rain aria-hidden="true"></div>
      <div class="scenario-stage-light" data-stage-light aria-hidden="true"></div>
      <div class="scenario-stage-vignette" aria-hidden="true"></div>
    </div>
  `;

  const bg = host.querySelector("[data-stage-bg]");
  const layers = host.querySelector("[data-stage-layers]");
  const rainSheet = host.querySelector("[data-stage-rain]");
  const light = host.querySelector("[data-stage-light]");
  let lastSceneKey = "";
  let renderGen = 0;

  function clearLayers() {
    if (layers) {
      layers.hidden = true;
      layers.replaceChildren();
    }
    rainSheet?.classList.remove("is-active");
    bg?.classList.remove("is-layered");
    if (bg) delete bg.dataset.scene;
  }

  function paintManifest(manifest, backdrop) {
    if (!layers || !manifest?.layers?.length) {
      clearLayers();
      if (bg) bg.style.background = backdrop.gradient;
      return;
    }
    const base = `/assets/scenes/${manifest.id}/`;
    layers.hidden = false;
    bg?.classList.add("is-layered");
    if (bg) {
      bg.dataset.scene = manifest.id;
      bg.style.background = manifest.fallbackGradient || backdrop.gradient;
    }
    layers.innerHTML = manifest.layers.map((layer) => {
      const src = `${base}${layer.src}`;
      const z = Number(layer.z) || 1;
      const parallax = Number(layer.parallax) || 0;
      const cls = ["scenario-scene-layer", layer.className || ""].filter(Boolean).join(" ");
      return `<div class="${cls}" data-layer="${layer.id}" style="z-index:${z};--parallax:${parallax};background-image:url('${src}')"></div>`;
    }).join("");
    const hasRain = manifest.layers.some((l) => /rain/i.test(l.id) || /rain/i.test(l.className || ""));
    rainSheet?.classList.toggle("is-active", hasRain);
  }

  async function renderLayers(backdrop, sceneId) {
    const gen = ++renderGen;
    const key = `${backdrop.id}|${sceneId || ""}`;
    if (key === lastSceneKey && layers && !layers.hidden) return;
    lastSceneKey = key;

    const preferredId = sceneId || backdrop.sceneId || (backdrop.layered ? "night-rain-station" : "");
    if (!backdrop.layered && !preferredId) {
      clearLayers();
      host.setAttribute("data-scene-id", "");
      if (bg) bg.style.background = backdrop.gradient;
      return;
    }

    const manifest = await loadSceneManifest(preferredId || "night-rain-station");
    if (gen !== renderGen) return;
    if (manifest) {
      paintManifest(manifest, backdrop);
      host.setAttribute("data-scene-id", manifest.id || preferredId || "");
      return;
    }

    clearLayers();
    host.setAttribute("data-scene-id", preferredId || backdrop.sceneId || "");
    if (bg) {
      bg.classList.add("is-layered");
      bg.dataset.scene = backdrop.id;
      bg.style.background = backdrop.gradient;
    }
    if (layers) {
      layers.hidden = false;
      layers.innerHTML = `
        <div class="scenario-scene-layer scene-layer--far" data-layer="sky" style="z-index:1"></div>
        <div class="scenario-scene-layer scene-layer--rain" data-layer="rain" style="z-index:2"></div>
        <div class="scenario-scene-layer scene-layer--near" data-layer="platform" style="z-index:3"></div>
      `;
    }
    rainSheet?.classList.add("is-active");
  }

  function render({
    backgroundId = "",
    mood = "",
    sceneId = "",
    actionId = "",
    expressionId = "",
    emotion = "",
    portraitUrl = "",
    characterId = "",
    entering = false,
    cameraShot = "medium",
  } = {}) {
    const backdrop = resolveBackground(backgroundId, mood);
    void renderLayers(backdrop, sceneId || backdrop.sceneId || "");
    if (bg) {
      bg.dataset.backgroundId = backdrop.id;
    }
    if (light) {
      light.dataset.mood = String(mood || backdrop.id || "neutral");
    }

    const cid = String(characterId || "").trim();
    const normalizedAction = String(actionId || "idle").trim() || "idle";
    const normalizedExpression = String(expressionId || "neutral").trim() || "neutral";
    const normalizedEmotion = String(emotion || mood || "neutral").trim() || "neutral";
    host.setAttribute("data-action", normalizedAction);
    host.setAttribute("data-expression", normalizedExpression);
    host.setAttribute("data-emotion", normalizedEmotion);
    host.setAttribute("data-character-id", cid);
    host.setAttribute("data-shot", cameraShot || "medium");
    host.classList.toggle("is-entering", Boolean(entering));
    host.setAttribute("data-bg", backdrop.id);
    if (backdrop.sceneId) host.setAttribute("data-scene-id", backdrop.sceneId);

  }

  function setEntering(on) {
    host.classList.toggle("is-entering", Boolean(on));
  }

  return {
    render,
    setEntering,
    destroy() {
      host.replaceChildren();
    },
  };
}
