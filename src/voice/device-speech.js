/**
 * The device's own speech engine — no key, no Credits, works offline.
 *
 * Browsers expose Web Speech; Android WebView does not, so the native bridge
 * covers the packaged app. Playback has no audio element, so lip sync stays on
 * the cloud routes.
 */

import { getNativeCapabilityPlugin } from "../platform/native-capabilities.js";

// The native bridge answers for any method name, so support is trusted only
// after the plugin reports which engines the OS actually has.
let nativeSpeech = { checked: false, tts: false, stt: false };
let webVoicesPresent = null;
let activeUtterance = null;
let activeRecognition = null;

function nativePlugin() {
  return getNativeCapabilityPlugin();
}

function webSynthesis() {
  const synthesis = globalThis.speechSynthesis;
  if (!synthesis || typeof globalThis.SpeechSynthesisUtterance !== "function") return null;
  return synthesis;
}

function recognitionConstructor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

export function deviceSpeechAvailable() {
  if (nativePlugin()) return nativeSpeech.tts;
  const synthesis = webSynthesis();
  if (!synthesis) return false;
  // A synthesis object with no installed voice speaks nothing and reports
  // nothing, so an empty voice list counts as unavailable.
  return webVoicesPresent === true || (synthesis.getVoices?.() || []).length > 0;
}

export function deviceRecognitionAvailable() {
  if (nativePlugin()) return nativeSpeech.stt;
  return Boolean(recognitionConstructor());
}

/** Asks the OS which speech engines are installed. Safe to call repeatedly. */
export async function refreshDeviceSpeechSupport() {
  const plugin = nativePlugin();
  if (plugin) {
    try {
      const status = await plugin.speechCapabilities();
      nativeSpeech = { checked: true, tts: Boolean(status?.tts), stt: Boolean(status?.stt) };
    } catch {
      nativeSpeech = { checked: true, tts: false, stt: false };
    }
    return deviceSpeechAvailable();
  }
  const synthesis = webSynthesis();
  if (!synthesis) {
    webVoicesPresent = false;
    return false;
  }
  await waitForWebVoices(synthesis, 800);
  webVoicesPresent = (synthesis.getVoices?.() || []).length > 0;
  return deviceSpeechAvailable();
}

function pickWebVoice(synthesis, locale) {
  const voices = synthesis.getVoices?.() || [];
  if (!voices.length) return null;
  const wanted = String(locale || "").toLowerCase();
  const language = wanted.split("-")[0];
  return voices.find((voice) => String(voice.lang || "").toLowerCase() === wanted)
    || voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith(language))
    || voices.find((voice) => voice.default)
    || voices[0];
}

/** Some engines populate the voice list asynchronously on first use. */
function waitForWebVoices(synthesis, timeoutMs = 400) {
  if ((synthesis.getVoices?.() || []).length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      synthesis.removeEventListener?.("voiceschanged", done);
      resolve();
    };
    synthesis.addEventListener?.("voiceschanged", done);
    setTimeout(done, timeoutMs);
  });
}

export function stopDeviceSpeech() {
  if (nativePlugin() && nativeSpeech.tts) {
    nativePlugin().stopSpeaking().catch(() => {});
  }
  const synthesis = webSynthesis();
  if (synthesis) {
    activeUtterance = null;
    synthesis.cancel();
  }
}

export function isDeviceSpeaking() {
  const synthesis = webSynthesis();
  if (synthesis) return Boolean(synthesis.speaking || activeUtterance);
  return false;
}

export async function speakWithDeviceVoice(text, { locale = "zh-CN", rate = 1, pitch = 1 } = {}) {
  const payload = String(text || "").trim();
  if (!payload) return;
  const plugin = nativePlugin();
  if (plugin && nativeSpeech.tts) {
    await plugin.speak({ text: payload, locale, rate, pitch });
    return;
  }
  const synthesis = webSynthesis();
  if (!synthesis) {
    const error = new Error("device_speech_unavailable");
    error.code = "device_speech_unavailable";
    throw error;
  }
  await waitForWebVoices(synthesis);
  synthesis.cancel();
  const utterance = new globalThis.SpeechSynthesisUtterance(payload);
  const voice = pickWebVoice(synthesis, locale);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || locale;
  utterance.rate = rate;
  utterance.pitch = pitch;
  activeUtterance = utterance;
  await new Promise((resolve, reject) => {
    // Some engines accept an utterance and then stay silent forever; without a
    // start deadline the caller's button would spin indefinitely.
    let startDeadline = setTimeout(() => {
      startDeadline = null;
      if (activeUtterance === utterance) activeUtterance = null;
      synthesis.cancel();
      reject(new Error("device_speech_failed"));
    }, 2_500);
    const clearDeadline = () => {
      if (startDeadline) clearTimeout(startDeadline);
      startDeadline = null;
    };
    utterance.onstart = clearDeadline;
    utterance.onend = () => {
      clearDeadline();
      if (activeUtterance === utterance) activeUtterance = null;
      resolve();
    };
    utterance.onerror = (event) => {
      clearDeadline();
      if (activeUtterance === utterance) activeUtterance = null;
      // Cancelling counts as a normal stop, not a failure worth surfacing.
      if (event?.error === "interrupted" || event?.error === "canceled") resolve();
      else reject(new Error("device_speech_failed"));
    };
    synthesis.speak(utterance);
  });
}

let dictationSession = null;

/** Opens a hold-to-talk dictation session; the text arrives on stop. */
export function startDeviceDictation({ locale = "zh-CN" } = {}) {
  if (dictationSession) return dictationSession;
  dictationSession = {
    promise: recognizeWithDeviceVoice({ locale }).catch(() => ""),
  };
  return dictationSession;
}

export async function stopDeviceDictation() {
  const session = dictationSession;
  dictationSession = null;
  if (!session) return "";
  stopDeviceRecognition();
  return session.promise;
}

export function stopDeviceRecognition() {
  dictationSession = null;
  if (activeRecognition) {
    try {
      activeRecognition.stop();
    } catch {
      /* already stopped */
    }
    activeRecognition = null;
  }
  if (nativePlugin() && nativeSpeech.stt) {
    nativePlugin().stopSpeechRecognition().catch(() => {});
  }
}

/**
 * Live dictation on the device. Resolves with the recognized text; the caller
 * still owns sending it, so this stays interchangeable with cloud transcription.
 */
export async function recognizeWithDeviceVoice({ locale = "zh-CN", onPartial } = {}) {
  const plugin = nativePlugin();
  if (plugin && nativeSpeech.stt) {
    const result = await plugin.startSpeechRecognition({ locale });
    return String(result?.text || "").trim();
  }
  const Recognition = recognitionConstructor();
  if (!Recognition) {
    const error = new Error("device_recognition_unavailable");
    error.code = "device_recognition_unavailable";
    throw error;
  }
  const recognition = new Recognition();
  recognition.lang = locale;
  recognition.interimResults = typeof onPartial === "function";
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  activeRecognition = recognition;
  try {
    return await new Promise((resolve, reject) => {
      let finalText = "";
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = String(result[0]?.transcript || "");
          if (result.isFinal) finalText += transcript;
          else interim += transcript;
        }
        if (interim && typeof onPartial === "function") onPartial(interim);
      };
      recognition.onerror = (event) => {
        const code = String(event?.error || "recognition_failed");
        if (code === "aborted" || code === "no-speech") resolve(finalText.trim());
        else reject(Object.assign(new Error("device_recognition_failed"), { code }));
      };
      recognition.onend = () => resolve(finalText.trim());
      recognition.start();
    });
  } finally {
    if (activeRecognition === recognition) activeRecognition = null;
  }
}
