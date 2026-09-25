/**
 * 本地聊天助手桥接（F7 H6）— 剪贴板 / 粘贴导入为 Pop 草稿
 */

import { loadGatePrefs, saveGatePrefs } from "./gate-prefs.js";

/**
 * @param {HTMLElement} root
 * @param {{
 *   onImportDraft?: (text: string) => void,
 *   onToast?: (text: string) => void,
 * }} deps
 */
export function mountLocalChatAssistant(root, deps = {}) {
  if (!root) return { refresh() {}, destroy() {} };

  function refresh() {
    const prefs = loadGatePrefs();
    root.hidden = !prefs.localChatAssistantEnabled;
    const bridge = root.querySelector("[data-local-chat-bridge]");
    if (bridge) bridge.hidden = !prefs.localChatAssistantEnabled;
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-local-chat-import]")) {
      const input = root.querySelector("[data-local-chat-paste]");
      const text = String(input?.value || "").trim();
      if (!text) {
        deps.onToast?.("请先粘贴要导入的文本");
        return;
      }
      deps.onImportDraft?.(text);
      deps.onToast?.("已导入为 Pop 草稿（未发送）");
      return;
    }
    if (event.target.closest("[data-local-chat-clear]")) {
      const input = root.querySelector("[data-local-chat-paste]");
      if (input) input.value = "";
      const preview = root.querySelector("[data-local-chat-preview]");
      if (preview) preview.textContent = "";
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches?.("[data-local-chat-paste]")) {
      const preview = root.querySelector("[data-local-chat-preview]");
      if (preview) preview.textContent = String(event.target.value || "").slice(0, 280);
    }
  });

  refresh();
  return { refresh, destroy() {} };
}

export function setLocalChatAssistantEnabled(enabled) {
  return saveGatePrefs({ localChatAssistantEnabled: Boolean(enabled) });
}

export function isLocalChatAssistantEnabled() {
  return Boolean(loadGatePrefs().localChatAssistantEnabled);
}
