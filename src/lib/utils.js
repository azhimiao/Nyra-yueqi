export function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** Escape text for safe interpolation into HTML / attributes. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Escape then keep intentional line breaks as <br>. */
export function escapeHtmlWithBreaks(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

export function tokenize(text) {
  return Array.from(
    new Set(String(text).toLowerCase().match(/[\p{Script=Han}]|[a-z0-9_]+/gu) || [])
  );
}

import { readNativeKvRaw, writeNativeKvRaw, isNativeKvReady } from "../platform/kv-store.js";

export function readLocalObject(key, fallback = null) {
  if (isNativeKvReady()) {
    const raw = readNativeKvRaw(key);
    if (raw != null) {
      try {
        return JSON.parse(raw) || fallback;
      } catch {
        return fallback;
      }
    }
  }
  try {
    const storage = globalThis.localStorage || globalThis.window?.localStorage;
    if (!storage?.getItem) return fallback;
    return JSON.parse(storage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalObject(key, value) {
  const serialized = JSON.stringify(value);
  if (isNativeKvReady()) {
    writeNativeKvRaw(key, serialized);
    return;
  }
  const storage = globalThis.localStorage || globalThis.window?.localStorage;
  storage?.setItem?.(key, serialized);
}

export function getSelectedText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || select?.value || "";
}

export function setSelectByText(select, text) {
  if (!select) return;
  const option = Array.from(select.options).find(
    (item) => item.textContent.trim() === text || item.value === text
  );
  if (option) select.value = option.value;
}

export function compareVersions(a = "0.0.0", b = "0.0.0") {
  const left = String(a).split(".").map((part) => Number(part) || 0);
  const right = String(b).split(".").map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function formatLocalTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function shortFileTitle(name = "") {
  return name.replace(/\.[a-z0-9]+$/i, "").trim() || "未命名";
}

export function estimateTextTokens(text = "") {
  return Math.ceil(String(text).length / 2);
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) {
    const error = new Error(
      payload.message || payload.error || `${response.status} ${response.statusText}`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function safeFetch(url, options = {}) {
  return fetch(url, options).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  });
}

export function modelServiceUrl(path) {
  const runtimeBase = typeof window !== "undefined"
    ? String(window.localStorage?.getItem("yueqi.serviceBase") || "").trim()
    : "";
  const buildBase = String(import.meta.env?.VITE_YUEQI_SERVICE_BASE || "").trim();
  const base = (runtimeBase || buildBase || "http://127.0.0.1:8787").replace(/\/+$/, "");
  const suffix = String(path || "").startsWith("/") ? String(path) : `/${path || ""}`;
  return `${base}${suffix}`;
}
