/**
 * User home widgets.
 * A pack is JSON or an HTML template: title, span, HTML, and CSS.
 * Script, event handlers, and foreign embeds are discarded. Nothing is eval'd.
 */

export const MAX_CUSTOM_WIDGETS = 8;
export const MAX_WIDGET_FILE_BYTES = 128 * 1024;
const MAX_HTML = 12000;
const MAX_CSS = 8000;

const ALLOWED_TAGS = new Set([
  "div", "span", "p", "strong", "em", "b", "i", "small", "br", "hr",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "header", "section", "article",
  "time", "img", "figure", "figcaption", "blockquote", "code", "pre", "sup", "sub", "mark", "a",
]);
const VOID_TAGS = new Set(["br", "hr", "img"]);

export class WidgetPackError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function isCustomWidgetId(id) {
  return /^custom:[a-z0-9-]{1,40}$/.test(String(id || ""));
}

export function createCustomWidgetId(existing = []) {
  const used = new Set((existing || []).map((item) => item?.id || item));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = `custom:${Math.random().toString(36).slice(2, 10)}`;
    if (!used.has(id)) return id;
  }
  return `custom:${Date.now().toString(36)}`;
}

function plainTitle(value) {
  const text = String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  return text || "组件";
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function safeUrl(value, tag) {
  const compact = String(value || "").trim().replace(/[\u0000-\u001f\s]+/g, "");
  if (!compact || /^javascript:/i.test(compact) || /^vbscript:/i.test(compact)) return "";
  if (tag === "img") {
    if (/^https?:\/\//i.test(compact)) return compact;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(compact)) return compact;
    return "";
  }
  if (tag === "a" && /^https?:\/\//i.test(compact)) return compact;
  return "";
}

function sanitizeAttrs(tag, raw) {
  const attrs = [];
  const re = /([:@a-zA-Z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = re.exec(String(raw || "")))) {
    const name = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";
    if (name.startsWith("on") || name === "style" || name === "srcset" || name === "srcdoc") continue;
    if (name === "href" || name === "src") {
      const url = safeUrl(value, tag);
      if (!url) continue;
      attrs.push(`${name}="${escapeAttr(url)}"`);
      continue;
    }
    if (name === "alt" && tag === "img") {
      attrs.push(`alt="${escapeAttr(value).slice(0, 80)}"`);
      continue;
    }
    if (name === "datetime" && tag === "time") {
      attrs.push(`datetime="${escapeAttr(value).slice(0, 40)}"`);
      continue;
    }
    if (name === "class") {
      const cls = String(value).split(/\s+/).filter((token) => /^[a-zA-Z_][\w-]{0,40}$/.test(token)).slice(0, 8).join(" ");
      if (cls) attrs.push(`class="${cls}"`);
      continue;
    }
    if (name === "role" && /^[a-z]{1,20}$/.test(value)) {
      attrs.push(`role="${value}"`);
      continue;
    }
    if (name === "title" || name === "aria-label") {
      attrs.push(`${name}="${escapeAttr(value).slice(0, 80)}"`);
    }
  }
  return attrs.length ? ` ${attrs.join(" ")}` : "";
}

export function sanitizeWidgetHtml(input) {
  let html = String(input || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(?:script|iframe|object|embed|link|meta|base|form|input|button|textarea|svg|math|frame|frameset)\b[^>]*>/gi, "");
  html = html.replace(/<\/?([a-zA-Z][\w:-]*)(\s[^<>]*)?\s*\/?>/g, (full, tag, attrText = "") => {
    const name = String(tag || "").toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";
    if (full.startsWith("</")) return VOID_TAGS.has(name) ? "" : `</${name}>`;
    const attrs = sanitizeAttrs(name, attrText);
    if (name === "img" && !/\ssrc=/.test(attrs)) return "";
    return `<${name}${attrs}>`;
  });
  return html.slice(0, MAX_HTML);
}

export function sanitizeWidgetCss(css) {
  let next = String(css || "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/@charset\b[^;]*;?/gi, "")
    .replace(/@namespace\b[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "blocked(")
    .replace(/javascript\s*:/gi, "")
    .replace(/-moz-binding\s*:[^;}]*/gi, "")
    .replace(/behavior\s*:[^;}]*/gi, "");
  next = next.replace(/url\s*\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi, (_full, _quote, inner) => {
    const value = String(inner || "").trim().replace(/[\u0000-\u001f\s]+/g, "");
    if (/^https?:\/\//i.test(value)) return `url("${value.replace(/"/g, "")}")`;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return `url("${value.replace(/"/g, "")}")`;
    return "none";
  });
  return next.slice(0, MAX_CSS);
}

function sealWidget(raw) {
  const html = sanitizeWidgetHtml(raw?.html || raw?.markup || "");
  if (!html.trim()) return null;
  return {
    title: plainTitle(raw?.title || raw?.name),
    span: raw?.span === "half" ? "half" : "wide",
    html,
    css: sanitizeWidgetCss(raw?.css || raw?.style || ""),
  };
}

function attrValue(source, name) {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(String(source || ""));
  return match ? (match[2] ?? match[3] ?? match[4] ?? "") : "";
}

function splitStyle(source) {
  let css = "";
  const html = String(source || "").replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full, body) => {
    css += body;
    return "";
  });
  return { html, css };
}

function parseWidgetJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new WidgetPackError("bad_format");
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.widgets) ? data.widgets : [data];
  if (!list.length || list.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new WidgetPackError("bad_format");
  }
  return list;
}

function parseWidgetHtml(text) {
  const widgets = [];
  const template = /<template\b([^>]*)>([\s\S]*?)<\/template>/gi;
  let match;
  while ((match = template.exec(text))) {
    const attrs = match[1] || "";
    const parts = splitStyle(match[2] || "");
    widgets.push({
      title: attrValue(attrs, "data-title") || attrValue(attrs, "title"),
      span: attrValue(attrs, "data-span") || attrValue(attrs, "span"),
      html: parts.html,
      css: parts.css,
    });
  }
  if (widgets.length) return widgets;
  if (!/<\s*[a-z]/i.test(text)) throw new WidgetPackError("bad_format");
  const parts = splitStyle(text);
  return [{ title: "", span: "wide", html: parts.html, css: parts.css }];
}

/** @returns {Array<{ title: string, span: "wide"|"half", html: string, css: string }>} */
export function parseWidgetPack(text) {
  const source = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!source) throw new WidgetPackError("empty");
  if (source.length > MAX_WIDGET_FILE_BYTES) throw new WidgetPackError("too_big");
  const rawList = source.startsWith("{") || source.startsWith("[")
    ? parseWidgetJson(source)
    : parseWidgetHtml(source);
  const widgets = [];
  for (const raw of rawList) {
    const sealed = sealWidget(raw);
    if (!sealed) continue;
    widgets.push(sealed);
    if (widgets.length >= MAX_CUSTOM_WIDGETS) break;
  }
  if (!widgets.length) throw new WidgetPackError("no_html");
  return widgets;
}

export function normalizeCustomWidgets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = String(item.id || "");
    if (!isCustomWidgetId(id) || seen.has(id)) continue;
    const sealed = sealWidget(item);
    if (!sealed) continue;
    seen.add(id);
    out.push({ id, ...sealed });
    if (out.length >= MAX_CUSTOM_WIDGETS) break;
  }
  return out;
}
