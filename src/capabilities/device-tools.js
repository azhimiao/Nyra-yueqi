import { capabilityForTool } from "./device-registry.js";
import { capabilityFailure } from "./permission-broker.js";
import {
  capabilityPermissionBroker,
  getCurrentNativeLocation,
  getNativeCapabilityPlugin,
} from "../platform/native-capabilities.js";
import { captureOverlayScreen } from "../platform/companion-overlay.js";
import { showCompanionNotification } from "../platform/notifications.js";

function toolFailure(tool, capability, error) {
  const details = error?.details || error?.data || {};
  return {
    ok: false,
    code: error?.code || details.code || "NATIVE_ERROR",
    tool,
    capability,
    canRequestNow: false,
    needsSettings: false,
    reason: details.reason || error?.message || "NATIVE_ERROR",
  };
}

async function nativeCall(method, args = {}) {
  const plugin = getNativeCapabilityPlugin();
  if (!plugin?.[method]) {
    return {
      ok: false,
      code: "DEVICE_UNSUPPORTED",
      reason: `NativeCapability.${method} unavailable`,
    };
  }
  return plugin[method](args);
}

async function captureBrowserCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = resolve;
    });
    const canvas = document.createElement("canvas");
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      ok: true,
      mimeType: "image/jpeg",
      dataUrl: canvas.toDataURL("image/jpeg", 0.78),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

async function listenAndTranscribe(args = {}) {
  const durationMs = Math.max(1_000, Math.min(15_000, Number(args.durationMs) || 5_000));
  const plugin = getNativeCapabilityPlugin();
  let audio;
  if (plugin?.startMicrophoneCapture) {
    await plugin.startMicrophoneCapture();
    try {
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      audio = await plugin.stopMicrophoneCapture();
    } catch (error) {
      await plugin.cancelMicrophoneCapture?.().catch(() => {});
      throw error;
    }
  } else {
    const { startRecording, stopRecording, cancelRecording } = await import("../voice/record.js");
    await startRecording();
    try {
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      const stopped = await stopRecording();
      audio = { blob: stopped.blob, mimeType: stopped.mimeType };
    } catch (error) {
      await cancelRecording();
      throw error;
    }
  }
  const blob = audio?.blob || (
    audio?.dataUrl ? await (await fetch(audio.dataUrl)).blob() : null
  );
  if (!blob) return { ok: false, code: "NATIVE_ERROR", reason: "EMPTY_AUDIO" };
  const { transcribeAudio } = await import("../voice/stt.js");
  const transcript = await transcribeAudio(blob);
  return {
    ok: true,
    capability: "voice.input",
    transcript: String(transcript?.text || "").trim(),
    durationMs,
  };
}

/**
 * Execute a real-device tool behind internal + OS capability preflight.
 * This function never opens an Android permission dialog. A PERMISSION_REQUIRED
 * result must be surfaced to UI, and only a user gesture may call requestCapability.
 */
export async function executeDeviceTool(tool, args = {}, deps = {}) {
  const capability = capabilityForTool(tool);
  if (!capability) {
    return { ok: false, code: "UNKNOWN_TOOL", tool, reason: "UNKNOWN_TOOL" };
  }
  const broker = deps.broker || capabilityPermissionBroker;

  if (tool.endsWith(".get_status")) {
    return { ok: true, tool, capability, state: await broker.getCapabilityStatus(capability) };
  }
  if (tool.endsWith(".request")) {
    const state = await broker.getCapabilityStatus(capability);
    return capabilityFailure(capability, state);
  }
  if (tool === "microphone.stop_capture" || tool === "screen.observe.stop") {
    try {
      if (tool === "microphone.stop_capture") return nativeCall("stopMicrophoneCapture");
      return nativeCall("stopScreenObservation");
    } catch (error) {
      return toolFailure(tool, capability, error);
    }
  }

  const preflight = await broker.ensureCapability(capability, {
    allowRequest: deps.allowPermissionRequest === true && deps.userGesture === true,
    allowSessionConsent: deps.userGesture === true,
    userGesture: deps.userGesture === true,
  });
  if (!preflight.ok) return { ...preflight, tool };

  try {
    switch (tool) {
      case "microphone.start_capture":
        return nativeCall("startMicrophoneCapture");
      case "voice.listen":
        return listenAndTranscribe(args);
      case "voice.speak": {
        const { speakMessageText } = await import("../voice/tts.js");
        await speakMessageText(String(args.text || ""));
        return { ok: true, capability, tool };
      }
      case "camera.capture":
        return getNativeCapabilityPlugin()?.captureCamera
          ? nativeCall("captureCamera", args)
          : captureBrowserCamera();
      case "location.get_current":
        return { ok: true, capability, tool, location: await getCurrentNativeLocation() };
      case "screen.capture":
        return captureOverlayScreen();
      case "screen.observe.start":
        return nativeCall("startScreenObservation", args);
      case "notification.send":
        return showCompanionNotification(
          String(args.body || ""),
          String(args.title || ""),
          args.extra || {},
        );
      case "calendar.list_calendars":
        return nativeCall("listCalendars", args);
      case "calendar.list_events":
        return nativeCall("listCalendarEvents", args);
      case "calendar.get_event":
        return nativeCall("getCalendarEvent", args);
      case "calendar.create_event":
        return nativeCall("createCalendarEvent", args);
      case "calendar.update_event":
        return nativeCall("updateCalendarEvent", args);
      case "calendar.delete_event":
        return nativeCall("deleteCalendarEvent", args);
      default:
        return { ok: false, code: "UNKNOWN_TOOL", tool, capability };
    }
  } catch (error) {
    return toolFailure(tool, capability, error);
  }
}

export function createDeviceNyraTools(deps = {}) {
  const definitions = [
    ["microphone.get_status", "Read real microphone capability status."],
    ["microphone.request", "Ask UI to request microphone capability; never grants it."],
    ["microphone.start_capture", "Start user-initiated native microphone capture."],
    ["microphone.stop_capture", "Stop native microphone capture and return temporary audio."],
    ["voice.listen", "Start a user-initiated voice input capture."],
    ["voice.speak", "Speak text using the configured TTS output."],
    ["camera.get_status", "Read real camera capability status."],
    ["camera.request", "Ask UI to request camera capability; never grants it."],
    ["camera.capture", "Capture one user-initiated camera image."],
    ["location.get_current", "Read one current approximate or precise location."],
    ["screen.capture", "Request one MediaProjection session and capture one frame."],
    ["screen.observe.start", "Start an explicit screen observation session."],
    ["screen.observe.stop", "Stop screen observation and release native resources."],
    ["notification.send", "Send a companion message notification."],
    ["calendar.list_calendars", "List Android system calendars."],
    ["calendar.list_events", "List Android system calendar events."],
    ["calendar.get_event", "Read one Android system calendar event."],
    ["calendar.create_event", "Create an Android system calendar event."],
    ["calendar.update_event", "Update an Android system calendar event."],
    ["calendar.delete_event", "Delete an Android system calendar event."],
  ];
  return definitions.map(([name, description]) => ({
    name,
    description,
    parametersJsonSchema: { type: "object", properties: {}, additionalProperties: true },
    riskLevel: name.includes("create_") || name.includes("update_") || name.includes("delete_")
      ? "high"
      : "medium",
    requiredCapabilities: [capabilityForTool(name)],
    timeoutMs: 30_000,
    execute: (args) => executeDeviceTool(name, args, deps),
  }));
}
