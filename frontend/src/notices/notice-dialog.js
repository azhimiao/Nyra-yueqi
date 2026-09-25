import { escapeHtml, escapeHtmlWithBreaks } from "../lib/utils.js";
import { getLocale, t } from "../i18n/index.js";
import { isAllowedNoticeLink } from "../../../shared/notice-hosts.mjs";
import { localizeNotice } from "./notice-policy.mjs";

function lockBodyScroll(lock) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("notice-dialog-open", Boolean(lock));
  document.body.classList.toggle("notice-dialog-open", Boolean(lock));
}

function openLink(url) {
  const href = isAllowedNoticeLink(url);
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

export function showNoticeDialog(notice) {
  const locale = getLocale();
  const view = localizeNotice(notice, locale);
  if (!view?.titleText) return Promise.resolve({ action: "skip" });

  const forced = view.kind === "forced";
  const stay = view.dismiss === "none";
  const isUpdate = view.type === "update";
  const badge = forced
    ? t(isUpdate ? "notice.updateForcedBadge" : "notice.announcementForcedBadge", locale)
    : t(isUpdate ? "notice.updateBadge" : "notice.announcementBadge", locale);
  const primaryLabel = view.ctaLabelText
    || t(isUpdate ? "notice.now" : "notice.ack", locale);
  const hint = forced
    ? t(isUpdate ? "notice.forcedUpdateHint" : "notice.forcedHint", locale)
    : "";

  return new Promise((resolve) => {
    if (document.querySelector("[data-update-dialog]")) {
      resolve({ action: "skip" });
      return;
    }
    document.querySelector("[data-notice-dialog]")?.remove();
    lockBodyScroll(true);

    const modal = document.createElement("section");
    modal.className = `modal confirm-modal update-dialog notice-dialog is-open${forced ? " update-dialog--forced notice-dialog--forced" : " update-dialog--optional"}${stay ? " notice-dialog--stay" : ""}`;
    modal.setAttribute("data-notice-dialog", stay ? "stay" : forced ? "forced" : "optional");
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-backdrop"${forced ? "" : ' data-notice-later="1"'}></div>
      <article class="modal-panel confirm-panel update-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="noticeDialogTitle">
        <header>
          <div>
            <p class="update-dialog__eyebrow">${escapeHtml(badge)}</p>
            <h2 id="noticeDialogTitle">${escapeHtml(view.titleText)}</h2>
          </div>
        </header>
        ${view.bodyText ? `<div class="update-dialog__notes">${escapeHtmlWithBreaks(view.bodyText)}</div>` : ""}
        ${hint ? `<p class="update-dialog__hint">${escapeHtml(hint)}</p>` : ""}
        <footer class="update-dialog__footer">
          ${forced ? "" : `<button type="button" class="ghost-action" data-notice-later="1">${escapeHtml(t("notice.later", locale))}</button>`}
          <button type="button" class="send-button update-dialog__primary" data-notice-primary="1">${escapeHtml(primaryLabel)}</button>
        </footer>
      </article>
    `;

    const finish = (action) => {
      if (action === "later" && !forced) {
        lockBodyScroll(false);
        modal.remove();
        resolve({ action, notice: view });
        return;
      }
      if (action === "primary") {
        if (view.ctaUrl) openLink(view.ctaUrl);
        if (stay) {
          const primary = modal.querySelector("[data-notice-primary]");
          if (primary) primary.textContent = t(isUpdate ? "notice.nowAgain" : "notice.openAgain", locale);
          resolve({ action, notice: view });
          return;
        }
        lockBodyScroll(false);
        modal.remove();
        resolve({ action, notice: view });
        return;
      }
      resolve({ action, notice: view });
    };

    modal.querySelectorAll("[data-notice-later]").forEach((node) => {
      node.addEventListener("click", () => finish("later"));
    });
    modal.querySelector("[data-notice-primary]")?.addEventListener("click", () => finish("primary"));
    if (forced) {
      modal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") event.preventDefault();
      });
    }

    document.body.append(modal);
    modal.querySelector("[data-notice-primary]")?.focus();
  });
}
