import { modelServiceUrl } from "../lib/utils.js";
import { localServiceHeaders } from "../platform/local-service.js";
import { isManagedProductMode, readProductAccess } from "../account/product-access.js";
import {
  startModelExecutionTrace,
  finishModelExecutionTrace,
  failModelExecutionTrace,
} from "../observability/model-execution-trace.js";

export function voiceServiceUrl(path) {
  return modelServiceUrl(path);
}

export async function fetchVoiceBinary(path, body, options = {}) {
  const startedAt = Date.now();
  const capability = path.includes("stt") ? "stt" : "tts";
  const modelExecutionId = startModelExecutionTrace({
    turnExecutionId: options.turnExecutionId,
    userId: options.userId || readProductAccess().userId,
    companionId: options.companionId || options.characterId,
    businessPurpose: options.businessPurpose || `voice.${capability}`,
    capability,
    providerMode: isManagedProductMode() ? "managed" : "byok",
    provider: "model-gateway",
    model: isManagedProductMode() ? "server-resolved" : body.model,
    messages: body.text ? [{ role: "user", content: String(body.text) }] : [],
  });

  let response;
  try {
    response = await fetch(voiceServiceUrl(path), {
      method: "POST",
      headers: await localServiceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        ...body,
        modelExecutionId,
        businessPurpose: options.businessPurpose || `voice.${capability}`,
        companionId: options.companionId || options.characterId || "",
      }),
      signal: options.signal,
    });
  } catch (error) {
    failModelExecutionTrace(modelExecutionId, error, { latencyMs: Date.now() - startedAt });
    throw error;
  }
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let payload = {};
    try {
      payload = await response.json();
      message = payload.message || payload.error || message;
    } catch {
      // Preserve the HTTP status when the response is not JSON.
    }
    if (response.status === 402 && payload.error === "credits_exhausted") {
      globalThis.dispatchEvent?.(new CustomEvent("yueqi:credits-exhausted", {
        detail: {
          available: payload.available ?? 0,
          required: payload.required ?? 1,
        },
      }));
    }
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    failModelExecutionTrace(modelExecutionId, error, { latencyMs: Date.now() - startedAt });
    throw error;
  }
  const mimeType = response.headers.get("Content-Type") || "audio/mpeg";
  const buffer = await response.arrayBuffer();
  finishModelExecutionTrace(modelExecutionId, {
    model: response.headers.get("X-Yueqi-Model") || body.model,
    latencyMs: Date.now() - startedAt,
    billing: {
      source: isManagedProductMode() ? "managed" : "byok",
      remainingCredits: response.headers.has("X-Yueqi-Credits-Remaining")
        ? Number(response.headers.get("X-Yueqi-Credits-Remaining"))
        : null,
      chargedCredits: Number(response.headers.get("X-Yueqi-Billing-Units")) || 0,
    },
  });
  return new Blob([buffer], { type: mimeType });
}

/** JSON voice helper (catalog list). Does not start a TTS billing trace. */
export async function fetchVoiceJson(path, body, options = {}) {
  const response = await fetch(voiceServiceUrl(path), {
    method: "POST",
    headers: await localServiceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
    signal: options.signal,
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}
