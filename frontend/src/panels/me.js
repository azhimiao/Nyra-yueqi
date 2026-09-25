/**
 * Me panel: login, update, cloud save/restore, export/import, community.
 * Ordinary users export/import .nyra; legacy JSON/ZIP remain via the same importer.
 */
import { formatUserError } from "../onboarding/errors.js";
import { enhancePhoneCodeFields } from "../auth/phone-code-field.js";
import { messageForPortabilityError } from "../portability/errors.js";

export function wireMePanel(deps) {
  const {
    exportDataButton,
    exportFullBackupButton,
    exportBackupNoMediaButton,
    clearLocalAppEventsButton,
    importDataButton,
    importDataInput,
    cloudRestoreButton,
    loginToggleButtons,
    checkUpdateButtons,
    cloudSaveButtons,
    communityButtons,
    exportLocalPayload,
    exportNyraBackup,
    exportFullBackupZip,
    exportFullBackupZipNoMedia,
    clearLocalAppEvents,
    downloadJson,
    downloadBackupZip,
    downloadNyraArchive,
    importNyraOrLegacyFile,
    t,
    restoreImportPayload,
    restoreFullBackupZip,
    getRestoreHandlers,
    triggerAutoSync,
    refreshIcons,
    getEcosystemState,
    saveEcosystemState,
    renderEcosystemState,
    restoreCloudBackup,
    renderMemoryState,
    toggleLogin,
    submitAuth,
    setAuthFormMode,
    setAuthFormType,
    syncAuthLegalConsent,
    sendAuthRegisterCode,
    changeProductMode,
    changeHostedTier,
    logoutAccount,
    checkForUpdate,
    toggleCloudSave,
    openCommunityEntry,
  } = deps;

  // Primary: export sealed .nyra (data-export-data now means "export world")
  exportDataButton?.addEventListener("click", async () => {
    try {
      if (exportNyraBackup && downloadNyraArchive) {
        const built = await exportNyraBackup({ includeMedia: true });
        downloadNyraArchive(`nyra-backup-${Date.now()}.nyra`, built.bytes);
        return;
      }
      const payload = await exportLocalPayload();
      downloadJson(`yueqi-backup-${Date.now()}.json`, payload);
    } catch (error) {
      window.alert(messageForPortabilityError(error) || formatUserError(error, { fallbackKey: "errors.backupImportFail" }));
    }
  });

  // Developer / diagnostics: legacy full ZIP
  exportFullBackupButton?.addEventListener("click", async () => {
    try {
      const bytes = await exportFullBackupZip();
      downloadBackupZip(`yueqi-full-backup-${Date.now()}.zip`, bytes);
    } catch (error) {
      window.alert(formatUserError(error, { fallbackKey: "errors.backupImportFail" }));
    }
  });

  exportBackupNoMediaButton?.addEventListener("click", async () => {
    try {
      const bytes = await exportFullBackupZipNoMedia?.();
      if (!bytes) return;
      downloadBackupZip(`yueqi-backup-no-media-${Date.now()}.zip`, bytes);
    } catch (error) {
      window.alert(formatUserError(error, { fallbackKey: "errors.backupImportFail" }));
    }
  });

  clearLocalAppEventsButton?.addEventListener("click", () => {
    if (!window.confirm(t("appShell.me.clearEventsConfirm"))) return;
    clearLocalAppEvents?.();
    window.alert(t("appShell.me.clearEventsDone"));
  });

  importDataButton?.addEventListener("click", () => importDataInput?.click());

  importDataInput?.addEventListener("change", async () => {
    const file = importDataInput.files?.[0];
    if (!file) return;
    try {
      if (importNyraOrLegacyFile) {
        await importNyraOrLegacyFile(file);
      } else {
        if (!window.confirm(t("alerts.importOverwrite"))) return;
        const name = (file.name || "").toLowerCase();
        if (name.endsWith(".zip") || file.type === "application/zip") {
          const bytes = new Uint8Array(await file.arrayBuffer());
          await restoreFullBackupZip(bytes, getRestoreHandlers());
        } else {
          const payload = JSON.parse(await file.text());
          await restoreImportPayload(payload, getRestoreHandlers());
        }
      }
      triggerAutoSync();
      refreshIcons();
    } catch (error) {
      if (error?.code === "archive_cancelled") return;
      window.alert(messageForPortabilityError(error) || formatUserError(error, { fallbackKey: "errors.backupImportFail" }));
    }
    importDataInput.value = "";
  });

  cloudRestoreButton?.addEventListener("click", async () => {
    const state = getEcosystemState();
    if (!state.loggedIn) {
      state.cloudMessage = t("appShell.me.loginBeforeCloudRestore");
      saveEcosystemState(state);
      renderEcosystemState(state);
      return;
    }
    try {
      await restoreCloudBackup(state);
      await renderMemoryState();
      refreshIcons();
    } catch (error) {
      state.cloudMessage = messageForPortabilityError(error) || error.message;
      saveEcosystemState(state);
      renderEcosystemState(state);
    }
  });

  loginToggleButtons.forEach((button) => {
    button.addEventListener("click", toggleLogin);
  });

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setAuthFormMode?.(button.dataset.authMode);
    });
  });
  document.querySelectorAll("[data-auth-type]").forEach((button) => {
    button.addEventListener("click", () => {
      setAuthFormType?.(button.dataset.authType);
    });
  });
  document.querySelector("[data-auth-submit]")?.addEventListener("click", () => {
    submitAuth?.();
  });
  document.querySelector("[data-auth-send-code]")?.addEventListener("click", () => {
    sendAuthRegisterCode?.();
  });
  document.querySelector("[data-auth-legal-consent]")?.addEventListener("change", () => {
    syncAuthLegalConsent?.();
  });
  document.querySelectorAll("[data-auth-email], [data-auth-phone], [data-auth-code], [data-auth-password]").forEach((input) => {
    input.addEventListener("input", () => syncAuthLegalConsent?.());
  });
  setAuthFormMode?.("login");
  enhancePhoneCodeFields(document);
  document.querySelector("[data-auth-logout]")?.addEventListener("click", () => {
    logoutAccount?.();
  });
  document.querySelector("[data-auth-password]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitAuth?.();
  });
  document.querySelector("[data-auth-toggle-password]")?.addEventListener("click", () => {
    const input = document.querySelector("[data-auth-password]");
    const btn = document.querySelector("[data-auth-toggle-password]");
    if (!(input instanceof HTMLInputElement) || !btn) return;
    const show = input.type === "password";
    const nextType = show ? "text" : "password";
    const value = input.value;
    input.type = nextType;
    input.setAttribute("type", nextType);
    input.style.webkitTextSecurity = show ? "none" : "";
    btn.setAttribute("aria-pressed", show ? "true" : "false");
    btn.setAttribute("aria-label", t(show ? "appShell.me.hidePassword" : "appShell.me.showPassword"));
    input.value = value;
    input.focus();
  });

  checkUpdateButtons.forEach((button) => {
    button.addEventListener("click", () => checkForUpdate({ prompt: true, forcePrompt: true }));
  });

  cloudSaveButtons.forEach((button) => {
    button.addEventListener("click", () => toggleCloudSave());
  });

  communityButtons.forEach((button) => {
    button.addEventListener("click", () => openCommunityEntry(button.dataset.community));
  });

  document.querySelectorAll("[data-product-mode]").forEach((button) => {
    button.addEventListener("click", () => changeProductMode?.(button.dataset.productMode));
  });
  document.querySelectorAll("[data-hosted-tier]").forEach((button) => {
    button.addEventListener("click", () => changeHostedTier?.(button.dataset.hostedTier));
  });
}
