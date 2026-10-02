/**
 * First Light motion tokens — shared timings only; no per-component random motion.
 */

export const FL_MOTION = Object.freeze({
  instant: 120,
  quick: 180,
  normal: 280,
  slow: 420,
  scene: 560,
  easing: Object.freeze({
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    decelerate: "cubic-bezier(0, 0, 0, 1)",
    springSoft: "cubic-bezier(0.22, 1.2, 0.36, 1)",
  }),
});

export function prefersReducedMotion() {
  try {
    return typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Apply CSS custom properties on a root element. */
export function applyMotionTokens(el) {
  if (!el?.style) return;
  el.style.setProperty("--fl-instant", `${FL_MOTION.instant}ms`);
  el.style.setProperty("--fl-quick", `${FL_MOTION.quick}ms`);
  el.style.setProperty("--fl-normal", `${FL_MOTION.normal}ms`);
  el.style.setProperty("--fl-slow", `${FL_MOTION.slow}ms`);
  el.style.setProperty("--fl-scene", `${FL_MOTION.scene}ms`);
  el.style.setProperty("--fl-ease", FL_MOTION.easing.standard);
  el.style.setProperty("--fl-ease-out", FL_MOTION.easing.decelerate);
  el.style.setProperty("--fl-ease-spring", FL_MOTION.easing.springSoft);
}
