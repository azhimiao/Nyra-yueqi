import { voiceServiceUrl } from "./client.js";
import { localServiceHeaders } from "../platform/local-service.js";
import { getVoiceSettings } from "../settings/voice-preferences.js";
import { getLocale, t } from "../i18n/index.js";
import { isManagedProductMode, readProductAccess } from "../account/product-access.js";
import {
  deviceRecognitionAvailable,
  startDeviceDictation,
  stopDeviceDictation,
  stopDeviceRecognition,
} from "./device-speech.js";
import { SPEECH_ROUTE, hostedSpeechStatus, resolveSpeechRoute } from "./speech-routing.js";
import {
  startModelExecutionTrace,
  finishModelExecutionTrace,
  failModelExecutionTrace,
} from "../observability/model-execution-trace.js";

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function getSttConfig(settings = getVoiceSettings()) {
  const provider = settings.sttProvider || "OpenAI Whisper";
  if (provider === "Volcengine") {
    const volcAppId = String(settings.volcSpeechAppId || "").trim();
    const volcToken = String(settings.volcSpeechAccessToken || settings.sttApiKey || settings.ttsApiKey || "").trim();
    return {
      provider,
      volcAppId,
      volcAccessToken: volcAppId ? volcToken : "",
      volcApiKey: volcAppId ? "" : volcToken,
      model: settings.sttModel || "bigmodel",
    };
  }
  const apiKey = String(settings.sttApiKey || settings.ttsApiKey || "").trim();
  return {
    apiKey,
    model: settings.sttModel || "whisper-1",
    provider,
  };
}

export function isSttConfigured(settings = getVoiceSettings()) {
  const config = getSttConfig(settings);
  if (config.provider === "Volcengine") {
    return Boolean((config.volcAppId && config.volcAccessToken) || config.volcApiKey);
  }
  return Boolean(config.apiKey);
}

export function sttRoute(settings = getVoiceSettings()) {
  return resolveSpeechRoute({
    hasDeviceKey: isSttConfigured(settings),
    managed: isManagedProductMode(),
    hostedAvailable: hostedSpeechStatus().stt,
    deviceVoiceAvailable: deviceRecognitionAvailable(),
  });
}

export function canTranscribe(settings = getVoiceSettings()) {
  return sttRoute(settings) !== SPEECH_ROUTE.NONE;
}

/**
 * Device dictation listens live, so hold-to-talk has to open it at press time.
 * Returns false when this device is on a cloud route and nothing was started.
 */
export function beginDictation(settings = getVoiceSettings()) {
  if (sttRoute(settings) !== SPEECH_ROUTE.DEVICE) return false;
  startDeviceDictation({ locale: getLocale() });
  return true;
}

export function cancelDictation() {
  stopDeviceRecognition();
}

/** Turns a finished hold-to-talk gesture into text on whichever route applies. */
export async function transcribeRecording(blob, config = getSttConfig(), options = {}) {
  const route = options.route || sttRoute();
  if (route === SPEECH_ROUTE.DEVICE) {
    const text = await stopDeviceDictation();
    if (!text) throw new Error(t("alerts.voiceNoSpeechHeard", getLocale()));
    return { text, modelExecutionId: "", billing: null };
  }
  return transcribeAudio(blob, config, { ...options, route });
}

export async function transcribeAudio(blob, config = getSttConfig(), options = {}) {
  if (!blob) throw new Error("No audio is available to transcribe.");
  const route = options.route || sttRoute();
  // Device dictation works on a live microphone, not on a finished recording,
  // so this upload path only serves the two cloud routes.
  if (route !== SPEECH_ROUTE.BYOK && route !== SPEECH_ROUTE.HOSTED) {
    throw new Error(t("alerts.voiceNeedKey", getLocale()));
  }

  const startedAt = Date.now();
  const modelExecutionId = startModelExecutionTrace({
    turnExecutionId: options.turnExecutionId,
    userId: options.userId || readProductAccess().userId,
    companionId: options.companionId || options.characterId,
    businessPurpose: options.businessPurpose || "voice.transcribe",
    capability: "stt",
    providerMode: isManagedProductMode() ? "managed" : "byok",
    provider: "model-gateway",
    model: isManagedProductMode() ? "server-resolved" : config.model,
  });

  let response;
  try {
    const byokBody = route === SPEECH_ROUTE.BYOK
      ? (config.provider === "Volcengine"
        ? {
          provider: "Volcengine",
          volcApiKey: config.volcApiKey,
          volcAppId: config.volcAppId,
          volcAccessToken: config.volcAccessToken,
          model: config.model,
        }
        : { apiKey: config.apiKey, model: config.model, provider: config.provider })
      : {};
    response = await fetch(voiceServiceUrl("/voice/stt"), {
      method: "POST",
      headers: await localServiceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...byokBody,
        audioBase64: await blobToBase64(blob),
        mimeType: blob.type || "audio/webm",
        filename: blob.type?.includes("mp4") ? "recording.m4a" : "recording.webm",
        modelExecutionId,
        businessPurpose: options.businessPurpose || "voice.transcribe",
        companionId: options.companionId || options.characterId || "",
      }),
    });
  } catch (error) {
    failModelExecutionTrace(modelExecutionId, error, { latencyMs: Date.now() - startedAt });
    throw error;
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(String(payload.message || payload.error || `${response.status} transcription failed`).slice(0, 200));
    failModelExecutionTrace(modelExecutionId, error, {
      latencyMs: Date.now() - startedAt,
      billing: payload.billing,
    });
    throw error;
  }

  const text = String(payload.text || "").trim();
  if (!text) {
    const error = new Error("The speech provider returned no recognized text.");
    failModelExecutionTrace(modelExecutionId, error, { latencyMs: Date.now() - startedAt });
    throw error;
  }
  finishModelExecutionTrace(modelExecutionId, {
    model: payload.model || config.model,
    latencyMs: payload.latencyMs || Date.now() - startedAt,
    usage: payload.usage || null,
    billing: payload.billing || null,
  });
  return { text, modelExecutionId, billing: payload.billing || null };
}
