/**
 * BYOK image generation preferences (F6 / G1).
 * Key stays local; backup export strips apiKey.
 */

import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import {
  DEFAULT_IMAGEGEN_SETTINGS,
  IMAGEGEN_SETTINGS_KEY,
  IMAGEGEN_SIZES,
} from "../imagegen/constants.js";
import { isManagedProductMode, readProductAccess } from "../account/product-access.js";

/**
 * @typedef {object} ImagegenSettings
 * @property {number} schemaVersion
 * @property {string} provider
 * @property {string} apiKey
 * @property {string} baseUrl
 * @property {string} model
 * @property {string} defaultSize
 * @property {boolean} enabled
 */

/**
 * @param {Partial<ImagegenSettings>} [raw]
 * @returns {ImagegenSettings}
 */
export function normalizeImagegenSettings(raw = {}) {
  const size = String(raw.defaultSize || DEFAULT_IMAGEGEN_SETTINGS.defaultSize);
  return {
    schemaVersion: 1,
    provider: String(raw.provider || DEFAULT_IMAGEGEN_SETTINGS.provider),
    apiKey: String(raw.apiKey || ""),
    baseUrl: String(raw.baseUrl || ""),
    model: String(raw.model || DEFAULT_IMAGEGEN_SETTINGS.model).trim() || DEFAULT_IMAGEGEN_SETTINGS.model,
    defaultSize: IMAGEGEN_SIZES.includes(size) ? size : DEFAULT_IMAGEGEN_SETTINGS.defaultSize,
    enabled: raw.enabled !== false,
  };
}

/** @returns {ImagegenSettings} */
export function getImagegenSettings() {
  return normalizeImagegenSettings(readLocalObject(IMAGEGEN_SETTINGS_KEY, {}) || {});
}

/**
 * @param {Partial<ImagegenSettings>} [partial]
 * @returns {ImagegenSettings}
 */
export function saveImagegenSettings(partial = {}) {
  const next = normalizeImagegenSettings({ ...getImagegenSettings(), ...partial });
  writeLocalObject(IMAGEGEN_SETTINGS_KEY, next);
  return next;
}

/**
 * @param {ImagegenSettings} [settings]
 */
export function isImagegenConfigured(settings = getImagegenSettings()) {
  const s = settings && typeof settings === "object" ? settings : getImagegenSettings();
  if (isManagedProductMode()) return Boolean(s.enabled !== false && readProductAccess().loggedIn);
  return Boolean(s.enabled !== false && String(s.apiKey || "").trim());
}

/**
 * @param {ImagegenSettings} [settings]
 */
export function exportImagegenSettingsForBackup(settings = getImagegenSettings()) {
  const { apiKey: _key, ...rest } = normalizeImagegenSettings(settings);
  return rest;
}
