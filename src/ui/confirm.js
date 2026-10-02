import { t } from "../i18n/index.js";

export function confirmAction({
  title,
  message,
  confirmLabel = t("common.confirm"),
  cancelLabel = t("common.cancel"),
}) {
  return new Promise((resolve) => {
    const modal = document.createElement("section");
    modal.className = "modal confirm-modal is-open";
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-backdrop" data-confirm-cancel></div>
      <article class="modal-panel confirm-panel" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <header><h2 id="confirmTitle">${title}</h2></header>
        <p class="confirm-message">${message}</p>
        <footer>
          <button type="button" class="ghost-action" data-confirm-cancel>${cancelLabel}</button>
          <button type="button" class="send-button" data-confirm-ok>${confirmLabel}</button>
        </footer>
      </article>
    `;

    const finish = (result) => {
      modal.remove();
      resolve(result);
    };

    modal.querySelectorAll("[data-confirm-cancel]").forEach((node) => {
      node.addEventListener("click", () => finish(false));
    });
    modal.querySelector("[data-confirm-ok]")?.addEventListener("click", () => finish(true));
    document.body.append(modal);
  });
}

/**
 * Edit a block of text in an app-styled dialog, resolving to the new string or
 * to null when dismissed. Replaces `window.prompt`, which is unstyled and, in
 * the Android WebView, is announced with the page origin above the field.
 * @param {{
 *   title?: string,
 *   value?: string,
 *   placeholder?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 * }} options
 * @returns {Promise<string|null>}
 */
export function promptText({
  title = "",
  value = "",
  placeholder = "",
  confirmLabel = t("common.save"),
  cancelLabel = t("common.cancel"),
} = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("section");
    modal.className = "modal confirm-modal text-prompt-modal is-open";
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-backdrop" data-prompt-cancel></div>
      <article class="modal-panel confirm-panel text-prompt-panel" role="dialog" aria-modal="true" aria-labelledby="textPromptTitle">
        <header><h2 id="textPromptTitle"></h2></header>
        <textarea class="text-prompt-field" rows="4" data-prompt-field></textarea>
        <footer>
          <button type="button" class="ghost-action" data-prompt-cancel></button>
          <button type="button" class="send-button" data-prompt-ok></button>
        </footer>
      </article>
    `;

    const field = modal.querySelector("[data-prompt-field]");
    // Assigned rather than interpolated: the text being edited is chat content.
    modal.querySelector("#textPromptTitle").textContent = title;
    modal.querySelector("[data-prompt-cancel]:not(.modal-backdrop)").textContent = cancelLabel;
    modal.querySelector("[data-prompt-ok]").textContent = confirmLabel;
    field.value = String(value ?? "");
    field.placeholder = placeholder;

    const finish = (result) => {
      document.removeEventListener("keydown", onKeydown, true);
      modal.remove();
      resolve(result);
    };
    const submit = () => {
      const next = field.value;
      finish(next.trim() ? next : null);
    };
    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
        return;
      }
      // A message can span lines, so Enter belongs to the text and saving takes
      // the modifier — the opposite of the composer's one-line habit.
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    }

    modal.querySelectorAll("[data-prompt-cancel]").forEach((node) => {
      node.addEventListener("click", () => finish(null));
    });
    modal.querySelector("[data-prompt-ok]")?.addEventListener("click", submit);
    document.addEventListener("keydown", onKeydown, true);
    document.body.append(modal);
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  });
}

export function confirmOverwriteDiary(diaryDay = "") {
  const day = String(diaryDay || "").trim();
  const dayLabel = day ? day.slice(5).replace("-", ".") : "";
  return confirmAction({
    title: dayLabel
      ? t("shared.overlay.diaryExistsTitleDay", { day: dayLabel })
      : t("shared.overlay.diaryExistsTitle"),
    message: dayLabel
      ? t("shared.overlay.diaryExistsMessageDay", { day: dayLabel })
      : t("shared.overlay.diaryExistsMessage"),
    confirmLabel: t("shared.overlay.overwrite"),
    cancelLabel: t("common.cancel"),
  });
}
