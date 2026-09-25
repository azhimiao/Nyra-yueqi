/**
 * Bind proactive wake prefs controls (probability + silence window).
 * Uses [data-proactive-wake="probability|silenceMinMin|silenceMaxMin|checkEveryMin"].
 */

import { t } from "../i18n/index.js";
import {
  getDefaultProactiveWakePrefs,
  loadProactiveWakePrefs,
  saveProactiveWakePrefs,
} from "./config.js";

function formatWakeOut(key, value) {
  if (key === "probability") return `${value}%`;
  return t("mePanels.minutes", { n: value });
}

const FIELDS = ["probability", "silenceMinMin", "silenceMaxMin", "checkEveryMin"];
const boundRoots = new WeakSet();

function readField(root, key) {
  const el = root.querySelector(`[data-proactive-wake="${key}"]`);
  if (!el) return undefined;
  return el.value;
}

function writeField(root, key, value) {
  const el = root.querySelector(`[data-proactive-wake="${key}"]`);
  if (!el) return;
  el.value = String(value);
  const out = el.closest("label")?.querySelector("[data-proactive-wake-out]");
  if (out) out.textContent = formatWakeOut(key, value);
}

export function fillProactiveWakeControls(root = document) {
  if (!root?.querySelector?.("[data-proactive-wake]")) return;
  const prefs = loadProactiveWakePrefs();
  FIELDS.forEach((key) => writeField(root, key, prefs[key]));
}

export function collectProactiveWakeFromControls(root = document) {
  const patch = {};
  FIELDS.forEach((key) => {
    const raw = readField(root, key);
    if (raw != null && raw !== "") patch[key] = Number(raw);
  });
  return patch;
}

export function persistProactiveWakeFromControls(root = document) {
  const next = saveProactiveWakePrefs(collectProactiveWakeFromControls(root));
  fillProactiveWakeControls(root);
  return next;
}

/**
 * Wire input/change on wake controls inside root. Idempotent via WeakSet.
 */
export function bindProactiveWakeControls(root = document, { onChange } = {}) {
  const host = root?.nodeType === 9 ? root.documentElement : root;
  if (!root || !host) return;
  if (boundRoots.has(host)) {
    fillProactiveWakeControls(root);
    return;
  }
  if (!root.querySelector?.("[data-proactive-wake]")) return;

  boundRoots.add(host);
  fillProactiveWakeControls(root);

  const persist = () => {
    const next = persistProactiveWakeFromControls(root);
    onChange?.(next);
  };

  root.addEventListener("input", (event) => {
    const el = event.target?.closest?.("[data-proactive-wake]");
    if (!el) return;
    const key = el.dataset.proactiveWake;
    const out = el.closest("label")?.querySelector("[data-proactive-wake-out]");
    if (out) out.textContent = formatWakeOut(key, el.value);
  });

  root.addEventListener("change", (event) => {
    if (!event.target?.closest?.("[data-proactive-wake]")) return;
    persist();
  });
}

export function resetProactiveWakeControls(root = document, { onChange } = {}) {
  const next = saveProactiveWakePrefs(getDefaultProactiveWakePrefs());
  fillProactiveWakeControls(root);
  onChange?.(next);
  return next;
}
