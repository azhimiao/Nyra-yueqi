/**
 * Chooses where a speech request runs.
 *
 * Priority: a key stored on this device wins (never billed), then Hosted cloud
 * speech for subscribers, then the device's built-in system voice. "none" means
 * this device genuinely cannot speak, which is the only case worth nagging the
 * user about.
 */

import { fetchBillingPricing } from "../billing/client.js";

export const SPEECH_ROUTE = Object.freeze({
  BYOK: "byok",
  HOSTED: "hosted",
  DEVICE: "device",
  NONE: "none",
});

const HOSTED_STATUS_TTL_MS = 5 * 60_000;

let hostedStatus = { tts: false, stt: false, reason: "unknown", checkedAt: 0, defaultVoice: "", voices: [] };
let inflight = null;

export function resolveSpeechRoute({
  hasDeviceKey = false,
  managed = false,
  hostedAvailable = false,
  deviceVoiceAvailable = false,
} = {}) {
  if (hasDeviceKey) return SPEECH_ROUTE.BYOK;
  if (managed && hostedAvailable) return SPEECH_ROUTE.HOSTED;
  if (deviceVoiceAvailable) return SPEECH_ROUTE.DEVICE;
  return SPEECH_ROUTE.NONE;
}

export function hostedSpeechStatus() {
  return { ...hostedStatus };
}

export function __setHostedSpeechStatusForTests(next = {}) {
  hostedStatus = { tts: false, stt: false, reason: "test", checkedAt: Date.now(), ...next };
  inflight = null;
}

/**
 * Reads hosted speech availability from the public pricing endpoint. Failures
 * leave the cached answer alone so a flaky network cannot silently downgrade a
 * subscriber to the system voice mid-session.
 */
export function refreshHostedSpeechStatus({ force = false } = {}) {
  const fresh = Date.now() - hostedStatus.checkedAt < HOSTED_STATUS_TTL_MS;
  if (!force && fresh) return Promise.resolve(hostedSpeechStatus());
  if (inflight) return inflight;
  inflight = fetchBillingPricing()
    .then((pricing) => {
      const voice = pricing?.voice || {};
      hostedStatus = {
        tts: Boolean(voice.hostedTts),
        stt: Boolean(voice.hostedStt),
        reason: String(voice.reason || ""),
        checkedAt: Date.now(),
        ttsCredits: Number(voice.ttsCredits) || null,
        sttCredits: Number(voice.sttCredits) || null,
        sampleChars: Number(voice.sampleChars) || null,
        defaultVoice: String(voice.defaultVoice || ""),
        voices: Array.isArray(voice.voices) ? voice.voices : [],
      };
      return hostedSpeechStatus();
    })
    .catch(() => hostedSpeechStatus())
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
