import { applyI18n, setLocale, getLocale, hasLocaleChosen, t } from "../i18n/index.js";
import { installUiLeakObserver } from "../i18n/leak-guard.js";
import { formatUserError } from "./errors.js";
import { enhancePhoneCodeFields } from "../auth/phone-code-field.js";
import {
  loginAccount,
  registerAccount,
  sendRegisterCode,
  getServiceBase,
} from "../auth/client.js";
import {
  isAuthCredentialReady,
  isEmailAddress,
  isPhoneNumber,
} from "../auth/form-credentials.js";
import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import {
  MODEL_SOURCE_BYOK,
  readProductAccess,
} from "../account/product-access.js";
import {
  ACCOUNT_MODE_OFFLINE,
  ACCOUNT_MODE_ONLINE,
  APP_MODE_KEY,
  hasOnboardingDone,
  markOnboardingDone,
  resetOnboarding,
} from "./prefs.js";
import { resolveDefaultAppMode } from "./app-mode.js";

export const ONBOARD_STEPS = Object.freeze(["language", "account", "ui"]);

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

/**
 * First-run contract:
 * language → account (login/register/offline) → app|phone.
 * Model source is chosen only when the user first needs AI.
 * Desk pet look is not a character choice — change it later in the pet library.
 * Every screen uses explicit selection plus one bottom primary action.
 */
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
  let pendingAuthMode = "login";
  let pendingAuthType = "email";
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
    gate.querySelectorAll("button, input, select").forEach((node) => {
      if (node.matches("[data-onboard-back]")) node.disabled = busy;
      else if (node.tagName === "BUTTON") node.disabled = busy;
      else node.readOnly = busy;
    });
    if (!busy) syncChrome();
  }

  function syncChoiceUi() {
    gate.querySelectorAll("[data-set-locale]").forEach((node) => {
      const active = hasLocaleChosen() && node.dataset.setLocale === getLocale();
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    gate.querySelectorAll("[data-onboard-auth-mode]").forEach((node) => {
      const active = node.dataset.onboardAuthMode === pendingAuthMode;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    gate.querySelectorAll("[data-onboard-auth-type]").forEach((node) => {
      const active = node.dataset.onboardAuthType === pendingAuthType;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    gate.querySelectorAll("[data-onboard-email-only]").forEach((node) => {
      node.hidden = pendingAuthType !== "email";
    });
    gate.querySelectorAll("[data-onboard-phone-only]").forEach((node) => {
      node.hidden = pendingAuthType !== "phone";
    });
    gate.querySelectorAll("[data-onboard-email-register-only]").forEach((node) => {
      node.hidden = pendingAuthMode !== "register" || pendingAuthType !== "email";
    });
    gate.querySelectorAll("[data-onboard-register-only]").forEach((node) => {
      node.hidden = pendingAuthMode !== "register";
    });
    gate.querySelectorAll("[data-onboard-ui]").forEach((node) => {
      const active = node.dataset.onboardUi === pendingUiMode;
      node.classList.toggle("is-active", active);
      node.setAttribute("aria-pressed", active ? "true" : "false");
    });
    gate.querySelectorAll("[data-onboard-app-project]").forEach((node) => {
      node.hidden = pendingUiMode !== "app";
    });
    const authSubmit = gate.querySelector("[data-onboard-auth-submit]");
    if (authSubmit) authSubmit.textContent = t(pendingAuthMode === "register" ? "onboard.registerContinue" : "onboard.loginContinue");
    const accountTitle = gate.querySelector("[data-onboard-account-title]");
    if (accountTitle) {
      const titleKey = pendingAuthMode === "register" ? "onboard.accountTitleRegister" : "onboard.accountTitle";
      accountTitle.dataset.i18n = titleKey;
      accountTitle.textContent = t(titleKey);
    }
    const password = gate.querySelector("[data-onboard-password]");
    if (password) password.autocomplete = pendingAuthMode === "register" ? "new-password" : "current-password";
    syncChrome();
  }

  function setFieldError(kind, key) {
    const node = gate.querySelector(`[data-onboard-${kind}-error]`);
    if (!node) return;
    if (key) {
      node.hidden = false;
      node.textContent = t(key);
      node.dataset.i18nStatusKey = key;
    } else {
      node.hidden = true;
      node.textContent = "";
      delete node.dataset.i18nStatusKey;
    }
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
    const authSubmit = gate.querySelector("[data-onboard-auth-submit]");
    if (authSubmit) {
      const blockedKey = authBlockedReasonKey(readOnboardAuth());
      authSubmit.disabled = busy || Boolean(blockedKey);
      setAuthHint(blockedKey);
    }
  }

  function authBlockedReasonKey(form) {
    if (!isOnboardAuthReady(form)) return "onboard.authNeedFields";
    if (pendingAuthMode !== "register") return "";
    if (pendingAuthType === "email" && !/^\d{6}$/.test(form.code)) return "onboard.authHintNeedCode";
    if (!form.legalConsent) return "onboard.authNeedLegalConsent";
    return "";
  }

  function setAuthHint(key) {
    const node = gate.querySelector("[data-onboard-auth-hint]");
    if (!node) return;
    if (key) {
      node.hidden = false;
      node.textContent = t(key);
      node.dataset.i18nStatusKey = key;
    } else {
      node.hidden = true;
      node.textContent = "";
      delete node.dataset.i18nStatusKey;
    }
  }

  function setStep(next) {
    step = next;
    gate.dataset.onboardCurrentStep = next;
    gate.querySelectorAll("[data-onboard-step]").forEach((panel) => {
      const active = panel.dataset.onboardStep === next;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    const back = gate.querySelector("[data-onboard-back]");
    if (back) back.hidden = next === "language";
    const scroll = gate.querySelector("[data-onboard-step].is-active .first-run-main")
      || gate.querySelector("[data-onboard-card]");
    scroll?.scrollTo?.({ top: 0, behavior: "instant" });
    applyI18n(gate);
    syncChoiceUi();
  }

  function setAuthStatus(text, i18nKey = "", { error = false } = {}) {
    const node = gate.querySelector("[data-onboard-auth-status]");
    if (!node) return;
    node.textContent = text;
    if (i18nKey) node.dataset.i18nStatusKey = i18nKey;
    else delete node.dataset.i18nStatusKey;
    const errorKey = /auth(Need|Invalid|Failed|Wrong|Exists|Device|Otp|LoginRate|Legal)/.test(i18nKey);
    node.classList.toggle("is-error", Boolean(text) && (error || errorKey));
  }

  function readOnboardAuth() {
    return {
      authType: pendingAuthType,
      email: String(gate.querySelector("[data-onboard-email]")?.value || "").trim(),
      countryCode: String(gate.querySelector("[data-onboard-country-code]")?.value || "+86"),
      phone: String(gate.querySelector("[data-onboard-phone]")?.value || "").trim(),
      code: String(gate.querySelector("[data-onboard-code]")?.value || "").trim(),
      invitationCode: String(gate.querySelector("[data-onboard-invitation-code]")?.value || "").trim(),
      password: String(gate.querySelector("[data-onboard-password]")?.value || ""),
      legalConsent: gate.querySelector("[data-onboard-auth-legal-consent]")?.checked === true,
    };
  }

  function saveAuthSession(data, identifier) {
    const access = data?.user?.productAccess || {};
    const state = {
      ...readLocalObject(LOCAL_KEYS.ecosystemKey, {}),
      loggedIn: true,
      authMode: "online",
      username: data?.user?.email || data?.user?.phone || data?.user?.username || identifier || "月栖用户",
      token: data?.token || "",
      serviceBase: getServiceBase(),
      cloudSave: false,
      modelSource: access.modelSource || access.mode || MODEL_SOURCE_BYOK,
      billingBalance: Math.max(0, Number(access.credits) || 0),
    };
    delete state.productMode;
    delete state.subscriptionStatus;
    delete state.credits;
    writeLocalObject(LOCAL_KEYS.ecosystemKey, state);
    return state;
  }

  async function submitOnboardAuth() {
    const form = readOnboardAuth();
    const errors = onboardAuthFieldErrors(form);
    setFieldError("identifier", errors.identifier);
    setFieldError("phone", form.authType === "phone" ? errors.identifier : "");
    setFieldError("password", errors.password);
    if (errors.identifier || errors.password) {
      setAuthStatus(t("onboard.authNeedFields"), "onboard.authNeedFields");
      return false;
    }
    setFieldError("identifier", "");
    setFieldError("phone", "");
    setFieldError("password", "");
    const registering = pendingAuthMode === "register";
    if (registering && !form.legalConsent) {
      setAuthStatus(t("onboard.authNeedLegalConsent"), "onboard.authNeedLegalConsent");
      return false;
    }
    setBusy(true);
    setAuthStatus(t(registering ? "onboard.authRegistering" : "onboard.authLoggingIn"));
    try {
      const data = registering
        ? await registerAccount(form)
        : await loginAccount(form);
      saveAuthSession(data, form.authType === "phone" ? `${form.countryCode}${form.phone}` : form.email);
      setAuthStatus(t(registering ? "onboard.authRegistered" : "onboard.authLoggedIn"));
      setStep("ui");
      return true;
    } catch (error) {
      setAuthStatus(formatUserError(error, { fallbackKey: "onboard.authFailed" }), "", { error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    const access = readProductAccess();
    const offline = access.authMode === "offline";
    if (!access.loggedIn && !offline) {
      setStep("account");
      return;
    }
    markOnboardingDone({
      uiModeChosen: true,
      accountMode: offline ? ACCOUNT_MODE_OFFLINE : ACCOUNT_MODE_ONLINE,
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
      accountMode: offline ? ACCOUNT_MODE_OFFLINE : ACCOUNT_MODE_ONLINE,
      uiMode: mode,
      locale: getLocale(),
    });
  }

  function refreshAccountPanels() {
    const loggedIn = Boolean(readLocalObject(LOCAL_KEYS.ecosystemKey, {}).loggedIn);
    document.querySelectorAll("[data-account-login-body], [data-auth-guest-only]").forEach((node) => {
      node.hidden = loggedIn;
    });
    document.querySelectorAll("[data-auth-signed-in]").forEach((node) => {
      node.hidden = !loggedIn;
    });
    document.querySelectorAll("[data-auth-form]").forEach((node) => {
      node.classList.toggle("is-signed-in", loggedIn);
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
    setStep("account");
  });

  gate.querySelectorAll("[data-onboard-auth-mode]").forEach((button) => bindTap(button, () => {
    pendingAuthMode = button.dataset.onboardAuthMode === "register" ? "register" : "login";
    syncChoiceUi();
  }));
  gate.querySelectorAll("[data-onboard-auth-type]").forEach((button) => bindTap(button, () => {
    pendingAuthType = button.dataset.onboardAuthType === "phone" ? "phone" : "email";
    setFieldError("identifier", "");
    setFieldError("phone", "");
    setAuthStatus("");
    syncChoiceUi();
  }));
  bindTap(gate.querySelector("[data-onboard-send-code]"), () => {
    const email = readOnboardAuth().email;
    if (!email) {
      setAuthStatus(t("onboard.authNeedEmail"));
      return;
    }
    setBusy(true);
    setAuthStatus(t("onboard.authSendingCode"));
    sendRegisterCode(email)
      .then(() => setAuthStatus(t("onboard.authCodeSent")))
      .catch((error) => setAuthStatus(formatUserError(error, { fallbackKey: "onboard.authFailed" }), "", { error: true }))
      .finally(() => setBusy(false));
  });
  bindTap(gate.querySelector("[data-onboard-auth-submit]"), () => { void submitOnboardAuth(); });
  gate.querySelectorAll("[data-onboard-email], [data-onboard-phone], [data-onboard-code], [data-onboard-password]").forEach((input) => {
    input.addEventListener("input", () => {
      const form = readOnboardAuth();
      if (input.hasAttribute("data-onboard-email") && isEmailAddress(form.email)) setFieldError("identifier", "");
      if (input.hasAttribute("data-onboard-phone") && isPhoneNumber(form.phone)) setFieldError("phone", "");
      if (input.hasAttribute("data-onboard-password") && form.password.length >= 6) setFieldError("password", "");
      syncChrome();
    });
  });
  gate.querySelector("[data-onboard-auth-legal-consent]")?.addEventListener("change", syncChrome);

  gate.querySelectorAll("[data-onboard-ui]").forEach((button) => bindTap(button, () => {
    pendingUiMode = button.dataset.onboardUi === "phone" ? "phone" : "app";
    syncChoiceUi();
  }));
  bindTap(gate.querySelector("[data-onboard-enter]"), finish);

  bindTap(gate.querySelector("[data-onboard-back]"), () => {
    if (step === "ui") setStep("account");
    else if (step === "account") setStep("language");
  });

  bindTap(gate.querySelector("[data-onboard-toggle-password]"), () => {
    const input = gate.querySelector("[data-onboard-password]");
    if (!(input instanceof HTMLInputElement)) return;
    const show = input.type === "password";
    const nextType = show ? "text" : "password";
    // WebView sometimes keeps masked glyphs unless value is refreshed after type flip.
    const value = input.value;
    input.type = nextType;
    input.setAttribute("type", nextType);
    input.style.webkitTextSecurity = show ? "none" : "";
    if (input.value !== value) input.value = value;
    else {
      input.value = "";
      input.value = value;
    }
    const button = gate.querySelector("[data-onboard-toggle-password]");
    if (button) {
      button.textContent = t(show ? "onboard.hidePassword" : "onboard.showPassword");
      button.setAttribute("aria-pressed", show ? "true" : "false");
    }
  });

  window.addEventListener("yueqi:locale-changed", () => {
    const node = gate.querySelector("[data-onboard-auth-status]");
    const key = node?.dataset?.i18nStatusKey;
    if (key) node.textContent = t(key);
    applyI18n(gate);
    syncChoiceUi();
  });

  function initialStep() {
    if (!hasLocaleChosen()) return "language";
    const access = readProductAccess();
    if (!access.loggedIn && access.authMode !== "offline") return "account";
    return "ui";
  }

  function clearAuthForm() {
    gate.querySelectorAll("[data-onboard-email], [data-onboard-phone], [data-onboard-code], [data-onboard-invitation-code], [data-onboard-password]").forEach((input) => {
      if (input instanceof HTMLInputElement) input.value = "";
    });
    const legalConsent = gate.querySelector("[data-onboard-auth-legal-consent]");
    if (legalConsent instanceof HTMLInputElement) legalConsent.checked = false;
    pendingAuthMode = "login";
    pendingAuthType = "email";
    setAuthStatus("");
    setFieldError("identifier", "");
    setFieldError("phone", "");
    setFieldError("password", "");
  }

  /** `fullReset` signs the device out and forgets language/shell picks. */
  function reopenWizard({ forceLanguage = true, fullReset = false } = {}) {
    resetOnboarding(fullReset ? { signOut: true, forgetLocale: true } : {});
    if (fullReset) {
      clearAuthForm();
      window.dispatchEvent(new CustomEvent("yueqi:onboarding-full-reset"));
    }
    pendingUiMode = resolveDefaultAppMode();
    showGate(true);
    setStep(forceLanguage ? "language" : initialStep());
  }

  // Delegated so entries rendered later (phone shell settings) also work.
  document.addEventListener("click", (event) => {
    const trigger = event.target instanceof Element
      ? event.target.closest("[data-reset-onboarding]")
      : null;
    if (!trigger) return;
    if (!window.confirm(t("onboard.resetConfirm"))) return;
    reopenWizard({ fullReset: true });
  });

  window.addEventListener("yueqi:auth-required", () => reopenWizard({ forceLanguage: false }));

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

  enhancePhoneCodeFields(gate);
  return { refreshAccountPanels, isOpen: () => !gate.hidden, reopenWizard };
}
