import { escapeHtml, escapeHtmlWithBreaks } from "../lib/utils.js";
import { getLocale, t } from "../i18n/index.js";
import { shouldPromptUpdate, snoozeOptionalUpdate } from "./update-prompt.mjs";

function openDownload(url) {
  const href = String(url || "").trim();
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

function lockBodyScroll(lock) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("update-dialog-open", Boolean(lock));
  document.body.classList.toggle("update-dialog-open", Boolean(lock));
}

export function showUpdateDialog(policy, { force = false } = {}) {
  if (!shouldPromptUpdate(policy, { force })) return Promise.resolve({ action: "skip" });

  const forced = policy.kind === "forced";
  const locale = getLocale();
  const title = forced
    ? t("update.forcedTitle", locale)
    : t("update.optionalTitle", locale);
  const lead = forced
    ? t("update.forcedLead", locale, {
      current: policy.currentVersion,
      latest: policy.latestVersion,
    })
    : t("update.optionalLead", locale, {
      current: policy.currentVersion,
      latest: policy.latestVersion,
    });
  const notes = policy.notes
    || t(forced ? "update.forcedNotesFallback" : "update.optionalNotesFallback", locale);
  const versionLine = t("update.versionLine", locale, {
    current: policy.currentVersion,
    latest: policy.latestVersion,
  });

  return new Promise((resolve) => {
    document.querySelector("[data-update-dialog]")?.remove();
    lockBodyScroll(true);

    const modal = document.createElement("section");
    modal.className = `modal confirm-modal update-dialog is-open${forced ? " update-dialog--forced" : " update-dialog--optional"}`;
    modal.setAttribute("data-update-dialog", forced ? "forced" : "optional");
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-backdrop"${forced ? "" : ' data-update-later="1"'}></div>
      <article class="modal-panel confirm-panel update-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="updateDialogTitle">
        <header>
          <div>
            <p class="update-dialog__eyebrow">${escapeHtml(t(forced ? "update.forcedBadge" : "update.optionalBadge", locale))}</p>
            <h2 id="updateDialogTitle">${escapeHtml(title)}</h2>
          </div>
        </header>
        <p class="update-dialog__versions">${escapeHtml(versionLine)}</p>
        <p class="confirm-message update-dialog__lead">${escapeHtml(lead)}</p>
        <div class="update-dialog__notes">${escapeHtmlWithBreaks(notes)}</div>
        ${forced ? `<p class="update-dialog__hint">${escapeHtml(t("update.forcedHint", locale))}</p>` : ""}
        <footer class="update-dialog__footer">
          ${forced ? "" : `<button type="button" class="ghost-action" data-update-later="1">${escapeHtml(t("update.later", locale))}</button>`}
          <button type="button" class="send-button update-dialog__primary" data-update-now="1">${escapeHtml(t("update.now", locale))}</button>
        </footer>
      </article>
    `;

    const finish = (action) => {
      if (action === "later" && !forced) {
        snoozeOptionalUpdate(policy.latestVersion);
        lockBodyScroll(false);
        modal.remove();
        resolve({ action });
        return;
      }
      if (action === "update") {
        openDownload(policy.downloadUrl);
        if (!forced) {
          lockBodyScroll(false);
          modal.remove();
        } else {
          const primary = modal.querySelector("[data-update-now]");
          if (primary) primary.textContent = t("update.nowAgain", locale);
        }
        resolve({ action });
        return;
      }
      resolve({ action });
    };

    modal.querySelectorAll("[data-update-later]").forEach((node) => {
      node.addEventListener("click", () => finish("later"));
    });
    modal.querySelector("[data-update-now]")?.addEventListener("click", () => finish("update"));

    if (forced) {
      modal.addEventListener("keydown", (event) => {
        if (event.key === "Escape") event.preventDefault();
      });
    }

    document.body.append(modal);
    modal.querySelector("[data-update-now]")?.focus();
  });
}

export { shouldPromptUpdate, snoozeOptionalUpdate };
