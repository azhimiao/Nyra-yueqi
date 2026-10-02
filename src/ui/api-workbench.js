/**
 * 接口页：入口列表 → 点进详情配置。
 */
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import { collectVoiceConfig, isSttConfigured, isVoiceConfigured } from "../settings/voice-preferences.js";
import { collectProviderConfig } from "../model/client.js";

function updateStatuses(root) {
  // Use the actual request collector, including provider defaults and Hosted
  // routing, so this label cannot drift from the connection being sent.
  const config = collectProviderConfig({
    providerKind: root.querySelector("[data-provider-kind]"),
    providerBaseUrl: root.querySelector("[data-provider-base-url]"),
    providerApiKey: root.querySelector("[data-provider-api-key]"),
    providerModel: root.querySelector("[data-provider-model]"),
  });
  const modelReady = Boolean(config.baseUrl && config.apiKey && config.model);

  const voiceConfig = collectVoiceConfig({
    voiceTtsProvider: root.querySelector("[data-voice-tts-provider]"),
    voiceTtsApiKey: root.querySelector("[data-voice-tts-api-key]"),
    voiceId: root.querySelector("[data-voice-id]"),
    voiceTtsModel: root.querySelector("[data-voice-tts-model]"),
    voiceOpenaiVoice: root.querySelector("[data-voice-openai-voice]"),
    voiceVolcAppId: root.querySelector("[data-voice-volc-app-id]"),
    voiceVolcAccessToken: root.querySelector("[data-voice-volc-access-token]"),
    voiceVolcVoiceType: root.querySelector("[data-voice-volc-voice-type]"),
    voiceHostedVoiceType: root.querySelector("[data-voice-hosted-voice-type]"),
    voiceSttProvider: root.querySelector("[data-voice-stt-provider]"),
    voiceSttApiKey: root.querySelector("[data-voice-stt-api-key]"),
    voiceSttModel: root.querySelector("[data-voice-stt-model]"),
    voiceAutoSpeak: root.querySelector("[data-voice-auto-speak]"),
  });
  const ttsReady = isVoiceConfigured(voiceConfig);
  const sttReady = isSttConfigured(voiceConfig);
  const voiceReady = ttsReady || sttReady;
  const voicePartial = ttsReady !== sttReady;

  const modelStatus = root.querySelector('[data-api-status="model"]');
  const voiceStatus = root.querySelector('[data-api-status="voice"]');
  if (modelStatus) modelStatus.textContent = modelReady ? t("nav.apiConfigured") : t("nav.apiIncomplete");
  if (voiceStatus) voiceStatus.textContent = voicePartial ? t("nav.apiPartial") : (voiceReady ? t("nav.apiConfigured") : t("nav.apiUnconfigured"));
  modelStatus?.classList.toggle("is-ready", modelReady);
  voiceStatus?.classList.toggle("is-ready", voiceReady && !voicePartial);
  voiceStatus?.classList.toggle("is-partial", voicePartial);
  if (modelStatus) {
    modelStatus.title = modelReady
      ? t("nav.apiModelReadyHint")
      : t("nav.apiModelIncompleteHint");
  }
  if (voiceStatus) {
    voiceStatus.title = voicePartial
      ? t("nav.apiVoicePartialHint")
      : (voiceReady ? t("nav.apiVoiceReadyHint") : t("nav.apiVoiceEmptyHint"));
  }
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
  window.addEventListener("yueqi:product-access-changed", () => updateStatuses(root));
  window.addEventListener("yueqi:locale-changed", () => updateStatuses(root));

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
