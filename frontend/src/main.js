import { initSystemBars } from "./platform/status-bar.js";
import { initViewportFit } from "./platform/viewport-fit.js";
import { applyEarlyLocale, resolveEarlyLocale } from "./i18n/early-locale.js";

// Before any pre-bootstrap paint, so a refresh or cold start keeps the language
// the user picked instead of falling back to the Chinese markup defaults.
// The intro itself starts from `src/splash/start.js`, ahead of this bundle.
applyEarlyLocale();

let fullBootstrapPromise = null;

function getEarlyLocale() {
  return resolveEarlyLocale();
}

function getEarlyBrandName() {
  return getEarlyLocale() === "en" ? "Nyra" : "\u6708\u6816";
}

function mountImmediatePhone() {
  const root = document.querySelector("[data-small-phone-root]");
  if (!root) return false;
  if (root.dataset.immediatePhone === "true") {
    root.hidden = false;
    return true;
  }
  const english = getEarlyLocale() === "en";
  const copy = english
    ? { name: "Nyra", chat: "Chat", diary: "Diary", settings: "Settings", detail: "Your private space" }
    : { name: "\u6708\u6816", chat: "\u804a\u5929", diary: "\u65e5\u8bb0", settings: "\u8bbe\u7f6e", detail: "\u53ea\u5c5e\u4e8e\u4f60\u7684\u7a7a\u95f4" };
  const now = new Date();
  const clock = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  document.documentElement.classList.add("is-compact-shell", "immediate-phone-ready");
  document.body.dataset.appMode = "phone";
  document.body.removeAttribute("data-mobile-companion");
  root.hidden = false;
  root.dataset.immediatePhone = "true";
  root.innerHTML = `<section class="instant-phone" aria-label="${copy.name}"><p class="instant-phone__clock">${clock}</p><p class="instant-phone__date">${now.toLocaleDateString()}</p><section class="instant-phone__card"><strong>${copy.name}</strong><span>${copy.detail}</span></section><nav class="instant-phone__apps" aria-label="${copy.name}"><span class="instant-phone__app"><b>...</b><small>${copy.chat}</small></span><span class="instant-phone__app"><b>+</b><small>${copy.diary}</small></span><span class="instant-phone__app"><b>*</b><small>${copy.settings}</small></span></nav></section>`;
  document.querySelector("[data-onboard-gate]")?.setAttribute("hidden", "");
  window.__yueqiImmediatePhoneActive = true;
  return true;
}

window.__yueqiMountImmediatePhone = mountImmediatePhone;

function launchFullApp() {
  if (fullBootstrapPromise) return fullBootstrapPromise;
  window.__yueqiFullBootstrapState = "loading";
  fullBootstrapPromise = import("./app.js")
    .then(({ bootstrapApp }) => bootstrapApp())
    .then(() => {
      window.__yueqiFullBootstrapState = "ready";
      // Safety net: hide boot screen even if onboarding wiring skipped revealReadyShell.
      document.documentElement.classList.add("app-boot-ready");
    });
  return fullBootstrapPromise;
}

window.addEventListener("yueqi:early-onboarding-complete", (event) => {
  if (event.detail?.uiMode === "phone") mountImmediatePhone();
});


function isDevHost() {
  const host = window.location.hostname;
  // Capacitor serves release WebViews from localhost too. Only Vite's dev
  // transform may clear service workers; native startup must never wait here.
  return import.meta.env.DEV
    && (host === "127.0.0.1" || host === "localhost" || host === "[::1]");
}

async function clearDevServiceWorkers() {
  if (!("serviceWorker" in navigator) || !isDevHost()) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
    if (window.caches?.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    /* ignore */
  }
}

function waitForSplashHold() {
  const scene = document.querySelector("[data-boot-screen]");
  if (!scene) return Promise.resolve();
  const yielded = () => {
    const state = scene.dataset.splashState;
    return state === "ready" || state === "done";
  };
  if (yielded()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      document.removeEventListener("yueqi:splash-done", finish);
      resolve();
    };
    const observer = new MutationObserver(() => {
      if (yielded()) finish();
    });
    observer.observe(scene, { attributes: true });
    document.addEventListener("yueqi:splash-done", finish);
    window.setTimeout(() => {
      if (!scene.dataset.splashState || yielded()) finish();
    }, 900);
    window.setTimeout(finish, 8000);
  });
}

function startApp() {
  initSystemBars();
  initViewportFit();
  // Cache cleanup is a local-development convenience, never a prerequisite
  // for making the application interactive.
  void clearDevServiceWorkers();
  waitForSplashHold()
    .then(() => launchFullApp())
    .catch((error) => {
      const brand = getEarlyBrandName();
      const english = getEarlyLocale() === "en";
      console.error(`${brand} Companion failed to start`, error);
      document.documentElement.classList.add("app-boot-ready");
      const detail = String(error?.message || error || "unknown_error").slice(0, 240);
      const notice = document.createElement("div");
      notice.className = "startup-error";
      notice.setAttribute("role", "alert");
      notice.innerHTML = `
      <strong>${english ? "The app could not finish starting" : "应用暂时没有完成启动"}</strong>
      <span>${english ? "Refresh the page. If this continues, check the local service and permissions." : "请刷新页面；如果问题持续，请检查本地服务与权限。"}</span>
      <code class="startup-error-detail"></code>
      <button type="button">${english ? "Refresh" : "刷新"}</button>
    `;
      const code = notice.querySelector(".startup-error-detail");
      if (code) code.textContent = detail;
      notice.querySelector("button")?.addEventListener("click", () => window.location.reload());
      document.body.prepend(notice);
    });
}

// A native app must start as soon as the DOM is usable. Waiting for `load`
// makes first-run onboarding wait for every image/font/resource to finish.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp, { once: true });
} else {
  startApp();
}
