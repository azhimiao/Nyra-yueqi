/**
 * Speech routing rules for /voice/tts and /voice/stt.
 *
 * Three routes exist, in priority order:
 *   1. `byok`   — the device supplied its own speech key; never charged.
 *   2. `hosted` — a Hosted account and the operator wired a speech supplier
 *                 with unit prices; charged in Credits.
 *   3. rejected — no key and no hosted supplier. The client then falls back to
 *                 the device's built-in system voice.
 *
 * Messages here are user-facing, so they name no upstream supplier.
 */

const CAPABILITY_COPY = Object.freeze({
  tts: Object.freeze({
    byokError: "voice_not_configured",
    byokMessage: "请在接口页配置 TTS API Key。",
    hostedMessage: "云端语音暂时不可用；你也可以在接口设置里填入自己的语音密钥。",
  }),
  stt: Object.freeze({
    byokError: "stt_not_configured",
    byokMessage: "请在接口页配置 STT API Key。",
    hostedMessage: "云端语音识别暂时不可用；你也可以在接口设置里填入自己的语音密钥。",
  }),
});

function copyFor(capability) {
  return CAPABILITY_COPY[capability] || CAPABILITY_COPY.tts;
}

/**
 * @returns {{ route: "byok" | "hosted", rejection: null }
 *   | { route: null, rejection: { status: number, error: string, message: string } }}
 */
export function resolveVoiceRoute({
  managed = false,
  apiKey = "",
  byokAvailable = false,
  capability = "tts",
  hostedAvailable = false,
} = {}) {
  if (String(apiKey || "").trim() || byokAvailable) return { route: "byok", rejection: null };
  if (managed && hostedAvailable) return { route: "hosted", rejection: null };
  const copy = copyFor(capability);
  if (managed) {
    return {
      route: null,
      rejection: {
        status: 503,
        error: "hosted_speech_unavailable",
        message: copy.hostedMessage,
      },
    };
  }
  return {
    route: null,
    rejection: {
      status: 400,
      error: copy.byokError,
      message: copy.byokMessage,
    },
  };
}

/** @returns {null | { status: number, error: string, message: string }} */
export function voiceKeyRejection(input = {}) {
  return resolveVoiceRoute(input).rejection;
}
