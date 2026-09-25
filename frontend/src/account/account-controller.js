import {
  APP_VERSION,
  RELEASE_CHANNEL,
  UPDATE_CHANNEL,
} from "../constants.js";
import {
  formatLocalTime,
  modelServiceUrl,
  readLocalObject,
  safeFetch,
  writeLocalObject,
} from "../lib/utils.js";
import {
  getServiceBase,
  loginAccount,
  logoutAccountSession,
  registerAccount,
  sendRegisterCode,
  selectProductMode,
} from "../auth/client.js";
import {
  isAuthCredentialReady,
  normalizeAuthType,
} from "../auth/form-credentials.js";
import { formatUserError } from "../onboarding/errors.js";
import {
  MODEL_SOURCE_BYOK,
  MODEL_SOURCE_HOSTED,
  normalizeHostedTier,
  writeProductAccess,
} from "./product-access.js";
import {
  cancelAutoSync,
  fetchSyncStatus,
  scheduleAutoSync,
} from "../sync/client.js";
import { getLocale } from "../i18n/index.js";
import { resolveUpdatePolicy } from "../update/update-policy.mjs";
import { showUpdateDialog } from "../update/update-dialog.js";
import { UPDATE_PUBLIC_KEY_PEM } from "../update/update-public-key.mjs";
import { CUSTOM_CONTACT } from "../commerce/custom-contact.js";
import { verifySignedUpdateManifest } from "../update/update-signature.mjs";

/**
 * Account/update/cloud controller for the Me panel.
 * Keeps service orchestration out of the application bootstrap.
 */
export function createAccountController(options = {}) {
  const {
    localFallback,
    loginStateNodes = [],
    loginToggleButtons = [],
    cloudStateNodes = [],
    updateStateNodes = [],
    openUpdateButton = null,
    updateResult = null,
    cloudResult = null,
    scheduleCapabilityRefresh = () => {},
    restoreCloudBackup = async () => {},
    uploadCloudBackup = async () => {},
    translate = (key) => key,
  } = options;

  const releaseChannel = RELEASE_CHANNEL;
  let authFormMode = "login";
  let authFormType = "email";

  function syncAuthLegalConsent() {
    const submit = document.querySelector("[data-auth-submit]");
    if (!submit) return;
    const form = readAuthForm();
    const accepted = document.querySelector("[data-auth-legal-consent]")?.checked === true;
    submit.disabled = !isAuthCredentialReady(form)
      || (authFormMode === "register" && (
        !accepted
        || (authFormType === "email" && !/^\d{6}$/.test(form.code))
      ));
  }

  function setAuthFormType(type) {
    authFormType = normalizeAuthType(type);
    document.querySelectorAll("[data-auth-type]").forEach((button) => {
      const active = button.dataset.authType === authFormType;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.querySelectorAll("[data-auth-email-only]").forEach((node) => {
      node.hidden = authFormType !== "email";
    });
    document.querySelectorAll("[data-auth-phone-only]").forEach((node) => {
      node.hidden = authFormType !== "phone";
    });
    document.querySelectorAll("[data-auth-email-register-only]").forEach((node) => {
      node.hidden = authFormMode !== "register" || authFormType !== "email";
    });
    syncAuthLegalConsent();
  }

  function setAuthFormMode(mode) {
    authFormMode = mode === "register" ? "register" : "login";
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.authMode === authFormMode);
    });
    document.querySelectorAll("[data-auth-register-only]").forEach((node) => {
      node.hidden = authFormMode !== "register";
    });
    document.querySelectorAll("[data-auth-email-register-only]").forEach((node) => {
      node.hidden = authFormMode !== "register" || authFormType !== "email";
    });
    const submit = document.querySelector("[data-auth-submit]");
    if (submit) submit.textContent = translate(
      authFormMode === "register" ? "onboard.register" : "onboard.login",
    );
    setAuthFormType(authFormType);
  }

  function getEcosystemState() {
    return {
      loggedIn: false,
      username: "guest",
      token: "",
      serviceBase: getServiceBase(),
      cloudSave: false,
      updateChannel: UPDATE_CHANNEL,
      currentVersion: APP_VERSION,
      latestVersion: "",
      updateAvailable: false,
      updateForced: false,
      lastChecked: "",
      releaseNotes: "",
      releaseUrl: "",
      updateSource: "not_checked",
      updateError: "",
      cloudMessage: "聊天记录、日记和记忆默认只保存在本机；开启后才上传云端。",
      communityMessage: "用户群入口会同步版本公告、世界书模板、插件适配和迁移教程。",
      ...readLocalObject(localFallback.ecosystemKey, {}),
    };
  }

  function saveEcosystemState(state) {
    writeLocalObject(localFallback.ecosystemKey, state);
  }

  function buttonLabel(button) {
    return button.querySelector("[data-login-action-label]")
      || button.querySelector(".me-cell__label")
      || button.querySelector("span:last-of-type");
  }

  function renderEcosystemState(state = getEcosystemState()) {
    const displayName = translate("status.loggedOut");
    const initial = translate("status.avatarInitial");

    document.querySelectorAll("[data-user-name]").forEach((node) => { node.textContent = displayName; });
    document.querySelectorAll("[data-user-avatar-initial]").forEach((node) => { node.textContent = initial; });
    document.querySelectorAll("[data-community-message]").forEach((node) => {
      node.textContent = state.communityMessage || "";
    });

    const serviceBaseInput = document.querySelector("[data-auth-service-base]");
    if (serviceBaseInput && !serviceBaseInput.matches(":focus")) {
      serviceBaseInput.value = state.serviceBase || getServiceBase();
    }
    const emailInput = document.querySelector("[data-auth-email]");
    if (
      emailInput
      && !emailInput.matches(":focus")
      && String(state.username || "").includes("@")
    ) {
      emailInput.value = state.username;
    }

    document.querySelectorAll("[data-auth-logout], [data-auth-submit], [data-auth-mode], [data-auth-guest-only], [data-account-login-body], [data-auth-signed-in]").forEach((node) => {
      node.hidden = true;
    });
    document.querySelectorAll("[data-auth-form]").forEach((node) => {
      node.classList.toggle("is-signed-in", Boolean(state.loggedIn));
    });
    document.querySelectorAll("[data-auth-password], [data-auth-email], [data-auth-phone], [data-auth-country-code]").forEach((input) => {
      input.disabled = Boolean(state.loggedIn);
    });

    const productMode = state.modelSource === MODEL_SOURCE_HOSTED
      || state.productMode === "subscription"
      ? MODEL_SOURCE_HOSTED
      : MODEL_SOURCE_BYOK;
    const hostedTier = normalizeHostedTier(state.hostedTier);
    document.querySelectorAll("[data-product-mode]").forEach((button) => {
      const active = button.dataset.productMode === productMode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.disabled = button.dataset.productMode === MODEL_SOURCE_HOSTED && !state.loggedIn;
    });
    document.querySelectorAll("[data-hosted-tier-group]").forEach((node) => {
      node.hidden = productMode !== MODEL_SOURCE_HOSTED || !state.loggedIn;
    });
    document.querySelectorAll("[data-hosted-tier]").forEach((button) => {
      const active = button.dataset.hostedTier === hostedTier;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    document.querySelectorAll("[data-product-mode='hosted'], [data-hosted-tier-group]").forEach((node) => {
      node.hidden = true;
    });
    document.querySelectorAll("[data-product-access-status]").forEach((node) => {
      node.textContent = translate("onboard.productDeveloperActive");
    });

    loginStateNodes.forEach((node) => {
      node.textContent = translate("status.loggedOut");
    });
    loginToggleButtons.forEach((button) => {
      button.hidden = true;
    });
    cloudStateNodes.forEach((node) => { node.textContent = state.cloudSave ? translate("status.cloudOn") : translate("status.cloudOff"); });
    updateStateNodes.forEach((node) => {
      if (state.updateError) {
        node.textContent = translate("status.updateCheckFailed");
      } else if (state.updateForced && state.latestVersion) {
        node.textContent = translate("status.updateForced", { version: state.latestVersion });
      } else if (state.updateAvailable && state.latestVersion) {
        node.textContent = translate("status.updateFound", { version: state.latestVersion });
      } else {
        node.textContent = translate("status.updateUpToDate");
      }
    });
    if (openUpdateButton) openUpdateButton.hidden = !state.updateAvailable || !state.releaseUrl;
    if (updateResult) {
      if (state.updateError) {
        updateResult.textContent = translate("status.updateCheckFailedDetail", {
          current: state.currentVersion || APP_VERSION,
        });
      } else if (state.updateAvailable && state.latestVersion) {
        updateResult.textContent = translate("status.updateCurrentAvailable", {
          current: state.currentVersion,
          latest: state.latestVersion,
        });
      } else {
        updateResult.textContent = translate("status.updateCurrentLatest", {
          current: state.currentVersion || APP_VERSION,
        });
      }
    }
    if (cloudResult) {
      cloudResult.textContent = state.cloudSave
        ? translate("status.cloudBackupOn", {
          who: state.loggedIn ? state.username : translate("status.signedInShort"),
        })
        : translate("status.cloudBackupOff");
    }
  }

  function setAuthStatus(text, { error = false } = {}) {
    const node = document.querySelector("[data-auth-status]");
    if (!node) return;
    node.textContent = text;
    node.classList.toggle("is-error", error);
  }

  function readAuthForm() {
    return {
      serviceBase: "",
      authType: authFormType,
      email: String(document.querySelector("[data-auth-email]")?.value || "").trim(),
      countryCode: String(document.querySelector("[data-auth-country-code]")?.value || "+86"),
      phone: String(document.querySelector("[data-auth-phone]")?.value || "").trim(),
      code: String(document.querySelector("[data-auth-code]")?.value || "").trim(),
      invitationCode: String(document.querySelector("[data-auth-invitation-code]")?.value || "").trim(),
      password: String(document.querySelector("[data-auth-password]")?.value || ""),
      legalConsent: document.querySelector("[data-auth-legal-consent]")?.checked === true,
    };
  }

  async function applyAuthSession(data, { mode = "login" } = {}) {
    const state = getEcosystemState();
    const form = readAuthForm();
    const username = data?.user?.email
      || data?.user?.phone
      || data?.user?.username
      || (form.authType === "phone" ? `${form.countryCode}${form.phone}` : form.email);
    const access = data?.user?.productAccess || {};
    Object.assign(state, {
      loggedIn: true,
      authMode: "online",
      username: username || translate("status.defaultUser"),
      token: data?.token || "",
      serviceBase: getServiceBase(),
      modelSource: access.modelSource || access.mode || state.modelSource || MODEL_SOURCE_BYOK,
      hostedTier: normalizeHostedTier(access.hostedTier || state.hostedTier),
      billingBalance: Math.max(0, Number(access.credits ?? state.billingBalance) || 0),
      cloudMessage: mode === "register"
        ? translate("onboard.authRegisteredCloud")
        : translate("onboard.authLoggedInCloud"),
    });
    saveEcosystemState(state);
    writeProductAccess({
      modelSource: state.modelSource,
      hostedTier: state.hostedTier,
      authMode: "online",
      credits: state.billingBalance,
    });
    renderEcosystemState(state);
    setAuthStatus(state.cloudMessage);
    document.querySelectorAll("[data-auth-password]").forEach((input) => { input.value = ""; });
    scheduleCapabilityRefresh();
    window.dispatchEvent(new CustomEvent("yueqi:auth-changed", { detail: { loggedIn: true } }));
    try {
      const status = await fetchSyncStatus(state.token);
      if (status.hasPayload && window.confirm(translate("alerts.cloudRestore"))) await restoreCloudBackup(state);
    } catch {
      // Account login remains valid when sync status is unavailable.
    }
  }

  async function logoutAccount() {
    const state = getEcosystemState();
    await logoutAccountSession(state.token).catch(() => {});
    Object.assign(state, {
      loggedIn: false,
      authMode: "signed_out",
      username: "guest",
      token: "",
      cloudSave: false,
      cloudMessage: translate("onboard.authLoggedOutLocal"),
    });
    cancelAutoSync();
    saveEcosystemState(state);
    renderEcosystemState(state);
    setAuthStatus(translate("onboard.authLoggedOut"));
    scheduleCapabilityRefresh();
    window.dispatchEvent(new CustomEvent("yueqi:auth-required"));
  }

  async function submitAuth() {
    setAuthStatus(translate("onboard.offlineSettingsLead"));
  }

  async function sendAuthRegisterCode() {
    if (authFormType !== "email") return;
    const email = readAuthForm().email;
    if (!email) {
      setAuthStatus(translate("onboard.authNeedEmail"));
      return;
    }
    setAuthStatus(translate("onboard.authSendingCode"));
    try {
      await sendRegisterCode(email);
      setAuthStatus(translate("onboard.authCodeSent"));
    } catch (error) {
      setAuthStatus(formatUserError(error, { fallbackKey: "onboard.authFailed" }), { error: true });
    }
  }

  async function toggleLogin() {}

  async function changeProductMode() {
    const state = getEcosystemState();
    state.modelSource = MODEL_SOURCE_BYOK;
    saveEcosystemState(state);
    writeProductAccess({ modelSource: MODEL_SOURCE_BYOK });
    renderEcosystemState(state);
    setAuthStatus(translate("onboard.productDeveloperActive"));
    return true;
  }

  async function changeHostedTier() {
    return changeProductMode();
  }

  async function fetchUpdateManifest() {
    const envelope = await safeFetch(modelServiceUrl("/updates/latest"), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return verifySignedUpdateManifest(envelope, {
      publicKeyPem: UPDATE_PUBLIC_KEY_PEM,
      allowedDownloadHosts: ["localhost"],
    });
  }

  async function checkForUpdate({ prompt = true, forcePrompt = false } = {}) {
    const state = getEcosystemState();
    state.currentVersion = APP_VERSION;
    updateStateNodes.forEach((node) => {
      node.textContent = translate("status.updateChecking");
    });
    let policy;
    try {
      const manifest = await fetchUpdateManifest();
      policy = resolveUpdatePolicy(APP_VERSION, manifest, getLocale());
      if (policy.kind === "invalid") throw new Error("invalid_update_manifest");
    } catch (error) {
      Object.assign(state, {
        latestVersion: "",
        updateAvailable: false,
        updateForced: false,
        lastChecked: new Date().toISOString(),
        releaseNotes: "",
        releaseUrl: releaseChannel.fallbackDownloadUrl,
        updateSource: "unavailable",
        updateError: error?.message || "update_check_failed",
      });
      saveEcosystemState(state);
      renderEcosystemState(state);
      return { kind: "unavailable", error };
    }

    Object.assign(state, {
      latestVersion: policy.latestVersion || APP_VERSION,
      updateAvailable: policy.kind === "optional" || policy.kind === "forced",
      updateForced: policy.kind === "forced",
      lastChecked: new Date().toISOString(),
      releaseNotes: policy.notes || "",
      releaseUrl: policy.downloadUrl || releaseChannel.fallbackDownloadUrl,
      updateSource: "yueqi-manifest",
      updateError: "",
    });
    saveEcosystemState(state);
    renderEcosystemState(state);
    if (prompt) await showUpdateDialog(policy, { force: forcePrompt });
    return policy;
  }

  function openReleasePage() {
    const url = getEcosystemState().releaseUrl;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  function wireUpdateLinks() {
    updateStateNodes.forEach((node) => {
      node.style.cursor = "pointer";
      node.title = "点击查看更新说明或下载";
      node.addEventListener("click", () => {
        checkForUpdate({ prompt: true, forcePrompt: true }).catch(() => openReleasePage());
      });
    });
    updateResult?.addEventListener("dblclick", openReleasePage);
    openUpdateButton?.addEventListener("click", () => {
      checkForUpdate({ prompt: true, forcePrompt: true }).catch(() => openReleasePage());
    });
  }

  function triggerAutoSync() {
    const state = getEcosystemState();
    if (!state.loggedIn || !state.cloudSave || !state.token || state.token.startsWith("local-")) return;
    scheduleAutoSync(async () => {
      try { await uploadCloudBackup(getEcosystemState()); } catch { /* keep local-first */ }
    });
  }

  async function toggleCloudSave() {
    const state = getEcosystemState();
    state.cloudSave = false;
    state.cloudMessage = "开源版数据只在本机，没有云备份。";
    saveEcosystemState(state);
    renderEcosystemState(state);
  }

  async function openCommunityEntry() {
    const state = getEcosystemState();
    try {
      const community = await safeFetch(`${releaseChannel.serviceBase}/community`);
      state.communityMessage = `社群入口：QQ群 ${community.qqGroup || community.qq} / Discord ${community.discord} / 微信 ${community.wechat}`;
    } catch {
      state.communityMessage = `社群入口：QQ群 ${CUSTOM_CONTACT.qqGroup} / Discord ${CUSTOM_CONTACT.discord} / 微信 ${CUSTOM_CONTACT.wechat}`;
    }
    saveEcosystemState(state);
    renderEcosystemState(state);
  }

  return {
    getEcosystemState,
    saveEcosystemState,
    renderEcosystemState,
    logoutAccount,
    submitAuth,
    setAuthFormMode,
    setAuthFormType,
    syncAuthLegalConsent,
    sendAuthRegisterCode,
    changeProductMode,
    changeHostedTier,
    toggleLogin,
    checkForUpdate,
    wireUpdateLinks,
    triggerAutoSync,
    toggleCloudSave,
    openCommunityEntry,
  };
}
