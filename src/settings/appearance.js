import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { getThemeId, THEMES } from "../ui/theme.js";
import { savePhoneOsPrefs, buildC1HomePrefs, reconcileWidgetAppPlacement, DEFAULT_WIDGETS, DEFAULT_WIDGET_ORDER } from "../phone-shell/os-prefs.js";
import { isCustomWidgetId } from "../phone-shell/widget-pack.js";
import { WIDGET_APP_LINKS } from "../phone-shell/home-layout.js";
import { isNativeKvReady, removeNativeKvRaw } from "../platform/kv-store.js";
import { Preferences } from "@capacitor/preferences";

const PHONE_PREFS_KEY = "yueqi.phone.os.v1";

export const APPEARANCE_CHANGED_EVENT = "yueqi:appearance-changed";
export const DEFAULT_APPEARANCE = Object.freeze({
  customized: false, fontSize: 14, bubbleRadius: 12, density: "comfortable",
  cardStyle: "system", cardRadius: 20, customColors: false,
  userColor: "#edf1f4", assistantColor: "#ffffff",
});
const clamp = (value, min, max, fallback) => value !== null && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value))
  ? Math.min(max, Math.max(min, Number(value))) : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;

export function normalizeAppearance(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  return {
    customized: raw.customized === true,
    fontSize: clamp(raw.fontSize, 14, 20, 14),
    bubbleRadius: clamp(raw.bubbleRadius, 4, 28, 12),
    density: raw.density === "compact" ? "compact" : "comfortable",
    cardStyle: ["system", "soft", "outline", "glass"].includes(raw.cardStyle) ? raw.cardStyle : "system",
    cardRadius: clamp(raw.cardRadius, 8, 28, 20),
    customColors: raw.customColors === true,
    userColor: color(raw.userColor, DEFAULT_APPEARANCE.userColor),
    assistantColor: color(raw.assistantColor, DEFAULT_APPEARANCE.assistantColor),
  };
}

export function getAppearanceSettings() {
  return normalizeAppearance(readLocalObject(LOCAL_KEYS.settingsKey, {})?.appearance);
}

function readPhonePrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PHONE_PREFS_KEY) || "null");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}

/** Opening or adjusting a preview must never migrate or persist phone prefs. */
export function getPhoneAppearanceSettings() {
  const raw = readPhonePrefs();
  const widgets = { ...DEFAULT_WIDGETS };
  for (const id of DEFAULT_WIDGET_ORDER) if (typeof raw.widgets?.[id] === "boolean") widgets[id] = raw.widgets[id];
  const customWidgets = (Array.isArray(raw.customWidgets) ? raw.customWidgets : [])
    .filter((item) => item && isCustomWidgetId(item.id))
    .map((item) => ({ id: item.id, title: String(item.title || "组件").slice(0, 24) }));
  for (const item of customWidgets) {
    widgets[item.id] = typeof raw.widgets?.[item.id] === "boolean" ? raw.widgets[item.id] : true;
  }
  const allowed = new Set([...DEFAULT_WIDGET_ORDER, ...customWidgets.map((item) => item.id)]);
  const widgetOrder = [];
  const seen = new Set();
  const source = [
    ...(Array.isArray(raw.widgetOrder) ? raw.widgetOrder : []),
    ...DEFAULT_WIDGET_ORDER,
    ...customWidgets.map((item) => item.id),
  ];
  for (const id of source) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    widgetOrder.push(id);
  }
  return { widgets, widgetOrder, customWidgets };
}

export function colorInk(hex) {
  const measure = (value) => value.slice(1).match(/.{2}/g).map((n) => parseInt(n, 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const luminance = measure(color(hex, "#ffffff"));
  const navyLuminance = measure("#102131");
  if ((luminance + 0.05) / (navyLuminance + 0.05) >= 4.5) return "#102131";
  if (1.05 / (luminance + 0.05) >= 4.5) return "#ffffff";
  return "#000000";
}

export function applyAppearance(settings = getAppearanceSettings()) {
  if (typeof document === "undefined") return settings;
  const value = normalizeAppearance(settings);
  const root = document.documentElement;
  root.dataset.appearanceCustomized = String(value.customized);
  root.dataset.appearanceCards = value.customized ? value.cardStyle : "system";
  root.dataset.appearanceColors = String(value.customized && value.customColors);
  const vars = {
    "--author-chat-size": `${value.fontSize}px`, "--author-bubble-radius": `${value.bubbleRadius}px`,
    "--author-chat-gap": value.density === "compact" ? "7px" : "12px",
    "--author-bubble-padding": value.density === "compact" ? "8px 11px" : "11px 14px",
    "--author-card-radius": `${value.cardRadius}px`,
    "--author-user-color": value.userColor, "--author-ai-color": value.assistantColor,
    "--author-user-ink": colorInk(value.userColor), "--author-ai-ink": colorInk(value.assistantColor),
  };
  Object.entries(vars).forEach(([key, val]) => root.style.setProperty(key, val));
  return value;
}

export async function saveAppearanceSettings({ appearance, themeId, widgets, widgetOrder } = {}) {
  const native = isNativeKvReady();
  const previous = native ? (await Preferences.get({ key: LOCAL_KEYS.settingsKey })).value : localStorage.getItem(LOCAL_KEYS.settingsKey);
  const previousPhone = localStorage.getItem(PHONE_PREFS_KEY);
  const current = readLocalObject(LOCAL_KEYS.settingsKey, {}) || {};
  const theme = THEMES.some((item) => item.id === themeId) ? themeId : getThemeId();
  const value = normalizeAppearance(appearance);
  // Read the latest phone preferences so a style edit cannot revert wallpaper,
  // passcode or app placement changes made since the editor was opened.
  const rawPhone = readPhonePrefs();
  const phone = rawPhone.layoutVersion ? rawPhone : { ...rawPhone, ...buildC1HomePrefs(rawPhone) };
  const nextWidgets = { ...phone.widgets, ...widgets };
  const placement = reconcileWidgetAppPlacement({ ...phone, widgets: nextWidgets });
  const hasApp = (appId) => placement.iconOrder.includes(appId) || placement.dockOrder.includes(appId)
    || Object.values(placement.folders).some((folder) => folder.apps.includes(appId));
  const unavailableWidgets = Object.entries(WIDGET_APP_LINKS)
    .filter(([widget, appId]) => widgets?.[widget] === false && phone.widgets?.[widget] !== false && !hasApp(appId))
    .map(([widget]) => widget);
  if (unavailableWidgets.length) {
    const error = new Error("widget_placement_full");
    error.code = "widget_placement_full";
    error.widgetIds = unavailableWidgets;
    throw error;
  }
  const next = { ...current, appearance: { ...current.appearance, ...value }, theme: { ...current.theme, id: theme } };
  let phoneWritten = false;
  try {
    if (widgets || widgetOrder) {
      savePhoneOsPrefs({ ...phone, widgets: nextWidgets, widgetOrder: widgetOrder || phone.widgetOrder });
      phoneWritten = true;
    }
    // Native writes must be acknowledged before the editor reports success.
    // writeLocalObject then synchronizes the existing native cache as well.
    if (native) await Preferences.set({ key: LOCAL_KEYS.settingsKey, value: JSON.stringify(next) });
    writeLocalObject(LOCAL_KEYS.settingsKey, next);
  } catch (error) {
    if (phoneWritten) {
      if (previousPhone === null) localStorage.removeItem(PHONE_PREFS_KEY);
      else localStorage.setItem(PHONE_PREFS_KEY, previousPhone);
    }
    if (native) {
      if (previous == null) {
        await Preferences.remove({ key: LOCAL_KEYS.settingsKey });
        removeNativeKvRaw(LOCAL_KEYS.settingsKey);
      } else {
        await Preferences.set({ key: LOCAL_KEYS.settingsKey, value: previous });
        writeLocalObject(LOCAL_KEYS.settingsKey, JSON.parse(previous));
      }
    }
    throw error;
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
    if (document.body) document.body.dataset.theme = theme;
  }
  applyAppearance(value);
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGED_EVENT, { detail: { appearance: value, themeId: theme } }));
  return value;
}

export function defaultWidgetSettings() {
  return { widgets: { ...DEFAULT_WIDGETS }, widgetOrder: [...DEFAULT_WIDGET_ORDER] };
}
