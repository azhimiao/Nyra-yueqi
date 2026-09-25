/**
 * Home-indicator swipe-up → Home.
 * Follow finger while dragging; commit by distance or velocity on release.
 */

export function bindHomeIndicatorGesture(indicator, {
  canExit,
  onExitToHome,
  thresholdPx = 42,
  velocityPxPerMs = 0.45,
} = {}) {
  if (!indicator) return () => {};

  let pointerId = null;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;

  function resetVisual() {
    indicator.style.transform = "";
    indicator.classList.remove("is-dragging");
  }

  function onPointerDown(event) {
    if (!canExit?.()) return;
    if (event.button != null && event.button !== 0) return;
    pointerId = event.pointerId;
    startY = event.clientY;
    lastY = startY;
    lastT = performance.now();
    velocity = 0;
    dragging = true;
    indicator.classList.add("is-dragging");
    indicator.setPointerCapture?.(pointerId);
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const now = performance.now();
    const dy = Math.min(0, event.clientY - startY);
    const dt = Math.max(1, now - lastT);
    const instant = (event.clientY - lastY) / dt;
    velocity = velocity * 0.7 + instant * 0.3;
    lastY = event.clientY;
    lastT = now;
    indicator.style.transform = `translateY(${dy * 0.55}px)`;
  }

  function finish(event) {
    if (!dragging || (event && event.pointerId !== pointerId)) return;
    dragging = false;
    const dy = Math.min(0, (event?.clientY ?? lastY) - startY);
    const shouldExit = Math.abs(dy) >= thresholdPx || Math.abs(velocity) >= velocityPxPerMs;
    resetVisual();
    pointerId = null;
    if (shouldExit && canExit?.()) onExitToHome?.({ source: "gesture" });
  }

  indicator.addEventListener("pointerdown", onPointerDown);
  indicator.addEventListener("pointermove", onPointerMove);
  indicator.addEventListener("pointerup", finish);
  indicator.addEventListener("pointercancel", finish);

  return () => {
    indicator.removeEventListener("pointerdown", onPointerDown);
    indicator.removeEventListener("pointermove", onPointerMove);
    indicator.removeEventListener("pointerup", finish);
    indicator.removeEventListener("pointercancel", finish);
    resetVisual();
  };
}
