/**
 * Home widget reorder.
 * A still long-press opens the widget sheet (same idea as app icons).
 * After 换位置, the next press drags immediately and the page stops scrolling.
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
 *   onLongPress?: (id: string) => void,
 * }} deps
 */
export function bindWidgetEditor(homeRoot, deps = {}) {
  if (!homeRoot) return () => {};

  const longPressMs = Number(deps.longPressMs) > 0 ? Number(deps.longPressMs) : 480;
  let arrange = false;
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
    homeRoot.querySelectorAll(".is-widget-drop-predict").forEach((node) => {
      node.classList.remove("is-widget-drop-predict");
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
    if (el.shadowRoot) {
      const shadow = ghost.attachShadow({ mode: "open" });
      shadow.innerHTML = el.shadowRoot.innerHTML;
    }
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

  function reorderByPoint(clientX, clientY) {
    const order = (deps.getOrder?.() || []).slice();
    if (!dragId || order.length < 2) return;
    const container = deps.getContainer?.();
    if (!container) return;
    const widgets = Array.from(container.querySelectorAll("[data-widget]")).filter((node) => {
      const id = node.dataset.widget;
      return id && id !== dragId && !node.hidden;
    });
    const rest = order.filter((id) => id !== dragId);
    let insertAt = rest.length;
    for (let index = 0; index < widgets.length; index += 1) {
      const rect = widgets[index].getBoundingClientRect();
      if (!rect.height && !rect.width) continue;
      const midY = rect.top + rect.height / 2;
      const midX = rect.left + rect.width / 2;
      const sameRow = clientY >= rect.top && clientY <= rect.bottom;
      const before = sameRow ? clientX < midX : clientY < midY;
      if (before) {
        const at = rest.indexOf(widgets[index].dataset.widget);
        insertAt = at < 0 ? index : at;
        break;
      }
    }
    const next = rest.slice();
    next.splice(Math.max(0, insertAt), 0, dragId);
    const same = next.length === order.length && next.every((id, index) => id === order[index]);
    container.querySelectorAll("[data-widget]").forEach((node) => node.classList.remove("is-widget-drop-predict"));
    const predictId = next[Math.min(insertAt, next.length - 1)];
    if (predictId && predictId !== dragId) {
      container.querySelector(`[data-widget="${predictId}"]`)?.classList.add("is-widget-drop-predict");
    }
    if (!same) {
      deps.setOrder?.(next);
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

  function beginDrag(widget, id, clientX, clientY, pointerId) {
    dragging = true;
    dragId = id;
    deps.onDragStart?.();
    try {
      widget.setPointerCapture?.(pointerId);
    } catch {
      /* ignore */
    }
    spawnGhost(widget, clientX, clientY);
  }

  function onMove(event) {
    if (event.pointerId !== activePointerId) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) clearPress();
      return;
    }
    event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    reorderByPoint(event.clientX, event.clientY);
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
    if (event.target.closest("input, textarea, select")) return;
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

    if (arrange) {
      event.preventDefault();
      event.stopPropagation();
      beginDrag(widget, id, event.clientX, event.clientY, event.pointerId);
      return;
    }

    pressTimer = window.setTimeout(() => {
      if (activePointerId == null) return;
      suppressClick = true;
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = window.setTimeout(() => {
        suppressClick = false;
      }, 700);
      deps.onLongPress?.(id);
    }, longPressMs);
  }

  function onClickCapture(event) {
    if (!suppressClick || !event.target.closest("[data-widget]")) return;
    suppressClick = false;
    window.clearTimeout(suppressClickTimer);
    event.preventDefault();
    event.stopPropagation();
  }

  function onContextMenu(event) {
    const widget = event.target.closest("[data-widget]");
    if (!widget || !homeRoot.contains(widget)) return;
    event.preventDefault();
    if (deps.isBlocked?.() || arrange) return;
    deps.onLongPress?.(widget.dataset.widget);
  }

  homeRoot.addEventListener("pointerdown", onDown, { capture: true, passive: false });
  homeRoot.addEventListener("click", onClickCapture, true);
  homeRoot.addEventListener("contextmenu", onContextMenu, true);

  function unbind() {
    clearPress();
    window.clearTimeout(suppressClickTimer);
    destroyGhost();
    homeRoot.removeEventListener("pointerdown", onDown, true);
    homeRoot.removeEventListener("click", onClickCapture, true);
    homeRoot.removeEventListener("contextmenu", onContextMenu, true);
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
  }

  unbind.setArrange = (next) => {
    arrange = Boolean(next);
    if (!arrange) {
      dragging = false;
      dragId = "";
      clearPress();
      destroyGhost();
    }
  };
  return unbind;
}
