import { isManagedProductMode } from "../account/product-access.js";
import { getLocale, t } from "../i18n/index.js";
import {
  getCharacterHostedVoice,
  getVoiceSettings,
  hasHostedVoiceDefault,
} from "../settings/voice-preferences.js";
import { populateHostedVoiceSelect } from "./hosted-voices.js";
import { hostedSpeechStatus } from "./speech-routing.js";

export function hostedVoiceUiAvailable() {
  return Boolean(isManagedProductMode() && hostedSpeechStatus().tts);
}

/** Hosted TTS is on, but the account has not chosen a default voice yet. */
export function needsHostedVoiceSetup(settings = getVoiceSettings()) {
  return Boolean(hostedVoiceUiAvailable() && !hasHostedVoiceDefault(settings));
}

export function refreshHostedVoiceUi({ characterId = "" } = {}) {
  if (typeof document === "undefined") return;
  const locale = getLocale();
  const settings = getVoiceSettings();
  const hostedOn = hostedVoiceUiAvailable();
  const needsSetup = needsHostedVoiceSetup(settings);
  document.querySelectorAll("[data-hosted-voice-only]").forEach((node) => {
    node.hidden = !hostedOn;
  });
  document.querySelectorAll("[data-hosted-voice-setup-needed]").forEach((node) => {
    node.hidden = !needsSetup;
  });
  document.querySelectorAll("[data-hosted-voice-select]").forEach((select) => {
    const scope = select.getAttribute("data-hosted-voice-scope") || "user";
    const isCharacter = scope === "character";
    const selected = isCharacter
      ? getCharacterHostedVoice(select.getAttribute("data-character-id") || characterId)
      : (settings.hostedVoiceType || hostedSpeechStatus().defaultVoice);
    populateHostedVoiceSelect(select, {
      selected,
      includeFollowDefault: true,
      followDefaultLabel: isCharacter
        ? t("character.hostedVoiceFollowDefault")
        : t("character.hostedVoiceChoose"),
      femaleLabel: t("character.hostedVoiceFemale"),
      maleLabel: t("character.hostedVoiceMale"),
      locale,
    });
    select.classList.toggle("is-needs-setup", !isCharacter && needsSetup);
    select.setAttribute("aria-invalid", !isCharacter && needsSetup ? "true" : "false");
  });
}
