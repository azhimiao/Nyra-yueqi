/**
 * Desktop pet companion sensing — three independent loops that can run in parallel:
 * - screenWatch: periodic screen frames → chat
 * - voiceChat: mic listen sessions → STT → chat
 * - systemAudio: OS loopback / desktop audio → STT → chat
 */
import {
  isElectronDesktop,
  getDesktopHostInfo,
  setDesktopSensing,
  captureDesktopScreen,
  getDesktopCaptureSourceId,
} from "../platform/desktop-host.js";

const DEFAULT_SENSING = {
  screenWatch: { enabled: false, intervalSec: 15 },
  voiceChat: { enabled: false },
  systemAudio: { enabled: false },
};

const INTERVAL_OPTIONS = [10, 15, 30, 60, 120];

let screenTimer = 0;
let voiceSession = null;
let systemSession = null;
let submitTurn = null;
let running = false;

export function getDefaultPetSensing() {
  return structuredClone(DEFAULT_SENSING);
}

export function normalizePetSensing(raw = {}) {
  const base = getDefaultPetSensing();
  const interval = Number(raw?.screenWatch?.intervalSec);
  return {
    screenWatch: {
      enabled: Boolean(raw?.screenWatch?.enabled),
      intervalSec: INTERVAL_OPTIONS.includes(interval) ? interval : base.screenWatch.intervalSec,
    },
    voiceChat: {
      enabled: Boolean(raw?.voiceChat?.enabled),
    },
    systemAudio: {
      enabled: Boolean(raw?.systemAudio?.enabled),
    },
  };
}

export function wirePetSensing({ onSubmitTurn } = {}) {
  submitTurn = typeof onSubmitTurn === "function" ? onSubmitTurn : null;
  return {
    apply: applySensing,
    stopAll,
    getDefaults: getDefaultPetSensing,
  };
}

export async function applySensing(sensingRaw, { petVisible = true } = {}) {
  if (!isElectronDesktop()) {
    stopAll();
    return getDefaultPetSensing();
  }
  const sensing = normalizePetSensing(sensingRaw);
  running = true;
  // 截帧读屏可在桌宠隐藏时继续；语音/系统音频仍要求桌宠开着
  syncScreenWatch(sensing);
  await syncVoiceChat(sensing, petVisible);
  await syncSystemAudio(sensing, petVisible);
  return sensing;
}

export function stopAll() {
  running = false;
  clearScreenWatch();
  stopVoiceChat();
  stopSystemAudio();
}

function clearScreenWatch() {
  if (screenTimer) {
    window.clearInterval(screenTimer);
    screenTimer = 0;
  }
}

function syncScreenWatch(sensing) {
  clearScreenWatch();
  if (!sensing.screenWatch.enabled || !submitTurn) return;
  const ms = Math.max(5, sensing.screenWatch.intervalSec) * 1000;
  const tick = async () => {
    if (!running || !sensing.screenWatch.enabled) return;
    try {
      // Host main refuses frames unless ScreenCaptureGate has a stored grant
      // (set when the user explicitly enables screenWatch).
      const shot = await captureDesktopScreen();
      const imageDataUrl = shot?.imageDataUrl || "";
      if (!imageDataUrl.startsWith("data:image/")) return;
      await submitTurn({
        imageDataUrl,
        text: "【读屏陪伴】这是刚才截到的屏幕画面。用简短陪伴语气告诉我你注意到了什么，不要列清单。",
        source: "desktop_screen_watch",
      });
    } catch (error) {
      console.warn("screen watch tick failed", error);
    }
  };
  // First tick after a short delay so opening pet is not blocked
  window.setTimeout(() => {
    if (running) tick();
  }, 1200);
  screenTimer = window.setInterval(tick, ms);
}

async function syncVoiceChat(sensing, petVisible) {
  if (!sensing.voiceChat.enabled || !petVisible || !submitTurn) {
    stopVoiceChat();
    return;
  }
  if (voiceSession) return;
  voiceSession = { stopped: false };
  runVoiceLoop(voiceSession).catch((error) => console.warn("voice chat loop failed", error));
}

function stopVoiceChat() {
  if (voiceSession) voiceSession.stopped = true;
  voiceSession = null;
}

async function runVoiceLoop(session) {
  while (session && !session.stopped && running) {
    let stream = null;
    let recorder = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const blob = await recordStreamChunk(stream, {
        maxMs: 8000,
        mimeType: pickAudioMime(),
        onRecorder: (rec) => {
          recorder = rec;
        },
      });
      if (session.stopped || !blob || blob.size < 1200) {
        await sleep(400);
        continue;
      }
      const audioDataUrl = await blobToDataUrl(blob);
      await submitTurn({
        audioDataUrl,
        text: "",
        source: "desktop_voice_chat",
      });
    } catch (error) {
      console.warn("voice chat chunk failed", error);
      await sleep(1500);
    } finally {
      try {
        recorder?.stop?.();
      } catch {
        /* ignore */
      }
      stream?.getTracks?.().forEach((track) => track.stop());
    }
    await sleep(600);
  }
}

async function syncSystemAudio(sensing, petVisible) {
  if (!sensing.systemAudio.enabled || !petVisible || !submitTurn) {
    stopSystemAudio();
    return;
  }
  if (systemSession) return;
  systemSession = { stopped: false };
  runSystemAudioLoop(systemSession).catch((error) => console.warn("system audio loop failed", error));
}

function stopSystemAudio() {
  if (systemSession) systemSession.stopped = true;
  systemSession = null;
}

async function runSystemAudioLoop(session) {
  let stream = null;
  try {
    stream = await openSystemAudioStream();
  } catch (error) {
    console.warn("system audio permission/stream failed", error);
    systemSession = null;
    return;
  }

  while (session && !session.stopped && running && stream) {
    let recorder = null;
    try {
      const blob = await recordStreamChunk(stream, {
        maxMs: 12000,
        mimeType: pickAudioMime(),
        onRecorder: (rec) => {
          recorder = rec;
        },
      });
      if (session.stopped || !blob || blob.size < 1500) {
        await sleep(500);
        continue;
      }
      const audioDataUrl = await blobToDataUrl(blob);
      await submitTurn({
        audioDataUrl,
        text: "【本机声音】这是电脑里正在播放/发出的声音转写结果，结合它陪我聊聊。",
        source: "desktop_system_audio",
      });
    } catch (error) {
      console.warn("system audio chunk failed", error);
      await sleep(2000);
    } finally {
      try {
        recorder?.stop?.();
      } catch {
        /* ignore */
      }
    }
    await sleep(800);
  }

  stream?.getTracks?.().forEach((track) => track.stop());
}

async function openSystemAudioStream() {
  const sourceId = await getDesktopCaptureSourceId();
  if (sourceId && navigator.mediaDevices?.getUserMedia) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            maxWidth: 1,
            maxHeight: 1,
          },
        },
      });
    } catch {
      // fall through to display media
    }
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("SYSTEM_AUDIO_UNSUPPORTED");
  }
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  // Keep audio only if possible
  display.getVideoTracks().forEach((track) => {
    track.enabled = false;
  });
  return display;
}

function recordStreamChunk(stream, { maxMs = 8000, mimeType = "", onRecorder } = {}) {
  return new Promise((resolve, reject) => {
    const options = mimeType ? { mimeType } : undefined;
    let recorder;
    try {
      recorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
    } catch (error) {
      reject(error);
      return;
    }
    onRecorder?.(recorder);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error("RECORDER_ERROR"));
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    };
    recorder.start(250);
    window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, maxMs);
  });
}

function pickAudioMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(blob);
  });
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function loadPetSensingFromHost() {
  if (!isElectronDesktop()) return getDefaultPetSensing();
  const info = await getDesktopHostInfo();
  return normalizePetSensing(info.sensing || getDefaultPetSensing());
}

export async function savePetSensing(patch) {
  const current = await loadPetSensingFromHost();
  const next = normalizePetSensing({
    screenWatch: { ...current.screenWatch, ...patch.screenWatch },
    voiceChat: { ...current.voiceChat, ...patch.voiceChat },
    systemAudio: { ...current.systemAudio, ...patch.systemAudio },
  });
  await setDesktopSensing(next);
  return next;
}

/** Toggle periodic screen-frame companion (Doubao-style 截帧读屏). */
export async function toggleScreenWatch(enabled, { intervalSec, petVisible = true } = {}) {
  const current = await loadPetSensingFromHost();
  const nextEnabled = typeof enabled === "boolean" ? enabled : !current.screenWatch.enabled;
  const next = await savePetSensing({
    screenWatch: {
      enabled: nextEnabled,
      intervalSec: Number(intervalSec) || current.screenWatch.intervalSec || 15,
    },
  });
  await applySensing(next, { petVisible: Boolean(petVisible) });
  return next;
}

export { INTERVAL_OPTIONS };
