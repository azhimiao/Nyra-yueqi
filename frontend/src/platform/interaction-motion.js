const WIRED = Symbol.for("yueqi.interaction-motion.wired");
const HAPTIC_OFF_KEY = "yueqi.haptics.off";

const HAPTIC_PATTERNS = Object.freeze({
  light: 7,
  selection: 5,
  "medium-light": 14,
  "double-pulse": [9, 34, 9],
  error: 26,
});

const INTERACTIVE_SELECTOR = [
  "button",
  '[role="button"]',
  '[role="tab"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
].join(",");

function asElement(value) {
  return value instanceof Element ? value : value?.parentElement || null;
}

function isDisabled(node) {
  return !node
    || node.matches?.(":disabled")
    || node.getAttribute?.("aria-disabled") === "true";
}

function inInteractiveShell(node) {
  return Boolean(node?.closest?.(".app-shell, .mini-phone"));
}

export function requestHaptic(kind = "light") {
  try {
    if (localStorage.getItem(HAPTIC_OFF_KEY) === "1") return false;
    if (document.visibilityState === "hidden") return false;
    const vibrate = navigator?.vibrate;
    const pattern = HAPTIC_PATTERNS[kind] ?? HAPTIC_PATTERNS.light;
    if (typeof vibrate !== "function") return false;
    return Boolean(vibrate.call(navigator, pattern));
  } catch {
    return false;
  }
}

function explicitHaptic(node) {
  const value = String(node?.closest?.("[data-haptic]")?.dataset?.haptic || "").trim();
  if (value === "none") return "";
  return Object.hasOwn(HAPTIC_PATTERNS, value) ? value : "";
}

function inferredHaptic(node) {
  if (!node || !inInteractiveShell(node)) return "";
  if (node.matches("[data-audio-toggle], [data-listen-play]")) return "medium-light";
  if (node.matches("[data-nav-hub-toggle]")) return "medium-light";
  if (node.matches([
    ".nyra-dock > button:not(.nyra-dock__hub)",
    ".mini-segment",
    ".mini-switch",
    '[role="tab"]',
    'input[type="checkbox"]',
    'input[type="radio"]',
  ].join(","))) return "light";
  return "";
}

function pulseCompanion(source) {
  const shell = source?.closest?.(".app-shell, .mini-phone")
    || document.querySelector(".app-shell, .mini-phone");
  if (!shell) return;
  shell.classList.remove("is-companion-aware");
  requestAnimationFrame(() => {
    shell.classList.add("is-companion-aware");
    window.setTimeout(() => shell.classList.remove("is-companion-aware"), 520);
  });
}

function emitFeedback({ haptic = "", companion = false, source = null } = {}) {
  if (haptic) requestHaptic(haptic);
  if (companion) pulseCompanion(source);
}

export function wireInteractionMotion(root = document) {
  if (!root || root[WIRED]) return root?.[WIRED] || (() => {});

  let pressed = null;
  let pressedPointer = null;
  let releaseTimer = 0;

  const clearPressed = (immediate = false) => {
    window.clearTimeout(releaseTimer);
    const target = pressed;
    pressed = null;
    pressedPointer = null;
    if (!target) return;
    if (immediate) target.classList.remove("is-pressed");
    else releaseTimer = window.setTimeout(() => target.classList.remove("is-pressed"), 34);
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = asElement(event.target)?.closest?.(INTERACTIVE_SELECTOR);
    if (isDisabled(target) || !inInteractiveShell(target)) return;
    clearPressed(true);
    pressed = target;
    pressedPointer = event.pointerId;
    target.classList.add("is-pressed");
  };

  const onPointerEnd = (event) => {
    if (pressedPointer != null && event.pointerId !== pressedPointer) return;
    clearPressed(event.type === "pointercancel");
  };

  const onClick = (event) => {
    const target = asElement(event.target)?.closest?.(INTERACTIVE_SELECTOR);
    if (isDisabled(target) || !inInteractiveShell(target)) return;
    if (event.detail === 0) {
      target.classList.add("is-pressed");
      window.setTimeout(() => target.classList.remove("is-pressed"), 90);
    }
    const haptic = explicitHaptic(target) || inferredHaptic(target);
    if (haptic) requestHaptic(haptic);
    if (haptic === "medium-light" || haptic === "double-pulse") pulseCompanion(target);
  };

  const onFeedback = (event) => emitFeedback(event.detail || {});
  const onDiarySaved = () => emitFeedback({ haptic: "medium-light", companion: true });
  const onCharacterReply = () => pulseCompanion(document.querySelector(".app-shell, .mini-phone"));

  root.addEventListener("pointerdown", onPointerDown, { passive: true });
  root.addEventListener("pointerup", onPointerEnd, { passive: true });
  root.addEventListener("pointercancel", onPointerEnd, { passive: true });
  root.addEventListener("click", onClick);
  window.addEventListener("yueqi:interaction-feedback", onFeedback);
  window.addEventListener("yueqi:diary-saved", onDiarySaved);
  window.addEventListener("yueqi.character.replied", onCharacterReply);

  const destroy = () => {
    clearPressed(true);
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointerup", onPointerEnd);
    root.removeEventListener("pointercancel", onPointerEnd);
    root.removeEventListener("click", onClick);
    window.removeEventListener("yueqi:interaction-feedback", onFeedback);
    window.removeEventListener("yueqi:diary-saved", onDiarySaved);
    window.removeEventListener("yueqi.character.replied", onCharacterReply);
    delete root[WIRED];
  };

  root[WIRED] = destroy;
  return destroy;
}

