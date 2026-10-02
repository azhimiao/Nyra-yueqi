import { StatusBar, Style } from "@capacitor/status-bar";
import { isNativePlatform } from "./runtime.js";

const LIGHT_SURFACE = "#f5f9fc";
const DARK_SURFACE = "#405269";

/** Mirrors the reveal rule the boot screen uses in index.html. */
function isBootSceneVisible() {
  if (!document.querySelector("[data-boot-screen]")) return false;
  const root = document.documentElement.classList;
  const revealed = root.contains("splash-done")
    && (root.contains("app-boot-ready") || root.contains("immediate-phone-ready"));
  return !revealed;
}

function isDarkSurface() {
  // The cold-start intro is a night scene, so the clock has to invert with it.
  if (isBootSceneVisible()) return true;
  const body = document.body;
  if (!body || body.dataset.appMode !== "phone") return false;
  const phone = document.querySelector(".mini-phone");
  if (!phone) return false;
  const passcodeOpen = Boolean(phone.querySelector('[data-lock-pane="PASSCODE"]:not([hidden])'));
  if (passcodeOpen) return true;
  return phone.dataset.wallpaperTone === "dark";
}

function updateThemeColor(dark) {
  const color = dark ? DARK_SURFACE : LIGHT_SURFACE;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  document.documentElement.style.setProperty("--system-bar-surface", color);
}

export function initSystemBars() {
  if (!isNativePlatform()) return () => {};

  let lastDark = null;
  let scheduled = false;

  const apply = async () => {
    scheduled = false;
    const dark = isDarkSurface();
    updateThemeColor(dark);
    if (lastDark === dark) return;
    lastDark = dark;
    await Promise.allSettled([
      StatusBar.setOverlaysWebView({ overlay: true }),
      StatusBar.setBackgroundColor({ color: "#00000000" }),
      // The enum names the text, not the surface: Style.Dark paints light text
      // and Style.Light paints dark text. A light surface therefore needs
      // Style.Light, or the clock turns white on white.
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }),
    ]);
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { void apply(); });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-app-mode", "data-wallpaper-tone", "data-phone-locked", "hidden", "class"],
  });
  window.addEventListener("yueqi:locale-changed", schedule);
  schedule();

  return () => {
    observer.disconnect();
    window.removeEventListener("yueqi:locale-changed", schedule);
  };
}
