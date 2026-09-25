/** Image generation client through the authenticated model gateway. */

import { modelServiceUrl } from "../lib/utils.js";
import { localServiceHeaders } from "../platform/local-service.js";
import { isManagedProductMode, readProductAccess } from "../account/product-access.js";
import {
  startModelExecutionTrace,
  finishModelExecutionTrace,
  failModelExecutionTrace,
} from "../observability/model-execution-trace.js";

export async function fetchImageGenerate(body = {}) {
  const startedAt = Date.now();
  const modelExecutionId = startModelExecutionTrace({
    turnExecutionId: body.turnExecutionId,
    userId: body.userId || readProductAccess().userId,
    companionId: body.companionId || body.characterId,
    businessPurpose: body.businessPurpose || "image.generate",
    capability: "image_generation",
    providerMode: isManagedProductMode() ? "managed" : "byok",
    provider: "model-gateway",
    model: isManagedProductMode() ? "server-resolved" : body.model,
    messages: [{ role: "user", content: String(body.prompt || "") }],
  });

  let response;
  try {
    response = await fetch(modelServiceUrl("/image/generate"), {
      method: "POST",
      headers: await localServiceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        apiKey: body.apiKey,
        baseUrl: body.baseUrl || "",
        model: body.model || "dall-e-3",
        prompt: body.prompt,
        size: body.size || "1024x1024",
        referenceMediaIds: Array.isArray(body.referenceMediaIds) ? body.referenceMediaIds : [],
        referenceImageDataUrl: String(body.referenceImageDataUrl || ""),
        requireIdentityReferences: body.requireIdentityReferences === true,
        modelExecutionId,
        businessPurpose: body.businessPurpose || "image.generate",
        companionId: body.companionId || body.characterId || "",
      }),
    });
  } catch (error) {
    failModelExecutionTrace(modelExecutionId, error, { latencyMs: Date.now() - startedAt });
    throw error;
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok || !payload.b64) {
    if (response.status === 402 && payload.error === "credits_exhausted") {
      globalThis.dispatchEvent?.(new CustomEvent("yueqi:credits-exhausted", {
        detail: {
          available: payload.available ?? 0,
          required: payload.required ?? 1,
        },
      }));
    }
    const error = new Error(String(
      payload.message || payload.error || (!response.ok ? `${response.status} image generation failed` : "Image provider returned no image."),
    ).slice(0, 200));
    error.status = response.status;
    error.payload = payload;
    failModelExecutionTrace(modelExecutionId, error, {
      latencyMs: Date.now() - startedAt,
      billing: payload.billing,
    });
    throw error;
  }

  finishModelExecutionTrace(modelExecutionId, {
    model: payload.model || body.model,
    latencyMs: payload.latencyMs || Date.now() - startedAt,
    usage: payload.usage || null,
    billing: payload.billing || null,
    estimatedCost: payload.estimatedCost ?? null,
  });
  return {
    ok: true,
    b64: String(payload.b64),
    mimeType: String(payload.mimeType || "image/png"),
    revisedPrompt: payload.revisedPrompt ? String(payload.revisedPrompt) : undefined,
    modelExecutionId,
    billing: payload.billing || null,
    identityReferencesApplied: payload.identityReferencesApplied === true,
    providerRequestId: String(payload.providerRequestId || ""),
  };
}

export function b64ToBlob(b64, mimeType = "image/png") {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}
