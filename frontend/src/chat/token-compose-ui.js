/**
 * Wire transfer compose sheets (AIPlatform Pop style).
 */

import {
  formatLocationText,
  formatTransferText,
} from "./token-compose.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";

/**
 * @param {HTMLElement} root — document or phone root containing [data-token-compose]
 * @param {{
 *   onSend: (text: string) => void|Promise<void>,
 *   onToast?: (msg: string) => void,
 * }} deps
 */
export function bindTokenComposeSheets(root, deps = {}) {
  if (!root) return { open() {}, close() {} };

  function sheet(kind) {
    return root.querySelector(`[data-token-compose="${kind}"]`);
  }

  function closeAll() {
    root.querySelectorAll("[data-token-compose]").forEach((node) => {
      node.hidden = true;
    });
  }

  function open(kind) {
    if (kind === "redpacket") return;
    closeAll();
    const node = sheet(kind);
    if (!node) return;
    node.hidden = false;
    const amount = node.querySelector("[data-token-amount]");
    const note = node.querySelector("[data-token-note]");
    const preview = node.querySelector("[data-token-preview]");
    if (amount) amount.value = "";
    if (note) note.value = "";
    if (preview) preview.textContent = "0.00";
    amount?.focus?.();
    refreshIcons();
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-token-compose-close]")) {
      closeAll();
      return;
    }
    const submit = event.target.closest("[data-token-compose-submit]");
    if (!submit) return;
    const kind = submit.getAttribute("data-token-compose-submit");
    if (kind !== "transfer") return;
    const panel = submit.closest("[data-token-compose]");
    const amount = Number(panel?.querySelector("[data-token-amount]")?.value || 0);
    const note = String(panel?.querySelector("[data-token-note]")?.value || "").trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      deps.onToast?.(t("shared.token.invalidAmount"));
      return;
    }
    const text = formatTransferText(amount, note);
    if (!text) {
      deps.onToast?.(t("shared.token.invalidAmount"));
      return;
    }
    closeAll();
    void Promise.resolve(deps.onSend?.(text));
  });

  root.addEventListener("input", (event) => {
    const amountInput = event.target.closest("[data-token-amount]");
    if (!amountInput) return;
    const panel = amountInput.closest("[data-token-compose]");
    const preview = panel?.querySelector("[data-token-preview]");
    if (!preview) return;
    const n = Number(amountInput.value || 0);
    preview.textContent = Number.isFinite(n) && n > 0 ? n.toFixed(2) : "0.00";
  });

  return {
    open,
    close: closeAll,
    sendLocation(title, subtitle) {
      void Promise.resolve(deps.onSend?.(formatLocationText(title, subtitle)));
    },
  };
}
