/**
 * Pop chat plugins — 「一起玩」and optional YEOS panel sheets.
 * Floating dice / plugin toolbar chips are intentionally not shown in the thread.
 */

import { escapeHtml } from "../lib/utils.js";
import { safeUserFacingText } from "../onboarding/errors.js";
import { listInstalledPlugins } from "../yeos/registry-plugins.js";
import { createNyraPopBridge, loadPopPluginModule } from "../yeos/bridge-pop.js";
import { buildPopGameStart, listPopGames } from "../games/pop-games.js";
import { pt } from "./i18n.js";

function hostKindForFocus(focus = {}) {
  return focus.kind === "group" ? "group" : "dm";
}

function listToolbarPlugins(focus = {}) {
  const host = hostKindForFocus(focus);
  return listInstalledPlugins().filter((item) => (
    item.enabled !== false
    && Array.isArray(item.manifest?.pop?.hosts)
    && item.manifest.pop.hosts.includes(host)
  ));
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getChatFocus: () => object,
 *   isThreadActive: () => boolean,
 *   injectSystemMessage: (text: string, meta?: object) => Promise<void>|void,
 *   startGame?: (gameId: string) => Promise<void>|void,
 *   sendInviteMessage?: (text: string, meta?: object) => Promise<void>|void,
 *   phoneToast?: (msg: string) => void,
 *   refreshIcons?: () => void,
 *   listCharacters?: () => Promise<object[]>|object[],
 *   requestPermissionUi?: (permissionId: string, meta?: object) => Promise<boolean>,
 * }} deps
 */
export function mountPopChatPlugins(root, deps = {}) {
  if (!root) {
    return {
      renderToolbar() {},
      openGamePicker() {},
      queueGame() {},
      startGame() {},
      closeAllSheets() {},
      destroy() {},
    };
  }

  const gameSheet = root.querySelector("[data-pop-game-sheet]");
  const pluginSheet = root.querySelector("[data-pop-plugin-sheet]");
  const pluginPanel = root.querySelector("[data-pop-plugin-panel]");
  let activePluginId = "";
  /** @type {string} */
  let queuedGameId = "";

  function closeGameSheet() {
    if (gameSheet) gameSheet.hidden = true;
  }

  function closePluginSheet() {
    activePluginId = "";
    if (pluginSheet) pluginSheet.hidden = true;
    if (pluginPanel) pluginPanel.innerHTML = "";
  }

  function closeAllSheets() {
    closeGameSheet();
    closePluginSheet();
  }

  async function injectSystemMessage(text, meta = {}) {
    const content = String(text || "").trim();
    if (!content) return;
    if (!deps.isThreadActive?.()) {
      deps.phoneToast?.("toast.needChatSession");
      return;
    }
    await Promise.resolve(deps.injectSystemMessage?.(content, meta));
  }

  function renderGameList() {
    const list = root.querySelector("[data-pop-game-list]");
    if (!list) return;
    list.innerHTML = listPopGames().map((game) => `
      <button type="button" class="mini-pop-game-card tone-${escapeHtml(game.tone)}" data-pop-start-game="${escapeHtml(game.id)}">
        <strong>${escapeHtml(game.title)}</strong>
        <span>${escapeHtml(game.blurb)}</span>
      </button>
    `).join("");
  }

  function openGamePicker(preferredGameId = "") {
    if (!deps.isThreadActive?.()) {
      const id = String(preferredGameId || "").trim();
      if (id) queuedGameId = id;
      deps.phoneToast?.("toast.needChatSession");
      return;
    }
    closePluginSheet();
    renderGameList();
    if (gameSheet) gameSheet.hidden = false;
    deps.refreshIcons?.();
    const preferred = String(preferredGameId || queuedGameId || "").trim();
    if (preferred && getPopGameSafe(preferred)) {
      const btn = gameSheet?.querySelector(`[data-pop-start-game="${preferred.replace(/\\/g, "").replace(/"/g, "")}"]`);
      btn?.focus?.();
    }
  }

  function getPopGameSafe(gameId) {
    return buildPopGameStart(gameId).ok;
  }

  function queueGame(gameId) {
    queuedGameId = String(gameId || "").trim();
  }

  async function startGame(gameId) {
    const built = buildPopGameStart(gameId);
    if (!built.ok) {
      deps.phoneToast?.(built.error || "toast.gameUnavailable");
      return;
    }
    closeAllSheets();
    queuedGameId = "";
    if (typeof deps.startGame === "function") {
      await Promise.resolve(deps.startGame(built.game.id));
      return;
    }
    await Promise.resolve(deps.sendInviteMessage?.(built.game.invite, {
      pluginId: "builtin-pop-game",
      popGameId: built.game.id,
      kind: "pop-game-invite",
    }));
  }

  function flushQueuedGame() {
    if (!queuedGameId || !deps.isThreadActive?.()) return;
    const id = queuedGameId;
    queuedGameId = "";
    startGame(id);
  }

  /** Toolbar chips removed from Pop chat; keep hook for session enter flush. */
  function renderToolbar() {
    flushQueuedGame();
  }

  async function runPlugin(pluginId) {
    const plugin = listInstalledPlugins().find((item) => item.id === pluginId)
      || listToolbarPlugins(deps.getChatFocus?.() || {}).find((item) => item.id === pluginId);
    if (!plugin) {
      deps.phoneToast?.("toast.pluginNotInstalled");
      return;
    }
    if (!deps.isThreadActive?.()) {
      deps.phoneToast?.("toast.needChatSession");
      return;
    }

    closeGameSheet();
    activePluginId = pluginId;

    const bridge = createNyraPopBridge({
      pkgId: pluginId,
      permissions: plugin.manifest?.permissions || [],
      grantedPermissions: plugin.grantedPermissions || [],
      requestPermissionUi: deps.requestPermissionUi,
      getSession: async () => {
        const focus = deps.getChatFocus?.() || {};
        const characters = await Promise.resolve(deps.listCharacters?.() || []);
        const members = focus.kind === "group"
          ? (focus.memberIds || []).map((id) => {
            const character = characters.find((row) => row.id === id);
            return {
              id,
              name: character?.name || id,
              isAi: true,
            };
          })
          : undefined;
        return {
          sessionId: focus.sessionId || "",
          kind: focus.kind === "group" ? "group" : "dm",
          title: focus.title || pt("pop.chat"),
          members,
        };
      },
      inject: async (input = {}) => {
        await injectSystemMessage(String(input.text || ""), {
          ...(input.meta && typeof input.meta === "object" ? input.meta : {}),
          pluginId,
          injectKind: input.kind || "system",
        });
      },
      openPanel: async () => {
        if (pluginSheet) pluginSheet.hidden = false;
      },
      closePanel: () => closePluginSheet(),
      setToolbarBadge: async () => {},
      getPanelRoot: () => pluginPanel,
    });

    try {
      const mod = await loadPopPluginModule(plugin);
      if (typeof mod?.onToolbarClick !== "function") {
        deps.phoneToast?.("toast.pluginNoHandler");
        return;
      }
      await mod.onToolbarClick({
        host: bridge,
        panelRoot: pluginPanel,
        pluginId,
      });
    } catch (error) {
      console.warn("pop plugin failed", error);
      deps.phoneToast?.(safeUserFacingText(error?.message, 120) || pt("toast.pluginFail"));
      closePluginSheet();
    }
  }

  function onClick(event) {
    if (event.target.closest("[data-pop-game-close]")) {
      closeGameSheet();
      return;
    }
    if (event.target.closest("[data-pop-plugin-close]")) {
      closePluginSheet();
      return;
    }
    const startBtn = event.target.closest("[data-pop-start-game]");
    if (startBtn?.dataset.popStartGame) {
      startGame(startBtn.dataset.popStartGame);
      return;
    }
    const pluginBtn = event.target.closest("[data-pop-plugin]");
    if (pluginBtn?.dataset.popPlugin) {
      runPlugin(pluginBtn.dataset.popPlugin);
    }
  }

  root.addEventListener("click", onClick);
  renderGameList();

  return {
    renderToolbar,
    openGamePicker,
    queueGame,
    startGame,
    closeAllSheets,
    destroy() {
      root.removeEventListener("click", onClick);
    },
  };
}
