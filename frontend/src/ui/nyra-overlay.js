/**
 * In-app sheets that replace window.prompt / window.confirm for product UI.
 */

import { escapeHtml } from "../lib/utils.js";
import { t } from "../i18n/index.js";
import "./nyra-overlay.css";

/** @type {HTMLElement|null} */
let host = null;

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement("div");
  host.className = "nyra-overlay";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  return host;
}

/**
 * @param {HTMLElement} root
 * @param {() => void} onCancel
 */
function bindChrome(root, onCancel) {
  root.querySelector("[data-nyra-overlay-scrim]")?.addEventListener("click", onCancel);
  root.querySelector("[data-nyra-overlay-cancel]")?.addEventListener("click", onCancel);
}

/**
 * @param {{
 *   title?: string,
 *   placeholder?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   defaultValue?: string,
 *   maxLength?: number,
 * }} [opts]
 * @returns {Promise<string|null>}
 */
export function openNyraInputSheet(opts = {}) {
  const root = ensureHost();
  const title = opts.title || t("shared.overlay.inputTitle");
  const placeholder = opts.placeholder || "";
  const confirmLabel = opts.confirmLabel || t("common.confirm");
  const cancelLabel = opts.cancelLabel || t("common.cancel");
  const defaultValue = opts.defaultValue ?? "";
  const maxLength = Math.max(1, Number(opts.maxLength) || 48);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      root.classList.remove("is-open", "nyra-overlay--center");
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = "";
      resolve(value);
    };

    root.classList.remove("nyra-overlay--center");
    root.innerHTML = `
      <button type="button" class="nyra-overlay__scrim" data-nyra-overlay-scrim aria-label="${escapeHtml(cancelLabel)}"></button>
      <div class="nyra-overlay__sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <h3 class="nyra-overlay__title">${escapeHtml(title)}</h3>
        <input class="nyra-overlay__field" type="text" maxlength="${maxLength}" placeholder="${escapeHtml(placeholder)}" value="" data-nyra-overlay-input autocomplete="off" />
        <div class="nyra-overlay__actions">
          <button type="button" class="nyra-overlay__btn nyra-overlay__btn--ghost" data-nyra-overlay-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="nyra-overlay__btn nyra-overlay__btn--primary" data-nyra-overlay-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    const input = /** @type {HTMLInputElement|null} */ (root.querySelector("[data-nyra-overlay-input]"));
    if (input) input.value = String(defaultValue);

    bindChrome(root, () => finish(null));
    root.querySelector("[data-nyra-overlay-confirm]")?.addEventListener("click", () => {
      finish(input ? input.value : "");
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(input.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    });

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      root.classList.add("is-open");
      input?.focus();
      input?.select();
    });
  });
}

/**
 * @param {{
 *   title?: string,
 *   body?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 * }} [opts]
 * @returns {Promise<boolean>}
 */
export function openNyraConfirmSheet(opts = {}) {
  const root = ensureHost();
  const title = opts.title || t("shared.overlay.confirmTitle");
  const body = opts.body || "";
  const confirmLabel = opts.confirmLabel || t("common.confirm");
  const cancelLabel = opts.cancelLabel || t("common.cancel");
  const danger = Boolean(opts.danger);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      root.classList.remove("is-open", "nyra-overlay--center");
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = "";
      resolve(ok);
    };

    root.classList.add("nyra-overlay--center");
    root.innerHTML = `
      <button type="button" class="nyra-overlay__scrim" data-nyra-overlay-scrim aria-label="${escapeHtml(cancelLabel)}"></button>
      <div class="nyra-overlay__sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <h3 class="nyra-overlay__title">${escapeHtml(title)}</h3>
        ${body ? `<p class="nyra-overlay__body">${escapeHtml(body)}</p>` : ""}
        <div class="nyra-overlay__actions">
          <button type="button" class="nyra-overlay__btn nyra-overlay__btn--ghost" data-nyra-overlay-cancel>${escapeHtml(cancelLabel)}</button>
          <button type="button" class="nyra-overlay__btn ${danger ? "nyra-overlay__btn--danger" : "nyra-overlay__btn--primary"}" data-nyra-overlay-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    bindChrome(root, () => finish(false));
    root.querySelector("[data-nyra-overlay-confirm]")?.addEventListener("click", () => finish(true));

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      root.classList.add("is-open");
      root.querySelector("[data-nyra-overlay-confirm]")?.focus();
    });
  });
}
