/**
 * BYOK voice catalogs: ElevenLabs (fetched), OpenAI / Volcengine (curated).
 * Keys stay on the device and are only forwarded to the local gateway.
 */

import { fetchVoiceJson } from "./client.js";
import { listHostedVoices } from "./hosted-voices.js";

export const OPENAI_TTS_VOICES = Object.freeze([
  Object.freeze({ id: "alloy", name: "Alloy", gender: "", description: "" }),
  Object.freeze({ id: "ash", name: "Ash", gender: "male", description: "" }),
  Object.freeze({ id: "coral", name: "Coral", gender: "female", description: "" }),
  Object.freeze({ id: "echo", name: "Echo", gender: "male", description: "" }),
  Object.freeze({ id: "fable", name: "Fable", gender: "male", description: "" }),
  Object.freeze({ id: "nova", name: "Nova", gender: "female", description: "" }),
  Object.freeze({ id: "onyx", name: "Onyx", gender: "male", description: "" }),
  Object.freeze({ id: "sage", name: "Sage", gender: "female", description: "" }),
  Object.freeze({ id: "shimmer", name: "Shimmer", gender: "female", description: "" }),
]);

/** Built-in ElevenLabs default (Rachel). Used only as a display name before the catalog loads. */
export const ELEVENLABS_DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const KNOWN_VOICE_NAMES = Object.freeze({
  [ELEVENLABS_DEFAULT_VOICE_ID]: "Rachel",
});

export const ELEVENLABS_TTS_MODELS = Object.freeze([
  Object.freeze({ id: "eleven_multilingual_v2", label: "Multilingual v2" }),
  Object.freeze({ id: "eleven_turbo_v2_5", label: "Turbo v2.5" }),
  Object.freeze({ id: "eleven_flash_v2_5", label: "Flash v2.5" }),
]);

export const OPENAI_TTS_MODELS = Object.freeze([
  Object.freeze({ id: "tts-1", label: "tts-1" }),
  Object.freeze({ id: "tts-1-hd", label: "tts-1-hd" }),
  Object.freeze({ id: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts" }),
]);

export const OPENAI_STT_MODELS = Object.freeze([
  Object.freeze({ id: "whisper-1", label: "whisper-1" }),
  Object.freeze({ id: "gpt-4o-mini-transcribe", label: "gpt-4o-mini-transcribe" }),
  Object.freeze({ id: "gpt-4o-transcribe", label: "gpt-4o-transcribe" }),
]);

export function normalizeCatalogVoice(raw = {}) {
  const id = String(raw.id || raw.voice_id || "").trim();
  if (!id) return null;
  const labels = raw.labels && typeof raw.labels === "object" ? raw.labels : {};
  const gender = String(raw.gender || labels.gender || "").trim();
  const accent = String(raw.accent || labels.accent || "").trim();
  const age = String(raw.age || labels.age || "").trim();
  const description = String(
    raw.description || labels.description || raw.preview || "",
  ).trim();
  const previewUrl = String(raw.previewUrl || raw.preview_url || "").trim();
  return {
    id,
    name: String(raw.name || id).trim() || id,
    category: String(raw.category || "").trim(),
    gender,
    accent,
    age,
    description,
    previewUrl: /^https:\/\//i.test(previewUrl) ? previewUrl : "",
    source: String(raw.source || "remote").trim() || "remote",
  };
}

export function curatedOpenAiVoices() {
  return OPENAI_TTS_VOICES.map((voice) => normalizeCatalogVoice({
    ...voice,
    source: "openai",
    category: "premade",
  }));
}

export function curatedVolcVoices() {
  return listHostedVoices().map((voice) => normalizeCatalogVoice({
    id: voice.id,
    name: voice.nameZh || voice.nameEn || voice.id,
    gender: voice.gender,
    source: "volc",
    category: "premade",
  }));
}

const cache = new Map();

function cacheKey(provider, apiKey) {
  const tail = String(apiKey || "").trim().slice(-6);
  return `${String(provider || "").trim()}:${tail}`;
}

export function rememberVoiceCatalog(provider, apiKey, voices) {
  const key = cacheKey(provider, apiKey);
  const list = (Array.isArray(voices) ? voices : []).map(normalizeCatalogVoice).filter(Boolean);
  cache.set(key, list);
  return list;
}

export function recalledVoiceCatalog(provider, apiKey) {
  return cache.get(cacheKey(provider, apiKey)) || null;
}

export async function fetchElevenLabsVoices(apiKey, options = {}) {
  const key = String(apiKey || "").trim();
  if (!key) {
    const error = new Error("missing_key");
    error.code = "missing_key";
    throw error;
  }
  const cached = recalledVoiceCatalog("ElevenLabs", key);
  if (cached && !options.force) return cached;
  const payload = await fetchVoiceJson("/voice/voices", {
    provider: "ElevenLabs",
    apiKey: key,
  }, options);
  const voices = (payload?.voices || []).map(normalizeCatalogVoice).filter(Boolean);
  return rememberVoiceCatalog("ElevenLabs", key, voices);
}

export function voiceMetaLine(voice, labels = {}) {
  if (!voice) return "";
  const parts = [];
  if (voice.gender === "female") parts.push(labels.female || "女声");
  else if (voice.gender === "male") parts.push(labels.male || "男声");
  if (voice.accent) parts.push(voice.accent);
  if (voice.age) parts.push(voice.age);
  if (voice.category && voice.category !== "premade") parts.push(voice.category);
  if (voice.description) parts.push(voice.description);
  return parts.filter(Boolean).join(" · ");
}

export function findCatalogVoice(voices, id) {
  const needle = String(id || "").trim();
  if (!needle) return null;
  return (voices || []).find((voice) => voice.id === needle) || null;
}

export function voiceIdFromSettings(settings = {}) {
  if (settings.ttsProvider === "OpenAI") return String(settings.openaiVoice || "").trim();
  if (settings.ttsProvider === "Volcengine") {
    return String(settings.volcSpeechVoiceType || settings.voiceId || "").trim();
  }
  return String(settings.voiceId || "").trim();
}

/**
 * Human label for the selected voice. Never returns a vendor hash when a name exists.
 */
export function resolveVoiceDisplayName(settings = {}, voices = []) {
  const id = voiceIdFromSettings(settings);
  if (!id) return "";
  const found = findCatalogVoice(voices, id)
    || findCatalogVoice(curatedOpenAiVoices(), id)
    || findCatalogVoice(curatedVolcVoices(), id);
  if (found?.name && found.name !== id) return found.name;
  return KNOWN_VOICE_NAMES[id] || "";
}
