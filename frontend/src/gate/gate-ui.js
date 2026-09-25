/**
 * 设置内门禁 / 合规 / 举报队列 / H6（F7 H3–H6）
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import {
  loadGatePrefs,
  saveGatePrefs,
  computeAgeVerified,
  mockGateLogin,
  mockGateLogout,
} from "./gate-prefs.js";
import { listReports, markReportRead, REPORT_REASON_LABELS } from "./report-store.js";
import { mountLocalChatAssistant } from "./local-chat-assistant.js";
import {
  listInstalledExtensions,
  revokeExtensionPermission,
  grantExtensionPermission,
} from "../phone-ext/registry.js";
import { permissionLabelZh } from "../phone-ext/manifest-schema.js";

/**
 * @param {HTMLElement} settingsRoot
 * @param {object} deps
 */
export function mountGateUi(settingsRoot, deps = {}) {
  if (!settingsRoot) return { refresh() {}, destroy() {} };

  const localChat = mountLocalChatAssistant(
    settingsRoot.querySelector("[data-local-chat-section]"),
    {
      onImportDraft: deps.onImportDraft,
      onToast: deps.onToast,
    },
  );

  function refresh() {
    const prefs = loadGatePrefs();
    const local = settingsRoot.querySelector("[data-gate-local-mode]");
    if (local) local.checked = prefs.localMode;
    const cloud = settingsRoot.querySelector("[data-gate-cloud-enabled]");
    if (cloud) cloud.checked = prefs.cloudGateEnabled;
    const endpointWrap = settingsRoot.querySelector("[data-gate-endpoint-wrap]");
    const loginForm = settingsRoot.querySelector("[data-gate-login-form]");
    const cloudWrap = settingsRoot.querySelector("[data-gate-cloud-wrap]");
    if (cloudWrap) cloudWrap.hidden = prefs.localMode;
    if (endpointWrap) endpointWrap.hidden = prefs.localMode || !prefs.cloudGateEnabled;
    if (loginForm) loginForm.hidden = prefs.localMode || !prefs.cloudGateEnabled;
    const endpoint = settingsRoot.querySelector("[data-gate-cloud-endpoint]");
    if (endpoint) endpoint.value = prefs.cloudGateEndpoint || "";
    const session = settingsRoot.querySelector("[data-gate-session-status]");
    if (session) {
      session.textContent = prefs.gateSessionToken
        ? "已登录（占位会话）"
        : (prefs.cloudGateEnabled && !prefs.localMode ? "未登录" : "");
    }

    const ageEnabled = settingsRoot.querySelector("[data-age-gate-enabled]");
    if (ageEnabled) ageEnabled.checked = prefs.ageGateEnabled;
    const ageForm = settingsRoot.querySelector("[data-age-gate-form]");
    if (ageForm) ageForm.hidden = !prefs.ageGateEnabled;
    const birth = settingsRoot.querySelector("[data-age-birth-year]");
    if (birth) birth.value = prefs.birthYear ?? "";
    const ageStatus = settingsRoot.querySelector("[data-age-gate-status]");
    if (ageStatus) {
      ageStatus.textContent = prefs.ageGateEnabled
        ? (prefs.ageVerified ? "已完成成年确认" : "尚未完成成年确认")
        : "成年确认门槛已关闭";
    }

    const reportSync = settingsRoot.querySelector("[data-report-sync-enabled]");
    if (reportSync) reportSync.checked = prefs.reportSyncEnabled;
    const reportEp = settingsRoot.querySelector("[data-report-sync-endpoint]");
    if (reportEp) reportEp.value = prefs.reportSyncEndpoint || "";

    const catalog = settingsRoot.querySelector("[data-cloud-catalog-enabled]");
    if (catalog) catalog.checked = prefs.cloudCatalogEnabled;
    const catalogEp = settingsRoot.querySelector("[data-cloud-catalog-endpoint]");
    if (catalogEp) catalogEp.value = prefs.cloudCatalogEndpoint || "";

    const localMaster = settingsRoot.querySelector("[data-local-chat-master]");
    if (localMaster) localMaster.checked = prefs.localChatAssistantEnabled;
    const localSection = settingsRoot.querySelector("[data-local-chat-section]");
    if (localSection) localSection.hidden = !prefs.localChatAssistantEnabled;
    const localEnabled = settingsRoot.querySelector("[data-local-chat-enabled]");
    if (localEnabled) localEnabled.checked = prefs.localChatAssistantEnabled;
    localChat.refresh();

    renderExtPerms();
  }

  function renderExtPerms() {
    const host = settingsRoot.querySelector("[data-ext-perm-manage]");
    if (!host) return;
    const list = listInstalledExtensions();
    if (!list.length) {
      host.innerHTML = '<p class="mini-app-lead">暂无已装扩展</p>';
      return;
    }
    host.innerHTML = list.map((ext) => `
      <div class="mini-ext-perm-block">
        <strong>${escapeHtml(ext.manifest?.name || ext.id)}</strong>
        ${(ext.manifest?.permissions || []).map((p) => {
    const granted = (ext.grantedPermissions || []).includes(p);
    return `
            <label class="mini-settings-row">
              <span>${escapeHtml(permissionLabelZh(p))}</span>
              <button type="button" data-ext-perm-toggle="${escapeHtml(ext.id)}" data-perm="${escapeHtml(p)}" data-granted="${granted ? "1" : "0"}">
                ${granted ? "撤销" : "授予"}
              </button>
            </label>
          `;
  }).join("")}
      </div>
    `).join("");
  }

  function renderReportQueue() {
    const host = settingsRoot.querySelector("[data-report-queue]");
    if (!host) return;
    host.hidden = false;
    const rows = listReports();
    if (!rows.length) {
      host.innerHTML = '<p class="mini-empty">暂无举报</p>';
      return;
    }
    host.innerHTML = rows.map((r) => `
      <article class="mini-report-row" data-report-id="${escapeHtml(r.id)}">
        <div>
          <strong>${escapeHtml(r.targetName || r.targetId)}</strong>
          <span>${escapeHtml(REPORT_REASON_LABELS[r.reason] || r.reason)} · ${escapeHtml((r.createdAt || "").slice(0, 16).replace("T", " "))}</span>
        </div>
        <em class="mini-report-status">${r.status === "read" ? "已读" : "待处理"}${r.syncState === "failed" ? " · 待同步" : ""}</em>
        ${r.status !== "read" ? `<button type="button" data-report-mark-read="${escapeHtml(r.id)}">标记已读</button>` : ""}
      </article>
    `).join("");
  }

  settingsRoot.addEventListener("change", (event) => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement)) return;

    if (t.matches("[data-gate-local-mode]")) {
      saveGatePrefs({ localMode: t.checked, cloudGateEnabled: t.checked ? false : loadGatePrefs().cloudGateEnabled });
      refresh();
      return;
    }
    if (t.matches("[data-gate-cloud-enabled]")) {
      saveGatePrefs({ cloudGateEnabled: t.checked, localMode: t.checked ? false : loadGatePrefs().localMode });
      refresh();
      return;
    }
    if (t.matches("[data-gate-cloud-endpoint]")) {
      saveGatePrefs({ cloudGateEndpoint: t.value });
      return;
    }
    if (t.matches("[data-age-gate-enabled]")) {
      saveGatePrefs({ ageGateEnabled: t.checked });
      refresh();
      return;
    }
    if (t.matches("[data-report-sync-enabled]")) {
      saveGatePrefs({ reportSyncEnabled: t.checked });
      return;
    }
    if (t.matches("[data-report-sync-endpoint]")) {
      saveGatePrefs({ reportSyncEndpoint: t.value });
      return;
    }
    if (t.matches("[data-cloud-catalog-enabled]")) {
      saveGatePrefs({ cloudCatalogEnabled: t.checked });
      return;
    }
    if (t.matches("[data-cloud-catalog-endpoint]")) {
      saveGatePrefs({ cloudCatalogEndpoint: t.value });
      return;
    }
    if (t.matches("[data-local-chat-master], [data-local-chat-enabled]")) {
      saveGatePrefs({ localChatAssistantEnabled: t.checked });
      refresh();
    }
  });

  settingsRoot.addEventListener("click", (event) => {
    if (event.target.closest("[data-gate-login-submit]")) {
      const email = settingsRoot.querySelector("[data-gate-login-email]")?.value || "";
      mockGateLogin({ email });
      deps.onToast?.("登录成功（占位）");
      refresh();
      return;
    }
    if (event.target.closest("[data-age-gate-save]")) {
      const year = Number(settingsRoot.querySelector("[data-age-birth-year]")?.value);
      const confirmed = Boolean(settingsRoot.querySelector("[data-age-confirm]")?.checked);
      const ok = computeAgeVerified({ birthYear: year, confirmed });
      saveGatePrefs({ birthYear: year, ageVerified: ok });
      deps.onToast?.(ok ? "成年确认已保存" : "未通过成年确认，请检查出生年与勾选");
      refresh();
      return;
    }
    if (event.target.closest("[data-open-report-queue]")) {
      renderReportQueue();
      return;
    }
    const markId = event.target.closest("[data-report-mark-read]")?.dataset.reportMarkRead;
    if (markId) {
      markReportRead(markId);
      renderReportQueue();
      return;
    }
    const toggle = event.target.closest("[data-ext-perm-toggle]");
    if (toggle) {
      const extId = toggle.dataset.extPermToggle;
      const perm = toggle.dataset.perm;
      if (toggle.dataset.granted === "1") revokeExtensionPermission(extId, perm);
      else grantExtensionPermission(extId, perm);
      refresh();
    }
  });

  refresh();
  return {
    refresh,
    destroy() {
      localChat.destroy?.();
    },
  };
}

export { mockGateLogout };
