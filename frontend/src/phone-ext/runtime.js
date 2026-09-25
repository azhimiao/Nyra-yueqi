/**
 * 扩展 runtime — shadow / iframe 沙箱（F7 H2）
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { getInstalledExtension, uninstallExtension, removeExtFromIconOrder } from "./registry.js";
import { createHostApi, injectHostIntoWindow } from "./host-api.js";
import { createPermissionRequester } from "./permission-ui.js";

/**
 * @param {HTMLElement} hostRoot `[data-phone-screen="ext-host"]`
 * @param {object} deps
 */
export function mountExtRuntime(hostRoot, deps = {}) {
  if (!hostRoot) {
    return { open() {}, close() {}, destroy() {} };
  }

  const mount = hostRoot.querySelector("[data-ext-runtime-mount]");
  const titleEl = hostRoot.querySelector("[data-ext-host-title]");
  const menuEl = hostRoot.querySelector("[data-ext-host-menu]");
  const requestPermissionUi = createPermissionRequester(deps.phoneRoot || hostRoot.closest(".mini-phone") || document.body);

  let currentExtId = "";
  let iframe = null;

  function setCrash(message) {
    if (!mount) return;
    mount.innerHTML = `
      <div class="mini-ext-crash" role="alert">
        <p>${escapeHtml(message || "扩展未能启动")}</p>
        <div class="mini-ext-crash__actions">
          <button type="button" class="mini-app-cta" data-ext-retry>重试</button>
          <button type="button" class="mini-ghost-btn" data-ext-uninstall>卸载</button>
        </div>
      </div>
    `;
    refreshIcons(mount);
  }

  function buildSrcDoc(files, entry) {
    let html = files[entry] || "";
    // Inline relative script/src for sandbox (no network)
    html = html.replace(/<script\s+src=["']\.\/([^"']+)["']\s*>\s*<\/script>/gi, (_, src) => {
      const code = files[src] || files[`./${src}`] || "";
      return `<script>${code}<\/script>`;
    });
    html = html.replace(/href=["']\.\/([^"']+\.css)["']/gi, (_, src) => {
      const css = files[src] || "";
      return `data-inline-css="${src}"`;
    });
    // Inject CSS as style tags if referenced
    for (const [path, content] of Object.entries(files)) {
      if (path.endsWith(".css") && !html.includes(content.slice(0, 40))) {
        html = html.replace("</head>", `<style>${content}</style></head>`);
      }
    }
    return html;
  }

  function open(extId) {
    currentExtId = String(extId || "").trim();
    const installed = getInstalledExtension(currentExtId);
    if (!installed || !installed.enabled) {
      setCrash("扩展未能启动");
      if (titleEl) titleEl.textContent = "扩展";
      return;
    }
    if (titleEl) titleEl.textContent = installed.manifest?.name || currentExtId;
    if (!mount) return;

    mount.innerHTML = '<div class="mini-ext-skeleton" aria-busy="true"><span></span><span></span><span></span></div>';

    try {
      const files = installed.files || {};
      const entry = installed.manifest?.entry || "index.html";
      if (!files[entry]) {
        setCrash("扩展未能启动");
        return;
      }

      iframe = document.createElement("iframe");
      iframe.className = "mini-ext-frame";
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.title = installed.manifest?.name || "扩展";
      iframe.srcdoc = buildSrcDoc(files, entry);

      iframe.addEventListener("load", () => {
        try {
          const host = createHostApi({
            extId: currentExtId,
            requestPermissionUi,
            sendMessage: deps.sendMessage,
            sendTokenCard: deps.sendTokenCard,
            getRecentMessages: deps.getRecentMessages,
            getActiveProfileSummary: deps.getActiveProfileSummary,
            isDnd: deps.isDnd,
            showToast: deps.showToast,
          });
          injectHostIntoWindow(iframe.contentWindow, host);
        } catch (err) {
          console.error(err);
          setCrash("扩展未能启动");
        }
      });

      mount.innerHTML = "";
      mount.appendChild(iframe);
    } catch (err) {
      console.error(err);
      setCrash("扩展未能启动");
    }
  }

  function close() {
    currentExtId = "";
    iframe = null;
    if (mount) mount.innerHTML = "";
  }

  hostRoot.addEventListener("click", (event) => {
    if (event.target.closest("[data-ext-retry]") && currentExtId) {
      open(currentExtId);
      return;
    }
    if (event.target.closest("[data-ext-uninstall]") && currentExtId) {
      const id = currentExtId;
      uninstallExtension(id);
      deps.onUninstalled?.(id);
      deps.onHome?.();
      return;
    }
    if (event.target.closest("[data-ext-menu-report]")) {
      deps.onReport?.(currentExtId);
      menuEl && (menuEl.hidden = true);
      return;
    }
    if (event.target.closest("[data-ext-menu-perms]")) {
      deps.onPermissions?.(currentExtId);
      menuEl && (menuEl.hidden = true);
      return;
    }
    if (event.target.closest("[data-ext-host-more]")) {
      if (menuEl) menuEl.hidden = !menuEl.hidden;
    }
  });

  return {
    open,
    close,
    getCurrentExtId: () => currentExtId,
    destroy() {
      close();
    },
  };
}

export { removeExtFromIconOrder };
