/**
 * P2 — Companion selfie production spine (DEL-03 / DEL-12#1).
 * Real imagegen → Media + Photo → Artifact → Delivery. No fake success in production.
 */

import { isImagegenConfigured, getImagegenSettings } from "../settings/imagegen-preferences.js";
import { runImagegenJob } from "../imagegen/runner.js";
import { importGeneratedImageBlob } from "../media/import-image.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { MAX_PROMPT_CHARS } from "../imagegen/constants.js";
import { b64ToBlob } from "../imagegen/client.js";
import { assembleVisualGenPack } from "../visual-memory/prompt-assemble.js";
import { registerLibraryPhotoAsVisual, listIdentityGenerationReferences } from "../visual-memory/store.js";
import { ensureVisualMemoryGroups, syncLibraryIntoVisualMemory } from "../visual-memory/bridge-library.js";
import { SURFACE_GROUP_IDS } from "../visual-memory/surfaces.js";
import { addPhotoToGroup } from "../phone-shell/phone-data.js";
import { upsertArtifact, enqueueDelivery, artifactDeepLink } from "../artifacts/index.js";

/** Minimal 1×1 PNG for test-only inject (allowFakeSelfie). */
const FAKE_SELFIE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SELFIE_INTENT_PATTERNS = [
  /(?:发|来|给|拍).{0,10}(?:张|个)?(?:自拍|自拍照)/,
  /(?:自拍|自拍照)(?:一张|一下|给我)?/,
  /(?:发给我|给我发|发我).{0,4}(?:一张|个)?(?:图片|照片)/,
  /(?:发|给我).{0,4}(?:一张|个)?(?:你的|你自己的)?(?:图片|照片)/,
  /send.{0,12}(?:me\s+)?(?:a\s+)?selfie/i,
  /take.{0,8}(?:a\s+)?selfie/i,
];

/**
 * @param {string} text
 */
export function detectSelfieIntent(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  return SELFIE_INTENT_PATTERNS.some((re) => re.test(raw));
}

/**
 * Chat selfie prompt — 角色画像 + 聊天生图分组 only.
 * @param {object} [profile]
 * @param {{ companionId?: string, request?: string }} [opts]
 */
export function buildSelfiePrompt(profile = {}, opts = {}) {
  const companionId = String(opts.companionId || profile.id || "").trim();
  if (companionId) {
    const pack = assembleVisualGenPack({
      companionId,
      surface: "chat",
      request: opts.request || "对着镜头自拍，自然光线，半身或近景人像",
      profile,
    });
    return String(pack.prompt || "").slice(0, MAX_PROMPT_CHARS);
  }
  const name = String(profile.name || profile.alias || "角色").trim();
  const identity = String(profile.identity || profile.description || "").slice(0, 120);
  const base = identity
    ? `${name}，${identity}，对着镜头自拍，自然光线，半身或近景人像`
    : `${name}对着镜头自拍，自然光线，半身或近景人像`;
  return base.slice(0, MAX_PROMPT_CHARS);
}

function fakeSelfieBlob() {
  return b64ToBlob(FAKE_SELFIE_B64, "image/png");
}

async function blobToDataUrl(blob) {
  if (!(blob instanceof Blob)) return "";
  if (typeof FileReader === "undefined") return "";
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

async function compactReferenceDataUrl(dataUrl) {
  if (!dataUrl || typeof document === "undefined" || typeof Image === "undefined") return dataUrl;
  try {
    const image = await new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = reject;
      node.src = dataUrl;
    });
    // Keep the JSON envelope well below the mobile gateway's 8 MB limit.
    const maxEdge = 1024;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return dataUrl;
  }
}

/**
 * Build one compact identity reference for providers that accept the standard
 * image-edit endpoint. The original media stays local; only this in-memory
 * request payload is sent, and it is never persisted by the client.
 */
export async function buildIdentityReferenceDataUrl({
  companionId = "",
  references = [],
  getMediaRecord,
  readMediaBlob,
} = {}) {
  const rows = (Array.isArray(references) ? references : [])
    .filter((row) => row?.mediaId)
    .slice(0, 4);
  if (!rows.length || typeof getMediaRecord !== "function" || typeof readMediaBlob !== "function") return "";

  const dataUrls = [];
  for (const row of rows) {
    try {
      const record = await getMediaRecord(row.mediaId);
      const blob = await readMediaBlob(record);
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.startsWith("data:image/")) dataUrls.push(dataUrl);
    } catch {
      /* one missing local file must not prevent trying the next reference */
    }
  }
  if (!dataUrls.length) return "";

  // A single reference keeps OpenAI-compatible image-edit providers portable.
  // If several photos exist, use the first curated/ordered identity photo;
  // the prompt still names the full identity pack and the album remains the
  // source of truth for future adapters.
  return compactReferenceDataUrl(dataUrls[0]);
}

/**
 * @param {{
 *   companionId?: string,
 *   characterId?: string,
 *   characterProfile?: object,
 *   allowFakeSelfie?: boolean,
 *   storeMediaFile?: Function,
 *   getMediaRecord?: Function,
 *   readMediaBlob?: Function,
 *   buildReferenceImageFn?: Function,
 *   runJob?: typeof runImagegenJob,
 *   importBlob?: typeof importGeneratedImageBlob,
 * }} opts
 */
export async function requestCompanionSelfie(opts = {}) {
  const companionId = String(opts.companionId || opts.characterId || "").trim();
  if (!companionId) {
    return {
      ok: false,
      reason: "MISSING_SCOPE",
      message: "无法拍照：缺少角色作用域。",
    };
  }

  const profile = opts.characterProfile && typeof opts.characterProfile === "object"
    ? opts.characterProfile
    : {};
  const characterName = String(profile.name || profile.alias || "角色").trim();
  const allowFake = opts.allowFakeSelfie === true;
  if (!allowFake && !isImagegenConfigured()) {
    return {
      ok: false,
      reason: "PROVIDER_REQUIRED",
      message: "还没有配置生图接口。",
    };
  }
  try {
    ensureVisualMemoryGroups();
    syncLibraryIntoVisualMemory(companionId);
  } catch {
    /* Existing visual-memory rows remain usable when a legacy library sync is unavailable. */
  }
  const identityReferences = listIdentityGenerationReferences(companionId).slice(0, 8);
  if (!identityReferences.length && !allowFake) {
    return {
      ok: false,
      reason: "IDENTITY_REFERENCE_REQUIRED",
      message: "请先在角色相册的「ta自己」里添加一张身份照片，自拍会基于这张图生成。",
    };
  }
  const buildReferenceImageFn = typeof opts.buildReferenceImageFn === "function"
    ? opts.buildReferenceImageFn
    : buildIdentityReferenceDataUrl;
  const referenceImageDataUrl = identityReferences.length
    ? await buildReferenceImageFn({
      companionId,
      references: identityReferences,
      getMediaRecord: opts.getMediaRecord,
      readMediaBlob: opts.readMediaBlob,
    })
    : "";
  if (identityReferences.length && !referenceImageDataUrl && !allowFake) {
    return {
      ok: false,
      reason: "IDENTITY_REFERENCE_UNREADABLE",
      message: "身份照片在本机上暂时读不到，未生成换脸自拍；请重新打开相册或重新导入照片。",
    };
  }
  const pack = assembleVisualGenPack({
    companionId,
    surface: "chat",
    request: "对着镜头自拍，自然光线，半身或近景人像",
    profile: { ...profile, id: companionId },
  });
  const prompt = String(pack.prompt || buildSelfiePrompt(profile, { companionId })).slice(0, MAX_PROMPT_CHARS);
  const runJob = typeof opts.runJob === "function" ? opts.runJob : runImagegenJob;
  const importBlob = typeof opts.importBlob === "function" ? opts.importBlob : importGeneratedImageBlob;
  try {
    let mediaId = "";
    let photoId = "";
    if (allowFake && !isImagegenConfigured()) {
      const blob = fakeSelfieBlob();
      const imported = await importBlob({
        blob,
        title: `${characterName}自拍`,
        summary: "chat selfie",
        storeMediaFile: opts.storeMediaFile,
        groupId: SURFACE_GROUP_IDS.chat,
      });
      mediaId = imported?.mediaId || imported?.media?.id || "";
      photoId = imported?.photoId || imported?.photo?.id || "";
    } else {
      const generated = await runJob({
        prompt,
        storeMediaFile: opts.storeMediaFile,
        referenceMediaIds: identityReferences.map((row) => row.mediaId),
        referenceImageDataUrl,
        requireIdentityReferences: identityReferences.length > 0,
        companionId,
        businessPurpose: "companion.selfie",
      });
      mediaId = generated.mediaId || "";
      ensureVisualMemoryGroups();
      if (mediaId) {
        const photo = addPhotoToGroup(SURFACE_GROUP_IDS.chat, {
          title: `${characterName}自拍`,
          mediaId,
          summary: "chat selfie",
        });
        photoId = photo?.id || "";
        if (photo) {
          registerLibraryPhotoAsVisual(photo, {
            companionId,
            kind: "chat_gen",
            sourceType: "chat_selfie",
            sourceId: generated.job?.id || "",
            qaStatus: "pending",
            significance: "saved",
            contextSummary: prompt.slice(0, 160),
          });
        }
      }
    }

    try {
      appendCohabitEvent({
        companionId,
        appId: "gallery",
        kind: "selfie",
        summary: `${characterName}发来一张自拍`,
        payload: { mediaId, photoId, surface: "chat" },
      });
    } catch {
      /* optional */
    }

    const artifactId = `selfie:${mediaId || Date.now()}`;
    const artifact = upsertArtifact({
      artifactId,
      companionId,
      type: "selfie",
      status: "ready",
      title: `${characterName}自拍`,
      previewText: "角色基于相册身份照片生成的自拍",
      resourceUrl: mediaId ? `media://${mediaId}` : "",
      deepLink: artifactDeepLink(artifactId) || `yueqi://artifact/${artifactId}`,
      readyAt: new Date().toISOString(),
      meta: { mediaId, photoId, surface: "chat", referenceMediaIds: identityReferences.map((row) => row.mediaId) },
    });
    if (artifact?.ok) {
      for (const channel of ["phone_today", "phone_badge", "pop", "system_notification"]) {
        enqueueDelivery({ artifactId, channel, companionId });
      }
    }
    try {
      document.dispatchEvent(new CustomEvent("yueqi:selfie-created", {
        detail: { companionId, mediaId, photoId, artifactId, surface: "chat", referenceMediaIds: identityReferences.map((row) => row.mediaId) },
      }));
    } catch {
      /* optional */
    }

    return {
      ok: true,
      mediaId,
      photoId,
      artifactId,
      prompt,
      referenceMediaIds: pack.referenceMediaIds,
      surface: "chat",
    };
  } catch (error) {
    return {
      ok: false,
      reason: "MODEL_FAILED",
      message: String(error?.message || "自拍失败").slice(0, 200),
    };
  }
}
