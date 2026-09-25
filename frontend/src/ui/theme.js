import { LOCAL_KEYS } from "../constants.js";
import { t } from "../i18n/index.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";

function themeEntry(id, labelKey, hintKey) {
  return {
    id,
    labelKey,
    hintKey,
    get label() { return t(labelKey); },
    get hint() { return t(hintKey); },
  };
}

export const THEMES = [
  themeEntry("yueqi", "mePanels.theme.yueqi", "mePanels.theme.yueqiHint"),
  themeEntry("mist", "mePanels.theme.mist", "mePanels.theme.mistHint"),
  themeEntry("pine", "mePanels.theme.pine", "mePanels.theme.pineHint"),
  themeEntry("ink", "mePanels.theme.ink", "mePanels.theme.inkHint"),
];

const DEFAULT_THEME = "yueqi";

export function getThemeLabel(themeOrId) {
  const id = typeof themeOrId === "string" ? themeOrId : themeOrId?.id;
  const theme = THEMES.find((item) => item.id === id) || THEMES[0];
  return theme.label;
}

export function getThemeHint(themeOrId) {
  const id = typeof themeOrId === "string" ? themeOrId : themeOrId?.id;
  const theme = THEMES.find((item) => item.id === id) || THEMES[0];
  return theme.hint;
}

export function getThemeId() {
  const stored = readLocalObject(LOCAL_KEYS.settingsKey, {}).theme;
  const id = stored?.id || DEFAULT_THEME;
  return THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME;
}

export function saveThemeId(id) {
  const next = THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME;
  const settings = readLocalObject(LOCAL_KEYS.settingsKey, {});
  settings.theme = { id: next };
  writeLocalObject(LOCAL_KEYS.settingsKey, settings);
  return next;
}

export function applyTheme(id = getThemeId()) {
  const resolved = saveThemeId(id) || getThemeId();
  document.documentElement.dataset.theme = resolved;
  document.body.dataset.theme = resolved;
  return resolved;
}

function paintThemeLabels(root = document) {
  root.querySelectorAll("[data-theme-option]").forEach((button) => {
    const id = button.dataset.themeOption;
    const strong = button.querySelector("strong");
    const small = button.querySelector("small");
    if (strong) strong.textContent = getThemeLabel(id);
    if (small) small.textContent = getThemeHint(id);
  });
}

export function wireThemeControls(root = document) {
  applyTheme();
  paintThemeLabels(root);
  root.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.themeOption === getThemeId());
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeOption);
      root.querySelectorAll("[data-theme-option]").forEach((node) => {
        node.classList.toggle("is-active", node.dataset.themeOption === getThemeId());
      });
    });
  });
  window.addEventListener("yueqi:locale-changed", () => paintThemeLabels(root));
}
