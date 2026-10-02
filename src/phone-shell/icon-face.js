/**
 * Per-app icon face overrides: custom color / transparent / image.
 */

export const ICON_TONES = Object.freeze([
  { id: "sea", label: "海沫" },
  { id: "sky", label: "晴空" },
  { id: "blush", label: "桃雾" },
  { id: "rose", label: "蔷薇" },
  { id: "lilac", label: "丁香" },
  { id: "amber", label: "琥珀" },
  { id: "lemon", label: "柠檬" },
  { id: "yellow", label: "暖阳" },
  { id: "moss", label: "苔绿" },
  { id: "sage", label: "鼠尾" },
  { id: "mint", label: "薄荷" },
  { id: "foam", label: "青泡" },
  { id: "dusk", label: "暮紫" },
  { id: "ember", label: "余烬" },
  { id: "peach", label: "蜜桃" },
  { id: "coral", label: "珊瑚" },
  { id: "blue", label: "雾蓝" },
  { id: "slate", label: "青石" },
  { id: "ink", label: "墨色" },
  { id: "white", label: "霜白" },
]);

export const ICON_TONE_IDS = new Set(ICON_TONES.map((t) => t.id));

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function normalizeHexColor(value) {
  const text = String(value || "").trim();
  if (!HEX_RE.test(text)) return "";
  return text.toLowerCase();
}

/**
 * @param {string} hex
 * @returns {"light"|"dark"}
 */
export function contrastInkForHex(hex) {
  const raw = normalizeHexColor(hex).slice(1);
  if (!raw) return "dark";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const luma = (r * 0.299) + (g * 0.587) + (b * 0.114);
  return luma > 160 ? "dark" : "light";
}

/**
 * @param {unknown} raw
 * @returns {Record<string, { tone?: string, color?: string, imageDataUrl?: string, transparent?: boolean }>}
 */
export function normalizeIconOverrides(raw) {
  if (!raw || typeof raw !== "object") return {};
  const next = {};
  for (const [appId, value] of Object.entries(raw)) {
    const id = String(appId || "").trim();
    if (!id || !value || typeof value !== "object") continue;
    const patch = {};
    const tone = String(value.tone || "").trim();
    if (ICON_TONE_IDS.has(tone)) patch.tone = tone;
    const color = normalizeHexColor(value.color);
    if (color) patch.color = color;
    const image = String(value.imageDataUrl || "").trim();
    if (image.startsWith("data:image/")) patch.imageDataUrl = image;
    if (value.transparent === true) patch.transparent = true;
    if (Object.keys(patch).length) next[id] = patch;
  }
  return next;
}

/**
 * @param {object|null} entry
 * @param {Record<string, object>} overrides
 */
export function applyIconFace(entry, overrides = {}) {
  if (!entry || entry.type === "empty" || entry.type === "folder") return entry;
  const o = overrides?.[entry.id];
  if (!o) return entry;
  const transparent = Boolean(o.transparent);
  const color = transparent ? "" : normalizeHexColor(o.color);
  return {
    ...entry,
    tone: transparent ? "clear" : (color ? "custom" : (o.tone || entry.tone)),
    faceColor: color,
    faceImage: o.imageDataUrl || "",
    faceTransparent: transparent,
  };
}

/**
 * @param {{
 *   tone?: string,
 *   icon?: string,
 *   iconDataUrl?: string,
 *   faceColor?: string,
 *   faceImage?: string,
 *   faceTransparent?: boolean,
 * }} entry
 * @param {(s: string) => string} escapeHtml
 */
export function appFaceInnerHtml(entry, escapeHtml) {
  const transparent = Boolean(entry?.faceTransparent);
  const color = normalizeHexColor(entry?.faceColor);
  const tone = transparent
    ? "clear"
    : (color ? "custom" : (ICON_TONE_IDS.has(entry?.tone) ? entry.tone : "mint"));
  const ink = color && contrastInkForHex(color) === "light" ? "#fff" : "#2a3a3e";
  const style = color && !transparent
    ? ` style="--icon-face-color:${escapeHtml(color)};color:${ink}"`
    : "";
  const faceClass = [
    "mini-app-face",
    entry?.faceImage ? "is-image" : "",
    transparent ? "is-clear" : "",
    color && !transparent ? "is-custom" : "",
  ].filter(Boolean).join(" ");

  if (entry?.faceImage) {
    return `<span data-tone="${escapeHtml(tone)}" class="${faceClass}"><img src="${escapeHtml(entry.faceImage)}" alt="" /></span>`;
  }
  if (entry?.iconDataUrl && !transparent && !color) {
    return `<span data-tone="${escapeHtml(tone)}" class="mini-app-face is-image"><img src="${escapeHtml(entry.iconDataUrl)}" alt="" /></span>`;
  }
  return `<span data-tone="${escapeHtml(tone)}" class="${faceClass}"${style}><i data-lucide="${escapeHtml(entry?.icon || "app-window")}"></i></span>`;
}

/**
 * @param {File|Blob} file
 * @param {{ size?: number }} [options]
 * @returns {Promise<string>}
 */
export function readImageAsIconDataUrl(file, options = {}) {
  const size = Number(options.size) > 0 ? Number(options.size) : 128;
  if (!file || !String(file.type || "").startsWith("image/")) {
    return Promise.reject(new Error("请选择图片文件"));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("无法处理图片");
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = () => reject(new Error("图片无法解码"));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

/** @param {number} h 0-360 @param {number} s 0-1 @param {number} v 0-1 */
export function hsvToHex(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** @param {string} hex */
export function hexToHsv(hex) {
  const raw = normalizeHexColor(hex).slice(1);
  if (!raw) return { h: 180, s: 0.45, v: 0.75 };
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
