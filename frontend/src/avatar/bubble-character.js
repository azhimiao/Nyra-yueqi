/**
 * Gender-neutral animated bubble pet (Siri / voice-orb style).
 * Pure CSS — no canvas, so transparent hosts stay clean.
 */

const PLAY_STATES = new Set([
  "idle",
  "talking",
  "thinking",
  "listening",
  "reacting",
  "capturing",
  "sleep",
]);

/**
 * @param {Element|ShadowRoot|string} root
 * @param {{
 *   size?: number|string,
 *   state?: string,
 *   reducedMotion?: boolean,
 *   ariaLabel?: string,
 * }} options
 */
export function mountBubbleCharacter(root, options = {}) {
  const target = resolveMountTarget(root);
  const element = document.createElement("div");
  element.className = "bubble-character";
  element.dataset.status = "ready";
  element.dataset.state = normalizePlayState(options.state);
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", options.ariaLabel || "动态气泡桌宠");
  applySize(element, options.size);

  element.innerHTML = `
    <span class="bubble-character__aura" aria-hidden="true"></span>
    <span class="bubble-character__orb" aria-hidden="true">
      <span class="bubble-character__core"></span>
      <span class="bubble-character__shine"></span>
      <span class="bubble-character__ripple"></span>
      <span class="bubble-character__ripple bubble-character__ripple--late"></span>
    </span>
  `;
  target.append(element);

  const mediaQuery = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  let reducedMotion = options.reducedMotion == null
    ? Boolean(mediaQuery?.matches)
    : Boolean(options.reducedMotion);
  let destroyed = false;
  let reactTimer = 0;

  function paintMotion() {
    element.dataset.reducedMotion = reducedMotion ? "1" : "0";
  }

  function handleReducedMotion(event) {
    if (options.reducedMotion != null || destroyed) return;
    reducedMotion = Boolean(event.matches);
    paintMotion();
  }

  function setRuntimeState(patch = {}) {
    if (destroyed) return snapshot();
    if (reactTimer) {
      window.clearTimeout(reactTimer);
      reactTimer = 0;
    }
    const next = patch.asleep
      ? "sleep"
      : normalizePlayState(patch.playState ?? element.dataset.state);
    element.dataset.state = next;
    return snapshot();
  }

  function setState(nextState = "idle") {
    return setRuntimeState({ playState: nextState });
  }

  function playAction(actionId = "", settings = {}) {
    if (destroyed) return snapshot();
    const id = String(actionId || "").trim();
    if (id === "idle_default" || !id) {
      return setRuntimeState({ playState: "idle" });
    }
    element.dataset.state = "reacting";
    if (reactTimer) window.clearTimeout(reactTimer);
    const holdMs = Number(settings.holdMs) > 0 ? Number(settings.holdMs) : 900;
    reactTimer = window.setTimeout(() => {
      reactTimer = 0;
      if (!destroyed) element.dataset.state = "idle";
    }, holdMs);
    return snapshot();
  }

  function snapshot() {
    return {
      status: destroyed ? "destroyed" : "ready",
      playState: element.dataset.state || "idle",
      reducedMotion,
      destroyed,
    };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (reactTimer) window.clearTimeout(reactTimer);
    reactTimer = 0;
    if (mediaQuery?.removeEventListener) mediaQuery.removeEventListener("change", handleReducedMotion);
    else mediaQuery?.removeListener?.(handleReducedMotion);
    element.remove();
  }

  paintMotion();
  if (mediaQuery?.addEventListener) mediaQuery.addEventListener("change", handleReducedMotion);
  else mediaQuery?.addListener?.(handleReducedMotion);

  return {
    element,
    ready: Promise.resolve({ element }),
    setRuntimeState,
    setState,
    setEmotion() {},
    setSpeaking(speaking) {
      return setRuntimeState({ playState: speaking ? "talking" : "idle" });
    },
    setLookDirection() {},
    playAction,
    getState: snapshot,
    getClips: () => [],
    destroy,
  };
}

function resolveMountTarget(root) {
  const target = typeof root === "string" ? document.querySelector(root) : root;
  if (!target || typeof target.append !== "function") {
    throw new TypeError("mountBubbleCharacter(root): root must be an Element, ShadowRoot, or selector");
  }
  return target;
}

function applySize(element, rawSize) {
  if (typeof rawSize === "number" && Number.isFinite(rawSize)) {
    element.style.setProperty("--bubble-character-size", `${Math.min(320, Math.max(48, rawSize))}px`);
  } else if (typeof rawSize === "string" && /^(?:\d+(?:\.\d+)?)(?:px|rem|em|vw|vh|vmin|vmax|%)$/.test(rawSize.trim())) {
    element.style.setProperty("--bubble-character-size", rawSize.trim());
  }
}

function normalizePlayState(value) {
  const state = String(value || "idle").trim().toLowerCase();
  if (state === "asleep") return "sleep";
  if (PLAY_STATES.has(state)) return state;
  return "idle";
}
