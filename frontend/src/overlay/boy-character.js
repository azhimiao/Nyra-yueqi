import boySvgMarkup from "../../assets/companion-boy.svg?raw";
import "./boy-character.css";

const STATES = new Set([
  "idle",
  "blink",
  "breathe",
  "talking",
  "thinking",
  "listening",
  "reacting",
  "sleep",
  "greet",
  "selfie",
]);

const EMOTIONS = new Set([
  "neutral",
  "calm",
  "warm",
  "happy",
  "excited",
  "shy",
  "sad",
  "angry",
  "surprised",
]);

const LOOK_DIRECTIONS = Object.freeze({
  center: { x: 0, y: 0 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  "up-left": { x: -0.75, y: -0.75 },
  "up-right": { x: 0.75, y: -0.75 },
  "down-left": { x: -0.75, y: 0.75 },
  "down-right": { x: 0.75, y: 0.75 },
});

const BLOCKED_SVG_ELEMENTS = "script, foreignObject, iframe, object, embed, link, meta";
let instanceSequence = 0;

/**
 * Mount the original boy companion into an element or ShadowRoot.
 *
 * @param {Element|ShadowRoot|string} root
 * @param {{
 *   state?: string,
 *   emotion?: string,
 *   speaking?: boolean,
 *   lookDirection?: string|{x?: number,y?: number},
 *   size?: number|string,
 *   autoBlink?: boolean,
 *   ariaLabel?: string,
 *   blinkDuration?: number,
 *   reactionDuration?: number,
 *   onStateChange?: (detail: object) => void,
 *   onReady?: (controller: object) => void
 * }} [options]
 */
export function mountBoyCharacter(root, options = {}) {
  const target = resolveMountTarget(root);
  const instanceId = `yueqi-boy-${Date.now().toString(36)}-${++instanceSequence}`;
  const element = document.createElement("div");
  const canvas = document.createElement("div");

  element.className = "boy-character";
  element.dataset.loading = "true";
  element.dataset.autoBlink = options.autoBlink === false ? "false" : "true";
  element.dataset.speaking = "false";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", String(options.ariaLabel || "可互动的男孩陪伴角色"));

  canvas.className = "boy-character__canvas";
  canvas.setAttribute("aria-hidden", "true");
  element.append(canvas);
  applySize(element, options.size);

  let destroyed = false;
  let stateTimer = 0;
  let currentState = normalizeState(options.state);
  let currentEmotion = normalizeEmotion(options.emotion);
  let stateBeforeSpeaking = currentState;
  let speaking = false;

  const svg = createScopedSvg(instanceId);
  canvas.replaceChildren(svg);
  target.append(element);

  function clearStateTimer() {
    if (!stateTimer) return;
    window.clearTimeout(stateTimer);
    stateTimer = 0;
  }

  function emitState(reason) {
    if (destroyed) return;
    const detail = {
      reason,
      state: currentState,
      emotion: currentEmotion,
      speaking,
    };
    element.dispatchEvent(new CustomEvent("boy-character:statechange", { detail }));
    options.onStateChange?.(detail);
  }

  function commitState(nextState, reason = "api", config = {}) {
    if (destroyed) return currentState;
    const normalized = normalizeState(nextState);
    const previous = currentState === "blink" || currentState === "reacting"
      ? (speaking ? "talking" : "idle")
      : currentState;

    clearStateTimer();
    currentState = normalized;
    element.dataset.state = normalized;
    emitState(reason);

    const defaultDuration = normalized === "blink"
      ? clampNumber(options.blinkDuration, 120, 600, 210)
      : normalized === "reacting"
        ? clampNumber(options.reactionDuration, 450, 2400, 820)
        : normalized === "greet" || normalized === "selfie"
          ? 1600
          : 0;
    const temporaryMs = clampNumber(config.duration, 0, 5000, defaultDuration);

    if (temporaryMs > 0 && (normalized === "blink" || normalized === "reacting" || normalized === "greet" || normalized === "selfie")) {
      const returnState = config.returnState
        ? normalizeState(config.returnState)
        : (speaking ? "talking" : previous);
      stateTimer = window.setTimeout(() => {
        stateTimer = 0;
        commitState(returnState, `${normalized}-complete`, { duration: 0 });
      }, temporaryMs);
    }
    return currentState;
  }

  function setState(nextState, config = {}) {
    return commitState(nextState, "set-state", config);
  }

  function setEmotion(nextEmotion) {
    if (destroyed) return currentEmotion;
    currentEmotion = normalizeEmotion(nextEmotion);
    element.dataset.emotion = currentEmotion;
    emitState("set-emotion");
    return currentEmotion;
  }

  function setSpeaking(active) {
    if (destroyed) return speaking;
    const next = Boolean(active);
    if (next === speaking) return speaking;

    speaking = next;
    element.dataset.speaking = String(next);
    if (next) {
      stateBeforeSpeaking = currentState === "blink" || currentState === "reacting"
        ? "idle"
        : currentState;
      if (["idle", "breathe", "blink"].includes(currentState)) {
        commitState("talking", "speaking-start", { duration: 0 });
      } else {
        emitState("speaking-start");
      }
    } else if (currentState === "talking") {
      commitState(stateBeforeSpeaking === "talking" ? "idle" : stateBeforeSpeaking, "speaking-stop", {
        duration: 0,
      });
    } else {
      emitState("speaking-stop");
    }
    return speaking;
  }

  function setLookDirection(direction) {
    if (destroyed) return { x: 0, y: 0 };
    const resolved = normalizeLookDirection(direction);
    element.style.setProperty("--boy-look-x", `${(resolved.x * 4.5).toFixed(2)}px`);
    element.style.setProperty("--boy-look-y", `${(resolved.y * 3).toFixed(2)}px`);
    element.dataset.lookDirection = resolved.label;
    return { x: resolved.x, y: resolved.y };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearStateTimer();
    element.remove();
  }

  const controller = {
    element,
    svg,
    ready: Promise.resolve(true),
    setState,
    setEmotion,
    setSpeaking,
    setLookDirection,
    destroy,
  };

  element.dataset.state = currentState;
  element.dataset.emotion = currentEmotion;
  setLookDirection(options.lookDirection || "center");
  if (options.speaking) setSpeaking(true);
  element.dataset.loading = "false";

  queueMicrotask(() => {
    if (destroyed) return;
    element.dispatchEvent(new CustomEvent("boy-character:ready", { detail: { controller } }));
    options.onReady?.(controller);
  });

  return controller;
}

function resolveMountTarget(root) {
  const target = typeof root === "string" ? document.querySelector(root) : root;
  if (!target || typeof target.append !== "function") {
    throw new TypeError("mountBoyCharacter(root): root must be an Element, ShadowRoot, or selector");
  }
  return target;
}

function normalizeState(value) {
  const state = String(value || "idle").trim().toLowerCase();
  return STATES.has(state) ? state : "idle";
}

function normalizeEmotion(value) {
  const emotion = String(value || "neutral").trim().toLowerCase();
  return EMOTIONS.has(emotion) ? emotion : "neutral";
}

function normalizeLookDirection(value) {
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    const preset = LOOK_DIRECTIONS[key] || LOOK_DIRECTIONS.center;
    return { ...preset, label: LOOK_DIRECTIONS[key] ? key : "center" };
  }
  if (value && typeof value === "object") {
    const x = clampNumber(value.x, -1, 1, 0);
    const y = clampNumber(value.y, -1, 1, 0);
    return { x, y, label: "custom" };
  }
  return { ...LOOK_DIRECTIONS.center, label: "center" };
}

function applySize(element, rawSize) {
  if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
    element.style.setProperty("--boy-size", `${Math.min(480, Math.max(64, rawSize))}px`);
    return;
  }
  if (typeof rawSize === "string" && /^(?:\d+(?:\.\d+)?)(?:px|rem|em|vw|vh|vmin|vmax|%)$/.test(rawSize.trim())) {
    element.style.setProperty("--boy-size", rawSize.trim());
  }
}

function createScopedSvg(instanceId) {
  const parsed = new DOMParser().parseFromString(boySvgMarkup, "image/svg+xml");
  const parserError = parsed.querySelector("parsererror");
  const svg = parsed.documentElement;
  if (parserError || svg?.localName !== "svg") {
    throw new Error("Unable to parse companion-boy.svg");
  }

  svg.querySelectorAll(BLOCKED_SVG_ELEMENTS).forEach((node) => node.remove());
  [svg, ...svg.querySelectorAll("*")].forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on")) node.removeAttribute(attribute.name);
      if ((name === "href" || name === "xlink:href") && value && !value.startsWith("#")) {
        node.removeAttribute(attribute.name);
      }
      if (name === "style" && /(?:javascript:|url\s*\(\s*['\"]?(?:https?:|data:))/i.test(value)) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  scopeSvgIds(svg, instanceId);
  svg.classList.add("boy-character__svg");
  svg.removeAttribute("role");
  svg.removeAttribute("aria-labelledby");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  return document.importNode(svg, true);
}

function scopeSvgIds(svg, prefix) {
  const idMap = new Map();
  svg.querySelectorAll("[id]").forEach((node) => {
    const oldId = node.id;
    const nextId = `${prefix}-${oldId}`;
    idMap.set(oldId, nextId);
    node.id = nextId;
  });

  [svg, ...svg.querySelectorAll("*")].forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      let value = attribute.value;
      value = value.replace(/url\(#([^)]+)\)/g, (match, id) => (
        idMap.has(id) ? `url(#${idMap.get(id)})` : match
      ));
      if ((attribute.name === "href" || attribute.name === "xlink:href") && value.startsWith("#")) {
        const id = value.slice(1);
        if (idMap.has(id)) value = `#${idMap.get(id)}`;
      }
      if (attribute.name === "aria-labelledby" || attribute.name === "aria-describedby") {
        value = value.split(/\s+/).map((id) => idMap.get(id) || id).join(" ");
      }
      if (value !== attribute.value) node.setAttribute(attribute.name, value);
    });
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export const BOY_CHARACTER_STATES = Object.freeze([...STATES]);
export const BOY_CHARACTER_EMOTIONS = Object.freeze([...EMOTIONS]);
