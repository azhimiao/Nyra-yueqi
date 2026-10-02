/**
 * Keep composers above the soft keyboard.
 * Sets --vv-offset-bottom and toggles html.is-keyboard-open.
 *
 * Android edge-to-edge often overlays the IME on the WebView (visualViewport
 * does not shrink). Native MainActivity then dispatches `yueqi:ime`.
 */

const KEYBOARD_OPEN_PX = 80;
const MAX_INSET_RATIO = 0.72;
const COMPOSER_SEL = [
  ".assist-composer",
  ".explore-session__composer",
  ".mini-composer-stack",
  ".composer-stack",
  ".pop-composer",
].join(",");

/**
 * Only measured insets count. A previous version invented a keyboard height on
 * focus, which shrank the shell before (and sometimes without) any real IME and
 * then jumped again when the true inset arrived.
 *
 * @param {{
 *   innerHeight: number,
 *   visualViewport?: { height: number, offsetTop?: number } | null,
 *   nativeIme?: number,
 * }} args
 */
export function measureKeyboardInset({
  innerHeight,
  visualViewport: vv,
  nativeIme = 0,
} = {}) {
  const native = Math.max(0, Math.round(Number(nativeIme) || 0));
  const vvInset = vv
    ? Math.max(0, Math.round(innerHeight - vv.height - (vv.offsetTop || 0)))
    : 0;
  const measured = Math.max(native, vvInset);
  // A stale or wrongly scaled inset must never be able to collapse the shell.
  const ceiling = Math.max(0, Math.round((Number(innerHeight) || 0) * MAX_INSET_RATIO));
  return ceiling > 0 ? Math.min(measured, ceiling) : measured;
}

function isTextField(el) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  const type = String(el.type || "text").toLowerCase();
  return !["button", "checkbox", "radio", "file", "hidden", "range", "color", "submit", "reset"].includes(type);
}

function liftFocusedField() {
  const el = document.activeElement;
  if (!isTextField(el)) return;
  // Bottom composers are part of a resized grid. Calling scrollIntoView() on
  // them scrolls the whole shell and pushes the chat header off-screen.
  if (el.closest(COMPOSER_SEL)) return;
  const phone = el.closest(".mini-phone");
  if (phone) {
    // A WebView may otherwise scroll the document (and the whole mini-phone)
    // while trying to reveal a field. Only move the nearest app scroller.
    let scroller = el.parentElement;
    while (scroller && scroller !== phone) {
      const style = window.getComputedStyle(scroller);
      if (/(auto|scroll|overlay)/.test(style.overflowY)
        && scroller.scrollHeight > scroller.clientHeight + 1) break;
      scroller = scroller.parentElement;
    }
    if (!scroller || scroller === phone) return;
    const fieldBox = el.getBoundingClientRect();
    const scrollBox = scroller.getBoundingClientRect();
    const edge = 12;
    if (fieldBox.top < scrollBox.top + edge) {
      scroller.scrollTop -= (scrollBox.top + edge) - fieldBox.top;
    } else if (fieldBox.bottom > scrollBox.bottom - edge) {
      scroller.scrollTop += fieldBox.bottom - (scrollBox.bottom - edge);
    }
    return;
  }
  const firstLightPane = el.closest(".first-light-v2__content, .first-light-v2__paths, .first-light-v2__summary");
  if (firstLightPane) {
    const fieldBox = el.getBoundingClientRect();
    const scrollBox = firstLightPane.getBoundingClientRect();
    const edge = 16;
    if (fieldBox.top < scrollBox.top + edge) {
      firstLightPane.scrollTop -= (scrollBox.top + edge) - fieldBox.top;
    } else if (fieldBox.bottom > scrollBox.bottom - edge) {
      firstLightPane.scrollTop += fieldBox.bottom - (scrollBox.bottom - edge);
    }
    return;
  }
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {
    /* ignore */
  }
}

/**
 * @returns {() => void} cleanup
 */
export function initViewportFit() {
  const root = document.documentElement;
  if (!root) return () => {};

  const vv = window.visualViewport;
  let raf = 0;
  let nativeIme = Math.max(0, Math.round(Number(window.__yueqiImeBottom) || 0));
  // Once the native bridge has reported an inset, it is authoritative. A
  // stale visualViewport height must not reopen the keyboard layout after the
  // native inset has returned to zero.
  let nativeImeObserved = Object.prototype.hasOwnProperty.call(window, "__yueqiImeBottom");
  let blurTimer = 0;
  let settleTimer = 0;

  function resetOuterScroll() {
    try {
      window.scrollTo?.(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelector(".small-phone-mode")?.scrollTo?.(0, 0);
    } catch {
      /* ignore scroll restoration failures */
    }
  }

  function scheduleSettledApply() {
    schedule();
    if (settleTimer) window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settleTimer = 0;
      schedule();
    }, 360);
  }

  function apply() {
    raf = 0;
    const inset = measureKeyboardInset({
      innerHeight: window.innerHeight,
      visualViewport: nativeImeObserved ? null : vv,
      nativeIme,
    });
    const wasKeyboardOpen = root.classList.contains("is-keyboard-open");
    if (inset > 0) {
      root.style.setProperty("--vv-offset-bottom", `${inset}px`);
    } else {
      root.style.removeProperty("--vv-offset-bottom");
    }
    const keyboardOpen = inset >= KEYBOARD_OPEN_PX;
    root.classList.toggle("is-keyboard-open", keyboardOpen);
    if (wasKeyboardOpen && !keyboardOpen) {
      // Wait one frame for the WebView to finish its IME resize before
      // restoring the page origin. Do it twice for OEMs that animate late.
      resetOuterScroll();
      window.requestAnimationFrame(resetOuterScroll);
    }
    if (keyboardOpen) {
      const shell = document.querySelector(".app-shell, .mini-phone");
      if (shell?.scrollTop) shell.scrollTop = 0;
      liftFocusedField();
    }
  }

  function schedule() {
    if (raf) return;
    raf = window.requestAnimationFrame(apply);
  }

  function onIme(event) {
    const bottom = event?.detail?.bottom;
    nativeImeObserved = true;
    nativeIme = Math.max(0, Math.round(Number(bottom) || 0));
    window.__yueqiImeBottom = nativeIme;
    scheduleSettledApply();
  }

  function onFocusIn(event) {
    if (!isTextField(event.target)) return;
    if (blurTimer) {
      window.clearTimeout(blurTimer);
      blurTimer = 0;
    }
    scheduleSettledApply();
    window.setTimeout(liftFocusedField, 80);
  }

  function onFocusOut() {
    if (blurTimer) window.clearTimeout(blurTimer);
    blurTimer = window.setTimeout(() => {
      blurTimer = 0;
      if (isTextField(document.activeElement)) return;
      // Focus can be cleared before an OEM sends its final zero inset.
      nativeIme = 0;
      window.__yueqiImeBottom = 0;
      scheduleSettledApply();
    }, 120);
  }

  function onVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    nativeIme = 0;
    window.__yueqiImeBottom = 0;
    scheduleSettledApply();
  }

  vv?.addEventListener("resize", schedule);
  vv?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  window.addEventListener("yueqi:ime", onIme);
  document.addEventListener("visibilitychange", onVisibilityChange);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  apply();

  return () => {
    if (raf) window.cancelAnimationFrame(raf);
    if (blurTimer) window.clearTimeout(blurTimer);
    if (settleTimer) window.clearTimeout(settleTimer);
    vv?.removeEventListener("resize", schedule);
    vv?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    window.removeEventListener("yueqi:ime", onIme);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("focusin", onFocusIn);
    document.removeEventListener("focusout", onFocusOut);
    root.classList.remove("is-keyboard-open");
    root.style.removeProperty("--vv-offset-bottom");
  };
}
