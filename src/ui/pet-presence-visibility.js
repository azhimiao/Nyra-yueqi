/**
 * In-app orb vs Android system overlay.
 *
 * The system overlay is the leave-app layer. While Yueqi is on screen, the
 * in-app orb is the pet the user must see when they turned it on. Hiding the
 * orb just because overlay *claims* to be running leaves a blank screen when
 * the window is still attaching, or its WebView failed to load sprites.
 */

export function isAppShellVisible(doc = globalThis.document) {
  return !doc || doc.visibilityState !== "hidden";
}

export function shouldHideInAppFloat({
  wantOn = false,
  overlayRunning = false,
  appVisible = true,
} = {}) {
  if (!wantOn) return true;
  return Boolean(overlayRunning) && !appVisible;
}
