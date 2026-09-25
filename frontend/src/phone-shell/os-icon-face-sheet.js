/**
 * Long-press menu:
 * 1) 移动图标
 * 2) 换图片 → 选颜色（色轮 / 透明）或 换自己的图片
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import {
  appFaceInnerHtml,
  applyIconFace,
  contrastInkForHex,
  hexToHsv,
  hsvToHex,
  normalizeHexColor,
  readImageAsIconDataUrl,
} from "./icon-face.js";
import { PHONE_APP_MAP, resolveHomeEntry, isFolderEntry, isExtDesktopId } from "./apps-catalog.js";
import { phoneAppLabel, pt } from "./i18n.js";

/**
 * @param {HTMLElement} homeRoot
 * @param {{
 *   getOverrides: () => Record<string, object>,
 *   setOverrides: (next: Record<string, object>) => void,
 *   resolveExt?: (extId: string) => object|null,
 *   onArrange?: () => void,
 *   onToast?: (msg: string) => void,
 * }} deps
 */
export function mountIconFaceSheet(homeRoot, deps = {}) {
  if (!homeRoot) return { open() {}, close() {}, destroy() {} };

  let sheet = homeRoot.querySelector("[data-icon-face-sheet]");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.className = "mini-icon-face-sheet";
    sheet.dataset.iconFaceSheet = "1";
    sheet.hidden = true;
    homeRoot.append(sheet);
  }

  /** @type {"" | "root" | "face" | "color"} */
  let step = "root";
  let currentAppId = "";
  let draftHue = 180;
  let draftSat = 0.5;
  let draftVal = 0.78;
  let draftTransparent = false;
  let wheelCanvas = null;
  let picking = false;

  function baseEntry(appId) {
    if (isFolderEntry(appId)) return null;
    if (isExtDesktopId(appId)) {
      return resolveHomeEntry(appId, {}, deps.resolveExt || null);
    }
    const app = PHONE_APP_MAP[appId];
    return app ? { ...app, type: "app", id: appId } : null;
  }

  function currentEntry() {
    const base = baseEntry(currentAppId);
    if (!base) return null;
    return applyIconFace(base, deps.getOverrides?.() || {});
  }

  function patchOverride(partial) {
    const overrides = { ...(deps.getOverrides?.() || {}) };
    const prev = { ...(overrides[currentAppId] || {}) };
    const merged = { ...prev, ...partial };
    for (const key of Object.keys(merged)) {
      if (merged[key] == null || merged[key] === "" || merged[key] === false) {
        delete merged[key];
      }
    }
    if (Object.keys(merged).length) overrides[currentAppId] = merged;
    else delete overrides[currentAppId];
    deps.setOverrides?.(overrides);
  }

  function draftHex() {
    return hsvToHex(draftHue, draftSat, draftVal);
  }

  function syncDraftFromEntry() {
    const entry = currentEntry();
    draftTransparent = Boolean(entry?.faceTransparent);
    const hex = normalizeHexColor(entry?.faceColor) || "#4aa8b0";
    const hsv = hexToHsv(hex);
    draftHue = hsv.h;
    draftSat = Math.max(0.15, hsv.s);
    draftVal = Math.max(0.35, hsv.v);
  }

  function paintWheel() {
    if (!wheelCanvas) return;
    const size = wheelCanvas.width;
    const ctx = wheelCanvas.getContext("2d");
    if (!ctx) return;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 2;
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const i = (y * size + x) * 4;
        if (dist > radius) {
          image.data[i + 3] = 0;
          continue;
        }
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        const sat = dist / radius;
        const hex = hsvToHex(angle, sat, draftVal);
        image.data[i] = parseInt(hex.slice(1, 3), 16);
        image.data[i + 1] = parseInt(hex.slice(3, 5), 16);
        image.data[i + 2] = parseInt(hex.slice(5, 7), 16);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);

    // cursor
    const cr = draftSat * radius;
    const rad = (draftHue * Math.PI) / 180;
    const px = cx + Math.cos(rad) * cr;
    const py = cy + Math.sin(rad) * cr;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.strokeStyle = "rgb(0 0 0 / 45%)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function pickFromEvent(event) {
    if (!wheelCanvas || draftTransparent) return;
    const rect = wheelCanvas.getBoundingClientRect();
    const size = wheelCanvas.width;
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const cx = size / 2;
    const cy = size / 2;
    const dx = x - cx;
    const dy = y - cy;
    const radius = size / 2 - 2;
    const dist = Math.min(radius, Math.hypot(dx, dy));
    let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    draftHue = angle;
    draftSat = dist / radius;
    updateColorPreview();
    paintWheel();
  }

  function updateColorPreview() {
    const preview = sheet.querySelector("[data-icon-face-color-preview]");
    const hexLabel = sheet.querySelector("[data-icon-face-hex]");
    const hex = draftTransparent ? "" : draftHex();
    if (preview) {
      if (draftTransparent) {
        preview.classList.add("is-clear");
        preview.style.removeProperty("--icon-face-color");
        preview.style.color = "";
      } else {
        preview.classList.remove("is-clear");
        preview.style.setProperty("--icon-face-color", hex);
        preview.style.color = contrastInkForHex(hex) === "light" ? "#fff" : "#2a3a3e";
      }
    }
    if (hexLabel) hexLabel.textContent = draftTransparent ? pt("iconFace.transparent") : hex.toUpperCase();
    const wheelWrap = sheet.querySelector("[data-icon-face-wheel-wrap]");
    wheelWrap?.classList.toggle("is-dimmed", draftTransparent);
  }

  function bindWheel() {
    wheelCanvas = sheet.querySelector("[data-icon-face-wheel]");
    if (!wheelCanvas) return;
    paintWheel();
    const onMove = (event) => {
      if (!picking) return;
      pickFromEvent(event);
    };
    const onUp = () => {
      picking = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    wheelCanvas.addEventListener("pointerdown", (event) => {
      if (draftTransparent) return;
      picking = true;
      pickFromEvent(event);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  function render() {
    const entry = currentEntry();
    if (!entry) return;
    const hasCustom = Boolean(entry.faceImage || entry.faceTransparent || entry.faceColor);

    if (step === "root") {
      sheet.innerHTML = `
        <button type="button" class="mini-icon-face-sheet__scrim" data-icon-face-close aria-label="${escapeHtml(pt("iconFace.close"))}"></button>
        <div class="mini-icon-face-sheet__panel" role="dialog" aria-modal="true">
          <header class="mini-icon-face-sheet__head">
            <div class="mini-icon-face-sheet__preview">${appFaceInnerHtml(entry, escapeHtml)}</div>
            <strong>${escapeHtml(phoneAppLabel(entry) || entry.label || pt("iconFace.defaultLabel"))}</strong>
          </header>
          <div class="mini-icon-face-actions">
            <button type="button" class="mini-icon-face-action" data-icon-face-arrange>
              <i data-lucide="move"></i><span>${escapeHtml(pt("iconFace.moveIcon"))}</span>
            </button>
            <button type="button" class="mini-icon-face-action" data-icon-face-goto="face">
              <i data-lucide="image"></i><span>${escapeHtml(pt("iconFace.changeImage"))}</span>
            </button>
          </div>
        </div>
      `;
    } else if (step === "face") {
      sheet.innerHTML = `
        <button type="button" class="mini-icon-face-sheet__scrim" data-icon-face-close aria-label="${escapeHtml(pt("iconFace.close"))}"></button>
        <div class="mini-icon-face-sheet__panel" role="dialog" aria-modal="true">
          <header class="mini-icon-face-sheet__head">
            <button type="button" class="mini-icon-button" data-icon-face-goto="root" aria-label="${escapeHtml(pt("iconFace.back"))}"><i data-lucide="chevron-left"></i></button>
            <strong>${escapeHtml(pt("iconFace.changeImage"))}</strong>
          </header>
          <div class="mini-icon-face-actions">
            <button type="button" class="mini-icon-face-action" data-icon-face-goto="color">
              <i data-lucide="palette"></i><span>${escapeHtml(pt("iconFace.pickColor"))}</span>
            </button>
            <label class="mini-icon-face-action mini-icon-face-action--file">
              <input type="file" accept="image/*" hidden data-icon-face-file />
              <i data-lucide="image-plus"></i><span>${escapeHtml(pt("iconFace.customImage"))}</span>
            </label>
            ${hasCustom ? `
            <button type="button" class="mini-icon-face-action mini-icon-face-action--muted" data-icon-face-reset>
              <i data-lucide="rotate-ccw"></i><span>${escapeHtml(pt("iconFace.restoreDefault"))}</span>
            </button>` : ""}
          </div>
        </div>
      `;
      const fileInput = sheet.querySelector("[data-icon-face-file]");
      fileInput?.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        readImageAsIconDataUrl(file)
          .then((dataUrl) => {
            patchOverride({
              imageDataUrl: dataUrl,
              transparent: false,
              color: "",
              tone: "",
            });
            deps.onToast?.("toast.customImageApplied");
            close();
          })
          .catch((error) => {
            deps.onToast?.(String(error?.message || error || pt("toast.iconChangeFail")));
          })
          .finally(() => {
            fileInput.value = "";
          });
      });
    } else {
      const hex = draftHex();
      const ink = contrastInkForHex(hex) === "light" ? "#fff" : "#2a3a3e";
      sheet.innerHTML = `
        <button type="button" class="mini-icon-face-sheet__scrim" data-icon-face-close aria-label="${escapeHtml(pt("iconFace.close"))}"></button>
        <div class="mini-icon-face-sheet__panel" role="dialog" aria-modal="true">
          <header class="mini-icon-face-sheet__head">
            <button type="button" class="mini-icon-button" data-icon-face-goto="face" aria-label="${escapeHtml(pt("iconFace.back"))}"><i data-lucide="chevron-left"></i></button>
            <strong>${escapeHtml(pt("iconFace.pickColor"))}</strong>
            <span class="mini-icon-face-hex" data-icon-face-hex>${draftTransparent ? escapeHtml(pt("iconFace.transparent")) : hex.toUpperCase()}</span>
          </header>
          <div class="mini-icon-face-color">
            <div
              class="mini-app-face is-custom${draftTransparent ? " is-clear" : ""}"
              data-icon-face-color-preview
              data-tone="${draftTransparent ? "clear" : "custom"}"
              style="${draftTransparent ? "" : `--icon-face-color:${hex};color:${ink}`}"
            ><i data-lucide="${escapeHtml(entry.icon || "app-window")}"></i></div>
            <div class="mini-icon-face-wheel-wrap${draftTransparent ? " is-dimmed" : ""}" data-icon-face-wheel-wrap>
              <canvas class="mini-icon-face-wheel" data-icon-face-wheel width="220" height="220" aria-label="${escapeHtml(pt("iconFace.colorWheel"))}"></canvas>
            </div>
            <label class="mini-icon-face-value">
              <span>${escapeHtml(pt("iconFace.brightness"))}</span>
              <input type="range" min="35" max="100" value="${Math.round(draftVal * 100)}" data-icon-face-value ${draftTransparent ? "disabled" : ""} />
            </label>
            <button type="button" class="mini-icon-face-action${draftTransparent ? " is-on" : ""}" data-icon-face-transparent>
              <i data-lucide="droplet"></i><span>${escapeHtml(draftTransparent ? pt("iconFace.transparentSelected") : pt("iconFace.transparent"))}</span>
            </button>
            <button type="button" class="send-button" data-icon-face-apply-color>${escapeHtml(pt("iconFace.done"))}</button>
          </div>
        </div>
      `;
      bindWheel();
      updateColorPreview();
      const valueInput = sheet.querySelector("[data-icon-face-value]");
      valueInput?.addEventListener("input", () => {
        draftVal = Number(valueInput.value) / 100;
        updateColorPreview();
        paintWheel();
      });
    }
    refreshIcons();
  }

  function open(appId) {
    const id = String(appId || "").trim();
    if (!id || isFolderEntry(id) || !baseEntry(id)) return;
    currentAppId = id;
    step = "root";
    syncDraftFromEntry();
    sheet.hidden = false;
    render();
  }

  function close() {
    sheet.hidden = true;
    currentAppId = "";
    step = "root";
    picking = false;
    wheelCanvas = null;
  }

  sheet.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.target.closest("[data-icon-face-close]")) {
      close();
      return;
    }
    const goto = event.target.closest("[data-icon-face-goto]")?.getAttribute("data-icon-face-goto");
    if (goto === "root" || goto === "face" || goto === "color") {
      step = goto;
      if (goto === "color") syncDraftFromEntry();
      render();
      return;
    }
    if (event.target.closest("[data-icon-face-arrange]")) {
      close();
      // Defer: same click must not bubble into home and immediately exit edit mode.
      window.setTimeout(() => deps.onArrange?.(), 0);
      return;
    }
    if (event.target.closest("[data-icon-face-transparent]")) {
      draftTransparent = !draftTransparent;
      render();
      return;
    }
    if (event.target.closest("[data-icon-face-apply-color]")) {
      if (draftTransparent) {
        patchOverride({
          transparent: true,
          color: "",
          imageDataUrl: "",
          tone: "",
        });
        deps.onToast?.("toast.iconTransparent");
      } else {
        patchOverride({
          transparent: false,
          color: draftHex(),
          imageDataUrl: "",
          tone: "",
        });
        deps.onToast?.("toast.iconColorChanged");
      }
      close();
      return;
    }
    if (event.target.closest("[data-icon-face-reset]")) {
      const overrides = { ...(deps.getOverrides?.() || {}) };
      delete overrides[currentAppId];
      deps.setOverrides?.(overrides);
      deps.onToast?.("toast.iconRestored");
      close();
    }
  });

  return { open, close, destroy() { sheet.remove(); } };
}
