import assert from "node:assert/strict";
import { LOCAL_KEYS } from "../constants.js";
import {
  DEFAULT_APPEARANCE, normalizeAppearance, getAppearanceSettings,
  getPhoneAppearanceSettings, saveAppearanceSettings, defaultWidgetSettings, colorInk,
} from "./appearance.js";
import { buildC1HomePrefs } from "../phone-shell/os-prefs.js";
import { WIDGET_APP_LINKS } from "../phone-shell/home-layout.js";
import { MAX_ICON_PAGES, iconSlotsForPages } from "../phone-shell/apps-catalog.js";

const values = new Map();
const writes = [];
let failKey = "";
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem(key, value) {
    if (key === failKey) { failKey = ""; throw new Error("quota_exceeded"); }
    values.set(key, String(value)); writes.push(key);
  },
  removeItem: (key) => values.delete(key),
};
globalThis.window = { localStorage };
const phoneKey = "yueqi.phone.os.v1";

for (const raw of [undefined, null, [], "broken"]) assert.deepEqual(normalizeAppearance(raw), DEFAULT_APPEARANCE);
assert.equal(normalizeAppearance({ fontSize: 90 }).fontSize, 20);
assert.equal(normalizeAppearance({ fontSize: "", bubbleRadius: null, cardRadius: false }).bubbleRadius, 12);
assert.equal(normalizeAppearance({ cardRadius: false }).cardRadius, 20);
assert.equal(normalizeAppearance({ userColor: "url(javascript:bad)" }).userColor, DEFAULT_APPEARANCE.userColor);
assert.equal(colorInk("broken"), "#102131");
assert.equal(colorInk("#000000"), "#ffffff");
assert.equal(colorInk("#ffffff"), "#102131");
const luminance = (hex) => hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
  .map((part) => part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4)
  .reduce((total, part, index) => total + part * [0.2126, 0.7152, 0.0722][index], 0);
for (let gray = 0; gray <= 255; gray += 1) {
  const background = `#${gray.toString(16).padStart(2, "0").repeat(3)}`;
  const values = [luminance(background), luminance(colorInk(background))].sort((a, b) => a - b);
  assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, `custom bubble contrast must remain legible at ${background}`);
}
values.set(LOCAL_KEYS.settingsKey, JSON.stringify({ appearance: null }));
assert.deepEqual(getAppearanceSettings(), DEFAULT_APPEARANCE);

values.delete(phoneKey);
const preview = getPhoneAppearanceSettings();
assert.deepEqual(preview.widgetOrder, defaultWidgetSettings().widgetOrder);
assert.equal(values.has(phoneKey), false, "opening a preview must not persist or migrate defaults");
assert.equal(writes.length, 0);

const original = { locale: "en", permissions: { microphone: false }, theme: { id: "mist", future: "keep" }, appearance: { future: { keep: true } } };
values.set(LOCAL_KEYS.settingsKey, JSON.stringify(original));
const phone = { ...buildC1HomePrefs(), wallpaper: { homeScreen: "ink", lockScreen: "sand" }, passcode: "7654", passcodeEnabled: true, futureSetting: { preserved: true } };
values.set(phoneKey, JSON.stringify(phone));
await saveAppearanceSettings({ appearance: { customized: true, fontSize: 19 }, themeId: "pine", widgets: { today: false, listen: false, calendar: false } });
const saved = JSON.parse(values.get(LOCAL_KEYS.settingsKey));
assert.equal(saved.locale, "en");
assert.deepEqual(saved.permissions, original.permissions);
assert.equal(saved.theme.future, "keep", "theme edits keep unrelated future settings");
assert.deepEqual(saved.appearance.future, { keep: true });
const savedPhone = JSON.parse(values.get(phoneKey));
assert.deepEqual(savedPhone.wallpaper, phone.wallpaper);
assert.equal(savedPhone.passcode, "7654");
assert.equal(savedPhone.passcodeEnabled, true);
assert.deepEqual(savedPhone.futureSetting, phone.futureSetting);
for (const appId of Object.values(WIDGET_APP_LINKS)) {
  assert.ok(savedPhone.iconOrder.includes(appId) || savedPhone.dockOrder.includes(appId) || Object.values(savedPhone.folders).some((folder) => folder.apps.includes(appId)), `hiding the widget keeps ${appId} reachable`);
}

const settingsBeforeFailure = values.get(LOCAL_KEYS.settingsKey);
const phoneBeforeFailure = values.get(phoneKey);
failKey = LOCAL_KEYS.settingsKey;
await assert.rejects(() => saveAppearanceSettings({ appearance: { fontSize: 20 }, themeId: "ink", widgets: { today: true } }), /quota_exceeded/);
assert.equal(values.get(LOCAL_KEYS.settingsKey), settingsBeforeFailure);
assert.equal(values.get(phoneKey), phoneBeforeFailure, "settings-write failure rolls back the already-written phone prefs");
failKey = phoneKey;
await assert.rejects(() => saveAppearanceSettings({ appearance: { fontSize: 20 }, widgets: { today: true } }), /quota_exceeded/);
assert.equal(values.get(LOCAL_KEYS.settingsKey), settingsBeforeFailure);
assert.equal(values.get(phoneKey), phoneBeforeFailure);

await saveAppearanceSettings({ appearance: DEFAULT_APPEARANCE, themeId: "yueqi", ...defaultWidgetSettings() });
assert.deepEqual(getAppearanceSettings(), DEFAULT_APPEARANCE);
assert.equal(JSON.parse(values.get(LOCAL_KEYS.settingsKey)).theme.id, "yueqi");
assert.equal(JSON.parse(values.get(phoneKey)).passcode, "7654", "restore appearance defaults does not reset passcode");
assert.deepEqual(JSON.parse(values.get(phoneKey)).wallpaper, phone.wallpaper);
const fullPhone = {
  ...buildC1HomePrefs(),
  iconPageCount: MAX_ICON_PAGES,
  iconOrder: Array.from({ length: iconSlotsForPages(MAX_ICON_PAGES) }, (_, index) => `ext:full-${index}`),
  dockOrder: ["moments", "qishi", "shop", "settings"],
};
values.set(phoneKey, JSON.stringify(fullPhone));
const beforeFull = values.get(phoneKey);
const beforeFullSettings = values.get(LOCAL_KEYS.settingsKey);
await assert.rejects(() => saveAppearanceSettings({ appearance: { customized: true }, widgets: { today: false } }),
  (error) => error.code === "widget_placement_full" && error.widgetIds.includes("today"));
assert.equal(values.get(phoneKey), beforeFull, "a full desktop is rejected before persistence");
assert.equal(values.get(LOCAL_KEYS.settingsKey), beforeFullSettings);
console.log("PASS appearance normalization, pure preview, preserving unrelated prefs, hidden-widget app access, defaults and rollback");
