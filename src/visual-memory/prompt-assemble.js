/**
 * Automate imagegen prompt assembly:
 *   Character Identity text
 * + Visual Identity Pack (最大化角色画像)
 * + Surface-only style refs (朋友圈 / 角色世界 / 聊天 — 互不串组)
 * + Current generation request
 */

import { characterToCollectedProfile } from "../characters/profile.js";
import { getCharacterSync } from "../characters/store.js";
import { MAX_PROMPT_CHARS } from "../imagegen/constants.js";
import {
  listIdentityGenerationReferences,
  listVisualAssets,
  getIdentityVersion,
} from "./store.js";
import {
  GEN_SURFACES,
  IDENTITY_PACK_PRIORITY,
  resolveGenSurface,
  kindForSurfaceSave,
  surfaceForGroupId,
} from "./surfaces.js";

function clip(text, max) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function sortIdentityPack(assets = []) {
  const rank = new Map(IDENTITY_PACK_PRIORITY.map((k, i) => [k, i]));
  return [...assets].sort((a, b) => {
    const ra = rank.has(a.kind) ? rank.get(a.kind) : 99;
    const rb = rank.has(b.kind) ? rank.get(b.kind) : 99;
    if (ra !== rb) return ra - rb;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
}

function loadProfile(companionId, profileOverride) {
  if (profileOverride && typeof profileOverride === "object") {
    return {
      name: profileOverride.name || profileOverride.alias || "角色",
      alias: profileOverride.alias || "",
      identity: profileOverride.identity || profileOverride.description || "",
      promptSystem: profileOverride.promptSystem || profileOverride.profile?.promptSystem || "",
      promptDeveloper: profileOverride.promptDeveloper || profileOverride.profile?.promptDeveloper || "",
    };
  }
  const character = getCharacterSync(companionId);
  if (!character) {
    return { name: "角色", alias: "", identity: "", promptSystem: "", promptDeveloper: "" };
  }
  const collected = characterToCollectedProfile(character);
  return {
    name: collected.name,
    alias: collected.alias,
    identity: collected.identity,
    promptSystem: collected.promptSystem,
    promptDeveloper: collected.promptDeveloper,
  };
}

/**
 * Build the generation pack for one surface.
 * @param {{
 *   companionId: string,
 *   surface: "chat"|"moments"|"character_world",
 *   request: string,
 *   profile?: object,
 *   locale?: "zh"|"en",
 *   maxIdentitySlots?: number,
 *   maxSurfaceRefs?: number,
 * }} input
 */
export function assembleVisualGenPack(input = {}) {
  const companionId = String(input.companionId || "").trim();
  const surface = resolveGenSurface(input.surface) || GEN_SURFACES.chat;
  const en = String(input.locale || "").toLowerCase().startsWith("en");
  const request = clip(input.request || "", 400);
  const profile = loadProfile(companionId, input.profile);
  const identityVersion = companionId ? getIdentityVersion(companionId) : 1;

  const identityAssets = companionId
    ? sortIdentityPack(listIdentityGenerationReferences(companionId)).slice(
      0,
      Math.max(1, Number(input.maxIdentitySlots) || 8),
    )
    : [];

  const surfaceAssets = companionId
    ? listVisualAssets(companionId, { namespace: "life" })
      .filter((a) => a.qaStatus !== "failed")
      .filter((a) => {
        // Surface isolation: prefer libraryGroupId; fall back to lifeKind for legacy rows.
        const fromGroup = surfaceForGroupId(a.libraryGroupId || "");
        if (fromGroup) return fromGroup === surface.id;
        return a.kind === surface.lifeKind;
      })
      .slice(0, Math.max(0, Number(input.maxSurfaceRefs) || surface.maxSurfaceRefs || 3))
    : [];

  const identityLines = identityAssets.map((a) => {
    const label = a.kind || "identity";
    const bit = clip(a.contextSummary || a.title || label, 80);
    return `- [${label}] ${bit}`;
  });

  const surfaceLines = surfaceAssets.map((a, i) => {
    const bit = clip(a.contextSummary || a.title || `${surface.id}_${i + 1}`, 80);
    return `- ${bit}`;
  });

  const personaBits = [
    profile.name ? (en ? `Name: ${profile.name}` : `角色名：${profile.name}`) : "",
    profile.identity ? (en ? `Look: ${clip(profile.identity, 200)}` : `外貌要点：${clip(profile.identity, 200)}`) : "",
    profile.promptSystem
      ? (en
        ? `Character Identity (authoritative):\n${clip(profile.promptSystem, 900)}`
        : `角色身份（权威）：\n${clip(profile.promptSystem, 900)}`)
      : "",
  ].filter(Boolean);

  const sections = en
    ? [
      "[Surface]",
      `${surface.label.en} generation — use ONLY Visual Identity Pack + this surface's prior images. Do not invent looks from other apps.`,
      "",
      "[Character Identity]",
      ...personaBits,
      `identityVersion: ${identityVersion}`,
      "",
      "[Visual Identity Pack — maximize likeness]",
      identityLines.length
        ? identityLines.join("\n")
        : "(No passed identity references yet — stay faithful to Character Identity text; do not invent a new face.)",
      "Lock face, hair, body proportion, and default outfit to the pack. Same person across shots.",
      "",
      `[${surface.label.en} style continuity]`,
      surfaceLines.length
        ? surfaceLines.join("\n")
        : "(No prior images on this surface — establish a clean first look.)",
      "Match lighting/framing habits of this surface only; ignore other surfaces.",
      "",
      "[Current request]",
      request || "(no extra request)",
      "",
      "Output one image. No watermark, no UI chrome, no extra limbs.",
    ]
    : [
      "【表面】",
      `${surface.label.zh}——只使用「角色画像」+ 本表面分组里的既有图，禁止串用其他表面的生活图。`,
      "",
      "【Character Identity】",
      ...personaBits,
      `identityVersion: ${identityVersion}`,
      "",
      "【Visual Identity Pack · 最大化角色画像】",
      identityLines.length
        ? identityLines.join("\n")
        : "（尚无已通过 QA 的身份参考图——严格服从角色身份文本，禁止另造一张新脸。）",
      "面部、发型、身材比例与默认服装必须与画像包一致，跨图同一人。",
      "",
      `【${surface.label.zh} · 本表面风格连续】`,
      surfaceLines.length
        ? surfaceLines.join("\n")
        : "（本表面尚无成图——建立干净的第一张即可。）",
      "只延续本表面的构图/光线习惯；不要参考其他 App 的图。",
      "",
      "【当前生成要求】",
      request || "（无额外要求）",
      "",
      "输出一张图。无水印、无界面边框、无多余肢体。",
    ];

  const prompt = sections.filter((line, i, arr) => {
    if (line !== "") return true;
    return arr[i - 1] !== "";
  }).join("\n").slice(0, MAX_PROMPT_CHARS);

  return {
    surface: surface.id,
    groupId: surface.groupId,
    lifeKind: surface.lifeKind,
    identityVersion,
    prompt,
    /** For multimodal providers / future client — identity first, then surface. */
    referenceMediaIds: [
      ...identityAssets.map((a) => a.mediaId),
      ...surfaceAssets.map((a) => a.mediaId),
    ].filter(Boolean),
    identityMediaIds: identityAssets.map((a) => a.mediaId).filter(Boolean),
    surfaceMediaIds: surfaceAssets.map((a) => a.mediaId).filter(Boolean),
    identitySlots: identityAssets.map((a) => ({ id: a.id, kind: a.kind, mediaId: a.mediaId })),
    saveKind: kindForSurfaceSave(surface.id),
  };
}

/**
 * Convenience: prompt string only.
 */
export function assembleVisualGenPrompt(input = {}) {
  return assembleVisualGenPack(input).prompt;
}
