import { DEFAULT_VOICE, LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { defaultHostedVoiceId, normalizeHostedVoiceId } from "../voice/hosted-voices.js";
import { hostedSpeechStatus } from "../voice/speech-routing.js";

function cloneHostedVoiceMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next = {};
  for (const [characterId, voiceType] of Object.entries(value)) {
    const id = String(characterId || "").trim();
    const voice = normalizeHostedVoiceId(voiceType);
    if (id && voice) next[id] = voice;
  }
  return next;
}

export function getVoiceSettings() {
  const stored = readLocalObject(LOCAL_KEYS.voiceKey, {});
  return {
    ...DEFAULT_VOICE,
    ...stored,
    hostedVoiceType: normalizeHostedVoiceId(stored.hostedVoiceType),
    hostedVoiceByCharacterId: cloneHostedVoiceMap(stored.hostedVoiceByCharacterId),
  };
}

export function saveVoiceSettings(partial = {}) {
  const next = { ...getVoiceSettings(), ...partial };
  writeLocalObject(LOCAL_KEYS.voiceKey, next);
  return next;
}

/**
 * True when this device holds its own speech key, which is the highest-priority
 * route and is never billed. Hosted cloud speech and the device's built-in voice
 * are resolved separately in `src/voice/speech-routing.js`.
 */
export function isVoiceConfigured(settings = getVoiceSettings()) {
  if (settings.ttsProvider === "Volcengine") {
    const token = String(settings.volcSpeechAccessToken || settings.ttsApiKey || "").trim();
    const voice = String(settings.volcSpeechVoiceType || settings.voiceId || "").trim();
    const appId = String(settings.volcSpeechAppId || "").trim();
    return Boolean(voice && token && (appId || token));
  }
  const apiKey = String(settings.ttsApiKey || "").trim();
  if (!apiKey) return false;
  if (settings.ttsProvider === "ElevenLabs") {
    return Boolean(String(settings.voiceId || "").trim());
  }
  if (settings.ttsProvider === "OpenAI") {
    return Boolean(String(settings.ttsModel || "tts-1").trim());
  }
  return false;
}

export function isSttConfigured(settings = getVoiceSettings()) {
  if (settings.sttProvider === "Volcengine") {
    const token = String(settings.volcSpeechAccessToken || settings.sttApiKey || settings.ttsApiKey || "").trim();
    const appId = String(settings.volcSpeechAppId || "").trim();
    return Boolean(token && (appId || token));
  }
  return Boolean(String(settings.sttApiKey || settings.ttsApiKey || "").trim());
}

export function exportVoiceSettingsForBackup(settings = getVoiceSettings()) {
  const { ttsApiKey, sttApiKey, ...rest } = settings;
  return rest;
}

export function collectVoiceConfig(nodes = {}) {
  const existing = getVoiceSettings();
  const {
    voiceTtsProvider,
    voiceTtsApiKey,
    voiceId,
    voiceTtsModel,
    voiceOpenaiVoice,
    voiceVolcAppId,
    voiceVolcAccessToken,
    voiceVolcVoiceType,
    voiceHostedVoiceType,
    voiceSttProvider,
    voiceSttApiKey,
    voiceSttModel,
    voiceAutoSpeak,
  } = nodes;
  return {
    ttsProvider: voiceTtsProvider?.value || DEFAULT_VOICE.ttsProvider,
    ttsApiKey: voiceTtsApiKey?.value.trim() || "",
    voiceId: voiceId?.value.trim() || DEFAULT_VOICE.voiceId,
    ttsModel: voiceTtsModel?.value.trim() || DEFAULT_VOICE.ttsModel,
    openaiVoice: voiceOpenaiVoice?.value.trim() || DEFAULT_VOICE.openaiVoice,
    volcSpeechAppId: voiceVolcAppId?.value.trim() || "",
    volcSpeechAccessToken: voiceVolcAccessToken?.value.trim() || "",
    volcSpeechVoiceType: voiceVolcVoiceType?.value.trim() || "",
    hostedVoiceType: normalizeHostedVoiceId(
      voiceHostedVoiceType?.value ?? existing.hostedVoiceType,
    ),
    hostedVoiceByCharacterId: existing.hostedVoiceByCharacterId,
    sttProvider: voiceSttProvider?.value || DEFAULT_VOICE.sttProvider,
    sttApiKey: voiceSttApiKey?.value.trim() || "",
    sttModel: voiceSttModel?.value.trim() || DEFAULT_VOICE.sttModel,
    autoSpeak: Boolean(voiceAutoSpeak?.checked),
  };
}

export function applyVoiceConfigToNodes(config = getVoiceSettings(), nodes = {}) {
  const {
    voiceTtsProvider,
    voiceTtsApiKey,
    voiceId,
    voiceTtsModel,
    voiceOpenaiVoice,
    voiceVolcAppId,
    voiceVolcAccessToken,
    voiceVolcVoiceType,
    voiceHostedVoiceType,
    voiceSttProvider,
    voiceSttApiKey,
    voiceSttModel,
    voiceAutoSpeak,
  } = nodes;
  if (voiceTtsProvider) voiceTtsProvider.value = config.ttsProvider || DEFAULT_VOICE.ttsProvider;
  if (voiceTtsApiKey) voiceTtsApiKey.value = config.ttsApiKey || "";
  if (voiceId) voiceId.value = config.voiceId || DEFAULT_VOICE.voiceId;
  if (voiceTtsModel) voiceTtsModel.value = config.ttsModel || DEFAULT_VOICE.ttsModel;
  if (voiceOpenaiVoice) voiceOpenaiVoice.value = config.openaiVoice || DEFAULT_VOICE.openaiVoice;
  if (voiceVolcAppId) voiceVolcAppId.value = config.volcSpeechAppId || "";
  if (voiceVolcAccessToken) voiceVolcAccessToken.value = config.volcSpeechAccessToken || "";
  if (voiceVolcVoiceType) voiceVolcVoiceType.value = config.volcSpeechVoiceType || "";
  if (voiceHostedVoiceType) voiceHostedVoiceType.value = config.hostedVoiceType || "";
  if (voiceSttProvider) voiceSttProvider.value = config.sttProvider || DEFAULT_VOICE.sttProvider;
  if (voiceSttApiKey) voiceSttApiKey.value = config.sttApiKey || "";
  if (voiceSttModel) voiceSttModel.value = config.sttModel || DEFAULT_VOICE.sttModel;
  if (voiceAutoSpeak) voiceAutoSpeak.checked = Boolean(config.autoSpeak);
}

/** True when Hosted speech can resolve a speaker without more setup. */
export function hasHostedVoiceDefault(settings = getVoiceSettings()) {
  return Boolean(resolveHostedVoiceType("", settings));
}

/**
 * Character override → user pick → operator default → catalog fallback.
 * Paid mode must speak without a lab visit.
 */
export function resolveHostedVoiceType(characterId = "", settings = getVoiceSettings()) {
  const map = cloneHostedVoiceMap(settings.hostedVoiceByCharacterId);
  const fromCharacter = normalizeHostedVoiceId(map[String(characterId || "").trim()]);
  if (fromCharacter) return fromCharacter;
  const fromUser = normalizeHostedVoiceId(settings.hostedVoiceType);
  if (fromUser) return fromUser;
  return defaultHostedVoiceId(hostedSpeechStatus().defaultVoice);
}

export function getCharacterHostedVoice(characterId, settings = getVoiceSettings()) {
  const map = cloneHostedVoiceMap(settings.hostedVoiceByCharacterId);
  return normalizeHostedVoiceId(map[String(characterId || "").trim()]);
}

export function setCharacterHostedVoice(characterId, voiceType) {
  const id = String(characterId || "").trim();
  if (!id) return getVoiceSettings();
  const settings = getVoiceSettings();
  const map = cloneHostedVoiceMap(settings.hostedVoiceByCharacterId);
  const next = normalizeHostedVoiceId(voiceType);
  if (!next) delete map[id];
  else map[id] = next;
  return saveVoiceSettings({ hostedVoiceByCharacterId: map });
}
