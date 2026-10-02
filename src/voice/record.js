import { getNativeCapabilityPlugin } from "../platform/native-capabilities.js";

const MAX_RECORD_MS = 60000;

let mediaRecorder = null;
let mediaStream = null;
let chunks = [];
let startedAt = 0;
let stopTimer = null;
let nativeRecording = false;

function cleanupStream() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

export function isRecording() {
  return nativeRecording || Boolean(mediaRecorder && mediaRecorder.state === "recording");
}

export async function startRecording() {
  if (isRecording()) return { started: true };
  const native = getNativeCapabilityPlugin();
  if (native?.startMicrophoneCapture) {
    await native.startMicrophoneCapture();
    nativeRecording = true;
    startedAt = Date.now();
    stopTimer = window.setTimeout(() => {
      stopRecording().catch(() => {});
    }, MAX_RECORD_MS);
    return { started: true, source: "android-native" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前环境不支持录音。");
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "";
  mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  startedAt = Date.now();
  mediaRecorder.start();
  stopTimer = window.setTimeout(() => {
    stopRecording().catch(() => {});
  }, MAX_RECORD_MS);
  return { started: true };
}

export async function stopRecording() {
  if (nativeRecording) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
    const durationMs = Math.max(0, Date.now() - startedAt);
    const native = getNativeCapabilityPlugin();
    try {
      const result = await native.stopMicrophoneCapture();
      const blob = result?.dataUrl ? await (await fetch(result.dataUrl)).blob() : null;
      return {
        blob,
        mimeType: result?.mimeType || blob?.type || "audio/mp4",
        durationMs,
        source: "android-native",
      };
    } finally {
      nativeRecording = false;
    }
  }
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    return { blob: null, mimeType: "", durationMs: 0 };
  }
  window.clearTimeout(stopTimer);
  stopTimer = null;
  const durationMs = Math.max(0, Date.now() - startedAt);
  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      const mimeType = mediaRecorder.mimeType || "audio/webm";
      const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
      cleanupStream();
      mediaRecorder = null;
      chunks = [];
      resolve({ blob, mimeType, durationMs });
    };
    mediaRecorder.onerror = () => {
      cleanupStream();
      mediaRecorder = null;
      chunks = [];
      reject(new Error("录音失败，请重试。"));
    };
    mediaRecorder.stop();
  });
}

export async function cancelRecording() {
  if (nativeRecording) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
    nativeRecording = false;
    await getNativeCapabilityPlugin()?.cancelMicrophoneCapture?.().catch?.(() => {});
    return;
  }
  if (!mediaRecorder) return;
  window.clearTimeout(stopTimer);
  stopTimer = null;
  if (mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  cleanupStream();
  mediaRecorder = null;
  chunks = [];
}
