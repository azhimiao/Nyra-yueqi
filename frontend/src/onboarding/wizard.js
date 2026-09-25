import { applyI18n, setLocale, getLocale, hasLocaleChosen, t } from "../i18n/index.js";
import { installUiLeakObserver } from "../i18n/leak-guard.js";
import {
  isAuthCredentialReady,
  isEmailAddress,
  isPhoneNumber,
} from "../auth/form-credentials.js";
import { ensureLocalOfflineSession } from "../account/product-access.js";
import {
  ACCOUNT_MODE_OFFLINE,
  APP_MODE_KEY,
  hasOnboardingDone,
  markOnboardingDone,
  resetOnboarding,
} from "./prefs.js";
import { resolveDefaultAppMode } from "./app-mode.js";

export const ONBOARD_STEPS = Object.freeze(["language", "ui"]);

export function onboardStepIndex(step) {
  const index = ONBOARD_STEPS.indexOf(step);
  return index < 0 ? 0 : index;
}

export function onboardProgressLabel(step) {
  return `${onboardStepIndex(step) + 1}/${ONBOARD_STEPS.length}`;
}

export function isOnboardAuthReady(form = {}) {
  return isAuthCredentialReady(form);
}

export function onboardAuthFieldErrors(form = {}) {
  const identifierValid = form.authType === "phone"
    ? isPhoneNumber(form.phone)
    : isEmailAddress(form.email);
  const pass = String(form.password || "");
  return {
    identifier: identifierValid
      ? ""
      : form.authType === "phone"
        ? "onboard.authInvalidPhone"
        : "onboard.authInvalidEmail",
    password: pass.length >= 6 ? "" : "onboard.authInvalidPassword",
  };
}

function bindTap(node, handler) {
  if (!node) return;
  let suppressClickUntil = 0;
  const fire = (event) => {
    if (event?.type === "click" && Date.now() < suppressClickUntil) return;
    if (event?.type === "pointerup") {
      suppressClickUntil = Date.now() + 450;
      event.preventDefault?.();
    }
    handler(event);
  };
  node.addEventListener("pointerup", fire, { passive: false });
  node.addEventListener("click", fire);
}

export function wireOnboardingWizard({ onComplete, onLocaleChange, setAppMode } = {}) {
  const gate = document.querySelector("[data-onboard-gate]");
  if (!gate) return { refreshAccountPanels: () => {} };
  installUiLeakObserver(gate);

  let step = "language";
  let pendingUiMode = resolveDefaultAppMode();
  let busy = false;

  function showGate(open) {
    gate.hidden = !open;
    gate.setAttribute("aria-hidden", open ? "false" : "true");
    gate.classList.toggle("is-open", open);
    document.documentElement.classList.toggle("onboarding-open", open);
    document.querySelectorAll(".app-shell, [data-small-phone-root]").forEach((node) => {
      node.toggleAttribute("inert", open);
    });
  }

  function revealReadyShell() {
    requestAnimationFrame(() => document.documentElement.classList.add("app-boot-ready"));
  }

  function setBusy(next) {
    busy = Boolean(next);
    gate.setAttribute("aria-busy", busy ? "true" : "false");
    gate.querySelectorAll("button").forEach((node) => {
      if (node.matches("[data-onboard-back]")) node.disabled = busy;
      else node.disabled = busy;
    });
    if (!busy) syncChoiceUi();
  }

  function syncChoiceUi() {
    gate.querySelectorAll("[data-set-locale]").forEach((node) => {
      const active = hasLocaleChosen() && node.dataset.setLocale === getLocale();
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    gate.querySelectorAll("[data-onboard-ui]").forEach((node) => {
      const active = node.dataset.onboardUi === pendingUiMode;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    gate.querySelectorAll("[data-onboard-app-project]").forEach((node) => {
      node.hidden = pendingUiMode !== "app";
    });
    syncChrome();
  }

  function syncChrome() {
    const progressLabel = gate.querySelector("[data-onboard-progress-label]");
    if (progressLabel) progressLabel.textContent = onboardProgressLabel(step);
    const dots = gate.querySelector("[data-onboard-progress-dots]");
    if (dots) {
      dots.replaceChildren();
      ONBOARD_STEPS.forEach((id, index) => {
        const dot = document.createElement("span");
        dot.className = `first-run-dot${index === onboardStepIndex(step) ? " is-current" : ""}${index < onboardStepIndex(step) ? " is-done" : ""}`;
        dot.setAttribute("data-onboard-dot", id);
        dots.append(dot);
      });
    }
    const languageNext = gate.querySelector("[data-onboard-language-next]");
    if (languageNext) languageNext.disabled = busy || !hasLocaleChosen();
  }

  function setStep(next) {
    step = next === "ui" ? "ui" : "language";
    gate.dataset.onboardCurrentStep = step;
    gate.querySelectorAll("[data-onboard-step]").forEach((panel) => {
      const active = panel.dataset.onboardStep === step;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    const back = gate.querySelector("[data-onboard-back]");
    if (back) back.hidden = step === "language";
    const scroll = gate.querySelector("[data-onboard-step].is-active .first-run-main")
      || gate.querySelector("[data-onboard-card]");
    scroll?.scrollTo?.({ top: 0, behavior: "instant" });
    applyI18n(gate);
    syncChoiceUi();
  }

  function finish() {
    ensureLocalOfflineSession();
    markOnboardingDone({
      uiModeChosen: true,
      accountMode: ACCOUNT_MODE_OFFLINE,
    });
    const mode = pendingUiMode === "phone" ? "phone" : "app";
    if (typeof setAppMode === "function") setAppMode(mode, { persist: true });
    else {
      window.localStorage?.setItem(APP_MODE_KEY, mode);
      window.localStorage?.setItem("yueqi.app.mode.chosen", "1");
      document.body.dataset.appMode = mode;
    }
    showGate(false);
    revealReadyShell();
    refreshAccountPanels();
    onComplete?.({
      accountMode: ACCOUNT_MODE_OFFLINE,
      uiMode: mode,
      locale: getLocale(),
    });
  }

  function refreshAccountPanels() {
    document.querySelectorAll("[data-account-login-body], [data-auth-guest-only]").forEach((node) => {
      node.hidden = true;
    });
    document.querySelectorAll("[data-auth-signed-in]").forEach((node) => {
      node.hidden = true;
    });
  }

  gate.querySelectorAll("[data-set-locale]").forEach((button) => bindTap(button, () => {
    const next = setLocale(button.dataset.setLocale);
    onLocaleChange?.(next);
    applyI18n(gate);
    syncChoiceUi();
  }));
  bindTap(gate.querySelector("[data-onboard-language-next]"), () => {
    if (!hasLocaleChosen()) {
      syncChrome();
      return;
    }
    setStep("ui");
  });

  gate.querySelectorAll("[data-onboard-ui]").forEach((button) => bindTap(button, () => {
    pendingUiMode = button.dataset.onboardUi === "phone" ? "phone" : "app";
    syncChoiceUi();
  }));
  bindTap(gate.querySelector("[data-onboard-enter]"), finish);
  bindTap(gate.querySelector("[data-onboard-back]"), () => {
    if (step === "ui") setStep("language");
  });

  window.addEventListener("yueqi:locale-changed", () => {
    applyI18n(gate);
    syncChoiceUi();
  });

  function initialStep() {
    if (!hasLocaleChosen()) return "language";
    return "ui";
  }

  function reopenWizard({ forceLanguage = true, fullReset = false } = {}) {
    resetOnboarding(fullReset ? { signOut: true, forgetLocale: true } : {});
    if (fullReset) {
      window.dispatchEvent(new CustomEvent("yueqi:onboarding-full-reset"));
    }
    pendingUiMode = resolveDefaultAppMode();
    showGate(true);
    setStep(forceLanguage ? "language" : initialStep());
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest("[data-reset-onboarding]")
      : null;
    if (!trigger) return;
    if (!window.confirm(t("onboard.resetConfirm"))) return;
    reopenWizard({ fullReset: true });
  });

  if (!hasOnboardingDone()) {
    pendingUiMode = resolveDefaultAppMode();
    showGate(true);
    setStep(initialStep());
    document.documentElement.classList.remove("app-boot-ready");
    revealReadyShell();
  } else {
    showGate(false);
    refreshAccountPanels();
    revealReadyShell();
  }

  ensureLocalOfflineSession();
  return { refreshAccountPanels, isOpen: () => !gate.hidden, reopenWizard };
}
