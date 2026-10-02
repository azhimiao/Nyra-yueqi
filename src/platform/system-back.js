/**
 * Android system Back maps onto in-UI back (phone chevron, sheet close).
 * Overlay dismiss runs first so a sheet never leaks through to "leave app".
 */

const consumers = [];

function isShown(el) {
  if (!el) return false;
  if (el.hidden) return false;
  if (el.hasAttribute("hidden")) return false;
  const style = typeof window !== "undefined" ? window.getComputedStyle(el) : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return true;
}

function clickFirst(root, selector) {
  const node = root?.querySelector?.(selector);
  if (!node) return false;
  node.click();
  return true;
}

/** Close the topmost modal/sheet. Returns true when something was dismissed. */
export function dismissTopOverlay() {
  if (typeof document === "undefined") return false;

  const nyra = document.querySelector(".nyra-overlay.is-open");
  if (isShown(nyra) && clickFirst(nyra, "[data-nyra-overlay-cancel], [data-nyra-overlay-scrim]")) {
    return true;
  }

  const confirm = document.querySelector(".modal.confirm-modal.is-open");
  if (isShown(confirm) && clickFirst(confirm, "[data-confirm-cancel]")) return true;

  const compose = document.querySelector("[data-memory-compose-sheet]:not([hidden])");
  if (isShown(compose) && clickFirst(compose, "[data-memory-compose-close]")) return true;

  const month = document.querySelector("[data-memory-month-sheet]:not([hidden])");
  if (isShown(month) && clickFirst(month, "[data-memory-month-close]")) return true;

  const economy = document.querySelector("[data-economy-sheet]:not([hidden])");
  if (isShown(economy) && clickFirst(economy, "[data-economy-sheet-close]")) return true;

  const hub = document.querySelector(".nyra-nav-hub:not([hidden])");
  if (isShown(hub) && clickFirst(hub, "[data-nav-hub-close]")) return true;

  const yueqiSheet = document.querySelector(".yueqi-sheet:not([hidden])");
  if (isShown(yueqiSheet) && clickFirst(yueqiSheet, "[data-yueqi-sheet-close], [data-sheet-close]")) {
    return true;
  }

  const folder = document.querySelector("[data-folder-sheet]:not([hidden])");
  if (isShown(folder) && clickFirst(folder, "[data-folder-close]")) return true;

  return false;
}

export function registerSystemBack(fn) {
  if (typeof fn !== "function") return () => {};
  consumers.push(fn);
  return () => {
    const idx = consumers.lastIndexOf(fn);
    if (idx >= 0) consumers.splice(idx, 1);
  };
}

/** True when the press was consumed (do not minimize / exit). */
export function handleSystemBack() {
  if (dismissTopOverlay()) return true;
  for (let i = consumers.length - 1; i >= 0; i -= 1) {
    try {
      if (consumers[i]() === true) return true;
    } catch {
      /* a consumer must not break the back chain */
    }
  }
  return false;
}
