/**
 * Phone-shell host for 栖机助手 (system console).
 * Reuses studio-assist mount; phone chrome is the app bar.
 */

import { createLazyStudioAssistMount } from "../studio-assist/lazy-mount.js";
import { registerPhoneStudioAssist } from "../studio-assist/api-registry.js";
import { refreshIcons } from "../lib/icons.js";
import { pt } from "./i18n.js";

export function buildAssistScreenHtml() {
  return `
    <section class="mini-view mini-assist" data-phone-screen="assist" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-home aria-label="${pt("assist.backHome")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${pt("brand.qijiAssistant")}</strong><span>${pt("assist.subtitle")}</span></div>
        <button type="button" class="mini-icon-button" data-assist-phone-reset aria-label="${pt("assist.newChat")}" title="${pt("assist.newChat")}"><i data-lucide="rotate-ccw"></i></button>
      </header>
      <div class="mini-assist__body" data-assist-phone-mount></div>
    </section>
  `;
}

/**
 * @param {HTMLElement | null} root
 * @param {{
 *   collectProviderConfig?: () => Promise<object> | object,
 *   onToast?: (msg: string) => void,
 *   onNavigateSettings?: (viewId: string) => void,
 * }} [deps]
 */
export function mountPhoneAssist(root, deps = {}) {
  const screen = root?.closest?.("[data-phone-screen='assist']") || root;
  const mount = screen?.querySelector?.("[data-assist-phone-mount]") || root;
  if (!mount) return { open() {}, refresh() {}, destroy() {} };

  const api = createLazyStudioAssistMount(mount, {
    collectProviderConfig: deps.collectProviderConfig,
    onToast: deps.onToast,
    onNavigateSettings: deps.onNavigateSettings,
  });

  screen?.querySelector?.("[data-assist-phone-reset]")?.addEventListener("click", () => {
    void api.open({ context: "assist" });
    refreshIcons();
  });

  registerPhoneStudioAssist({
    open(opts = {}) {
      api.open(opts);
    },
    refresh: () => api.refresh?.(),
  });

  return {
    open(opts = {}) {
      api.open(opts);
    },
    refresh() {
      api.refresh?.();
    },
    destroy() {
      api.destroy?.();
    },
  };
}
