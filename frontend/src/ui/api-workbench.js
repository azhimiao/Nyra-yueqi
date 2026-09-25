/**
 * 接口页：入口列表 → 点进详情配置。
 */
import { refreshIcons } from "../lib/icons.js";

function filled(el) {
  return Boolean(el?.value?.trim());
}

function updateStatuses(root) {
  const modelReady =
    filled(root.querySelector("[data-provider-api-key]")) ||
    filled(root.querySelector("[data-provider-base-url]"));
  const voiceReady =
    filled(root.querySelector("[data-voice-tts-api-key]")) ||
    filled(root.querySelector("[data-voice-stt-api-key]")) ||
    filled(root.querySelector("[data-voice-volc-access-token]"));

  const modelStatus = root.querySelector('[data-api-status="model"]');
  const voiceStatus = root.querySelector('[data-api-status="voice"]');
  if (modelStatus) modelStatus.textContent = modelReady ? "已配置" : "未配置";
  if (voiceStatus) voiceStatus.textContent = voiceReady ? "已配置" : "未配置";
  modelStatus?.classList.toggle("is-ready", modelReady);
  voiceStatus?.classList.toggle("is-ready", voiceReady);
}

export function wireApiWorkbench({
  root = document.querySelector("[data-api-workbench]"),
} = {}) {
  if (!root || root.dataset.wired === "1") {
    return { open: () => {}, back: () => {}, refreshStatus: () => {} };
  }
  root.dataset.wired = "1";

  const hub = root.querySelector("[data-api-hub]");
  const details = [...root.querySelectorAll("[data-api-detail]")].filter(
    (el) => el.dataset.apiDetail !== "viber",
  );

  function showHub() {
    root.dataset.apiView = "hub";
    if (hub) hub.hidden = false;
    details.forEach((panel) => {
      panel.hidden = true;
    });
    updateStatuses(root);
  }

  function open(id) {
    const panel = root.querySelector(`[data-api-detail="${id}"]`);
    if (!panel || id === "viber") return;
    root.dataset.apiView = id;
    if (hub) hub.hidden = true;
    details.forEach((el) => {
      el.hidden = el !== panel;
    });
    refreshIcons();
  }

  root.addEventListener("click", (event) => {
    const openBtn = event.target.closest("[data-api-open]");
    if (openBtn && root.contains(openBtn)) {
      open(openBtn.dataset.apiOpen);
      return;
    }
    const backBtn = event.target.closest("[data-api-back]");
    if (backBtn && root.contains(backBtn)) {
      showHub();
    }
  });

  root.addEventListener("input", () => updateStatuses(root));
  root.addEventListener("change", () => updateStatuses(root));

  const body = document.body;
  const observer = new MutationObserver(() => {
    if (body.dataset.activePanel !== "api" && root.dataset.apiView !== "hub") {
      showHub();
    } else if (body.dataset.activePanel === "api") {
      updateStatuses(root);
    }
  });
  observer.observe(body, { attributes: true, attributeFilter: ["data-active-panel"] });

  showHub();
  refreshIcons();

  return {
    open,
    back: showHub,
    refreshStatus: () => updateStatuses(root),
  };
}
