/**
 * Long-press a home widget:
 * 1) 换位置 — same arrange gesture as app icons
 * 2) 导入组件 — user's HTML/CSS pack (.nywidget / .json / .html)
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { pt } from "./i18n.js";
import { isCustomWidgetId, MAX_WIDGET_FILE_BYTES } from "./widget-pack.js";

const FORMAT_SAMPLE = `{
  "format": "nyra-widget",
  "title": "便签",
  "span": "wide",
  "html": "<strong>今天也想你</strong>",
  "css": "strong { font-size: 18px; }"
}`;

/**
 * @param {HTMLElement} homeRoot
 * @param {{
 *   getMeta?: (id: string) => { title?: string, custom?: boolean }|null,
 *   onArrange?: (id: string) => void,
 *   onImport?: (file: File) => void,
 *   onRemove?: (id: string) => void,
 *   onToast?: (msg: string) => void,
 * }} deps
 */
export function mountWidgetSheet(homeRoot, deps = {}) {
  if (!homeRoot) return { open() {}, close() {}, destroy() {} };

  let sheet = homeRoot.querySelector("[data-widget-sheet]");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.className = "mini-icon-face-sheet";
    sheet.dataset.widgetSheet = "1";
    sheet.hidden = true;
    homeRoot.append(sheet);
  }

  /** @type {"" | "root" | "import"} */
  let step = "root";
  let currentId = "";

  function meta() {
    return deps.getMeta?.(currentId) || { title: pt("widgetFace.clock"), custom: false };
  }

  function render() {
    const info = meta();
    const title = info.title || pt("widgetFace.clock");
    if (step === "import") {
      sheet.innerHTML = `
        <button type="button" class="mini-icon-face-sheet__scrim" data-widget-sheet-close aria-label="${escapeHtml(pt("widgetFace.close"))}"></button>
        <div class="mini-icon-face-sheet__panel" role="dialog" aria-modal="true">
          <header class="mini-icon-face-sheet__head">
            <button type="button" class="mini-icon-button" data-widget-sheet-goto="root" aria-label="${escapeHtml(pt("widgetFace.back"))}"><i data-lucide="chevron-left"></i></button>
            <strong>${escapeHtml(pt("widgetFace.importTitle"))}</strong>
          </header>
          <p class="mini-widget-format-lead">${escapeHtml(pt("widgetFace.formatLead"))}</p>
          <pre class="mini-widget-format">${escapeHtml(FORMAT_SAMPLE)}</pre>
          <label class="mini-icon-face-action mini-icon-face-action--file">
            <input type="file" accept=".nywidget,.json,.html,application/json,text/html" hidden data-widget-file />
            <i data-lucide="file-plus"></i><span>${escapeHtml(pt("widgetFace.pickFile"))}</span>
          </label>
        </div>
      `;
      const fileInput = sheet.querySelector("[data-widget-file]");
      fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (!file) return;
        if (file.size > MAX_WIDGET_FILE_BYTES) {
          deps.onToast?.("widgetFace.too_big");
          return;
        }
        close();
        deps.onImport?.(file);
      });
    } else {
      sheet.innerHTML = `
        <button type="button" class="mini-icon-face-sheet__scrim" data-widget-sheet-close aria-label="${escapeHtml(pt("widgetFace.close"))}"></button>
        <div class="mini-icon-face-sheet__panel" role="dialog" aria-modal="true">
          <header class="mini-icon-face-sheet__head">
            <strong>${escapeHtml(title)}</strong>
          </header>
          <div class="mini-icon-face-actions">
            <button type="button" class="mini-icon-face-action" data-widget-arrange>
              <i data-lucide="move"></i><span>${escapeHtml(pt("widgetFace.move"))}</span>
            </button>
            <button type="button" class="mini-icon-face-action" data-widget-sheet-goto="import">
              <i data-lucide="file-plus"></i><span>${escapeHtml(pt("widgetFace.import"))}</span>
            </button>
            ${info.custom ? `
            <button type="button" class="mini-icon-face-action mini-icon-face-action--muted" data-widget-remove>
              <i data-lucide="trash-2"></i><span>${escapeHtml(pt("widgetFace.remove"))}</span>
            </button>` : ""}
          </div>
        </div>
      `;
    }
    refreshIcons();
  }

  function open(widgetId) {
    const id = String(widgetId || "").trim();
    if (!id) return;
    currentId = id;
    step = "root";
    sheet.hidden = false;
    render();
  }

  function close() {
    sheet.hidden = true;
    currentId = "";
    step = "root";
  }

  function onClick(event) {
    if (event.target.closest("[data-widget-file], .mini-icon-face-action--file")) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.target.closest("[data-widget-sheet-close]")) {
      close();
      return;
    }
    const goto = event.target.closest("[data-widget-sheet-goto]")?.getAttribute("data-widget-sheet-goto");
    if (goto === "root" || goto === "import") {
      step = goto;
      render();
      return;
    }
    if (event.target.closest("[data-widget-arrange]")) {
      const id = currentId;
      close();
      window.setTimeout(() => deps.onArrange?.(id), 0);
      return;
    }
    if (event.target.closest("[data-widget-remove]")) {
      const id = currentId;
      if (!isCustomWidgetId(id)) return;
      close();
      deps.onRemove?.(id);
    }
  }

  sheet.addEventListener("click", onClick);

  return {
    open,
    close,
    destroy() {
      sheet.removeEventListener("click", onClick);
      sheet.remove();
    },
  };
}
