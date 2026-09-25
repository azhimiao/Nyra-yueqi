/**
 * Lock TIME pane: follow-finger swipe-up (WarmLand-style), threshold commit.
 */

const UNLOCK_PULL_PX = 72;
const EASE_IOS = "cubic-bezier(0.32, 0.72, 0, 1)";

export function bindLockSwipe(timePane, {
  canSwipe,
  onCommit,
} = {}) {
  if (!timePane) return () => {};

  const clock = timePane.querySelector("[data-lock-clock]");
  const date = timePane.querySelector("[data-lock-date]");
  const hint = timePane.querySelector("[data-lock-hint]");

  let startY = 0;
  let active = false;
  let pulling = false;
  let offset = 0;

  function setPull(px, animate) {
    offset = Math.max(0, px);
    const progress = Math.min(1, offset / UNLOCK_PULL_PX);
    const transition = animate ? `transform 350ms ${EASE_IOS}, opacity 350ms ${EASE_IOS}` : "none";
    if (clock) {
      clock.style.transition = transition;
      clock.style.transform = `translate3d(0, ${-offset * 0.22}px, 0)`;
    }
    if (date) {
      date.style.transition = transition;
      date.style.transform = `translate3d(0, ${-offset * 0.16}px, 0)`;
      date.style.opacity = String(Math.max(0.35, 1 - progress * 0.45));
    }
    if (hint) {
      hint.style.transition = transition;
      hint.style.transform = `translate3d(0, ${-offset * 0.35}px, 0)`;
      hint.style.opacity = String(0.55 + progress * 0.45);
      hint.classList.toggle("is-dragging", !animate && offset > 0);
    }
    timePane.classList.toggle("is-pulling", offset > 0 && !animate);
  }

  function resetPull() {
    setPull(0, true);
    window.setTimeout(() => {
      [clock, date, hint].forEach((node) => {
        if (!node) return;
        node.style.transition = "";
        node.style.transform = "";
        node.style.opacity = "";
      });
      hint?.classList.remove("is-dragging");
      timePane.classList.remove("is-pulling");
    }, 360);
  }

  function onPointerDown(event) {
    if (!canSwipe?.()) return;
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest("button") && !event.target.closest("[data-lock-hint]")) return;
    active = true;
    pulling = false;
    startY = event.clientY;
    try {
      timePane.setPointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(event) {
    if (!active) return;
    const dy = startY - event.clientY;
    if (!pulling) {
      if (dy < 8) return;
      pulling = true;
    }
    event.preventDefault();
    setPull(dy, false);
  }

  function finish() {
    if (!active) return;
    active = false;
    const committed = offset > UNLOCK_PULL_PX;
    if (committed) {
      setPull(0, false);
      [clock, date, hint].forEach((node) => {
        if (!node) return;
        node.style.transition = "";
        node.style.transform = "";
        node.style.opacity = "";
      });
      hint?.classList.remove("is-dragging");
      timePane.classList.remove("is-pulling");
      onCommit?.();
      return;
    }
    resetPull();
  }

  timePane.addEventListener("pointerdown", onPointerDown);
  timePane.addEventListener("pointermove", onPointerMove, { passive: false });
  timePane.addEventListener("pointerup", finish);
  timePane.addEventListener("pointercancel", finish);

  return () => {
    timePane.removeEventListener("pointerdown", onPointerDown);
    timePane.removeEventListener("pointermove", onPointerMove);
    timePane.removeEventListener("pointerup", finish);
    timePane.removeEventListener("pointercancel", finish);
  };
}

export { UNLOCK_PULL_PX };
