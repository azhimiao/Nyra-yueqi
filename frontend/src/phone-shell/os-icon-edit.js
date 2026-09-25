/**
 * Home icon edit — fixed grid slots, elastic dock (max 4),
 * cross-page edge flip, merge into folder, predictive drop placeholders.
 */

import {
  DOCK_SLOT_COUNT,
  GRID_COLS,
  ICONS_PER_PAGE,
  ICON_PAGE_MAX,
  ICON_PAGE_MIN,
  ICON_SLOT_COUNT,
  isEmptySlot,
} from "./apps-catalog.js";
import { requestHaptic } from "../platform/interaction-motion.js";

function folderIdOf(entryId) {
  const raw = String(entryId || "");
  return raw.startsWith("folder:") ? raw.slice(7) : "";
}

function escapeAttr(id) {
  return typeof CSS !== "undefined" && CSS.escape
    ? CSS.escape(id)
    : String(id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function isFullOverlap(ghostRect, targetRect) {
  if (!ghostRect || !targetRect) return false;
  const gx = ghostRect.left + ghostRect.width / 2;
  const gy = ghostRect.top + ghostRect.height / 2;
  const tx = targetRect.left + targetRect.width / 2;
  const ty = targetRect.top + targetRect.height / 2;
  const maxDist = Math.min(targetRect.width, targetRect.height) * 0.3;
  return Math.hypot(gx - tx, gy - ty) <= maxDist;
}

export function bindIconEditor(root, {
  getOrder,
  setOrder,
  getDock,
  setDock,
  getFolders,
  setFolders,
  getPageIndex,
  setPageIndex,
  syncPage,
  getGridForPage,
  getDockRoot,
  onLiveLayout,
  onLiveOrder,
  iconsPerPage = ICONS_PER_PAGE,
  dockSlots = DOCK_SLOT_COUNT,
  getIconPageMax = () => ICON_PAGE_MAX,
  onNeedNewPage,
  isEditMode,
  setEditMode,
  longPressMs = 480,
  edgeFlipMs = 420,
  onOpenApp,
  onOpenFolder,
  onDragStart,
  onIconFaceEdit,
} = {}) {
  if (!root) return () => {};

  let pressTimer = 0;
  let pressId = "";
  let dragId = "";
  let dragging = false;
  let suppressOpen = false;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let liveOrder = null;
  let liveDock = null;
  let liveFolders = null;
  let orderDirty = false;
  let dockDirty = false;
  let foldersDirty = false;
  let activePointerId = null;
  let ghost = null;
  let sourceButton = null;
  let lastSlotKey = "";
  let hoverTargetId = "";
  let hoverTimer = 0;
  let mergeArmed = false;
  let listeningDoc = false;
  let edgeTimer = 0;
  let edgeDir = 0;
  let ghostW = 72;
  let ghostH = 84;
  let grabOffsetX = 0;
  let grabOffsetY = 0;

  function clearPress() {
    window.clearTimeout(pressTimer);
    pressTimer = 0;
  }

  function clearEdge() {
    window.clearTimeout(edgeTimer);
    edgeTimer = 0;
    edgeDir = 0;
  }

  function clearHover() {
    window.clearTimeout(hoverTimer);
    hoverTimer = 0;
    hoverTargetId = "";
    mergeArmed = false;
    root.querySelectorAll(".is-merge-target").forEach((node) => {
      node.classList.remove("is-merge-target");
    });
  }

  function iconPageMax() {
    return Math.max(ICON_PAGE_MIN, Number(getIconPageMax?.() || ICON_PAGE_MAX) || ICON_PAGE_MAX);
  }

  function ensureSlots(order) {
    const pages = iconPageMax();
    const len = pages * iconsPerPage;
    return Array.from({ length: len }, (_, i) => (
      i < (order?.length || 0) ? (isEmptySlot(order[i]) ? null : order[i]) : null
    ));
  }

  function ensureDock(dock) {
    const filled = [];
    const seen = new Set();
    for (const id of Array.isArray(dock) ? dock : []) {
      if (filled.length >= dockSlots) break;
      if (isEmptySlot(id) || folderIdOf(id) || seen.has(id)) continue;
      seen.add(id);
      filled.push(id);
    }
    return Array.from({ length: dockSlots }, (_, i) => filled[i] ?? null);
  }

  function captureFlipRects() {
    const map = new Map();
    root.querySelectorAll(".mini-app-icon[data-app-id]").forEach((node) => {
      const id = node.dataset.appId;
      if (!id || id === dragId) return;
      map.set(id, node.getBoundingClientRect());
    });
    return map;
  }

  function playFlip(before) {
    if (!before?.size) return;
    root.querySelectorAll(".mini-app-icon[data-app-id]").forEach((node) => {
      const id = node.dataset.appId;
      if (!id || id === dragId) return;
      const prev = before.get(id);
      if (!prev) return;
      const next = node.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      void node.offsetWidth;
      node.style.transition = "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)";
      node.style.transform = "";
      const clear = () => {
        node.style.transition = "";
        node.style.transform = "";
        node.removeEventListener("transitionend", clear);
      };
      node.addEventListener("transitionend", clear);
    });
  }

  function clearDropTargets() {
    root.querySelectorAll(
      ".mini-app-slot.is-drop-predict, .mini-dock__slot.is-drop-predict, .mini-app-icon.is-drop-predict, .mini-app-slot.is-drop-target, .mini-dock__slot.is-drop-target",
    ).forEach((node) => {
      node.classList.remove("is-drop-predict", "is-drop-target");
      const host = node.querySelector(":scope > i");
      if (host) host.style.opacity = "";
      node.querySelector(".mini-drop-predict")?.remove();
    });
  }

  function markDropPredict(slotEl) {
    clearDropTargets();
    if (!slotEl) return;
    slotEl.classList.add("is-drop-predict");
    const host = slotEl.querySelector(":scope > i");
    if (host) host.style.opacity = "0";
    let predict = slotEl.querySelector(".mini-drop-predict");
    if (!predict) {
      predict = document.createElement("div");
      predict.className = "mini-drop-predict";
      predict.setAttribute("aria-hidden", "true");
      slotEl.append(predict);
    }
    const face = ghost?.querySelector(".mini-app-face, .mini-app-folder-face")?.cloneNode(true)
      || ghost?.querySelector("span")?.cloneNode(true);
    predict.innerHTML = "";
    if (face) {
      face.classList.add("mini-drop-predict__face");
      predict.append(face);
    } else {
      predict.classList.add("is-empty-glass");
    }
  }

  function markDropPredictAt(page, localSlot) {
    const grid = getGridForPage?.(page);
    if (!grid) return;
    const empty = grid.querySelector(`.mini-app-slot[data-app-slot="${localSlot}"]`);
    if (empty) {
      markDropPredict(empty);
      return;
    }
    const icon = grid.querySelector(`.mini-app-icon[data-app-slot="${localSlot}"]`);
    if (icon && icon.dataset.appId !== dragId) markDropPredict(icon);
  }

  function paintLive() {
    const before = captureFlipRects();
    const order = liveOrder || getOrder?.() || [];
    const dock = liveDock || getDock?.() || [];
    onLiveLayout?.({ order, dock, folders: liveFolders || getFolders?.() || {} });
    onLiveOrder?.(order);
    if (sourceButton && dragId) {
      const live = root.querySelector(`.mini-app-icon[data-app-id="${escapeAttr(dragId)}"]`);
      if (live) {
        sourceButton = live;
        live.classList.add("is-dragging-icon");
        if (moved) live.classList.add("is-drag-lifted");
      }
    }
    requestAnimationFrame(() => playFlip(before));
  }

  function destroyGhost() {
    ghost?.remove();
    ghost = null;
    if (sourceButton) {
      sourceButton.classList.remove("is-dragging-icon", "is-drag-lifted");
      sourceButton = null;
    }
  }

  function spawnGhost(button, clientX, clientY) {
    destroyGhost();
    sourceButton = button;
    button.classList.add("is-dragging-icon");
    ghost = button.cloneNode(true);
    ghost.classList.add("mini-app-icon-ghost");
    ghost.classList.remove("is-dragging-icon", "is-drag-lifted", "is-merge-target");
    ghost.removeAttribute("data-app-id");
    ghost.setAttribute("aria-hidden", "true");
    const rect = button.getBoundingClientRect();
    ghostW = rect.width || 72;
    ghostH = rect.height || 84;
    grabOffsetX = clamp(clientX - rect.left, 0, ghostW);
    grabOffsetY = clamp(clientY - rect.top, 0, ghostH);
    ghost.style.width = `${ghostW}px`;
    ghost.style.height = `${ghostH}px`;
    document.body.append(ghost);
    moveGhost(clientX, clientY);
  }

  function moveGhost(clientX, clientY) {
    if (!ghost) return;
    ghost.style.transform = `translate3d(${clientX - grabOffsetX}px, ${clientY - grabOffsetY}px, 0) scale(1.1)`;
  }

  function slotFromPoint(clientX, clientY, page) {
    const grid = getGridForPage?.(page);
    if (!grid) return -1;
    const rect = grid.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    const col = clamp(Math.floor(((clientX - rect.left) / rect.width) * GRID_COLS), 0, GRID_COLS - 1);
    const rows = Math.max(1, Math.round(iconsPerPage / GRID_COLS));
    const row = clamp(Math.floor(((clientY - rect.top) / rect.height) * rows), 0, rows - 1);
    return row * GRID_COLS + col;
  }

  function dockSlotFromPoint(clientX, clientY) {
    const dock = getDockRoot?.() || root.querySelector("[data-home-dock]");
    if (!dock) return -1;
    const rect = dock.getBoundingClientRect();
    const pad = 28;
    if (
      clientX < rect.left - pad
      || clientX > rect.right + pad
      || clientY < rect.top - pad
      || clientY > rect.bottom + pad
    ) {
      return -1;
    }
    const slots = Array.from(dock.querySelectorAll("[data-dock-slot]"));
    if (!slots.length) return -1;
    let best = -1;
    let bestDist = Infinity;
    slots.forEach((node) => {
      const slotRect = node.getBoundingClientRect();
      const cx = slotRect.left + slotRect.width / 2;
      const cy = slotRect.top + slotRect.height / 2;
      const dist = Math.hypot(clientX - cx, clientY - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = Number(node.dataset.dockSlot);
      }
    });
    return Number.isFinite(best) ? best : -1;
  }

  function moveToDockSlot(localSlot) {
    if (localSlot < 0 || localSlot >= dockSlots || !dragId) return;
    if (folderIdOf(dragId)) return;
    const order = ensureSlots(liveOrder || getOrder?.() || []);
    const dock = ensureDock(liveDock || getDock?.() || []);
    const fromGrid = order.indexOf(dragId);
    const fromDock = dock.indexOf(dragId);
    if (fromGrid < 0 && fromDock < 0) return;
    const key = `dock:${localSlot}`;
    if (key === lastSlotKey) return;
    lastSlotKey = key;
    requestHaptic("selection");

    const packed = dock.filter((id) => !isEmptySlot(id) && id !== dragId);
    const insertAt = clamp(localSlot, 0, packed.length);
    packed.splice(insertAt, 0, dragId);

    if (fromGrid >= 0) {
      order[fromGrid] = null;
      orderDirty = true;
    }
    if (packed.length > dockSlots) {
      const overflow = packed.pop();
      if (overflow && overflow !== dragId) {
        if (fromGrid >= 0) order[fromGrid] = overflow;
        else {
          const free = order.findIndex((id) => isEmptySlot(id));
          if (free >= 0) order[free] = overflow;
        }
        orderDirty = true;
      }
    }

    for (let i = 0; i < dockSlots; i += 1) dock[i] = packed[i] ?? null;
    dockDirty = true;
    liveOrder = order;
    liveDock = dock;
    paintLive();

    const dockRoot = getDockRoot?.() || root;
    markDropPredict(dockRoot.querySelector?.(`.mini-dock__slot[data-dock-slot="${insertAt}"]`));
  }

  function moveToSlot(page, localSlot) {
    if (localSlot < 0 || !dragId || folderIdOf(dragId)) return;
    const order = ensureSlots(liveOrder || getOrder?.() || []);
    let dock = ensureDock(liveDock || getDock?.() || []);
    const fromGrid = order.indexOf(dragId);
    const fromDock = dock.indexOf(dragId);
    if (fromGrid < 0 && fromDock < 0) return;
    const dest = (page - 1) * iconsPerPage + clamp(localSlot, 0, iconsPerPage - 1);
    const key = `grid:${page}:${localSlot}`;
    if (key === lastSlotKey) return;
    lastSlotKey = key;

    const occupant = order[dest];
    if (fromGrid >= 0) {
      if (fromGrid === dest) return;
      order[fromGrid] = isEmptySlot(occupant) ? null : occupant;
      order[dest] = dragId;
      orderDirty = true;
    } else {
      dock[fromDock] = isEmptySlot(occupant) || folderIdOf(occupant) ? null : occupant;
      order[dest] = dragId;
      dock = ensureDock(dock);
      orderDirty = true;
      dockDirty = true;
    }
    liveOrder = order;
    liveDock = dock;
    requestHaptic("selection");
    paintLive();

    markDropPredictAt(page, localSlot);
  }

  function commitLive() {
    const order = liveOrder;
    const dock = liveDock;
    const folders = liveFolders;
    const shouldSetFolders = foldersDirty && folders;
    const shouldSetOrder = orderDirty && order;
    const shouldSetDock = dockDirty && dock;
    liveOrder = null;
    liveDock = null;
    liveFolders = null;
    orderDirty = false;
    dockDirty = false;
    foldersDirty = false;
    if (!shouldSetFolders && !shouldSetOrder && !shouldSetDock) return;

    const nextOrder = shouldSetOrder ? ensureSlots(order) : (getOrder?.() || []);
    const nextDock = shouldSetDock ? ensureDock(dock) : (getDock?.() || []);
    const nextFolders = shouldSetFolders ? folders : undefined;

    if (typeof setOrder === "function" && (shouldSetOrder || shouldSetDock || shouldSetFolders)) {
      if (setOrder.length >= 3 || shouldSetDock) {
        setOrder(nextOrder, nextFolders || getFolders?.() || {}, nextDock);
        return;
      }
    }
    if (shouldSetFolders) setFolders?.(folders);
    if (shouldSetOrder) setOrder?.(ensureSlots(order));
    if (shouldSetDock) setDock?.(ensureDock(dock));
  }

  function armMerge(overId) {
    const dock = ensureDock(liveDock || getDock?.() || []);
    if (dock.includes(dragId) || dock.includes(overId)) {
      clearHover();
      return;
    }
    if (!overId || overId === dragId || folderIdOf(dragId)) {
      clearHover();
      return;
    }
    if (hoverTargetId === overId) return;
    clearHover();
    hoverTargetId = overId;
    root.querySelector(`.mini-app-icon[data-app-id="${escapeAttr(overId)}"]`)
      ?.classList.add("is-merge-target");
    hoverTimer = window.setTimeout(() => {
      mergeArmed = true;
    }, 380);
  }

  function mergeInto(targetId) {
    const drag = dragId;
    if (!drag || !targetId || drag === targetId) return false;
    if (folderIdOf(drag)) return false;
    const dock = ensureDock(liveDock || getDock?.() || []);
    if (dock.includes(drag) || dock.includes(targetId)) return false;

    const order = ensureSlots(liveOrder || getOrder?.() || []);
    const folders = { ...(liveFolders || getFolders?.() || {}) };
    const targetFolderKey = folderIdOf(targetId);
    const dragIndex = order.indexOf(drag);
    const targetIndex = order.indexOf(targetId);
    if (dragIndex < 0) return false;

    if (targetFolderKey) {
      const folder = folders[targetFolderKey];
      if (!folder || folder.apps.includes(drag)) return false;
      folder.apps = [...folder.apps, drag];
      order[dragIndex] = null;
      liveOrder = order;
      liveFolders = folders;
      orderDirty = true;
      foldersDirty = true;
      return true;
    }

    if (targetIndex < 0) return false;
    const fid = `f${Date.now().toString(36)}`;
    const entry = `folder:${fid}`;
    folders[fid] = { name: "文件夹", apps: [targetId, drag] };
    order[targetIndex] = entry;
    order[dragIndex] = null;
    liveOrder = order;
    liveFolders = folders;
    orderDirty = true;
    foldersDirty = true;
    return true;
  }

  function findOverlapTarget() {
    if (!ghost) return "";
    const ghostRect = ghost.getBoundingClientRect();
    const icons = Array.from(root.querySelectorAll(".mini-app-icon[data-app-id]"));
    for (const icon of icons) {
      const id = icon.dataset.appId;
      if (!id || id === dragId || icon === sourceButton) continue;
      if (icon.closest("[data-folder-grid]")) continue;
      if (icon.closest("[data-home-dock]")) continue;
      if (isFullOverlap(ghostRect, icon.getBoundingClientRect())) return id;
    }
    return "";
  }

  function unbindDoc() {
    if (!listeningDoc) return;
    listeningDoc = false;
    document.removeEventListener("pointermove", onDocPointerMove, true);
    document.removeEventListener("pointerup", onDocPointerUp, true);
    document.removeEventListener("pointercancel", onDocPointerUp, true);
    document.removeEventListener("lostpointercapture", onLostCapture, true);
  }

  function bindDoc() {
    if (listeningDoc) return;
    listeningDoc = true;
    document.addEventListener("pointermove", onDocPointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onDocPointerUp, { capture: true, passive: false });
    document.addEventListener("pointercancel", onDocPointerUp, { capture: true, passive: false });
    document.addEventListener("lostpointercapture", onLostCapture, true);
  }

  function capturePointer(event) {
    try {
      root.setPointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
  }

  function releasePointer(pointerId) {
    try {
      if (pointerId != null) root.releasePointerCapture?.(pointerId);
    } catch {
      /* ignore */
    }
  }

  function beginDrag(button, id, clientX, clientY) {
    if (!button || !id) return;
    dragging = true;
    dragId = id;
    moved = false;
    lastSlotKey = "";
    liveOrder = ensureSlots(getOrder?.() || []);
    liveDock = ensureDock(getDock?.() || []);
    liveFolders = { ...(getFolders?.() || {}) };
    orderDirty = false;
    dockDirty = false;
    foldersDirty = false;
    // Cancel shared home pager gesture, then own the pointer for icon drag.
    onDragStart?.();
    if (activePointerId != null) capturePointer({ pointerId: activePointerId });
    spawnGhost(button, clientX, clientY);
    button.classList.add("is-drag-lifted");
  }

  function endDragSession({ merge = false } = {}) {
    clearPress();
    clearEdge();
    clearHover();
    clearDropTargets();
    const id = dragId;
    const doMerge = merge && hoverTargetId;
    if (doMerge) mergeInto(hoverTargetId);
    const changed = orderDirty || dockDirty || foldersDirty || doMerge;
    commitLive();
    if (changed) requestHaptic("medium-light");
    destroyGhost();
    dragging = false;
    dragId = "";
    lastSlotKey = "";
    releasePointer(activePointerId);
    unbindDoc();
    activePointerId = null;
    suppressOpen = false;
    moved = false;
    pressId = "";
    void id;
  }

  function updateEdgeFlip(clientX) {
    const page = Number(getPageIndex?.() || 0);
    const bounds = root.getBoundingClientRect();
    const edge = 28;
    const maxIcon = iconPageMax();
    let dir = 0;
    if (clientX < bounds.left + edge && page > ICON_PAGE_MIN) dir = -1;
    else if (clientX > bounds.right - edge && page <= maxIcon) dir = 1;
    if (dir === edgeDir) return;
    clearEdge();
    edgeDir = dir;
    if (!dir) return;
    edgeTimer = window.setTimeout(() => {
      let next = page + dir;
      if (dir > 0 && page >= maxIcon) {
        const added = onNeedNewPage?.();
        if (!added) return;
        liveOrder = ensureSlots(getOrder?.() || liveOrder || []);
        next = Math.min(page + 1, iconPageMax());
      } else {
        next = clamp(next, ICON_PAGE_MIN, iconPageMax());
      }
      if (next === page) return;
      setPageIndex?.(next);
      syncPage?.(next);
      lastSlotKey = "";
    }, edgeFlipMs);
  }

  function onDocPointerMove(event) {
    if (event.pointerId !== activePointerId) return;
    if (!dragging) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const dist = Math.hypot(dx, dy);
      // Horizontal page swipe (shared with home pager) must not open the app.
      // Match pager bias: mild diagonals still count as paging, not icon open.
      if (dist > 6 && Math.abs(dx) >= Math.abs(dy) * 0.85) {
        moved = true;
        clearPress();
        suppressOpen = true;
        return;
      }
      if (dist > 12) {
        moved = true;
        clearPress();
        suppressOpen = true;
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > 4) {
      moved = true;
      sourceButton?.classList.add("is-drag-lifted");
    }

    moveGhost(event.clientX, event.clientY);
    updateEdgeFlip(event.clientX);

    const page = Math.max(ICON_PAGE_MIN, Number(getPageIndex?.() || ICON_PAGE_MIN));
    const dockSlot = dockSlotFromPoint(event.clientX, event.clientY);
    if (dockSlot >= 0) {
      clearHover();
      moveToDockSlot(dockSlot);
      return;
    }

    const overlapId = findOverlapTarget();
    if (overlapId) {
      armMerge(overlapId);
      return;
    }

    if (ghost) ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (ghost) ghost.style.visibility = "";
    const over = el?.closest?.(".mini-app-icon[data-app-id]");
    const overId = over && over !== sourceButton && !over.closest("[data-home-dock]")
      ? over.dataset.appId
      : "";
    if (overId && overId !== dragId) armMerge(overId);
    else clearHover();

    if (!mergeArmed) {
      const slot = slotFromPoint(event.clientX, event.clientY, page);
      moveToSlot(page, slot);
    }
  }

  function onDocPointerUp(event) {
    if (event.pointerId !== activePointerId) return;

    if (!dragging) {
      // A horizontal launcher swipe may start on an icon. Do not consume its
      // pointerup: the shared home pager still needs that release to commit
      // the destination page. `moved/suppressOpen` already prevents app open.
      const openId = !isEditMode?.() && !moved && !suppressOpen ? pressId : "";
      clearPress();
      clearEdge();
      releasePointer(activePointerId);
      unbindDoc();
      activePointerId = null;
      const blocked = suppressOpen;
      suppressOpen = false;
      moved = false;
      pressId = "";
      if (!blocked && openId) {
        if (folderIdOf(openId)) onOpenFolder?.(folderIdOf(openId));
        else onOpenApp?.(openId);
      }
      return;
    }

    // Once long-press has become an actual icon drag, the editor owns release.
    event.preventDefault();
    event.stopPropagation();
    const overlap = findOverlapTarget();
    endDragSession({ merge: Boolean(mergeArmed || overlap) });
  }

  function onLostCapture(event) {
    if (event.pointerId !== activePointerId) return;
    if (!dragging) {
      clearPress();
      clearEdge();
      unbindDoc();
      activePointerId = null;
      suppressOpen = false;
      moved = false;
      pressId = "";
      return;
    }
    suppressOpen = true;
    endDragSession({ merge: false });
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const button = event.target.closest(".mini-app-icon[data-app-id]");
    if (!button || !root.contains(button)) return;
    if (button.closest("[data-folder-grid]")) return;
    const id = button.dataset.appId;
    if (!id) return;

    // Do not stopPropagation / capture here — home pager shares the same
    // pointer for horizontal paging until icon drag actually begins.
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    moved = false;
    liveOrder = null;
    liveDock = null;
    liveFolders = null;
    orderDirty = false;
    dockDirty = false;
    foldersDirty = false;
    suppressOpen = false;
    pressId = id;
    dragId = "";
    dragging = false;
    clearPress();
    clearHover();
    clearEdge();
    bindDoc();

    if (isEditMode?.()) {
      beginDrag(button, id, event.clientX, event.clientY);
      return;
    }

    pressTimer = window.setTimeout(() => {
      if (activePointerId == null || pressId !== id || dragging || moved) return;
      suppressOpen = true;
      clearPress();
      if (typeof onIconFaceEdit === "function" && !String(id).startsWith("folder:")) {
        releasePointer(activePointerId);
        unbindDoc();
        activePointerId = null;
        onIconFaceEdit(id);
        return;
      }
      setEditMode?.(true);
      const live = root.querySelector(`.mini-app-icon[data-app-id="${escapeAttr(id)}"]`) || button;
      beginDrag(live, id, startX, startY);
    }, longPressMs);
  }

  function onClickCapture(event) {
    if (!event.target.closest(".mini-app-icon[data-app-id]")) return;
    if (event.target.closest("[data-folder-grid]")) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onContextMenu(event) {
    if (!event.target.closest(".mini-app-icon[data-app-id]")) return;
    event.preventDefault();
    event.stopPropagation();
  }

  const downOpts = { capture: true, passive: false };
  root.addEventListener("pointerdown", onPointerDown, downOpts);
  root.addEventListener("click", onClickCapture, true);
  root.addEventListener("contextmenu", onContextMenu, true);

  return () => {
    clearPress();
    clearHover();
    clearEdge();
    releasePointer(activePointerId);
    unbindDoc();
    destroyGhost();
    clearDropTargets();
    root.removeEventListener("pointerdown", onPointerDown, downOpts);
    root.removeEventListener("click", onClickCapture, true);
    root.removeEventListener("contextmenu", onContextMenu, true);
  };
}
