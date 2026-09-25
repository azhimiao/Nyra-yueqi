/**
 * 扩展权限授权 sheet（F7 H2 · U7）
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { permissionLabelZh, PERMISSION_DEFS } from "../yeos/kinds.js";

/**
 * @param {HTMLElement} phoneRoot
 * @returns {(permissionId: string, meta?: object) => Promise<boolean>}
 */
export function createPermissionRequester(phoneRoot) {
  let sheet = phoneRoot?.querySelector("[data-ext-perm-sheet]");
  if (!sheet && phoneRoot) {
    sheet = document.createElement("div");
    sheet.className = "mini-ext-perm-sheet";
    sheet.dataset.extPermSheet = "";
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="mini-ext-perm-sheet__backdrop" data-ext-perm-cancel></div>
      <div class="mini-ext-perm-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="ext-perm-title">
        <div class="mini-ext-perm-sheet__icon" data-ext-perm-icon aria-hidden="true">
          <i data-lucide="shield"></i>
        </div>
        <strong id="ext-perm-title" data-ext-perm-name>扩展</strong>
        <p data-ext-perm-desc></p>
        <label class="mini-ext-perm-remember">
          <input type="checkbox" data-ext-perm-remember checked />
          <span>记住选择</span>
        </label>
        <div class="mini-ext-perm-sheet__actions">
          <button type="button" class="mini-ext-perm-deny" data-ext-perm-cancel>拒绝</button>
          <button type="button" class="mini-ext-perm-allow" data-ext-perm-allow>允许</button>
        </div>
      </div>
    `;
    phoneRoot.appendChild(sheet);
    refreshIcons(sheet);
  }

  return function requestPermissionUi(permissionId, meta = {}) {
    return new Promise((resolve) => {
      if (!sheet) {
        resolve(false);
        return;
      }
      const def = PERMISSION_DEFS.find((item) => item.id === permissionId);
      const label = permissionLabelZh(permissionId);
      const nameEl = sheet.querySelector("[data-ext-perm-name]");
      const descEl = sheet.querySelector("[data-ext-perm-desc]");
      const extName = meta.extension?.manifest?.name || meta.extId || "扩展";
      if (nameEl) nameEl.textContent = extName;
      if (descEl) {
        descEl.textContent = `请求「${label}」权限。${def?.description || "授权后扩展才能继续。"}`;
      }
      sheet.hidden = false;
      refreshIcons(sheet);

      const cleanup = (allowed) => {
        sheet.hidden = true;
        sheet.removeEventListener("click", onClick);
        resolve(Boolean(allowed));
      };

      const onClick = (event) => {
        if (event.target.closest("[data-ext-perm-allow]")) {
          cleanup(true);
          return;
        }
        if (event.target.closest("[data-ext-perm-cancel]")) {
          cleanup(false);
        }
      };
      sheet.addEventListener("click", onClick);
    });
  };
}

/**
 * Inline denied state HTML (U7).
 * @param {string} permissionId
 */
export function permissionDeniedInlineHtml(permissionId) {
  const label = permissionLabelZh(permissionId);
  return `
    <div class="mini-ext-denied" role="alert">
      <p>需要「${escapeHtml(label)}」权限</p>
      <div class="mini-ext-denied__actions">
        <button type="button" class="mini-app-cta" data-ext-go-grant="${escapeHtml(permissionId)}">去授权</button>
        <button type="button" class="mini-ghost-btn" data-ext-deny-cancel>取消</button>
      </div>
    </div>
  `;
}
