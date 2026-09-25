import {
  createStarterLayeredModel,
  normalizeLayeredModel,
  exportLayeredOpenJson,
  layeredHasRenderableParts,
} from "./layered-model.js";
import {
  avatarStateToPackDraft,
  escapeCharacterPackHtml,
  validateCharacterPack,
} from "../character-pack/schema.js";

/**
 * Phase 4 editor: layered parts, motions, action bindings, open JSON export.
 */
export function wirePhase4Editor(api) {
  const {
    getState,
    setState,
    save,
    renderAll,
    storeImageFile,
  } = api;

  const partsRoot = document.querySelector("[data-layered-parts]");
  const statusEl = document.querySelector("[data-layered-status]");
  const modeSelect = document.querySelector("[data-render-mode]");
  const motionBreath = document.querySelector("[data-motion-breathe]");
  const motionBlink = document.querySelector("[data-motion-blink]");
  const motionSway = document.querySelector("[data-motion-sway]");
  const lipEnabled = document.querySelector("[data-lip-enabled]");

  function state() {
    return getState();
  }

  function commit(next) {
    setState(next);
    save();
    renderAll();
    renderPhase4();
  }

  function ensureLayered() {
    const current = state();
    if (current.layered && Array.isArray(current.layered.parts) && current.layered.parts.length) {
      return normalizeLayeredModel(current.layered);
    }
    return createStarterLayeredModel();
  }

  function syncMotionToggles() {
    const layered = ensureLayered();
    if (motionBreath) motionBreath.checked = layered.motions?.breathe?.enabled !== false;
    if (motionBlink) motionBlink.checked = layered.motions?.blink?.enabled !== false;
    if (motionSway) motionSway.checked = layered.motions?.sway?.enabled !== false;
    if (lipEnabled) lipEnabled.checked = layered.lipSync?.enabled !== false;
  }

  function writeMotionToggles() {
    const layered = ensureLayered();
    if (motionBreath) layered.motions.breathe = { ...layered.motions.breathe, enabled: motionBreath.checked };
    if (motionBlink) layered.motions.blink = { ...layered.motions.blink, enabled: motionBlink.checked };
    if (motionSway) layered.motions.sway = { ...layered.motions.sway, enabled: motionSway.checked };
    if (lipEnabled) layered.lipSync = { ...layered.lipSync, enabled: lipEnabled.checked };
    commit({
      ...state(),
      layered: normalizeLayeredModel(layered),
      schemaVersion: 4,
    });
  }

  function renderPhase4() {
    const current = state();
    const layered = normalizeLayeredModel(current.layered || createStarterLayeredModel());
    if (modeSelect) modeSelect.value = current.renderMode || "auto";
    if (statusEl) {
      const ready = layeredHasRenderableParts(layered);
      statusEl.textContent = [
        `格式：${layered.format} v${layered.version}`,
        `部件：${layered.parts.length}`,
        `可渲染：${ready ? "是（至少一部件有素材）" : "否 → 使用序列帧/立绘 fallback"}`,
        `后端：Canvas 默认 · PixiJS 可选`,
        `口型：${layered.lipSync?.enabled === false ? "关" : layered.lipSync?.mode || "volume"}`,
      ].join("\n");
    }
    if (partsRoot) {
      partsRoot.innerHTML = layered.parts.map((part) => `
        <article class="action-card layered-part-card" data-part-id="${escapeCharacterPackHtml(part.id)}">
          <div class="action-card-head">
            <strong>${escapeCharacterPackHtml(part.name || part.id)}</strong>
            <span>${escapeCharacterPackHtml(`${part.id}${part.parentId ? ` ← ${part.parentId}` : ""}`)}</span>
          </div>
          <p class="wardrobe-hint">z ${part.z} · (${part.x}, ${part.y}) · scale ${part.scale}</p>
          <p class="wardrobe-hint">${escapeCharacterPackHtml(part.fileName || "未绑定分层素材")}</p>
          <div class="character-pack-actions">
            <label class="ghost-action">
              绑定 PNG/WebP
              <input type="file" accept="image/*,.webp,image/webp" data-part-file="${escapeCharacterPackHtml(part.id)}" hidden />
            </label>
            <button type="button" class="ghost-action" data-clear-part="${escapeCharacterPackHtml(part.id)}">清除素材</button>
          </div>
        </article>
      `).join("") || "<p class=\"wardrobe-hint\">尚未创建分层模型。点击「创建分层模板」。</p>";
    }
    syncMotionToggles();
  }

  document.querySelector("[data-layered-init]")?.addEventListener("click", () => {
    commit({
      ...state(),
      renderMode: state().renderMode || "auto",
      layered: createStarterLayeredModel(),
      schemaVersion: 4,
    });
  });

  document.querySelector("[data-layered-export-json]")?.addEventListener("click", () => {
    const json = exportLayeredOpenJson(ensureLayered());
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safePackId = String(state().packMeta?.id || "character")
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .slice(0, 64) || "character";
    a.download = `${safePackId}-layered.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.querySelector("[data-layered-import-json]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const candidate = {
        ...state(),
        layered: normalizeLayeredModel(parsed),
        renderMode: "auto",
        schemaVersion: 4,
      };
      const validation = validateCharacterPack(avatarStateToPackDraft(candidate));
      if (!validation.ok) {
        throw new Error(`分层模型校验失败：${validation.errors.join(", ")}`);
      }
      commit(candidate);
    } catch (error) {
      window.alert(`导入分层 JSON 失败：${error.message || error}`);
    }
    event.target.value = "";
  });

  document.querySelector("[data-layered-import-json-trigger]")?.addEventListener("click", () => {
    document.querySelector("[data-layered-import-json]")?.click();
  });

  modeSelect?.addEventListener("change", () => {
    commit({
      ...state(),
      renderMode: modeSelect.value || "auto",
      schemaVersion: 4,
    });
  });

  partsRoot?.addEventListener("change", async (event) => {
    const input = event.target.closest("[data-part-file]");
    if (!input?.files?.[0]) return;
    const partId = input.dataset.partFile;
    const file = input.files[0];
    const media = await storeImageFile(file, "layer");
    const layered = ensureLayered();
    layered.parts = layered.parts.map((part) => (
      part.id === partId
        ? { ...part, mediaId: media.id, fileName: file.name }
        : part
    ));
    commit({
      ...state(),
      layered: normalizeLayeredModel(layered),
      renderMode: state().renderMode === "sprite" ? "auto" : (state().renderMode || "auto"),
      schemaVersion: 4,
    });
    input.value = "";
  });

  partsRoot?.addEventListener("click", (event) => {
    const fileLabel = event.target.closest("label.ghost-action");
    if (fileLabel) {
      fileLabel.querySelector("input[type=file]")?.click();
      return;
    }
    const clear = event.target.closest("[data-clear-part]");
    if (!clear) return;
    const layered = ensureLayered();
    layered.parts = layered.parts.map((part) => (
      part.id === clear.dataset.clearPart
        ? { ...part, mediaId: "", fileName: "" }
        : part
    ));
    commit({
      ...state(),
      layered: normalizeLayeredModel(layered),
      schemaVersion: 4,
    });
  });

  motionBreath?.addEventListener("change", writeMotionToggles);
  motionBlink?.addEventListener("change", writeMotionToggles);
  motionSway?.addEventListener("change", writeMotionToggles);
  lipEnabled?.addEventListener("change", writeMotionToggles);

  return { renderPhase4 };
}
