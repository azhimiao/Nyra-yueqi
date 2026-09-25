import { splitBySentence, sleep } from "../chat/segmented-send.js";
import { getActiveCharacterId } from "../characters/store.js";
import { getVoiceSettings, isVoiceConfigured, resolveHostedVoiceType } from "../settings/voice-preferences.js";
import { fetchVoiceBinary } from "./client.js";
import { getLocale, t } from "../i18n/index.js";
import { isManagedProductMode } from "../account/product-access.js";
import {
  deviceSpeechAvailable,
  isDeviceSpeaking,
  speakWithDeviceVoice,
  stopDeviceSpeech,
} from "./device-speech.js";
import { SPEECH_ROUTE, hostedSpeechStatus, resolveSpeechRoute } from "./speech-routing.js";

import { attachLipSyncToAudio } from "../avatar/lip-sync.js";

const MAX_TTS_CHARS = 500;

let currentAudio = null;
let currentObjectUrl = "";
let currentButton = null;
let queueGeneration = 0;

export function getSpeechConfig(settings = getVoiceSettings()) {
  const volcAppId = String(settings.volcSpeechAppId || "").trim();
  const volcToken = String(settings.volcSpeechAccessToken || settings.ttsApiKey || "").trim();
  return {
    provider: settings.ttsProvider,
    apiKey: settings.ttsApiKey,
    voiceId: settings.voiceId,
    model: settings.ttsModel,
    openaiVoice: settings.openaiVoice,
    volcAppId,
    volcAccessToken: volcAppId ? volcToken : "",
    volcApiKey: volcAppId ? "" : volcToken,
    volcVoiceType: settings.volcSpeechVoiceType,
  };
}

export function speechRoute(settings = getVoiceSettings()) {
  return resolveSpeechRoute({
    hasDeviceKey: isVoiceConfigured(settings),
    managed: isManagedProductMode(),
    hostedAvailable: hostedSpeechStatus().tts,
    deviceVoiceAvailable: deviceSpeechAvailable(),
  });
}

export function canSpeak(settings = getVoiceSettings()) {
  return speechRoute(settings) !== SPEECH_ROUTE.NONE;
}

export function shouldAutoSpeak(settings = getVoiceSettings()) {
  if (!settings.autoSpeak || !canSpeak(settings)) return false;
  // Don't auto-speak on Hosted until a voice is resolved for the active character.
  if (speechRoute(settings) === SPEECH_ROUTE.HOSTED) {
    if (!resolveHostedVoiceType(getActiveCharacterId(), settings)) return false;
  }
  return true;
}

export async function synthesizeSpeech(text, config = getSpeechConfig(), options = {}) {
  const resolved = config && (config.ttsProvider || config.ttsApiKey)
    ? getSpeechConfig(config)
    : (config || getSpeechConfig());
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error(t("alerts.voiceNothingToSpeak", getLocale()));
  const route = options.route || speechRoute();
  if (route !== SPEECH_ROUTE.BYOK && route !== SPEECH_ROUTE.HOSTED) {
    throw new Error(t("alerts.voiceNeedKey", getLocale()));
  }
  const payload = trimmed.length > MAX_TTS_CHARS ? `${trimmed.slice(0, MAX_TTS_CHARS)}…` : trimmed;
  const hostedVoiceType = resolveHostedVoiceType(options.characterId || getActiveCharacterId());
  if (route === SPEECH_ROUTE.HOSTED && !hostedVoiceType) {
    throw new Error(t("alerts.voiceNeedHostedVoice", getLocale()));
  }
  const body = route === SPEECH_ROUTE.HOSTED
    ? { text: payload, voiceType: hostedVoiceType }
    : resolved.provider === "Volcengine"
      ? {
        provider: "Volcengine",
        volcApiKey: resolved.volcApiKey,
        volcAppId: resolved.volcAppId,
        volcAccessToken: resolved.volcAccessToken,
        volcVoiceType: resolved.volcVoiceType || resolved.voiceId,
        text: payload,
      }
      : {
        provider: resolved.provider,
        apiKey: resolved.apiKey,
        voiceId: resolved.voiceId,
        model: resolved.model,
        openaiVoice: resolved.openaiVoice,
        text: payload,
      };
  return fetchVoiceBinary("/voice/tts", body, {
    ...options,
    businessPurpose: options.businessPurpose || "voice.synthesize",
  });
}

function cleanupPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }
  if (currentButton) {
    currentButton.classList.remove("is-speaking");
    currentButton.disabled = false;
    currentButton = null;
  }
}

export function stopSpeech() {
  queueGeneration += 1;
  stopDeviceSpeech();
  cleanupPlayback();
}

export function isSpeaking() {
  return Boolean((currentAudio && !currentAudio.paused) || isDeviceSpeaking());
}

async function speakOnDevice(text, button = null) {
  const generation = queueGeneration;
  if (button) {
    currentButton = button;
    button.classList.add("is-speaking");
  }
  try {
    await speakWithDeviceVoice(text, { locale: getLocale() });
  } catch {
    if (generation === queueGeneration) throw new Error(t("alerts.voiceDeviceFailed", getLocale()));
  } finally {
    if (button) button.classList.remove("is-speaking");
    if (currentButton === button) currentButton = null;
  }
}

function playSpeechAndWait(blob, button = null) {
  const generation = queueGeneration;
  cleanupPlayback();
  currentObjectUrl = URL.createObjectURL(blob);
  currentAudio = new Audio(currentObjectUrl);
  currentButton = button;
  if (button) {
    button.classList.add("is-speaking");
    button.disabled = false;
  }
  let detachLip = () => {};
  try {
    detachLip = attachLipSyncToAudio(currentAudio) || (() => {});
  } catch {
    detachLip = () => {};
  }
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      try {
        detachLip();
      } catch {
        /* ignore */
      }
      cleanupPlayback();
      if (error && generation === queueGeneration) reject(error);
      else resolve();
    };
    currentAudio.addEventListener("ended", () => finish());
    currentAudio.addEventListener("error", () => finish(new Error("音频播放失败。")));
    currentAudio.play().catch((error) => finish(error));
  });
}

export async function playSpeech(blob, button = null) {
  await playSpeechAndWait(blob, button);
}

export async function speakMessageText(text, button = null) {
  const route = speechRoute();
  if (route === SPEECH_ROUTE.NONE) {
    throw new Error(t("alerts.voiceNeedKey", getLocale()));
  }
  if (button && button.classList.contains("is-speaking")) {
    stopSpeech();
    return;
  }
  if (route === SPEECH_ROUTE.DEVICE) {
    const payload = String(text || "").trim();
    if (!payload) throw new Error(t("alerts.voiceNothingToSpeak", getLocale()));
    stopSpeech();
    await speakOnDevice(payload, button);
    return;
  }
  if (button) button.disabled = true;
  try {
    const blob = await synthesizeSpeech(text, getSpeechConfig(), { route });
    await playSpeechAndWait(blob, button);
  } catch (error) {
    if (button) button.disabled = false;
    stopSpeech();
    throw error;
  }
}

export async function speakSegmentedText(text, options = {}) {
  if (!shouldAutoSpeak() && !options.force) return;
  const route = speechRoute();
  if (route === SPEECH_ROUTE.NONE) return;
  const parts = splitBySentence(String(text || "").trim(), { maxParts: options.maxParts || 4 });
  if (!parts.length) return;
  const generation = queueGeneration;
  for (const part of parts) {
    if (generation !== queueGeneration) break;
    if (route === SPEECH_ROUTE.DEVICE) {
      await speakOnDevice(part);
      if (generation !== queueGeneration) break;
    } else {
      const blob = await synthesizeSpeech(part, getSpeechConfig(), { route });
      if (generation !== queueGeneration) break;
      await playSpeechAndWait(blob);
      if (generation !== queueGeneration) break;
    }
    if (parts.length > 1) await sleep(options.pauseMs ?? 450);
  }
}
