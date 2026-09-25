/**
 * Horizontal home pager: follow finger, distance/velocity commit, edge rubber.
 * Tune in place; do not fork a second gesture system.
 *
 * Measured targets:
 * - axis lock after 6–8px
 * - 1:1 follow while dragging; no settle transition during drag
 * - edge damping ≈ 0.25–0.30
 * - release commit: max(width×0.20–0.22, 56–64px) or velocity
 * - snap 240–300ms decelerate (CSS)
 */

/** @type {{ axisLockPx: number, horizontalBias: number, edgeDamp: number, distanceRatio: number, distanceMinPx: number, velocityCommit: number }} */
export const HOME_PAGER_HANDFEEL = Object.freeze({
  axisLockPx: 8,
  horizontalBias: 1.15,
  edgeDamp: 0.28,
  distanceRatio: 0.13,
  distanceMinPx: 36,
  velocityCommit: 0.25,
});

export function bindHomePager(viewport, {
  pageCount = 2,
  getPageCount,
  getPageIndex,
  setPageIndex,
  canPage,
} = {}) {
  if (!viewport) {
    return { sync() {}, cancel() {}, destroy() {} };
  }
  const track = viewport.querySelector("[data-home-track]");
  if (!track) {
    return { sync() {}, cancel() {}, destroy() {} };
  }

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let dragging = false;
  let axis = "";
  let width = 1;
  /** Page awaiting a measurable viewport (see applyTransform). */
  let pendingPage = null;
  let appliedWidth = 0;

  function pages() {
    const n = Number(getPageCount?.() ?? pageCount);
    return Math.max(1, Number.isFinite(n) ? Math.floor(n) : pageCount);
  }

  function widthOf() {
    return Math.max(1, viewport.clientWidth || 1);
  }

  function applyTransform(page, dragPx, withTransition) {
    // A pager that is hidden (App mode) or not laid out yet (mount) measures 0.
    // Committing that would park the track ~1px from page 0 whatever the real
    // page is, and the first measurable sync would then animate the whole
    // desktop sideways just as it appears. Defer instead.
    const w = viewport.clientWidth;
    if (!w) {
      pendingPage = page;
      return;
    }
    // While dragging: never settle-transition (§10.2).
    const settling = Boolean(withTransition) && !(dragging && axis === "x");
    track.classList.toggle("is-dragging", !settling && dragging && axis === "x");
    appliedWidth = w;
    track.style.transform = `translate3d(${(-page * w) + dragPx}px, 0, 0)`;
  }

  function paintDots(page) {
    const home = viewport.closest(".mini-home") || viewport;
    home.querySelectorAll("[data-home-dot]").forEach((dot) => {
      const idx = Number(dot.dataset.page);
      dot.classList.toggle("is-active", idx === page);
    });
  }

  function clampPage(page) {
    return Math.max(0, Math.min(pages() - 1, page));
  }

  function sync(page = getPageIndex?.() || 0) {
    const safe = clampPage(page);
    applyTransform(safe, 0, true);
    paintDots(safe);
  }

  /** Land on a page without the settle transition — for appearing and resizing. */
  function jump(page) {
    const safe = clampPage(page);
    const w = viewport.clientWidth;
    if (!w) {
      pendingPage = safe;
      return;
    }
    track.classList.add("is-dragging");
    appliedWidth = w;
    track.style.transform = `translate3d(${-safe * w}px, 0, 0)`;
    void track.offsetWidth;
    track.classList.remove("is-dragging");
    paintDots(safe);
  }

  function onViewportResize() {
    if (dragging) return;
    const w = viewport.clientWidth;
    if (!w) return;
    if (pendingPage != null) {
      const page = pendingPage;
      pendingPage = null;
      jump(page);
      return;
    }
    // Offsets are in pixels, so a width change (rotation, shell resize) leaves
    // the track between pages until it is re-pinned.
    if (w !== appliedWidth) jump(getPageIndex?.() || 0);
  }

  function clampDrag(page, dx) {
    const max = pages() - 1;
    if ((page <= 0 && dx > 0) || (page >= max && dx < 0)) {
      return dx * HOME_PAGER_HANDFEEL.edgeDamp;
    }
    return dx;
  }

  function distanceThreshold() {
    return Math.max(
      HOME_PAGER_HANDFEEL.distanceMinPx,
      width * HOME_PAGER_HANDFEEL.distanceRatio,
    );
  }

  function pagingAllowed() {
    return typeof canPage === "function" ? Boolean(canPage()) : true;
  }

  function cancel() {
    if (!dragging && pointerId == null) return;
    dragging = false;
    pointerId = null;
    axis = "";
    applyTransform(getPageIndex?.() || 0, 0, true);
  }

  function onPointerDown(event) {
    if (!pagingAllowed()) return;
    if (event.button != null && event.button !== 0) return;
    // Calendar week strip / other nested horizontal owners.
    if (event.target.closest("[data-home-gesture-own]")) return;
    // Icon taps and long-presses share this pointer until horizontal intent is
    // established. The icon editor only owns the gesture after drag begins.
    pointerId = event.pointerId;
    width = widthOf();
    startX = event.clientX;
    startY = event.clientY;
    lastX = startX;
    lastT = performance.now();
    velocity = 0;
    dragging = true;
    axis = "";
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    if (!pagingAllowed()) {
      cancel();
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!axis) {
      if (Math.hypot(dx, dy) < HOME_PAGER_HANDFEEL.axisLockPx) return;
      axis = Math.abs(dy) > Math.abs(dx) * HOME_PAGER_HANDFEEL.horizontalBias ? "y" : "x";
      if (axis === "y") {
        dragging = false;
        applyTransform(getPageIndex?.() || 0, 0, true);
        return;
      }
      try {
        viewport.setPointerCapture?.(pointerId);
      } catch {
        /* ignore */
      }
    }
    if (axis !== "x") return;
    event.preventDefault();
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    velocity = velocity * 0.7 + ((event.clientX - lastX) / dt) * 0.3;
    lastX = event.clientX;
    lastT = now;
    const page = getPageIndex?.() || 0;
    // 1:1 follow finger (edge damping applied in clampDrag only).
    applyTransform(page, clampDrag(page, dx), false);
  }

  function finish(event) {
    if (!dragging || (event && event.pointerId !== pointerId)) {
      if (event?.pointerId === pointerId) {
        pointerId = null;
        axis = "";
      }
      return;
    }
    dragging = false;
    const page = getPageIndex?.() || 0;
    const dx = (event?.clientX ?? lastX) - startX;
    let next = page;
    const max = pages() - 1;
    if (axis === "x" && pagingAllowed()) {
      const thresh = distanceThreshold();
      const vCommit = HOME_PAGER_HANDFEEL.velocityCommit;
      if ((dx < -thresh || velocity < -vCommit) && page < max) next = page + 1;
      else if ((dx > thresh || velocity > vCommit) && page > 0) next = page - 1;
    }
    pointerId = null;
    axis = "";
    setPageIndex?.(next);
    sync(next);
  }

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove, { passive: false });
  viewport.addEventListener("pointerup", finish);
  viewport.addEventListener("pointercancel", finish);

  let resizeObserver = null;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(onViewportResize);
    resizeObserver.observe(viewport);
  } else {
    window.addEventListener("resize", onViewportResize);
  }

  sync(getPageIndex?.() || 0);

  return {
    sync,
    cancel,
    destroy() {
      cancel();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", onViewportResize);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", finish);
      viewport.removeEventListener("pointercancel", finish);
    },
  };
}
