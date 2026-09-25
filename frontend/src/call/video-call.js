import { callModel } from "../model/client.js";
import { ensurePermission } from "../platform/permissions.js";
import { t } from "../i18n/index.js";

let stream = null;
let videoEl = null;
let canvasEl = null;
let captureTimer = null;

export function isCallActive() {
  return Boolean(stream);
}

function mediaErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return t("mePanels.permissions.cameraDenied");
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return t("mePanels.permissions.cameraMissing");
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return t("mePanels.permissions.cameraBusy");
  }
  return error?.message || t("alerts.cameraFail");
}

export async function startVideoCall({ video, canvas } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(t("mePanels.permissions.cameraUnsupported"));
  }

  const camera = await ensurePermission("camera");
  if (!camera.ok) {
    throw new Error(camera.message || t("mePanels.permissions.cameraDenied"));
  }
  const mic = await ensurePermission("microphone");
  if (!mic.ok) {
    throw new Error(mic.message || t("mePanels.permissions.microphoneDenied"));
  }

  videoEl = video;
  canvasEl = canvas;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true,
    });
  } catch (error) {
    throw new Error(mediaErrorMessage(error));
  }
  if (videoEl) {
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
  }
  return stream;
}

export function stopVideoCall() {
  if (captureTimer) {
    window.clearInterval(captureTimer);
    captureTimer = null;
  }
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (videoEl) videoEl.srcObject = null;
}

export function captureVideoFrame(quality = 0.72) {
  if (!videoEl || !canvasEl) throw new Error("通话画面未就绪。");
  const width = videoEl.videoWidth || 640;
  const height = videoEl.videoHeight || 480;
  canvasEl.width = width;
  canvasEl.height = height;
  const ctx = canvasEl.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, width, height);
  return canvasEl.toDataURL("image/jpeg", quality);
}

export async function askAboutFrame({
  dataUrl,
  prompt = "请简短描述你看到的画面，并像陪伴者一样回应一句。",
  collectProviderConfig,
  characterName = "角色",
  stream = true,
  onDelta,
}) {
  const config = collectProviderConfig?.() || {};
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error("请先在接口页配置支持读图的模型。");
  }
  const result = await callModel(
    config,
    [
      {
        role: "system",
        content: `你是${characterName}。用户正在和你视频通话，你会看到截帧画面。回复简短、亲近，不超过 80 字。`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    {
      temperature: 0.7,
      stream: Boolean(stream),
      businessPurpose: "call.video_reply",
      capability: "vision",
      onDelta: (content) => {
        onDelta?.(content);
      },
    },
  );
  return String(result.content || "").trim();
}

export function startAutoCapture(intervalMs, onFrame) {
  stopAutoCapture();
  captureTimer = window.setInterval(async () => {
    try {
      const dataUrl = captureVideoFrame();
      await onFrame?.(dataUrl);
    } catch {
      // ignore frame errors during call
    }
  }, intervalMs);
  return captureTimer;
}

export function stopAutoCapture() {
  if (captureTimer) {
    window.clearInterval(captureTimer);
    captureTimer = null;
  }
}
