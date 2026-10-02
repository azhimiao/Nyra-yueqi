import { LOCAL_KEYS } from "../constants.js";
import { refreshIcons } from "../lib/icons.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { getAllRecords, storeRecord } from "../storage/db.js";
import { persistMediaFile, persistMediaBytes, readMediaBlob } from "../platform/media-files.js";
import {
  createDefaultAvatarState,
  migrateAvatarState,
  getCurrentLook,
  resolveActionForState,
} from "./looks-model.js";
import { createActionPlayer } from "../runtime/action-player.js";
import {
  exportCharacterPackZip,
  parseCharacterPackZip,
  installCharacterPack,
  downloadZip,
} from "../character-pack/pack-io.js";
import {
  validateCharacterPack,
  avatarStateToPackDraft,
  escapeCharacterPackHtml,
} from "../character-pack/schema.js";
import { applyPackUpgrade } from "../character-pack/pack-version.js";
import { wirePhase3Editor } from "./phase3-editor.js";
import { wirePhase4Editor } from "./phase4-editor.js";
import { shouldUseLayeredRender } from "./layered-model.js";
import { createCanvasLayeredRenderer } from "./layered-renderer.js";
import { resolveSceneTrigger, inferSceneFromStatus } from "../runtime/scene-triggers.js";
import { resolveActionFromExpression } from "./expressions.js";
import { createEmptyTimeline } from "./timeline.js";

let avatarState = createDefaultAvatarState();
const mediaUrlCache = new Map();
let actionPlayer = null;
let phase3 = null;
let phase4 = null;
let layeredRenderer = null;
let preferPixi = false;
let runtimeWarmPromise = null;
let characterUiWired = false;
const lookListeners = new Set();

const REQUIRED_ACTION_IDS = [
  "idle_default",
  "talking_default",
  "react_tap",
  "comfort",
  "sleep_pose",
  "greet",
  "selfie",
];

const stage = document.querySelector("[data-avatar-stage]");
const stageEmpty = document.querySelector("[data-avatar-empty]");
const stageImage = document.querySelector("[data-avatar-stage-image]");
const stageLayered = document.querySelector("[data-avatar-stage-layered]");
const stageCanvas = document.querySelector("[data-avatar-stage-canvas]");
const stageOverlay = document.querySelector("[data-avatar-stage-overlay]");
const stageMeta = document.querySelector("[data-avatar-stage-meta]");
const currentOutfitLabel = document.querySelector("[data-current-outfit-label]");
const outfitLockToggle = document.querySelector("[data-outfit-lock]");
const wardrobeList = document.querySelector("[data-wardrobe-list]");
const characterUploadInput = document.querySelector("[data-character-upload]");
const characterStatus = document.querySelector("[data-character-status]");
const actionsList = document.querySelector("[data-actions-list]");
const displayForm = document.querySelector("[data-display-form]");

function notifyLookChange(reason = "look") {
  lookListeners.forEach((listener) => listener(getLookPresentation(), reason));
  document.dispatchEvent(new CustomEvent("yueqi:avatar-look", {
    detail: { look: getLookPresentation(), reason },
  }));
}

function loadAvatarState() {
  const saved = readLocalObject(LOCAL_KEYS.avatarKey, {});
  avatarState = migrateAvatarState(saved);
  saveAvatarState();
}

/** Warm avatar state + ActionPlayer without requiring the character UI panel. */
export function ensureAvatarRuntime() {
  if (!runtimeWarmPromise) {
    runtimeWarmPromise = Promise.resolve().then(() => {
      loadAvatarState();
      if (!actionPlayer) {
        actionPlayer = createActionPlayer({
          getAvatarState: () => avatarState,
          resolveMediaUrl,
          onChange: async () => {
            if (stage && characterUiWired) {
              await renderStage();
              renderCharacterStatus();
            }
          },
        });
      }
      return {
        getAvatarState,
        getAvatarActionPlayer,
        resolveAvatarLookUrl,
        applyScene,
      };
    });
  }
  return runtimeWarmPromise;
}

function saveAvatarState() {
  const clean = migrateAvatarState(avatarState);
  avatarState = clean;
  writeLocalObject(LOCAL_KEYS.avatarKey, clean);
}

async function storeImageFile(file, kind) {
  const id = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const filePath = await persistMediaFile(id, file);
  const record = {
    id,
    kind,
    name: file.name,
    type: file.type || "image/png",
    size: file.size,
    createdAt: new Date().toISOString(),
    filePath: filePath || "",
    blob: filePath ? null : file,
  };
  await storeRecord("media", record);
  return record;
}

async function storeMediaFromBytes({ kind, name, type, bytes }) {
  const id = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const blob = new Blob([bytes], { type: type || "application/octet-stream" });
  const filePath = await persistMediaBytes(id, bytes, type);
  const record = {
    id,
    kind,
    name,
    type: type || "application/octet-stream",
    size: bytes.length,
    createdAt: new Date().toISOString(),
    filePath: filePath || "",
    blob: filePath ? null : blob,
  };
  await storeRecord("media", record);
  return record;
}

async function resolveMediaUrl(mediaId) {
  if (!mediaId) return "";
  if (mediaUrlCache.has(mediaId)) return mediaUrlCache.get(mediaId);
  const records = await getAllRecords("media");
  const record = records.find((item) => item.id === mediaId);
  const blob = await readMediaBlob(record);
  if (!blob) return "";
  try {
    const url = URL.createObjectURL(blob);
    mediaUrlCache.set(mediaId, url);
    return url;
  } catch {
    return "";
  }
}

async function getMediaBlobById(mediaId) {
  if (!mediaId) return null;
  const records = await getAllRecords("media");
  const record = records.find((item) => item.id === mediaId);
  return readMediaBlob(record);
}

function applyDisplayToImage(img) {
  if (!img) return;
  const display = avatarState.display || {};
  const scale = display.scale || 1;
  const ox = display.offsetX || 0;
  const oy = display.offsetY || 0;
  const flip = display.flipX ? -1 : 1;
  img.style.transform = `translate(${ox}px, ${oy}px) scale(${flip * scale}, ${scale})`;
  img.style.transformOrigin = display.anchor === "center-bottom"
    ? "center bottom"
    : display.anchor === "top"
      ? "center top"
      : "center center";
  img.style.objectPosition = display.anchor === "center-bottom"
    ? "center bottom"
    : display.anchor === "top"
      ? "center top"
      : "center center";
}

async function resolveStageImageUrl() {
  const actionSnap = actionPlayer?.getState?.();
  const actionId = actionSnap?.actionId || "idle_default";
  const { defaultPoseAssetUrl } = await import("./default-pose-assets.js");

  // Prefer playable action media / built-in 星梨 poses over wardrobe leftovers or SVG placeholders.
  if (actionSnap?.mediaUrl && actionSnap.playState !== "idle") {
    return { url: actionSnap.mediaUrl, source: "action" };
  }
  const action = (avatarState.actions || []).find((item) => item.id === actionId);
  if (action?.mediaId) {
    const url = await resolveMediaUrl(action.mediaId);
    if (url) return { url, source: "action-media" };
  }
  const poseUrl = defaultPoseAssetUrl(actionId) || defaultPoseAssetUrl("idle_default");
  if (poseUrl) return { url: poseUrl, source: "default-pose" };

  const look = getCurrentLook(avatarState);
  if (look?.mediaId) {
    const url = await resolveMediaUrl(look.mediaId);
    if (url) return { url, source: "look" };
  }
  return { url: "/assets/pet-poses/idle_default.png", source: "default-pose" };
}

export function getLookPresentation() {
  const look = getCurrentLook(avatarState);
  const action = actionPlayer?.getState?.() || resolveActionForState(avatarState, "idle");
  return {
    lookId: look?.id || "",
    lookName: look?.name || "",
    mediaId: look?.mediaId || "",
    fileName: look?.fileName || "",
    display: { ...(avatarState.display || {}) },
    actionId: action?.actionId || action?.id || "idle_default",
    playState: action?.playState || "idle",
    locked: Boolean(avatarState.userLookLocked),
  };
}

async function ensureLayeredRenderer() {
  if (layeredRenderer) return layeredRenderer;
  const backend = document.querySelector("[data-layered-backend]")?.value || "canvas";
  preferPixi = backend === "pixi";
  if (preferPixi && stageLayered) {
    try {
      const { createPixiLayeredRenderer } = await import("./layered-pixi.js");
      layeredRenderer = await createPixiLayeredRenderer({
        host: stageLayered,
        resolveMediaUrl,
      });
    } catch {
      layeredRenderer = null;
    }
  }
  if (!layeredRenderer && stageCanvas) {
    layeredRenderer = createCanvasLayeredRenderer({
      canvas: stageCanvas,
      resolveMediaUrl,
    });
  }
  return layeredRenderer;
}

function destroyLayeredRenderer() {
  layeredRenderer?.destroy?.();
  layeredRenderer = null;
  if (stageLayered) stageLayered.innerHTML = "";
}

async function syncLayeredPresenter(actionSnap) {
  const useLayered = shouldUseLayeredRender(avatarState);
  if (!useLayered) {
    destroyLayeredRenderer();
    if (stageCanvas) stageCanvas.hidden = true;
    if (stageLayered) stageLayered.hidden = true;
    return false;
  }

  const renderer = await ensureLayeredRenderer();
  if (!renderer) return false;

  await renderer.setModel(avatarState.layered);
  const actionId = actionSnap?.actionId || "idle_default";
  renderer.setAction(actionId);
  if (actionSnap?.expressionId) renderer.setExpression(actionSnap.expressionId);
  renderer.start();

  if (renderer.backend === "canvas" && stageCanvas) {
    stageCanvas.hidden = false;
    if (stageLayered) stageLayered.hidden = true;
  } else if (stageLayered) {
    stageLayered.hidden = false;
    if (stageCanvas) stageCanvas.hidden = true;
  }
  return true;
}

async function renderStage() {
  const look = getCurrentLook(avatarState);
  const actionSnap = actionPlayer?.getState?.();
  const layeredOn = await syncLayeredPresenter(actionSnap);
  const { url, source } = layeredOn
    ? { url: "layered", source: "layered" }
    : await resolveStageImageUrl();

  if (stage) {
    stage.classList.toggle("has-content", Boolean(url));
    stage.dataset.source = source;
    stage.dataset.render = layeredOn ? (layeredRenderer?.backend || "layered") : "sprite";
  }
  if (stageEmpty) stageEmpty.hidden = Boolean(url);

  if (stageImage) {
    if (!layeredOn && url) {
      stageImage.hidden = false;
      stageImage.classList.add("is-switching");
      stageImage.src = url;
      stageImage.alt = look?.name ? `${look.name} 外表` : "角色外表";
      applyDisplayToImage(stageImage);
      window.setTimeout(() => stageImage.classList.remove("is-switching"), 280);
    } else {
      stageImage.hidden = true;
      if (layeredOn) stageImage.removeAttribute("src");
      else {
        stageImage.removeAttribute("src");
        stageImage.style.transform = "";
      }
    }
  }

  if (stageOverlay) stageOverlay.hidden = !url;
  if (currentOutfitLabel) {
    const isBuiltinLook = !look?.mediaId || ["home_casual", "rainy_night", "sleepwear"].includes(look.id);
    currentOutfitLabel.textContent = isBuiltinLook ? "桌宠" : (look?.name || "桌宠");
  }
  if (stageMeta) {
    const actionId = actionSnap?.actionId || "idle_default";
    if (layeredOn) {
      stageMeta.textContent = `桌宠 · 分层渲染 · ${actionId}`;
    } else if (source === "default-pose" || source === "action" || source === "action-media") {
      stageMeta.textContent = "桌宠 · 待机";
    } else if (look?.name) {
      stageMeta.textContent = `桌宠 · ${look.name}`;
    } else {
      stageMeta.textContent = "桌宠";
    }
  }
  if (outfitLockToggle) outfitLockToggle.checked = avatarState.userLookLocked;
  renderCharacterStatus();
  renderDisplayForm();
  notifyLookChange("render");
}

function renderCharacterStatus() {
  if (!characterStatus) return;
  const look = getCurrentLook(avatarState);
  const action = actionPlayer?.getState?.();
  characterStatus.textContent = [
    `当前外表：${look?.name || "无"}`,
    look?.mediaId ? `素材：${look.fileName}` : "素材：未导入",
    `动作：${action?.actionId || "idle_default"} (${action?.playState || "idle"})`,
    `渲染：${shouldUseLayeredRender(avatarState) ? (layeredRenderer?.backend || "layered") : "sprite"}`,
    avatarState.userLookLocked ? "外表：已锁定" : "外表：可切换",
    `外表数：${(avatarState.looks || []).length}`,
  ].join("\n");
}

function renderDisplayForm() {
  if (!displayForm) return;
  const display = avatarState.display || {};
  const scale = displayForm.querySelector("[data-display-scale]");
  const offsetX = displayForm.querySelector("[data-display-offset-x]");
  const offsetY = displayForm.querySelector("[data-display-offset-y]");
  const flipX = displayForm.querySelector("[data-display-flip-x]");
  const anchor = displayForm.querySelector("[data-display-anchor]");
  const floatSize = displayForm.querySelector("[data-display-float-size]");
  if (scale) scale.value = String(display.scale ?? 1);
  if (offsetX) offsetX.value = String(display.offsetX ?? 0);
  if (offsetY) offsetY.value = String(display.offsetY ?? 0);
  if (flipX) flipX.checked = Boolean(display.flipX);
  if (anchor) anchor.value = display.anchor || "center";
  if (floatSize) floatSize.value = String(display.floatSize ?? 64);
}

function renderWardrobe() {
  if (!wardrobeList) return;
  wardrobeList.innerHTML = "";

  (avatarState.looks || []).forEach((look) => {
    const card = document.createElement("article");
    const lookId = escapeCharacterPackHtml(look.id);
    const lookName = escapeCharacterPackHtml(look.name || look.id);
    const lookInitial = escapeCharacterPackHtml((look.name || look.id).slice(0, 2));
    const description = escapeCharacterPackHtml(look.description || "可编辑外表");
    const fileStatus = escapeCharacterPackHtml(
      look.fileName ? `已导入：${look.fileName}` : "尚未导入素材"
    );
    card.className = "wardrobe-card";
    card.dataset.lookId = look.id;
    if (avatarState.currentLookId === look.id) card.classList.add("is-active");

    card.innerHTML = `
      <div class="wardrobe-thumb" data-look-thumb="${lookId}">
        <span>${lookInitial}</span>
      </div>
      <div class="wardrobe-body">
        <strong>${lookName}</strong>
        <p>${description}</p>
        <small>${fileStatus}</small>
        <label class="look-rename">
          <span class="sr-only">改名</span>
          <input type="text" value="${escapeCharacterPackHtml(look.name || "")}" data-rename-look="${lookId}" maxlength="32" />
        </label>
      </div>
      <div class="wardrobe-actions">
        <button type="button" class="ghost-action" data-apply-look="${lookId}">穿上</button>
        <button type="button" class="ghost-action" data-import-look="${lookId}">导入素材</button>
        <button type="button" class="ghost-action" data-delete-look="${lookId}">删除</button>
        <input type="file" accept="image/*,.webp,image/webp" data-look-file="${lookId}" hidden />
      </div>
    `;
    wardrobeList.append(card);
  });

  wardrobeList.querySelectorAll("[data-look-thumb]").forEach(async (node) => {
    const lookId = node.dataset.lookThumb;
    const mediaId = avatarState.looks.find((item) => item.id === lookId)?.mediaId;
    const url = await resolveMediaUrl(mediaId);
    if (url) {
      node.style.backgroundImage = `url("${url}")`;
      node.classList.add("has-image");
      node.innerHTML = "";
    }
  });

  refreshIcons();
}

function renderActionsEditor() {
  if (!actionsList) return;
  actionsList.innerHTML = "";
  (avatarState.actions || []).forEach((action) => {
    const row = document.createElement("article");
    const actionId = escapeCharacterPackHtml(action.id);
    const actionName = escapeCharacterPackHtml(action.name || action.id);
    const actionSummary = escapeCharacterPackHtml(
      `${action.id} · ${action.triggers?.join("/") || "manual"} · ${action.fileName || "无素材"}`
    );
    const fallbackOptions = (avatarState.actions || []).map((item) => {
      const id = escapeCharacterPackHtml(item.id);
      const label = escapeCharacterPackHtml(item.name || item.id);
      return `<option value="${id}" ${item.id === action.fallback ? "selected" : ""}>${label}</option>`;
    }).join("");
    const poseHint = ["sleep_pose", "greet", "selfie"].includes(action.id)
      ? "<p class=\"wardrobe-hint\">桌宠多动作：请绑定二次元姿势图（透明 PNG/WebP）。</p>"
      : "";
    row.className = "action-editor-row";
    row.dataset.actionId = action.id;
    row.innerHTML = `
      <div class="action-editor-main">
        <strong>${actionName}</strong>
        <small>${actionSummary}</small>
        ${poseHint}
      </div>
      <details class="action-editor-details" open>
        <summary>编辑动作参数</summary>
        <div class="action-editor-fields">
          <label>名称
            <input type="text" maxlength="48" value="${actionName}" data-action-field="name" data-action-id="${actionId}" />
          </label>
          <label>触发方式
            <input type="text" maxlength="120" value="${escapeCharacterPackHtml((action.triggers || []).join(", "))}" data-action-field="triggers" data-action-id="${actionId}" />
          </label>
          <label>优先级
            <input type="number" min="0" max="100" step="1" value="${Number(action.priority) || 0}" data-action-field="priority" data-action-id="${actionId}" />
          </label>
          <label>持续时间 ms
            <input type="number" min="0" max="60000" step="50" value="${Number(action.durationMs) || 0}" data-action-field="durationMs" data-action-id="${actionId}" />
          </label>
          <label>失败回退
            <select data-action-field="fallback" data-action-id="${actionId}">${fallbackOptions}</select>
          </label>
          <label class="workflow-toggle"><input type="checkbox" ${action.loop ? "checked" : ""} data-action-field="loop" data-action-id="${actionId}" /> 循环播放</label>
          <label class="workflow-toggle"><input type="checkbox" ${action.interruptible !== false ? "checked" : ""} data-action-field="interruptible" data-action-id="${actionId}" /> 允许打断</label>
        </div>
      </details>
      <div class="action-editor-actions">
        <button type="button" class="ghost-action" data-preview-action="${actionId}">预览</button>
        <button type="button" class="ghost-action" data-bind-action="${actionId}">绑定素材</button>
        <button type="button" class="ghost-action" data-edit-timeline="${actionId}">时间轴</button>
        <button type="button" class="ghost-action" data-delete-action="${actionId}">删除</button>
        <input type="file" accept="image/*,.webp,image/webp" data-action-file="${actionId}" hidden />
      </div>
    `;
    actionsList.append(row);
  });
}

function updateActionField(field) {
  const actionId = field?.dataset.actionId;
  const key = field?.dataset.actionField;
  const action = (avatarState.actions || []).find((item) => item.id === actionId);
  if (!action || !key) return;

  if (key === "name") action.name = field.value.trim() || action.id;
  if (key === "triggers") {
    action.triggers = field.value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 12);
  }
  if (key === "priority") action.priority = Math.max(0, Math.min(100, Number(field.value) || 0));
  if (key === "durationMs") action.durationMs = Math.max(0, Math.min(60000, Number(field.value) || 0));
  if (key === "fallback") action.fallback = field.value;
  if (key === "loop") action.loop = Boolean(field.checked);
  if (key === "interruptible") action.interruptible = Boolean(field.checked);
  saveAvatarState();
  renderCharacterStatus();
}

function addAction() {
  const id = window.prompt("action_id（英文/下划线）", `action_${Date.now().toString(16)}`);
  if (!id) return;
  if ((avatarState.actions || []).some((item) => item.id === id)) {
    window.alert("ID 已存在");
    return;
  }
  const name = window.prompt("显示名", id) || id;
  avatarState.actions = [
    ...(avatarState.actions || []),
    {
      id: id.trim(),
      name,
      type: "image",
      mediaId: "",
      fileName: "",
      loop: false,
      durationMs: 1200,
      priority: 15,
      interruptible: true,
      fallback: "idle_default",
      triggers: ["reacting"],
      timeline: createEmptyTimeline(),
    },
  ];
  saveAvatarState();
  renderActionsEditor();
  phase3?.setSelectedActionId?.(id.trim());
}

function deleteAction(actionId) {
  if (REQUIRED_ACTION_IDS.includes(actionId)) {
    window.alert("系统必需动作不能删除（待机 / 说话 / 点击 / 安慰）");
    return;
  }
  avatarState.actions = (avatarState.actions || []).filter((item) => item.id !== actionId);
  saveAvatarState();
  renderActionsEditor();
}

async function applyLook(lookId) {
  if (!(avatarState.looks || []).some((look) => look.id === lookId)) return;
  avatarState.currentLookId = lookId;
  saveAvatarState();
  await actionPlayer?.idle?.();
  await renderStage();
  renderWardrobe();
}

async function importLookImage(lookId, file) {
  const look = (avatarState.looks || []).find((item) => item.id === lookId);
  if (!file || !look) return;
  const media = await storeImageFile(file, "look");
  look.mediaId = media.id;
  look.fileName = file.name;
  look.updatedAt = new Date().toISOString();
  saveAvatarState();
  mediaUrlCache.set(media.id, URL.createObjectURL(file));
  await renderStage();
  renderWardrobe();
}

async function importCharacterAsCurrentLook(file) {
  if (!file) return;
  let look = getCurrentLook(avatarState);
  if (!look) {
    look = {
      id: `look_${Date.now().toString(16)}`,
      name: "新外表",
      description: "",
      mediaId: "",
      fileName: "",
      updatedAt: "",
    };
    avatarState.looks.push(look);
    avatarState.currentLookId = look.id;
  }
  await importLookImage(look.id, file);
}

function addLook() {
  const id = `look_${Date.now().toString(16)}`;
  avatarState.looks.push({
    id,
    name: `外表 ${(avatarState.looks.length || 0) + 1}`,
    description: "",
    mediaId: "",
    fileName: "",
    updatedAt: "",
  });
  avatarState.currentLookId = id;
  saveAvatarState();
  renderWardrobe();
  renderStage();
}

function deleteLook(lookId) {
  if ((avatarState.looks || []).length <= 1) {
    window.alert("至少保留一个外表。");
    return;
  }
  avatarState.looks = avatarState.looks.filter((look) => look.id !== lookId);
  if (avatarState.currentLookId === lookId) {
    avatarState.currentLookId = avatarState.looks[0].id;
  }
  saveAvatarState();
  renderWardrobe();
  renderStage();
}

function renameLook(lookId, name) {
  const look = avatarState.looks.find((item) => item.id === lookId);
  if (!look) return;
  look.name = String(name || look.id).trim() || look.id;
  saveAvatarState();
  renderStage();
}

function readDisplayFromForm() {
  if (!displayForm) return;
  avatarState.display = {
    ...avatarState.display,
    scale: Number(displayForm.querySelector("[data-display-scale]")?.value) || 1,
    offsetX: Number(displayForm.querySelector("[data-display-offset-x]")?.value) || 0,
    offsetY: Number(displayForm.querySelector("[data-display-offset-y]")?.value) || 0,
    flipX: Boolean(displayForm.querySelector("[data-display-flip-x]")?.checked),
    anchor: displayForm.querySelector("[data-display-anchor]")?.value || "center",
    floatSize: Number(displayForm.querySelector("[data-display-float-size]")?.value) || 64,
  };
  avatarState = migrateAvatarState(avatarState);
  saveAvatarState();
  applyDisplayToImage(stageImage);
  notifyLookChange("display");
  renderCharacterStatus();
}

async function bindActionMedia(actionId, file) {
  const action = (avatarState.actions || []).find((item) => item.id === actionId);
  if (!action || !file) return;
  if (!file.type.startsWith("image/") && file.type !== "image/webp") {
    window.alert("当前动作编辑器只支持图片和 WebP 素材。");
    return;
  }
  const media = await storeImageFile(file, "action");
  action.mediaId = media.id;
  action.fileName = file.name;
  action.type = file.type === "image/webp" ? "webp" : "image";
  saveAvatarState();
  mediaUrlCache.set(media.id, URL.createObjectURL(file));
  renderActionsEditor();
  renderCharacterStatus();
}

async function previewAction(actionId) {
  await actionPlayer?.play("reacting", { actionId });
  await renderStage();
  renderActionsEditor();
}

function validateEditorDraft() {
  const draft = avatarStateToPackDraft(avatarState);
  return validateCharacterPack(draft);
}

async function exportPack() {
  const validation = validateEditorDraft();
  const hard = validation.errors.filter((err) => !err.startsWith("missing_asset:"));
  if (hard.length) {
    window.alert(`无法导出：${hard.join(", ")}`);
    return;
  }
  const bytes = await exportCharacterPackZip(avatarState, {
    getMediaBlob: getMediaBlobById,
    packName: "月栖角色包",
  });
  downloadZip(`yueqi-character-pack-${Date.now()}.zip`, bytes);
}

async function importPackFile(file) {
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pack = parseCharacterPackZip(bytes);
  const next = await installCharacterPack(pack, { storeMediaFromBytes });
  avatarState = applyPackUpgrade(avatarState, next, {
    reason: "character-pack-import",
    version: pack.manifest?.version,
  });
  saveAvatarState();
  mediaUrlCache.clear();
  await actionPlayer?.idle?.();
  await renderStage();
  renderWardrobe();
  renderActionsEditor();
  phase3?.renderPhase3?.();
  phase4?.renderPhase4?.();
}

function wireCharacterPage() {
  document.querySelectorAll("[data-character-upload-trigger]").forEach((button) => {
    button.addEventListener("click", () => characterUploadInput?.click());
  });

  characterUploadInput?.addEventListener("change", async () => {
    await importCharacterAsCurrentLook(characterUploadInput.files?.[0]);
    characterUploadInput.value = "";
  });

  outfitLockToggle?.addEventListener("change", () => {
    avatarState.userLookLocked = outfitLockToggle.checked;
    saveAvatarState();
    renderCharacterStatus();
    notifyLookChange("lock");
  });

  document.querySelector("[data-add-look]")?.addEventListener("click", () => addLook());
  document.querySelector("[data-add-action]")?.addEventListener("click", () => addAction());
  document.querySelector("[data-export-character-pack]")?.addEventListener("click", () => exportPack());
  document.querySelector("[data-import-character-pack-trigger]")?.addEventListener("click", () => {
    document.querySelector("[data-import-character-pack]")?.click();
  });
  document.querySelector("[data-import-character-pack]")?.addEventListener("change", async (event) => {
    const input = event.target;
    await importPackFile(input.files?.[0]);
    input.value = "";
  });
  document.querySelector("[data-validate-character-pack]")?.addEventListener("click", () => {
    const result = validateEditorDraft();
    window.alert(result.ok ? "校验通过" : `校验问题：\n${result.errors.join("\n")}`);
  });

  displayForm?.addEventListener("change", () => readDisplayFromForm());
  displayForm?.addEventListener("input", () => readDisplayFromForm());

  wardrobeList?.addEventListener("click", async (event) => {
    const importButton = event.target.closest("[data-import-look]");
    if (importButton) {
      [...wardrobeList.querySelectorAll("[data-look-file]")]
        .find((node) => node.dataset.lookFile === importButton.dataset.importLook)
        ?.click();
      return;
    }
    const applyButton = event.target.closest("[data-apply-look]");
    if (applyButton) {
      await applyLook(applyButton.dataset.applyLook);
      return;
    }
    const deleteButton = event.target.closest("[data-delete-look]");
    if (deleteButton) {
      deleteLook(deleteButton.dataset.deleteLook);
      return;
    }
    const card = event.target.closest(".wardrobe-card");
    if (card?.dataset.lookId && !event.target.closest("input,button,label")) {
      await applyLook(card.dataset.lookId);
    }
  });

  wardrobeList?.addEventListener("change", async (event) => {
    const fileInput = event.target.closest("[data-look-file]");
    if (fileInput?.files?.[0]) {
      await importLookImage(fileInput.dataset.lookFile, fileInput.files[0]);
      fileInput.value = "";
      return;
    }
    const rename = event.target.closest("[data-rename-look]");
    if (rename) renameLook(rename.dataset.renameLook, rename.value);
  });

  actionsList?.addEventListener("click", async (event) => {
    const preview = event.target.closest("[data-preview-action]");
    if (preview) {
      await previewAction(preview.dataset.previewAction);
      return;
    }
    const bind = event.target.closest("[data-bind-action]");
    if (bind) {
      [...actionsList.querySelectorAll("[data-action-file]")]
        .find((node) => node.dataset.actionFile === bind.dataset.bindAction)
        ?.click();
      return;
    }
    const timeline = event.target.closest("[data-edit-timeline]");
    if (timeline) {
      phase3?.setSelectedActionId?.(timeline.dataset.editTimeline);
      document.querySelector("[data-timeline-editor]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const del = event.target.closest("[data-delete-action]");
    if (del) deleteAction(del.dataset.deleteAction);
  });

  actionsList?.addEventListener("change", async (event) => {
    const field = event.target.closest("[data-action-field]");
    if (field) {
      updateActionField(field);
      return;
    }
    const input = event.target.closest("[data-action-file]");
    if (!input?.files?.[0]) return;
    await bindActionMedia(input.dataset.actionFile, input.files[0]);
    input.value = "";
  });

  actionsList?.addEventListener("input", (event) => {
    const field = event.target.closest("[data-action-field]");
    if (field && field.matches("input[type='text'], input[type='number']")) {
      updateActionField(field);
    }
  });
}

export async function initCharacterPage() {
  if (!stage) return;
  await ensureAvatarRuntime();
  if (!characterUiWired) {
    wireCharacterPage();
    const sharedEditorApi = {
      getState: () => avatarState,
      setState: (next) => {
        avatarState = migrateAvatarState(next);
      },
      save: saveAvatarState,
      renderAll: () => {
        renderStage();
        renderWardrobe();
        renderActionsEditor();
        renderCharacterStatus();
        phase3?.renderPhase3?.();
        phase4?.renderPhase4?.();
      },
      getMediaBlobById,
      storeMediaFromBytes,
      storeImageFile,
      previewAction,
    };
    phase3 = wirePhase3Editor(sharedEditorApi);
    phase4 = wirePhase4Editor(sharedEditorApi);

    document.addEventListener("yueqi:lip-sync", (event) => {
      const open = Number(event.detail?.open) || 0;
      layeredRenderer?.setLipOpen?.(open);
    });

    document.querySelector("[data-layered-backend]")?.addEventListener("change", async () => {
      destroyLayeredRenderer();
      await renderStage();
    });

    characterUiWired = true;
  }

  await actionPlayer?.idle?.();
  await renderStage();
  renderWardrobe();
  renderActionsEditor();
  phase3?.renderPhase3?.();
  phase4?.renderPhase4?.();
}

export function getAvatarState() {
  return migrateAvatarState(avatarState);
}

export function applyAvatarState(state) {
  if (!state) return;
  avatarState = migrateAvatarState(state);
  saveAvatarState();
  mediaUrlCache.clear();
  actionPlayer?.idle?.();
  renderStage();
  renderWardrobe();
  renderActionsEditor();
  phase3?.renderPhase3?.();
  phase4?.renderPhase4?.();
  notifyLookChange("apply");
}

export function getAvatarActionPlayer() {
  return actionPlayer;
}

export function subscribeAvatarLook(listener) {
  lookListeners.add(listener);
  listener(getLookPresentation(), "init");
  return () => lookListeners.delete(listener);
}

export async function resolveAvatarLookUrl() {
  const look = getCurrentLook(avatarState);
  if (look?.mediaId) {
    const url = await resolveMediaUrl(look.mediaId);
    if (url) return url;
  }
  const { defaultPoseAssetUrl } = await import("./default-pose-assets.js");
  return defaultPoseAssetUrl("idle_default") || "/assets/pet-poses/idle_default.png";
}

/** Apply scene trigger: optional look switch + action play. */
export async function applyScene(scene, { status = null } = {}) {
  const key = scene || inferSceneFromStatus(status || {});
  const trigger = resolveSceneTrigger(avatarState, key);
  if (trigger?.lookId && !avatarState.userLookLocked) {
    await applyLook(trigger.lookId);
  }
  if (trigger?.actionId) {
    await actionPlayer?.playAction?.(trigger.actionId);
    return trigger;
  }
  return trigger;
}

export async function playExpression(expressionId, emotion = "") {
  const actionId = resolveActionFromExpression(avatarState, expressionId, emotion);
  if (actionId) {
    await actionPlayer?.playAction?.(actionId);
    return actionId;
  }
  return "";
}

export { resolveMediaUrl as resolveAvatarMediaUrl, getMediaBlobById, storeMediaFromBytes };
