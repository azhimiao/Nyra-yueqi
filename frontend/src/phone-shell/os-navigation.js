/**
 * Phone OS navigation: system Back (Android key / iOS edge / browser history)
 * walks the in-app stack — no fake home-indicator bar.
 */

const HISTORY_KEY = "yueqi-phone-app";

export function createPhoneOsNavigation({
  isInApp,
  onBack,
  onExitToHome,
} = {}) {
  let hasHistoryEntry = false;
  let skipNextPop = false;
  let attached = false;

  function syncHistory() {
    if (isInApp?.() && !hasHistoryEntry) {
      window.history.pushState({ [HISTORY_KEY]: true }, "");
      hasHistoryEntry = true;
      return;
    }
    if (!isInApp?.()) hasHistoryEntry = false;
  }

  function onPopState() {
    if (skipNextPop) {
      skipNextPop = false;
      return;
    }
    if (!hasHistoryEntry) return;
    hasHistoryEntry = false;
    if (typeof onBack === "function") {
      onBack({ source: "history" });
      // Still inside an app after hierarchical back → re-arm the trap.
      queueMicrotask(() => syncHistory());
      return;
    }
    onExitToHome?.({ source: "history" });
  }

  function exitToHome(options = {}) {
    onExitToHome?.(options);
    if (hasHistoryEntry) {
      skipNextPop = true;
      hasHistoryEntry = false;
      window.history.back();
    }
  }

  function attach() {
    if (attached) return;
    attached = true;
    window.addEventListener("popstate", onPopState);
  }

  function detach() {
    if (!attached) return;
    attached = false;
    window.removeEventListener("popstate", onPopState);
  }

  return {
    syncHistory,
    exitToHome,
    attach,
    detach,
  };
}
