/**
 * Phone shell i18n — resolve labels via existing t() packs (phone.* keys).
 * Do not invent a second locale store.
 */

import { t, getLocale, applyI18n } from "../i18n/index.js";

/** @param {string} key path under phone.* or full key if already dotted with phone. */
export function pt(key, vars) {
  const full = String(key || "").startsWith("phone.") ? key : `phone.${key}`;
  return t(full, vars);
}

export function phoneAppLabel(app) {
  if (!app) return "";
  if (app.labelKey) return t(app.labelKey);
  // Legacy hard label — still return for third-party / dynamic apps
  return String(app.label || app.id || "");
}

export function phoneAppJob(app) {
  if (!app) return "";
  if (app.jobKey) return t(app.jobKey);
  return String(app.job || "");
}

function applyPhoneAttr(node, attrSpec) {
  String(attrSpec || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [attr, key] = pair.split(":");
      if (!attr || !key) return;
      node.setAttribute(attr, pt(key));
    });
}

/** Re-apply data-i18n inside phone root after mount / locale change. */
export function applyPhoneI18n(root) {
  if (!root) return;
  applyI18n(root);
  root.querySelectorAll("[data-phone-i18n]").forEach((node) => {
    const key = node.getAttribute("data-phone-i18n");
    if (!key) return;
    const value = pt(key);
    if (node.dataset.i18nHtml === "true") node.innerHTML = value;
    else node.textContent = value;
  });
  root.querySelectorAll("[data-phone-i18n-placeholder]").forEach((node) => {
    const key = node.getAttribute("data-phone-i18n-placeholder");
    if (key) node.setAttribute("placeholder", pt(key));
  });
  root.querySelectorAll("[data-phone-i18n-aria]").forEach((node) => {
    const key = node.getAttribute("data-phone-i18n-aria");
    if (key) node.setAttribute("aria-label", pt(key));
  });
  root.querySelectorAll("[data-phone-i18n-attr]").forEach((node) => {
    applyPhoneAttr(node, node.getAttribute("data-phone-i18n-attr"));
  });
}

export { getLocale, t };
