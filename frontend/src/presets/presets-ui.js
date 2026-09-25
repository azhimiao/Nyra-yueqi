/**
 * Reply presets UI — selector sheet + manage mount (F5 / F3).
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import {
  duplicatePreset,
  getActivePresetId,
  listPresets,
  setActivePresetId,
  upsertPreset,
  deletePreset,
} from "./store.js";
import { normalizePromptLayout } from "../prompt/authoring.js";

/** @type {Record<string, string>} */
const BUILTIN_PRESET_KEY = {
  "preset-daily": "daily",
  "preset-literary": "literary",
  "preset-boundary": "boundary",
};

function presetBuiltinKey(preset) {
  return preset?.builtin ? BUILTIN_PRESET_KEY[preset.id] : "";
}

function presetDisplayName(preset) {
  const key = presetBuiltinKey(preset);
  if (key) return t(`mePanels.presets.builtin.${key}.name`);
  return preset.name;
}

function presetDisplayDescription(preset) {
  const key = presetBuiltinKey(preset);
  if (key) return t(`mePanels.presets.builtin.${key}.description`);
  return preset.description || "";
}

const PROMPT_LAYOUT_LABELS = Object.freeze({
  character: "角色",
  relationship_context: "关系与当前情况",
  world_context: "世界设定",
  relevant_memories: "相关记忆",
  runtime_context: "本轮能力与工具",
  branch_summary: "长对话摘要",
  world_context_after: "历史后的世界设定",
  post_history_contract: "回复规则",
});

const PROMPT_LAYOUT_POSITION_LABELS = Object.freeze({
  before_history: "历史前",
  at_depth: "插入历史",
  after_history: "历史后",
});

/**
 * Mount management panel into a settings container.
 * @param {HTMLElement} root
 * @param {{ onToast?: (msg: string) => void, onActiveChange?: (id: string) => void }} [deps]
 */
export function mountPresetsManager(root, deps = {}) {
  if (!root) return { refresh() {}, destroy() {} };

  /** @type {Set<string>} */
  const openEditors = new Set();

  function render() {
    const presets = listPresets();
    const activeId = getActivePresetId();
    root.innerHTML = `
      <p class="me-foot-hint">${escapeHtml(t("mePanels.presets.footHint"))}</p>
      <div class="presets-list" data-presets-list>
        ${presets
          .map(
            (p) => `
          <article class="preset-card${p.id === activeId ? " is-active" : ""}" data-preset-id="${escapeHtml(p.id)}">
            <div class="preset-card__head">
              <div class="preset-card__title">
                <strong>${escapeHtml(presetDisplayName(p))}</strong>
                <div class="preset-card__pills">
                  ${p.builtin ? `<span class="preset-pill">${escapeHtml(t("mePanels.presets.pillBuiltin"))}</span>` : ""}
                  ${p.id === activeId ? `<span class="preset-pill preset-pill--on">${escapeHtml(t("mePanels.presets.pillActive"))}</span>` : ""}
                </div>
              </div>
              <p class="preset-card__desc">${escapeHtml(presetDisplayDescription(p))}</p>
            </div>
            <div class="preset-card__actions">
              <button type="button" class="preset-action${p.id === activeId ? " is-on" : ""}" data-preset-use>${escapeHtml(p.id === activeId ? t("mePanels.presets.inUse") : t("mePanels.presets.use"))}</button>
              <button type="button" class="preset-action" data-preset-dup>${escapeHtml(t("mePanels.presets.duplicate"))}</button>
              ${p.builtin ? "" : `<button type="button" class="preset-action preset-action--danger" data-preset-del>${escapeHtml(t("mePanels.presets.delete"))}</button>`}
            </div>
            ${
              p.builtin
                ? ""
                : `<details class="preset-edit"${openEditors.has(p.id) ? " open" : ""}>
              <summary>${escapeHtml(t("mePanels.presets.editContent"))}</summary>
              <div class="preset-edit__body">
                <label class="edit-field">
                  <span>${escapeHtml(t("mePanels.presets.fieldName"))}</span>
                  <input type="text" data-edit-name value="${escapeHtml(p.name)}" autocomplete="off" />
                </label>
                <label class="edit-field">
                  <span>${escapeHtml(t("mePanels.presets.fieldDescription"))}</span>
                  <input type="text" data-edit-desc value="${escapeHtml(p.description)}" autocomplete="off" />
                </label>
                <label class="prompt-block">
                  <span>${escapeHtml(t("mePanels.presets.fieldSystemPrefix"))}</span>
                  <textarea rows="4" data-edit-sys>${escapeHtml(p.promptSystemPrefix)}</textarea>
                </label>
                <label class="prompt-block">
                  <span>${escapeHtml(t("mePanels.presets.fieldDeveloperAppend"))}</span>
                  <textarea rows="3" data-edit-dev>${escapeHtml(p.promptDeveloperAppend)}</textarea>
                </label>
                <section class="prompt-layout-editor" data-prompt-layout-editor>
                  <div class="prompt-layout-editor__head">
                    <strong>Prompt 顺序与位置</strong>
                    <span>可调整顺序、system/developer 角色，以及历史插入深度。</span>
                  </div>
                  <div class="prompt-layout-list">
                    ${normalizePromptLayout(p.promptLayout).map((entry, index, all) => `
                      <div class="prompt-layout-row" data-layout-id="${escapeHtml(entry.id)}">
                        <span class="prompt-layout-row__name">${escapeHtml(PROMPT_LAYOUT_LABELS[entry.id] || entry.id)}</span>
                        <span class="prompt-layout-row__order">
                          <button type="button" class="prompt-layout-move" data-layout-up ${index === 0 ? "disabled" : ""} aria-label="上移">↑</button>
                          <button type="button" class="prompt-layout-move" data-layout-down ${index === all.length - 1 ? "disabled" : ""} aria-label="下移">↓</button>
                        </span>
                        <select data-layout-role aria-label="消息角色">
                          <option value="system" ${entry.role === "system" ? "selected" : ""}>system</option>
                          <option value="developer" ${entry.role === "developer" ? "selected" : ""}>developer</option>
                        </select>
                        <select data-layout-position aria-label="插入位置">
                          ${Object.entries(PROMPT_LAYOUT_POSITION_LABELS).map(([value, label]) => `<option value="${value}" ${entry.position === value ? "selected" : ""}>${label}</option>`).join("")}
                        </select>
                        <input type="number" min="0" max="64" step="1" value="${entry.depth}" data-layout-depth aria-label="插入深度" ${entry.position !== "at_depth" ? "disabled" : ""} />
                        <label class="prompt-layout-row__enabled"><input type="checkbox" data-layout-enabled ${entry.enabled !== false ? "checked" : ""} />启用</label>
                      </div>
                    `).join("")}
                  </div>
                </section>
                <button type="button" class="me-auth-primary" data-preset-save>${escapeHtml(t("mePanels.presets.save"))}</button>
              </div>
            </details>`
            }
          </article>`,
          )
          .join("")}
      </div>
    `;
    root.querySelectorAll("textarea").forEach((el) => {
      el.style.height = "auto";
      el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
      el.addEventListener("input", () => {
        el.style.height = "auto";
        el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
      });
    });
    root.querySelectorAll("[data-layout-position]").forEach((select) => {
      select.addEventListener("change", () => {
        const depth = select.closest("[data-layout-id]")?.querySelector("[data-layout-depth]");
        if (depth) depth.disabled = select.value !== "at_depth";
      });
    });
    refreshIcons();
  }

  root.addEventListener("toggle", (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.classList.contains("preset-edit")) return;
    const id = details.closest("[data-preset-id]")?.getAttribute("data-preset-id");
    if (!id) return;
    if (details.open) openEditors.add(id);
    else openEditors.delete(id);
  }, true);

  root.addEventListener("click", (event) => {
    const card = event.target.closest("[data-preset-id]");
    if (!card || !root.contains(card)) return;
    const id = card.getAttribute("data-preset-id");
    if (event.target.closest("[data-preset-use]")) {
      setActivePresetId(id);
      deps.onActiveChange?.(id);
      deps.onToast?.(t("mePanels.presets.toastSwitched"));
      render();
      return;
    }
    if (event.target.closest("[data-preset-dup]")) {
      const copy = duplicatePreset(id);
      if (copy) {
        openEditors.add(copy.id);
        deps.onToast?.(t("mePanels.presets.toastDuplicated", { name: copy.name }));
        render();
      }
      return;
    }
    if (event.target.closest("[data-preset-del]")) {
      openEditors.delete(id);
      deletePreset(id);
      deps.onToast?.(t("mePanels.presets.toastDeleted"));
      render();
      return;
    }
    if (event.target.closest("[data-preset-save]")) {
      const layout = Array.from(card.querySelectorAll("[data-layout-id]")).map((row) => ({
        id: row.dataset.layoutId,
        role: row.querySelector("[data-layout-role]")?.value,
        position: row.querySelector("[data-layout-position]")?.value,
        depth: Number(row.querySelector("[data-layout-depth]")?.value || 0),
        enabled: row.querySelector("[data-layout-enabled]")?.checked !== false,
      }));
      upsertPreset({
        id,
        name: card.querySelector("[data-edit-name]")?.value,
        description: card.querySelector("[data-edit-desc]")?.value,
        promptSystemPrefix: card.querySelector("[data-edit-sys]")?.value,
        promptDeveloperAppend: card.querySelector("[data-edit-dev]")?.value,
        promptLayout: normalizePromptLayout(layout),
        builtin: false,
      });
      deps.onToast?.(t("mePanels.presets.toastSaved"));
      render();
      return;
    }
    const move = event.target.closest("[data-layout-up], [data-layout-down]");
    if (move) {
      const row = move.closest("[data-layout-id]");
      const list = row?.parentElement;
      if (!row || !list) return;
      const sibling = move.hasAttribute("data-layout-up") ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) return;
      if (move.hasAttribute("data-layout-up")) list.insertBefore(row, sibling);
      else list.insertBefore(sibling, row);
      return;
    }
  });

  render();
  const onPresetsChanged = () => render();
  const onLocaleChanged = () => render();
  window.addEventListener("yueqi.assist.presets-changed", onPresetsChanged);
  window.addEventListener("yueqi:locale-changed", onLocaleChanged);
  return {
    refresh: render,
    destroy() {
      window.removeEventListener("yueqi.assist.presets-changed", onPresetsChanged);
      window.removeEventListener("yueqi:locale-changed", onLocaleChanged);
      root.innerHTML = "";
    },
  };
}

/**
 * Bottom sheet picker for Pop.
 * @param {{ onManage?: () => void, onPick?: (id: string) => void }} [deps]
 */
export function openPresetPickerSheet(deps = {}) {
  document.querySelectorAll("[data-preset-sheet]").forEach((n) => n.remove());
  const presets = listPresets();
  const activeId = getActivePresetId();
  const sheet = document.createElement("section");
  sheet.className = "yueqi-sheet is-open";
  sheet.dataset.presetSheet = "1";
  sheet.innerHTML = `
    <div class="yueqi-sheet__backdrop" data-close></div>
    <div class="yueqi-sheet__panel" role="dialog" aria-label="${escapeHtml(t("mePanels.presets.sheetAria"))}">
      <header><h3>${escapeHtml(t("mePanels.presets.sheetTitle"))}</h3></header>
      <ul class="yueqi-sheet__list">
        ${presets
          .map(
            (p) => `
          <li>
            <button type="button" class="yueqi-sheet__item${p.id === activeId ? " is-active" : ""}" data-pick="${escapeHtml(p.id)}">
              <strong>${escapeHtml(presetDisplayName(p))}</strong>
              <span>${escapeHtml(presetDisplayDescription(p))}</span>
              ${p.id === activeId ? "<em>✓</em>" : ""}
            </button>
          </li>`,
          )
          .join("")}
      </ul>
      <button type="button" class="ghost-action yueqi-sheet__manage" data-manage>${escapeHtml(t("mePanels.presets.managePresets"))}</button>
    </div>
  `;
  const close = () => sheet.remove();
  sheet.querySelector("[data-close]")?.addEventListener("click", close);
  sheet.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-pick");
      setActivePresetId(id);
      deps.onPick?.(id);
      close();
    });
  });
  sheet.querySelector("[data-manage]")?.addEventListener("click", () => {
    close();
    deps.onManage?.();
  });
  document.body.append(sheet);
}

/**
 * Compact chip for Pop composer.
 * @param {HTMLElement} host
 * @param {{ onManage?: () => void }} [deps]
 */
export function mountPresetChip(host, deps = {}) {
  if (!host) return { refresh() {}, destroy() {} };
  function refresh() {
    const presets = listPresets();
    const active = presets.find((p) => p.id === getActivePresetId()) || presets[0];
    host.innerHTML = `
      <button type="button" class="preset-chip" data-open-preset-chip type="button">
        <span>${escapeHtml(t("mePanels.presets.chipLabel"))}</span>
        <strong>${escapeHtml(active ? presetDisplayName(active) : t("mePanels.presets.builtin.daily.name"))}</strong>
      </button>
    `;
  }
  host.addEventListener("click", (event) => {
    if (!event.target.closest("[data-open-preset-chip]")) return;
    openPresetPickerSheet({
      onManage: deps.onManage,
      onPick: () => refresh(),
    });
  });
  refresh();
  const onLocaleChanged = () => refresh();
  window.addEventListener("yueqi:locale-changed", onLocaleChanged);
  return {
    refresh,
    destroy() {
      window.removeEventListener("yueqi:locale-changed", onLocaleChanged);
      host.innerHTML = "";
    },
  };
}
