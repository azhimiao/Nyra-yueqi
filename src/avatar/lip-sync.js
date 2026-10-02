/**
 * TTS → mouth open amount via Web Audio AnalyserNode.
 * Dispatches `yueqi:lip-sync` CustomEvent on document.
 */

let audioContext = null;
let analyser = null;
let sourceNode = null;
let raf = 0;
let attachedAudio = null;

function ensureContext() {
  if (audioContext) return audioContext;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioContext = new Ctx();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.72;
  return audioContext;
}

function sampleOpen() {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  const end = Math.min(data.length, 48);
  for (let i = 2; i < end; i += 1) sum += data[i];
  const avg = sum / Math.max(1, end - 2);
  return Math.min(1, avg / 140);
}

function tick() {
  const open = sampleOpen();
  document.dispatchEvent(new CustomEvent("yueqi:lip-sync", {
    detail: { open, speaking: true, source: "tts-analyser" },
  }));
  raf = window.requestAnimationFrame(tick);
}

export function attachLipSyncToAudio(audio) {
  if (!audio || typeof audio !== "object") return () => {};
  const ctx = ensureContext();
  if (!ctx || !analyser) return () => {};

  detachLipSync();
  attachedAudio = audio;
  try {
    sourceNode = ctx.createMediaElementSource(audio);
    sourceNode.connect(analyser);
    analyser.connect(ctx.destination);
  } catch {
    // Element already connected elsewhere — still try analyser if possible
    try {
      analyser.connect(ctx.destination);
    } catch {
      /* ignore */
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  raf = window.requestAnimationFrame(tick);

  const onEnded = () => {
    document.dispatchEvent(new CustomEvent("yueqi:lip-sync", {
      detail: { open: 0, speaking: false, source: "tts-analyser" },
    }));
    detachLipSync();
  };
  audio.addEventListener("ended", onEnded);
  audio.addEventListener("pause", onEnded);

  return () => {
    audio.removeEventListener("ended", onEnded);
    audio.removeEventListener("pause", onEnded);
    detachLipSync();
  };
}

export function detachLipSync() {
  if (raf) {
    window.cancelAnimationFrame(raf);
    raf = 0;
  }
  try {
    sourceNode?.disconnect();
  } catch {
    /* ignore */
  }
  sourceNode = null;
  attachedAudio = null;
  document.dispatchEvent(new CustomEvent("yueqi:lip-sync", {
    detail: { open: 0, speaking: false, source: "tts-analyser" },
  }));
}

export function getAttachedLipSyncAudio() {
  return attachedAudio;
}
