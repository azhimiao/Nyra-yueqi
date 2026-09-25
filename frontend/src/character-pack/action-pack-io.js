import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { normalizeAction } from "../avatar/looks-model.js";
import { normalizeExpression } from "../avatar/expressions.js";
import { normalizeTimeline } from "../avatar/timeline.js";

const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function extFromName(name = "") {
  const match = String(name).match(/\.[a-z0-9]+$/i);
  return match ? match[0].toLowerCase() : ".png";
}

async function blobToUint8(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Export actions (+ optional expressions) as standalone ZIP.
 */
export async function exportActionPackZip(avatarState, deps = {}) {
  const actions = (avatarState?.actions || []).map((action) => ({
    ...action,
    timeline: normalizeTimeline(action.timeline),
    asset: action.mediaId ? `assets/actions/${action.id}${extFromName(action.fileName)}` : "",
  }));
  const expressions = avatarState?.expressions || [];
  const files = {};
  let total = 0;

  async function putAsset(path, mediaId) {
    if (!mediaId || !deps.getMediaBlob) return false;
    const blob = await deps.getMediaBlob(mediaId);
    if (!blob) return false;
    if (blob.size > MAX_ASSET_BYTES) throw new Error(`素材过大：${path}`);
    const bytes = await blobToUint8(blob);
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("动作包总大小超限");
    files[path] = bytes;
    return true;
  }

  for (const action of actions) {
    if (action.asset && action.mediaId) await putAsset(action.asset, action.mediaId);
    const tl = action.timeline || {};
    for (const stage of ["enter", "loop", "exit"]) {
      const seg = tl[stage];
      if (seg?.mediaId) {
        const path = `assets/actions/${action.id}_${stage}${extFromName(seg.fileName)}`;
        const ok = await putAsset(path, seg.mediaId);
        if (ok) seg.asset = path;
      }
    }
    if (tl.soundMediaId) {
      const path = `assets/audio/${action.id}_sfx${extFromName(tl.soundFileName)}`;
      const ok = await putAsset(path, tl.soundMediaId);
      if (ok) tl.soundAsset = path;
    }
  }

  const manifest = {
    schemaVersion: 1,
    kind: "yueqi-action-pack",
    id: `actions-${avatarState?.avatarId || "character"}`,
    name: deps.packName || "月栖动作包",
    version: deps.version || avatarState?.packMeta?.version || "1.0.0",
  };

  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["actions.json"] = strToU8(JSON.stringify(
    actions.map(({ mediaId, fileName, ...rest }) => rest),
    null,
    2
  ));
  files["expressions.json"] = strToU8(JSON.stringify(expressions, null, 2));

  return zipSync(files, { level: 6 });
}

export function parseActionPackZip(bytes) {
  const entries = unzipSync(bytes);
  const readJson = (name, fallback = null) => {
    const raw = entries[name];
    if (!raw) return fallback;
    return JSON.parse(strFromU8(raw));
  };
  const manifest = readJson("manifest.json");
  if (!manifest || manifest.kind !== "yueqi-action-pack") {
    throw new Error("不是有效的动作包 ZIP");
  }
  const actions = (readJson("actions.json", []) || []).map(normalizeAction).filter(Boolean);
  const expressions = (readJson("expressions.json", []) || []).map(normalizeExpression).filter(Boolean);
  const assets = {};
  let total = 0;
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith("assets/")) continue;
    if (path.includes("..")) throw new Error(`不安全路径：${path}`);
    if (data.length > MAX_ASSET_BYTES) throw new Error(`素材过大：${path}`);
    total += data.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("动作包总大小超限");
    assets[path] = data;
  }
  return { manifest, actions, expressions, assets };
}

/**
 * Merge action pack into avatar state; writes media via storeMediaFromBytes.
 */
export async function installActionPack(pack, avatarState, deps = {}) {
  const { storeMediaFromBytes } = deps;
  const nextActions = [...(avatarState.actions || [])];
  const byId = new Map(nextActions.map((item) => [item.id, item]));

  for (const action of pack.actions || []) {
    let mediaId = action.mediaId || "";
    let fileName = action.fileName || "";
    const assetPath = String(action.asset || "").trim();
    if (assetPath && pack.assets?.[assetPath] && storeMediaFromBytes) {
      const name = assetPath.split("/").pop() || `${action.id}.png`;
      const record = await storeMediaFromBytes({
        kind: "action",
        name,
        type: "image/png",
        bytes: pack.assets[assetPath],
      });
      mediaId = record.id;
      fileName = name;
    }
    const timeline = normalizeTimeline(action.timeline);
    for (const stage of ["enter", "loop", "exit"]) {
      const seg = timeline[stage];
      const path = seg.asset || `assets/actions/${action.id}_${stage}.png`;
      if (seg && pack.assets?.[path] && storeMediaFromBytes) {
        const name = path.split("/").pop();
        const record = await storeMediaFromBytes({
          kind: "action",
          name,
          type: "image/png",
          bytes: pack.assets[path],
        });
        seg.mediaId = record.id;
        seg.fileName = name;
      }
    }
    const merged = normalizeAction({
      ...action,
      mediaId,
      fileName,
      timeline,
    });
    if (!merged) continue;
    if (byId.has(merged.id)) {
      const idx = nextActions.findIndex((item) => item.id === merged.id);
      nextActions[idx] = { ...nextActions[idx], ...merged };
    } else {
      nextActions.push(merged);
      byId.set(merged.id, merged);
    }
  }

  const expressions = [...(avatarState.expressions || [])];
  const expIds = new Set(expressions.map((item) => item.id));
  for (const expression of pack.expressions || []) {
    const item = normalizeExpression(expression);
    if (!item) continue;
    if (expIds.has(item.id)) {
      const idx = expressions.findIndex((row) => row.id === item.id);
      expressions[idx] = item;
    } else {
      expressions.push(item);
      expIds.add(item.id);
    }
  }

  return {
    ...avatarState,
    actions: nextActions,
    expressions,
  };
}
