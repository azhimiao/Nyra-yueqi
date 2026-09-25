import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { avatarStateToPackDraft, validateCharacterPack, PACK_SCHEMA_VERSION } from "./schema.js";
import { migrateAvatarState } from "../avatar/looks-model.js";

const MAX_ASSET_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;

function uint8ToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function blobToUint8(blob) {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Build a character-pack ZIP from avatar state + media resolver.
 * @param {object} avatarState
 * @param {{ getMediaBlob: (mediaId: string) => Promise<Blob|null>, packName?: string }} deps
 */
export async function exportCharacterPackZip(avatarState, deps = {}) {
  const draft = avatarStateToPackDraft(avatarState, {
    name: deps.packName || "月栖角色包",
    id: `pack-${avatarState?.avatarId || "character"}`,
  });
  const files = {};
  let total = 0;

  async function putAsset(path, mediaId) {
    if (!mediaId || !deps.getMediaBlob) return false;
    const blob = await deps.getMediaBlob(mediaId);
    if (!blob) return false;
    if (blob.size > MAX_ASSET_BYTES) throw new Error(`素材过大：${path}`);
    const bytes = await blobToUint8(blob);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("角色包总大小超限");
    files[path] = bytes;
    return true;
  }

  for (const look of draft.looks) {
    if (look.asset && look.mediaId) {
      const ok = await putAsset(look.asset, look.mediaId);
      if (!ok) look.asset = "";
    }
  }
  for (const action of draft.actions) {
    if (action.asset && action.mediaId) {
      const ok = await putAsset(action.asset, action.mediaId);
      if (!ok) action.asset = "";
    }
    const tl = action.timeline || {};
    for (const stage of ["enter", "loop", "exit"]) {
      const seg = tl[stage];
      if (seg?.mediaId) {
        const path = `assets/actions/${action.id}_${stage}${extFromName(seg.fileName || action.fileName)}`;
        const ok = await putAsset(path, seg.mediaId);
        if (ok) seg.asset = path;
      }
    }
  }

  let layered = draft.layered ? { ...draft.layered } : null;
  if (layered?.parts?.length) {
    layered = {
      ...layered,
      parts: await Promise.all(layered.parts.map(async (part) => {
        const next = { ...part };
        if (part.mediaId) {
          const path = part.asset || `assets/layers/${part.id}${extFromName(part.fileName)}`;
          const ok = await putAsset(path, part.mediaId);
          if (ok) next.asset = path;
        }
        const { mediaId, ...rest } = next;
        return rest;
      })),
    };
  }

  const pack = {
    manifest: {
      ...draft.manifest,
      schemaVersion: PACK_SCHEMA_VERSION,
      defaultLook: avatarState.currentLookId || draft.looks[0]?.id || "",
    },
    persona: draft.persona,
    looks: draft.looks.map(({ mediaId, fileName, ...rest }) => rest),
    actions: draft.actions.map(({ mediaId, fileName, ...rest }) => rest),
    expressions: draft.expressions || [],
    sceneTriggers: draft.sceneTriggers || [],
    display: draft.display,
    renderMode: draft.renderMode || "auto",
    layered,
    voice: draft.voice,
    packMeta: draft.packMeta || avatarState.packMeta || {},
  };

  delete pack._allowMissingAssets;
  const validation = validateCharacterPack({ ...pack, assets: Object.fromEntries(Object.keys(files).map((k) => [k, true])) });
  if (!validation.ok) {
    // Allow packs with looks that have no assets yet (config-only)
    const soft = validation.errors.filter((err) => !err.startsWith("missing_asset:"));
    if (soft.length) throw new Error(`角色包校验失败：${soft.join(", ")}`);
  }

  files["manifest.json"] = strToU8(JSON.stringify(pack.manifest, null, 2));
  files["persona.json"] = strToU8(JSON.stringify(pack.persona, null, 2));
  files["looks.json"] = strToU8(JSON.stringify(pack.looks, null, 2));
  files["actions.json"] = strToU8(JSON.stringify(pack.actions, null, 2));
  files["expressions.json"] = strToU8(JSON.stringify(pack.expressions, null, 2));
  files["scenes.json"] = strToU8(JSON.stringify(pack.sceneTriggers, null, 2));
  files["display.json"] = strToU8(JSON.stringify(pack.display || {}, null, 2));
  files["render-mode.json"] = strToU8(JSON.stringify({ renderMode: pack.renderMode || "auto" }, null, 2));
  if (pack.layered) files["layered.json"] = strToU8(JSON.stringify(pack.layered, null, 2));
  files["voice.json"] = strToU8(JSON.stringify(pack.voice || {}, null, 2));
  files["pack-meta.json"] = strToU8(JSON.stringify(pack.packMeta || {}, null, 2));

  return zipSync(files, { level: 6 });
}

function extFromName(name = "") {
  const match = String(name).match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : ".png";
}

/**
 * Parse character-pack ZIP bytes into a pack object with asset blobs (base64).
 */
export function parseCharacterPackZip(bytes) {
  const entries = unzipSync(bytes);
  const readJson = (name, fallback = null) => {
    const raw = entries[name];
    if (!raw) return fallback;
    return JSON.parse(strFromU8(raw));
  };

  const manifest = readJson("manifest.json");
  const persona = readJson("persona.json", {});
  const looks = readJson("looks.json", []);
  const actions = readJson("actions.json", []);
  const expressions = readJson("expressions.json", []);
  const sceneTriggers = readJson("scenes.json", []);
  const display = readJson("display.json", {});
  const voice = readJson("voice.json", {});
  const packMeta = readJson("pack-meta.json", {});
  const layered = readJson("layered.json", null);
  const renderModeInfo = readJson("render-mode.json", {});
  const renderMode = renderModeInfo?.renderMode || "auto";

  const assets = {};
  let total = 0;
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith("assets/")) continue;
    if (path.includes("..")) throw new Error(`不安全路径：${path}`);
    if (data.length > MAX_ASSET_BYTES) throw new Error(`素材过大：${path}`);
    total += data.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("角色包总大小超限");
    assets[path] = {
      bytes: data,
      base64: uint8ToBase64(data),
      size: data.length,
    };
  }

  const pack = {
    manifest,
    persona,
    looks,
    actions,
    expressions,
    sceneTriggers,
    display,
    voice,
    packMeta,
    layered,
    renderMode,
    assets,
  };
  const validation = validateCharacterPack({
    ...pack,
    assets: Object.fromEntries(Object.keys(assets).map((k) => [k, true])),
  });
  if (!validation.ok) {
    const soft = validation.errors.filter((err) => !err.startsWith("missing_asset:"));
    if (soft.length) throw new Error(`角色包校验失败：${soft.join(", ")}`);
  }
  return pack;
}

/**
 * Install pack into avatar-shaped state + media store writes via callbacks.
 * @returns {Promise<object>} migrated avatar state
 */
export async function installCharacterPack(pack, deps = {}) {
  const { storeMediaFromBytes } = deps;
  const looks = [];
  for (const look of pack.looks || []) {
    let mediaId = "";
    let fileName = "";
    const assetPath = String(look.asset || "").trim();
    if (assetPath && pack.assets?.[assetPath] && storeMediaFromBytes) {
      const asset = pack.assets[assetPath];
      const name = assetPath.split("/").pop() || `${look.id}.png`;
      const mime = mimeFromName(name);
      const record = await storeMediaFromBytes({
        kind: "look",
        name,
        type: mime,
        bytes: asset.bytes || base64ToUint8(asset.base64),
      });
      mediaId = record.id;
      fileName = name;
    }
    looks.push({
      id: look.id,
      name: look.name || look.id,
      description: look.description || "",
      mediaId,
      fileName,
      updatedAt: new Date().toISOString(),
    });
  }

  const actions = [];
  for (const action of pack.actions || []) {
    let mediaId = "";
    let fileName = "";
    const assetPath = String(action.asset || "").trim();
    if (assetPath && pack.assets?.[assetPath] && storeMediaFromBytes) {
      const asset = pack.assets[assetPath];
      const name = assetPath.split("/").pop() || `${action.id}.png`;
      const mime = mimeFromName(name);
      const record = await storeMediaFromBytes({
        kind: "action",
        name,
        type: mime,
        bytes: asset.bytes || base64ToUint8(asset.base64),
      });
      mediaId = record.id;
      fileName = name;
    }
    const timeline = action.timeline ? { ...action.timeline } : null;
    if (timeline) {
      for (const stage of ["enter", "loop", "exit"]) {
        const seg = timeline[stage];
        if (!seg) continue;
        const path = String(seg.asset || "").trim();
        if (path && pack.assets?.[path] && storeMediaFromBytes) {
          const asset = pack.assets[path];
          const name = path.split("/").pop() || `${action.id}_${stage}.png`;
          const record = await storeMediaFromBytes({
            kind: "action",
            name,
            type: mimeFromName(name),
            bytes: asset.bytes || base64ToUint8(asset.base64),
          });
          seg.mediaId = record.id;
          seg.fileName = name;
        }
      }
    }
    actions.push({
      id: action.id,
      name: action.name || action.id,
      type: action.type || "image",
      mediaId,
      fileName,
      loop: Boolean(action.loop),
      durationMs: action.durationMs || 0,
      priority: action.priority || 0,
      interruptible: action.interruptible !== false,
      fallback: action.fallback || "",
      triggers: action.triggers || [],
      timeline,
    });
  }

  let layered = pack.layered || null;
  if (layered?.parts?.length && storeMediaFromBytes) {
    const parts = [];
    for (const part of layered.parts) {
      let mediaId = part.mediaId || "";
      let fileName = part.fileName || "";
      const assetPath = String(part.asset || "").trim();
      if (assetPath && pack.assets?.[assetPath]) {
        const asset = pack.assets[assetPath];
        const name = assetPath.split("/").pop() || `${part.id}.png`;
        const record = await storeMediaFromBytes({
          kind: "layer",
          name,
          type: mimeFromName(name),
          bytes: asset.bytes || base64ToUint8(asset.base64),
        });
        mediaId = record.id;
        fileName = name;
      }
      parts.push({ ...part, mediaId, fileName });
    }
    layered = { ...layered, parts };
  }

  const currentLookId = pack.manifest?.defaultLook || looks[0]?.id || "";
  return migrateAvatarState({
    schemaVersion: 4,
    avatarId: pack.persona?.avatarId || pack.manifest?.id || "imported",
    currentLookId,
    userLookLocked: false,
    renderMode: pack.renderMode || "auto",
    display: pack.display || {},
    looks,
    actions,
    expressions: pack.expressions || [],
    sceneTriggers: pack.sceneTriggers || [],
    layered,
    packMeta: {
      id: pack.manifest?.id || pack.packMeta?.id || "imported",
      name: pack.manifest?.name || pack.packMeta?.name || "导入角色",
      version: pack.manifest?.version || pack.packMeta?.version || "1.0.0",
      installedAt: new Date().toISOString(),
    },
  });
}

function mimeFromName(name = "") {
  const lower = name.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "image/png";
}

export function downloadZip(filename, bytes) {
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
