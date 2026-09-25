import { downloadZip } from "../character-pack/pack-io.js";
import {
  exportActionPackZip,
  parseActionPackZip,
  installActionPack,
} from "../character-pack/action-pack-io.js";
import {
  listPackHistory,
  rollbackPack,
  deliveryChecklist,
  bumpPackVersion,
} from "../character-pack/pack-version.js";
import { createEmptyTimeline, normalizeTimeline } from "./timeline.js";
import { normalizeExpression } from "./expressions.js";
import { normalizeSceneTrigger } from "../runtime/scene-triggers.js";
import {
  avatarStateToPackDraft,
  escapeCharacterPackHtml,
  validateCharacterPack,
} from "../character-pack/schema.js";

/**
 * Phase 3 editor surfaces: timeline B, expressions, scenes, action pack, versioning.
 */
export function wirePhase3Editor(api) {
  const {
    getState,
    setState,
    save,
    renderAll,
    getMediaBlobById,
    storeMediaFromBytes,
    previewAction,
  } = api;

  const timelineRoot = document.querySelector("[data-timeline-editor]");
  const expressionList = document.querySelector("[data-expression-list]");
  const sceneList = document.querySelector("[data-scene-list]");
  const versionStatus = document.querySelector("[data-pack-version-status]");
  const checklistPre = document.querySelector("[data-delivery-checklist]");
  const historySelect = document.querySelector("[data-pack-history]");

  let selectedActionId = "comfort";

  function state() {
    return getState();
  }

  function commit(next, { softTimeline = false } = {}) {
    setState(next);
    save();
    if (softTimeline) {
      // Keep focused inputs; DOM already shows typed values.
      return;
    }
    renderAll();
    renderPhase3();
  }

  function renderTimeline() {
    if (!timelineRoot) return;
    const action = (state().actions || []).find((item) => item.id === selectedActionId);
    if (!action) {
      timelineRoot.innerHTML = "<p class=\"wardrobe-hint\">选择一个动作以编辑时间轴。</p>";
      return;
    }
    const timeline = normalizeTimeline(action.timeline || createEmptyTimeline());
    const actionOptions = (state().actions || []).map((item) => {
      const id = escapeCharacterPackHtml(item.id);
      const name = escapeCharacterPackHtml(item.name || item.id);
      return `<option value="${id}" ${item.id === selectedActionId ? "selected" : ""}>${name} (${id})</option>`;
    }).join("");
    timelineRoot.innerHTML = `
      <div class="timeline-toolbar">
        <label>编辑动作
          <select data-timeline-action-select>
            ${actionOptions}
          </select>
        </label>
        <button type="button" class="ghost-action" data-timeline-preview>预览时间轴</button>
      </div>
      ${["enter", "loop", "exit"].map((stage) => `
        <div class="timeline-seg" data-timeline-stage="${stage}">
          <strong>${stage === "enter" ? "入场" : stage === "loop" ? "循环" : "出场"}</strong>
          <label>时长 ms <input type="number" min="0" step="50" data-seg-duration value="${timeline[stage].durationMs}" /></label>
          <label>表情 ID <input type="text" data-seg-expression value="${escapeCharacterPackHtml(timeline[stage].expressionId || "")}" placeholder="soft_smile" /></label>
          <small>${timeline[stage].fileName ? escapeCharacterPackHtml(`段素材：${timeline[stage].fileName}`) : "段素材未绑定（将用主动作图）"}</small>
          <button type="button" class="ghost-action" data-seg-bind="${stage}">绑定段素材</button>
          <input type="file" accept="image/*,.webp,image/webp" data-seg-file="${stage}" hidden />
        </div>
      `).join("")}
      <div class="timeline-keyframes">
        <strong>表情关键帧</strong>
        <div data-keyframe-rows>
          ${(timeline.keyframes || []).map((kf, index) => `
            <div class="keyframe-row" data-kf-index="${index}">
              <input type="number" min="0" data-kf-at value="${kf.atMs}" title="atMs" />
              <input type="text" data-kf-exp value="${escapeCharacterPackHtml(kf.expressionId)}" placeholder="expressionId" />
              <button type="button" class="ghost-action" data-kf-remove="${index}">删</button>
            </div>
          `).join("")}
        </div>
        <button type="button" class="ghost-action" data-kf-add>添加关键帧</button>
      </div>
    `;
  }

  function renderExpressions() {
    if (!expressionList) return;
    expressionList.innerHTML = (state().expressions || []).map((item) => `
      <article class="action-editor-row" data-expression-id="${escapeCharacterPackHtml(item.id)}">
        <div class="action-editor-main">
          <strong>${escapeCharacterPackHtml(item.name)}</strong>
          <small>${escapeCharacterPackHtml(`${item.id} · emotion=${item.emotion} → ${item.actionId || "(无动作)"}`)}</small>
        </div>
        <div class="action-editor-actions">
          <button type="button" class="ghost-action" data-expression-edit="${escapeCharacterPackHtml(item.id)}">编辑</button>
          <button type="button" class="ghost-action" data-expression-delete="${escapeCharacterPackHtml(item.id)}">删除</button>
        </div>
      </article>
    `).join("") || "<p class=\"wardrobe-hint\">暂无表情映射</p>";
  }

  function renderScenes() {
    if (!sceneList) return;
    sceneList.innerHTML = (state().sceneTriggers || []).map((item) => `
      <article class="action-editor-row" data-scene-id="${escapeCharacterPackHtml(item.id)}">
        <div class="action-editor-main">
          <strong>${escapeCharacterPackHtml(item.scene)}</strong>
          <small>${escapeCharacterPackHtml(`action=${item.actionId || "—"} · look=${item.lookId || "—"} · p=${item.priority || 0}`)}</small>
        </div>
        <div class="action-editor-actions">
          <button type="button" class="ghost-action" data-scene-edit="${escapeCharacterPackHtml(item.id)}">编辑</button>
          <button type="button" class="ghost-action" data-scene-delete="${escapeCharacterPackHtml(item.id)}">删除</button>
        </div>
      </article>
    `).join("") || "<p class=\"wardrobe-hint\">暂无场景触发</p>";
  }

  function renderVersion() {
    const meta = state().packMeta || {};
    if (versionStatus) {
      versionStatus.textContent = [
        `包：${meta.name || "未命名"}`,
        `版本：${meta.version || "1.0.0"}`,
        meta.installedAt ? `安装：${meta.installedAt}` : "尚未记录安装时间",
        meta.rolledBackAt ? `回滚于：${meta.rolledBackAt}` : "",
      ].filter(Boolean).join("\n");
    }
    if (historySelect) {
      const rows = listPackHistory(state());
      historySelect.innerHTML = rows.length
        ? rows.map((row) => `<option value="${row.index}">${escapeCharacterPackHtml(`${row.version} · ${row.reason} · ${row.savedAt}`)}</option>`).join("")
        : "<option value=\"\">暂无历史版本</option>";
    }
    if (checklistPre) {
      const result = deliveryChecklist(state());
      checklistPre.textContent = result.checks
        .map((item) => `${item.ok ? "✓" : "✗"} ${item.label}`)
        .concat([result.ok ? "交付检查：通过" : "交付检查：未通过"])
        .join("\n");
    }
  }

  function renderPhase3() {
    renderTimeline();
    renderExpressions();
    renderScenes();
    renderVersion();
  }

  function patchSelectedTimeline(mutator, commitOpts = {}) {
    const next = { ...state(), actions: (state().actions || []).map((action) => ({ ...action })) };
    const action = next.actions.find((item) => item.id === selectedActionId);
    if (!action) return;
    action.timeline = normalizeTimeline(action.timeline || createEmptyTimeline());
    mutator(action.timeline, action);
    commit(next, commitOpts);
  }

  timelineRoot?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-timeline-action-select]");
    if (select) {
      selectedActionId = select.value;
      renderTimeline();
      return;
    }
    const seg = event.target.closest("[data-timeline-stage]");
    if (seg) {
      const stage = seg.dataset.timelineStage;
      patchSelectedTimeline((timeline) => {
        if (event.target.matches("[data-seg-duration]")) {
          timeline[stage].durationMs = Number(event.target.value) || 0;
        }
        if (event.target.matches("[data-seg-expression]")) {
          timeline[stage].expressionId = event.target.value.trim();
        }
      }, { softTimeline: true });
      return;
    }
    const fileInput = event.target.closest("[data-seg-file]");
    if (fileInput?.files?.[0]) {
      const stage = fileInput.dataset.segFile;
      const media = await api.storeImageFile(fileInput.files[0], "action");
      patchSelectedTimeline((timeline) => {
        timeline[stage].mediaId = media.id;
        timeline[stage].fileName = fileInput.files[0].name;
      });
      fileInput.value = "";
    }
  });

  timelineRoot?.addEventListener("click", (event) => {
    if (event.target.closest("[data-timeline-preview]")) {
      previewAction?.(selectedActionId);
      return;
    }
    const bind = event.target.closest("[data-seg-bind]");
    if (bind) {
      timelineRoot.querySelector(`[data-seg-file="${bind.dataset.segBind}"]`)?.click();
      return;
    }
    if (event.target.closest("[data-kf-add]")) {
      patchSelectedTimeline((timeline) => {
        timeline.keyframes.push({ atMs: 0, expressionId: "soft_smile" });
      });
      return;
    }
    const remove = event.target.closest("[data-kf-remove]");
    if (remove) {
      const index = Number(remove.dataset.kfRemove);
      patchSelectedTimeline((timeline) => {
        timeline.keyframes.splice(index, 1);
      });
    }
  });

  timelineRoot?.addEventListener("input", (event) => {
    const row = event.target.closest("[data-kf-index]");
    if (!row) return;
    const index = Number(row.dataset.kfIndex);
    patchSelectedTimeline((timeline) => {
      const kf = timeline.keyframes[index];
      if (!kf) return;
      if (event.target.matches("[data-kf-at]")) kf.atMs = Number(event.target.value) || 0;
      if (event.target.matches("[data-kf-exp]")) kf.expressionId = event.target.value.trim();
    }, { softTimeline: true });
  });

  document.querySelector("[data-expression-add]")?.addEventListener("click", () => {
    const id = window.prompt("表情 ID（如 soft_smile）", `expr_${Date.now().toString(16)}`);
    if (!id) return;
    const name = window.prompt("显示名", id) || id;
    const emotion = window.prompt("emotion", "warm") || "warm";
    const actionId = window.prompt("映射 action_id", "talking_default") || "";
    const item = normalizeExpression({ id, name, emotion, actionId });
    if (!item) return;
    const next = { ...state(), expressions: [...(state().expressions || []), item] };
    commit(next);
  });

  expressionList?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-expression-edit]");
    if (edit) {
      const current = (state().expressions || []).find((item) => item.id === edit.dataset.expressionEdit);
      if (!current) return;
      const actionId = window.prompt("映射 action_id", current.actionId || "") ?? current.actionId;
      const emotion = window.prompt("emotion", current.emotion || "neutral") || current.emotion;
      const name = window.prompt("显示名", current.name || current.id) || current.name;
      const next = {
        ...state(),
        expressions: (state().expressions || []).map((item) => (
          item.id === current.id ? normalizeExpression({ ...item, actionId, emotion, name }) : item
        )),
      };
      commit(next);
      return;
    }
    const del = event.target.closest("[data-expression-delete]");
    if (del) {
      commit({
        ...state(),
        expressions: (state().expressions || []).filter((item) => item.id !== del.dataset.expressionDelete),
      });
    }
  });

  document.querySelector("[data-scene-add]")?.addEventListener("click", () => {
    const scene = window.prompt("场景键（proactive / weather_rain / sleep / morning）", "proactive");
    if (!scene) return;
    const actionId = window.prompt("action_id", "comfort") || "";
    const lookId = window.prompt("look_id（可空）", "") || "";
    const item = normalizeSceneTrigger({
      id: `scene_${scene}_${Date.now().toString(16)}`,
      scene,
      actionId,
      lookId,
      priority: 10,
    });
    commit({
      ...state(),
      sceneTriggers: [...(state().sceneTriggers || []), item],
    });
  });

  sceneList?.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-scene-edit]");
    if (edit) {
      const current = (state().sceneTriggers || []).find((item) => item.id === edit.dataset.sceneEdit);
      if (!current) return;
      const actionId = window.prompt("action_id", current.actionId || "") ?? current.actionId;
      const lookId = window.prompt("look_id", current.lookId || "") ?? current.lookId;
      commit({
        ...state(),
        sceneTriggers: (state().sceneTriggers || []).map((item) => (
          item.id === current.id
            ? normalizeSceneTrigger({ ...item, actionId, lookId })
            : item
        )),
      });
      return;
    }
    const del = event.target.closest("[data-scene-delete]");
    if (del) {
      commit({
        ...state(),
        sceneTriggers: (state().sceneTriggers || []).filter((item) => item.id !== del.dataset.sceneDelete),
      });
    }
  });

  document.querySelector("[data-export-action-pack]")?.addEventListener("click", async () => {
    try {
      const bytes = await exportActionPackZip(state(), {
        getMediaBlob: getMediaBlobById,
        packName: "月栖动作包",
        version: state().packMeta?.version,
      });
      downloadZip(`yueqi-action-pack-${Date.now()}.zip`, bytes);
    } catch (error) {
      window.alert(error.message || "导出失败");
    }
  });

  document.querySelector("[data-import-action-pack-trigger]")?.addEventListener("click", () => {
    document.querySelector("[data-import-action-pack]")?.click();
  });

  document.querySelector("[data-import-action-pack]")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pack = parseActionPackZip(bytes);
      const previewMerged = await installActionPack(pack, state());
      const validation = validateCharacterPack(avatarStateToPackDraft(previewMerged));
      if (!validation.ok) {
        throw new Error(`动作包校验失败：${validation.errors.join(", ")}`);
      }
      const merged = await installActionPack(pack, state(), { storeMediaFromBytes });
      commit({
        ...merged,
        packMeta: {
          ...(state().packMeta || {}),
          version: bumpPackVersion(state().packMeta?.version || "1.0.0", "minor"),
          installedAt: new Date().toISOString(),
        },
      });
      window.alert(`已导入动作包：${pack.manifest?.name || ""}`);
    } catch (error) {
      window.alert(error.message || "导入失败");
    }
    event.target.value = "";
  });

  document.querySelector("[data-pack-rollback]")?.addEventListener("click", () => {
    const index = Number(historySelect?.value);
    if (!Number.isFinite(index)) {
      window.alert("没有可回滚版本");
      return;
    }
    try {
      if (!window.confirm("确认回滚到所选历史版本？当前配置会保留在历史中。")) return;
      commit(rollbackPack(state(), index));
    } catch (error) {
      window.alert(error.message || "回滚失败");
    }
  });

  document.querySelector("[data-run-delivery-checklist]")?.addEventListener("click", () => {
    renderVersion();
    const result = deliveryChecklist(state());
    window.alert(result.ok ? "交付检查通过" : "交付检查未通过，请查看清单");
  });

  document.querySelector("[data-bump-pack-version]")?.addEventListener("click", () => {
    const kind = window.prompt("升级类型：patch / minor / major", "patch") || "patch";
    commit({
      ...state(),
      packMeta: {
        ...(state().packMeta || {}),
        version: bumpPackVersion(state().packMeta?.version || "1.0.0", kind),
      },
    });
  });

  renderPhase3();
  return { renderPhase3, setSelectedActionId: (id) => { selectedActionId = id; renderTimeline(); } };
}
