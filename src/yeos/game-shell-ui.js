/**
 * YEOS game shell — iframe sandbox + NyraGame postMessage bridge
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { getInstalledGame, uninstallGame } from "./registry-games.js";
import { createNyraGameBridge, invokeNyraGameMethod } from "./bridge-game.js";
import { createPermissionRequester } from "../phone-ext/permission-ui.js";
import { t } from "../i18n/index.js";

const NYRA_CHANNEL = "nyra-yeos";

function buildSrcDoc(files, entry, pkgId) {
  let html = files[entry] || "";
  html = html.replace(/<script\s+src=["']\.\/([^"']+)["']\s*>\s*<\/script>/gi, (_, src) => {
    const code = files[src] || files[`./${src}`] || "";
    return `<script>${code}<\/script>`;
  });
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith(".css") && html.includes(path)) {
      html = html.replace("</head>", `<style>${content}</style></head>`);
    }
  }

  const bootstrap = `
<script>
(function () {
  var PKG_ID = ${JSON.stringify(pkgId)};
  var CHANNEL = ${JSON.stringify(NYRA_CHANNEL)};
  var pending = {};
  var seq = 0;
  function invoke(method, args) {
    return new Promise(function (resolve, reject) {
      var requestId = "g" + (++seq);
      pending[requestId] = { resolve: resolve, reject: reject };
      parent.postMessage({ channel: CHANNEL, pkgId: PKG_ID, requestId: requestId, method: method, args: args || [] }, "*");
    });
  }
  window.NyraGame = {
    setChrome: function (opts) { return invoke("setChrome", [opts || {}]); },
    close: function () { return invoke("close", []); },
    getPlayerProfile: function () { return invoke("getPlayerProfile", []); },
    listCharacters: function () { return invoke("listCharacters", []); },
    getRoleLightPackage: function (id, opts) { return invoke("getRoleLightPackage", [id, opts || {}]); },
    getRoleFullPackage: function (id, opts) { return invoke("getRoleFullPackage", [id, opts || {}]); },
    callLLM: function (input) { return invoke("callLLM", [input || {}]); },
    callGlobalLLM: function (input) { return invoke("callGlobalLLM", [input || {}]); },
    saveGame: function (data) { return invoke("saveGame", [data]); },
    loadGame: function () { return invoke("loadGame", []); },
    recordGameEvent: function (input) { return invoke("recordGameEvent", [input || {}]); }
  };
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.channel !== CHANNEL || data.pkgId !== PKG_ID) return;
    var slot = pending[data.requestId];
    if (!slot) return;
    delete pending[data.requestId];
    if (data.ok) slot.resolve(data.result);
    else slot.reject(new Error(data.error || ${JSON.stringify(t("games.shell.requestFailed"))}));
  });
})();
<\/script>`;

  if (html.includes("</body>")) {
    html = html.replace("</body>", `${bootstrap}</body>`);
  } else {
    html += bootstrap;
  }
  return html;
}

/**
 * @param {HTMLElement} hostRoot `[data-phone-screen="game-host"]`
 * @param {object} deps
 */
export function mountGameShell(hostRoot, deps = {}) {
  if (!hostRoot) {
    return { open() {}, close() {}, destroy() {} };
  }

  const mount = hostRoot.querySelector("[data-game-runtime-mount]");
  const titleEl = hostRoot.querySelector("[data-game-host-title]");
  const requestPermissionUi = createPermissionRequester(
    deps.phoneRoot || hostRoot.closest(".mini-phone") || document.body,
  );

  let currentGameId = "";
  let iframe = null;
  let bridge = null;
  let onMessage = null;

  function setCrash(message) {
    if (!mount) return;
    mount.innerHTML = `
      <div class="mini-ext-crash" role="alert">
        <p>${escapeHtml(message || t("games.shell.launchFailed"))}</p>
        <div class="mini-ext-crash__actions">
          <button type="button" class="mini-app-cta" data-game-retry>${t("games.shell.retry")}</button>
          <button type="button" class="mini-ghost-btn" data-game-uninstall>${t("games.shell.uninstall")}</button>
        </div>
      </div>
    `;
    refreshIcons(mount);
  }

  function detachBridge() {
    if (onMessage) {
      window.removeEventListener("message", onMessage);
      onMessage = null;
    }
    bridge = null;
  }

  function attachBridge(gameRecord) {
    detachBridge();
    bridge = createNyraGameBridge({
      pkgId: gameRecord.id,
      permissions: gameRecord.manifest?.permissions || [],
      getCharacters: deps.getCharacters,
      getPlayer: deps.getPlayer,
      callModel: deps.callModel,
      buildRolePackage: deps.buildRolePackage,
      requestPermissionUi,
      onClose: () => deps.onHome?.(),
      setChrome: (opts) => {
        hostRoot.style.setProperty("--nyra-game-safe-top", opts?.material === "clear" ? "48px" : "72px");
      },
    });

    onMessage = async (event) => {
      const data = event.data;
      if (!data || data.channel !== NYRA_CHANNEL || data.pkgId !== gameRecord.id) return;
      if (!data.requestId || !data.method) return;
      const sourceWin = iframe?.contentWindow;
      if (sourceWin && event.source !== sourceWin) return;

      const reply = (payload) => {
        sourceWin?.postMessage({
          channel: NYRA_CHANNEL,
          pkgId: gameRecord.id,
          requestId: data.requestId,
          ...payload,
        }, "*");
      };

      try {
        const result = await invokeNyraGameMethod(bridge, data.method, data.args || []);
        reply({ ok: true, result });
      } catch (err) {
        reply({ ok: false, error: String(err?.message || err || t("games.shell.requestFailed")) });
      }
    };

    window.addEventListener("message", onMessage);
  }

  function open(gameId) {
    currentGameId = String(gameId || "").trim();
    const installed = getInstalledGame(currentGameId);
    if (!installed || !installed.enabled) {
      setCrash(t("games.shell.launchFailed"));
      if (titleEl) titleEl.textContent = t("games.shell.game");
      return;
    }
    if (titleEl) titleEl.textContent = installed.manifest?.name || currentGameId;
    if (!mount) return;

    mount.innerHTML = '<div class="mini-ext-skeleton" aria-busy="true"><span></span><span></span><span></span></div>';

    try {
      const files = installed.files || {};
      const entry = installed.manifest?.entry || "game.html";
      if (!files[entry]) {
        setCrash(t("games.shell.missingEntry"));
        return;
      }

      attachBridge(installed);

      iframe = document.createElement("iframe");
      iframe.className = "mini-ext-frame mini-game-frame";
      iframe.setAttribute("sandbox", "allow-scripts allow-forms");
      iframe.title = installed.manifest?.name || t("games.shell.game");
      iframe.srcdoc = buildSrcDoc(files, entry, installed.id);

      mount.innerHTML = "";
      mount.appendChild(iframe);
    } catch (err) {
      console.error(err);
      setCrash(t("games.shell.launchFailed"));
    }
  }

  function close() {
    currentGameId = "";
    iframe = null;
    detachBridge();
    if (mount) mount.innerHTML = "";
  }

  hostRoot.addEventListener("click", (event) => {
    if (event.target.closest("[data-game-retry]") && currentGameId) {
      open(currentGameId);
      return;
    }
    if (event.target.closest("[data-game-uninstall]") && currentGameId) {
      const id = currentGameId;
      uninstallGame(id);
      deps.onUninstalled?.(id);
      deps.onHome?.();
    }
  });

  return {
    open,
    close,
    getCurrentGameId: () => currentGameId,
    destroy() {
      close();
    },
  };
}

export function buildGameHostScreenHtml() {
  return `
    <section class="mini-view mini-ext-host mini-game-host" data-phone-screen="game-host" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${t("games.shell.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong data-game-host-title>${t("games.shell.game")}</strong><span>${t("games.shell.sideload")}</span></div>
        <span></span>
      </header>
      <div class="mini-ext-runtime-mount mini-game-runtime-mount" data-game-runtime-mount></div>
    </section>
  `;
}
