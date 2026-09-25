/**
 * Inner TA navigation stack.
 * Layers: consent → lock → desktop → list → detail
 */

export function createTaNavigation({ onChange } = {}) {
  /** @type {Array<{ name: string, appKey?: string|null, detailId?: string|null, scrollTop?: number }>} */
  let stack = [{ name: "lock" }];

  function peek() {
    return stack[stack.length - 1] || { name: "lock" };
  }

  function emit() {
    onChange?.(peek(), stack.slice());
  }

  function resetToLock() {
    stack = [{ name: "lock" }];
    emit();
  }

  function resetToDesktop() {
    stack = [{ name: "desktop" }];
    emit();
  }

  function showConsent() {
    stack = [{ name: "consent" }];
    emit();
  }

  function unlockToDesktop() {
    stack = [{ name: "desktop" }];
    emit();
  }

  /**
   * @param {string} appKey
   */
  function openApp(appKey) {
    stack = [{ name: "desktop" }, { name: "list", appKey: String(appKey), scrollTop: 0 }];
    emit();
  }

  /**
   * @param {string} detailId
   * @param {number} [listScrollTop]
   */
  function openDetail(detailId, listScrollTop = 0) {
    const cur = peek();
    if (cur.name === "list") cur.scrollTop = listScrollTop;
    stack.push({
      name: "detail",
      appKey: cur.appKey || null,
      detailId: String(detailId),
      scrollTop: 0,
    });
    emit();
  }

  /**
   * Jump to another app's detail (cross-link).
   * @param {string} appKey
   * @param {string} detailId
   */
  function openCrossApp(appKey, detailId) {
    stack = [
      { name: "desktop" },
      { name: "list", appKey: String(appKey), scrollTop: 0 },
      { name: "detail", appKey: String(appKey), detailId: String(detailId), scrollTop: 0 },
    ];
    emit();
  }

  /** Back one layer; returns true if handled. */
  function back() {
    if (stack.length <= 1) return false;
    const top = peek();
    if (top.name === "desktop" || top.name === "lock" || top.name === "consent") {
      return false;
    }
    stack.pop();
    emit();
    return true;
  }

  /** Home within TA: always desktop (after unlock). */
  function home() {
    if (peek().name === "desktop" && stack.length === 1) return false;
    if (peek().name === "lock" || peek().name === "consent") return false;
    resetToDesktop();
    return true;
  }

  return {
    peek,
    stack: () => stack.slice(),
    resetToLock,
    resetToDesktop,
    showConsent,
    unlockToDesktop,
    openApp,
    openDetail,
    openCrossApp,
    back,
    home,
    depth: () => stack.length,
  };
}
