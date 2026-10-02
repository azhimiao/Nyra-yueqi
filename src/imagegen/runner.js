/** Orchestrate imagegen job → blob → media (F6). */

import { getImagegenSettings, isImagegenConfigured } from "../settings/imagegen-preferences.js";
import { readLocalObject } from "../lib/utils.js";
import { LOCAL_KEYS } from "../constants.js";
import { MAX_PROMPT_CHARS } from "./constants.js";
import { appendImagegenJob, updateImagegenJob } from "./job-store.js";
import { b64ToBlob, fetchImageGenerate } from "./client.js";
import { importGeneratedImageBlob, storeGeneratedMediaBlob } from "../media/import-image.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { isHostedModelSource, readProductAccess } from "../account/product-access.js";
import { fetchBillingPricing } from "../billing/client.js";
import { confirmCreditEstimate } from "../billing/ui/billing-panel.js";

function resolveBaseUrl(settings) {
  const explicit = String(settings.baseUrl || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const provider = readLocalObject(LOCAL_KEYS.providerKey, {}) || {};
  const fromModel = String(provider.baseUrl || "").trim();
  if (fromModel) return fromModel.replace(/\/+$/, "");
  return "https://api.openai.com/v1";
}

function parseSize(size) {
  const m = String(size || "1024x1024").match(/^(\d+)x(\d+)$/);
  if (!m) return { width: 1024, height: 1024 };
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Generate image → media store (preview). Album save is separate.
 * @param {{ prompt: string, storeMediaFile?: Function, referenceMediaIds?: string[], referenceImageDataUrl?: string }} opts
 */
export async function runImagegenJob(opts = {}) {
  const prompt = String(opts.prompt || "").trim().slice(0, MAX_PROMPT_CHARS);
  if (!prompt) throw new Error("请先描述想画的画面");

  const settings = getImagegenSettings();
  if (!isImagegenConfigured(settings)) {
    throw new Error("还没有配置生图接口");
  }

  const referenceMediaIds = Array.isArray(opts.referenceMediaIds)
    ? opts.referenceMediaIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 8)
    : [];
  const referenceImageDataUrl = String(opts.referenceImageDataUrl || "").trim();

  if (isHostedModelSource()) {
    const pricing = await fetchBillingPricing();
    const tier = readProductAccess().hostedTier === "high" ? "high" : "standard";
    const estimatedCredits = Number(
      pricing.image?.estimatedCreditsByTier?.[tier] ?? pricing.image?.estimatedCredits,
    ) || 0;
    const confirmed = await confirmCreditEstimate({
      kind: "image",
      estimatedCredits,
    });
    if (!confirmed) throw new Error("已取消生成");
  }

  const { width, height } = parseSize(settings.defaultSize);
  const job = appendImagegenJob({
    status: "running",
    prompt,
    model: settings.model,
    width,
    height,
    referenceMediaIds,
  });

  try {
    const result = await fetchImageGenerate({
      apiKey: settings.apiKey.trim(),
      baseUrl: resolveBaseUrl(settings),
      model: settings.model,
      prompt,
      size: settings.defaultSize,
      referenceMediaIds,
      referenceImageDataUrl,
      requireIdentityReferences: opts.requireIdentityReferences === true,
      companionId: opts.companionId || opts.characterId || "",
      businessPurpose: opts.businessPurpose || "image.studio_generate",
    });
    if (opts.requireIdentityReferences && referenceMediaIds.length && !result.identityReferencesApplied) {
      throw new Error("The configured image provider did not apply the required character identity references.");
    }
    const blob = b64ToBlob(result.b64, result.mimeType || "image/png");
    const mediaRecord = await storeGeneratedMediaBlob({
      blob,
      name: prompt.slice(0, 24) || "AI 创作",
      storeMediaFile: opts.storeMediaFile,
    });

    const updated = updateImagegenJob(job.id, {
      status: "succeeded",
      finishedAt: new Date().toISOString(),
      revisedPrompt: result.revisedPrompt || null,
      mediaId: mediaRecord.id,
      photoId: null,
      error: null,
      referenceMediaIds,
      identityReferencesApplied: result.identityReferencesApplied === true,
    });

    return {
      job: updated,
      blob,
      objectUrl: URL.createObjectURL(blob),
      mediaId: mediaRecord.id,
      revisedPrompt: result.revisedPrompt || null,
      referenceMediaIds,
      identityReferencesApplied: result.identityReferencesApplied === true,
    };
  } catch (error) {
    const message = String(error?.message || "生成失败").slice(0, 200);
    const failed = updateImagegenJob(job.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      error: message,
    });
    const err = new Error(message);
    err.job = failed;
    throw err;
  }
}

/**
 * Persist succeeded job into AI album group.
 */
export async function saveJobToAlbum(job, { getMediaRecord, storeMediaFile, readMediaBlob, characterId = "", companionId = "" } = {}) {
  if (!job?.id) throw new Error("没有可保存的任务");
  if (job.photoId) {
    return { photoId: job.photoId, mediaId: job.mediaId, alreadySaved: true };
  }

  if (!job.mediaId && !job.blob) {
    throw new Error("图片数据不可用，请重新生成");
  }

  let blob = job.blob || null;
  if (!job.mediaId && !blob && typeof getMediaRecord === "function") {
    const record = await getMediaRecord(job.mediaId);
    blob = typeof readMediaBlob === "function" && record
      ? await readMediaBlob(record)
      : record?.blob || null;
  }

  const imported = await importGeneratedImageBlob({
    blob: job.mediaId ? undefined : blob,
    title: String(job.prompt || "AI 创作").slice(0, 24),
    summary: job.revisedPrompt || "",
    mediaId: job.mediaId,
    mediaRecord: job.mediaId ? { id: job.mediaId, kind: "image" } : undefined,
    storeMediaFile,
  });

  const mediaId = job.mediaId || imported.mediaId;
  const updated = updateImagegenJob(job.id, {
    photoId: imported.photo.id,
    mediaId,
  });

  const scopeId = String(companionId || characterId || "").trim();
  try {
    appendCohabitEvent({
      appId: "studio",
      kind: "imagegen",
      summary: `绘境创作并已存入相册：${String(job.prompt || "").slice(0, 80)}`,
      characterId: scopeId,
      meta: { mediaId, photoId: imported.photo.id, jobId: job.id, companionId: scopeId },
    });
  } catch {
    /* optional projection */
  }

  if (scopeId) {
    try {
      const { upsertArtifact, enqueueDelivery, artifactDeepLink } = await import("../artifacts/index.js");
      const artifactId = `photo:${imported.photo.id}`;
      const title = String(job.prompt || "AI 创作").slice(0, 24);
      const art = upsertArtifact({
        artifactId,
        companionId: scopeId,
        type: "photo",
        status: "ready",
        title,
        previewText: String(job.revisedPrompt || title).slice(0, 120),
        resourceUrl: `gallery://${mediaId}`,
        deepLink: artifactDeepLink(artifactId) || `yueqi://artifact/${artifactId}`,
        readyAt: new Date().toISOString(),
        meta: { mediaId, photoId: imported.photo.id, jobId: job.id, companionId: scopeId },
      });
      if (art?.ok) {
        for (const channel of ["phone_today", "phone_badge", "pop", "system_notification"]) {
          enqueueDelivery({
            artifactId: art.artifact.artifactId,
            channel,
            companionId: scopeId,
          });
        }
        if (typeof document !== "undefined") {
          document.dispatchEvent(new CustomEvent("yueqi:photo-saved", {
            detail: {
              artifactId: art.artifact.artifactId,
              mediaId,
              photoId: imported.photo.id,
              companionId: scopeId,
              deepLink: art.artifact.deepLink,
            },
          }));
        }
      }
    } catch {
      /* delivery optional */
    }
  }

  return { job: updated, photoId: imported.photo.id, mediaId };
}
