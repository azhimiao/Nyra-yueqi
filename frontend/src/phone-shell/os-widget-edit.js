/**
 * Home widget reorder — long-press large widgets, blur predictive swap.
 */

import { refreshIcons } from "../lib/icons.js";

/**
 * @param {HTMLElement} homeRoot
 * @param {{
 *   getOrder: () => string[],
 *   setOrder: (ids: string[]) => void,
 *   getContainer: () => HTMLElement|null,
 *   isBlocked?: () => boolean,
 *   longPressMs?: number,
 *   onDragStart?: () => void,
 * }} deps
 */
export function bindWidgetEditor(homeRoot, deps = {}) {
  if (!homeRoot) return () => {};

  const longPressMs = Number(deps.longPressMs) > 0 ? Number(deps.longPressMs) : 480;
  let pressTimer = 0;
  let activePointerId = null;
  let dragId = "";
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let ghost = null;
  let grabX = 0;
  let grabY = 0;
  let sourceEl = null;
  let suppressClick = false;
  let suppressClickTimer = 0;

  function clearPress() {
    window.clearTimeout(pressTimer);
    pressTimer = 0;
  }

  function destroyGhost() {
    ghost?.remove();
    ghost = null;
    sourceEl?.classList.remove("is-widget-dragging", "is-widget-lifted");
    sourceEl = null;
    homeRoot.querySelectorAll(".is-widget-drop-predict").forEach((n) => {
      n.classList.remove("is-widget-drop-predict");
    });
  }

  function spawnGhost(el, clientX, clientY) {
    destroyGhost();
    sourceEl = el;
    el.classList.add("is-widget-dragging", "is-widget-lifted");
    ghost = el.cloneNode(true);
    ghost.classList.add("mini-widget-ghost");
    ghost.classList.remove("is-widget-dragging", "is-widget-lifted", "is-widget-drop-predict");
    ghost.removeAttribute("data-widget");
    ghost.setAttribute("aria-hidden", "true");
    const rect = el.getBoundingClientRect();
    grabX = clientX - rect.left;
    grabY = clientY - rect.top;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.append(ghost);
    moveGhost(clientX, clientY);
  }

  function moveGhost(clientX, clientY) {
    if (!ghost) return;
    ghost.style.transform = `translate3d(${clientX - grabX}px, ${clientY - grabY}px, 0) scale(1.03)`;
  }

  function reorderByPoint(clientY) {
    const order = (deps.getOrder?.() || []).slice();
    if (!dragId || order.length < 2) return;
    const container = deps.getContainer?.();
    if (!container) return;
    const widgets = Array.from(container.querySelectorAll("[data-widget]"))
      .filter((n) => n.dataset.widget && n.dataset.widget !== dragId);
    let insertAt = order.filter((id) => id !== dragId).length;
    for (let i = 0; i < widgets.length; i += 1) {
      const rect = widgets[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        const id = widgets[i].dataset.widget;
        insertAt = order.filter((x) => x !== dragId).indexOf(id);
        if (insertAt < 0) insertAt = i;
        break;
      }
    }
    const next = order.filter((id) => id !== dragId);
    next.splice(Math.max(0, insertAt), 0, dragId);
    const same = next.length === order.length && next.every((id, i) => id === order[i]);
    container.querySelectorAll("[data-widget]").forEach((n) => n.classList.remove("is-widget-drop-predict"));
    const predictId = next[Math.min(insertAt, next.length - 1)];
    if (predictId && predictId !== dragId) {
      container.querySelector(`[data-widget="${predictId}"]`)?.classList.add("is-widget-drop-predict");
    }
    if (!same) {
      deps.setOrder?.(next);
      // re-mark source after re-render
      requestAnimationFrame(() => {
        const live = container.querySelector(`[data-widget="${dragId}"]`);
        if (live) {
          sourceEl = live;
          live.classList.add("is-widget-dragging", "is-widget-lifted");
        }
        refreshIcons();
      });
    }
  }

  function onMove(event) {
    if (event.pointerId !== activePointerId) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) {
        clearPress();
      }
      return;
    }
    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    reorderByPoint(event.clientY);
  }

  function onUp(event) {
    if (event.pointerId !== activePointerId) return;
    clearPress();
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    activePointerId = null;
    if (dragging) {
      suppressClick = true;
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = window.setTimeout(() => {
        suppressClick = false;
      }, 500);
      dragging = false;
      dragId = "";
      destroyGhost();
    }
  }

  function onDown(event) {
    if (deps.isBlocked?.()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const widget = event.target.closest("[data-widget]");
    if (!widget || !homeRoot.contains(widget)) return;
    if (event.target.closest("input, textarea, select, label, [data-home-gesture-own]")) return;
    const id = widget.dataset.widget;
    if (!id) return;

    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragging = false;
    dragId = "";
    clearPress();
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onUp, { capture: true, passive: false });
    window.addEventListener("pointercancel", onUp, { capture: true, passive: false });

    pressTimer = window.setTimeout(() => {
      if (activePointerId == null) return;
      dragging = true;
      dragId = id;
      deps.onDragStart?.();
      spawnGhost(widget, startX, startY);
    }, longPressMs);
  }

  function onClickCapture(event) {
    if (!suppressClick || !event.target.closest("[data-widget]")) return;
    suppressClick = false;
    window.clearTimeout(suppressClickTimer);
    event.preventDefault();
    event.stopImmediatePropagation?.();
  }

  homeRoot.addEventListener("pointerdown", onDown, { capture: true, passive: false });
  homeRoot.addEventListener("click", onClickCapture, true);

  return () => {
    clearPress();
    window.clearTimeout(suppressClickTimer);
    destroyGhost();
    homeRoot.removeEventListener("pointerdown", onDown, true);
    homeRoot.removeEventListener("click", onClickCapture, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
  };
}
