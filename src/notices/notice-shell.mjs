function isPresent(el) {
  return Boolean(el) && !el.hidden && el.getAttribute?.("hidden") == null;
}

/**
 * Notices must not cover splash, First Light, the account gate, or the
 * signed update dialog. First Light keeps `[data-first-light]` in the DOM
 * after close(), so only a visible / active overlay counts as blocking.
 */
export function isNoticeShellBlocked(doc = typeof document === "undefined" ? null : document) {
  if (!doc?.documentElement) return true;
  const root = doc.documentElement;
  if (!root.classList.contains("splash-done")) return true;
  if (root.classList.contains("first-light-active")) return true;
  if (isPresent(doc.querySelector("[data-onboard-gate]:not([hidden])"))) return true;
  if (isPresent(doc.querySelector("[data-first-light]"))) return true;
  if (doc.querySelector("[data-update-dialog]")) return true;
  if (doc.querySelector("[data-notice-dialog]")) return true;
  return false;
}
