/**
 * Reply presets localStorage (F5 / F3).
 */

import {
  BUILTIN_PRESETS,
  PRESETS_STORE_KEY,
  createBuiltinBag,
  normalizePreset,
  validatePreset,
} from "./schema.js";

export { PRESETS_STORE_KEY };

function nowIso() {
  return new Date().toISOString();
}

function readRaw() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return JSON.parse(window.localStorage.getItem(PRESETS_STORE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeBag(bag) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(PRESETS_STORE_KEY, JSON.stringify(bag));
  } catch {
    /* ignore */
  }
}

function mergeBuiltins(presets) {
  const byId = new Map((presets || []).map((p) => [p.id, normalizePreset(p)]));
  for (const builtin of BUILTIN_PRESETS) {
    const existing = byId.get(builtin.id);
    if (!existing) {
      byId.set(builtin.id, normalizePreset({ ...builtin }));
    } else {
      byId.set(
        builtin.id,
        normalizePreset({
          ...builtin,
          ...existing,
          builtin: true,
          id: builtin.id,
        }),
      );
    }
  }
  return [...byId.values()];
}

export function loadPresetsBag() {
  const raw = readRaw();
  if (!raw || typeof raw !== "object") {
    const bag = createBuiltinBag();
    writeBag(bag);
    return bag;
  }
  const presets = mergeBuiltins(Array.isArray(raw.presets) ? raw.presets : []);
  let activePresetId = String(raw.activePresetId || "preset-daily");
  if (!presets.some((p) => p.id === activePresetId)) {
    activePresetId = "preset-daily";
  }
  const bag = { activePresetId, presets };
  writeBag(bag);
  return bag;
}

export function listPresets() {
  return loadPresetsBag().presets.map((p) => ({ ...p, toneHints: [...(p.toneHints || [])] }));
}

export function getActivePreset() {
  const bag = loadPresetsBag();
  return bag.presets.find((p) => p.id === bag.activePresetId) || bag.presets[0] || null;
}

export function getActivePresetId() {
  return loadPresetsBag().activePresetId;
}

export function setActivePresetId(id) {
  const bag = loadPresetsBag();
  if (!bag.presets.some((p) => p.id === id)) return bag.activePresetId;
  bag.activePresetId = id;
  writeBag(bag);
  return id;
}

export function upsertPreset(partial = {}) {
  const bag = loadPresetsBag();
  const normalized = normalizePreset({
    ...partial,
    updatedAt: nowIso(),
    builtin: Boolean(partial.builtin),
  });
  const v = validatePreset(normalized);
  if (!v.ok) throw new Error(v.errors.join("；") || "预设无效");
  const idx = bag.presets.findIndex((p) => p.id === normalized.id);
  if (idx >= 0) {
    const prev = bag.presets[idx];
    bag.presets[idx] = normalizePreset({
      ...prev,
      ...normalized,
      builtin: prev.builtin,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: nowIso(),
    });
  } else {
    bag.presets.push(normalized);
  }
  writeBag(bag);
  return bag.presets.find((p) => p.id === normalized.id);
}

export function duplicatePreset(id) {
  const bag = loadPresetsBag();
  const source = bag.presets.find((p) => p.id === id);
  if (!source) return null;
  const copy = normalizePreset({
    ...source,
    id: `preset-${Date.now().toString(36)}`,
    name: `${source.name} 副本`,
    builtin: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  bag.presets.push(copy);
  writeBag(bag);
  return copy;
}

export function deletePreset(id) {
  const bag = loadPresetsBag();
  const target = bag.presets.find((p) => p.id === id);
  if (!target || target.builtin) return false;
  bag.presets = bag.presets.filter((p) => p.id !== id);
  if (bag.activePresetId === id) bag.activePresetId = "preset-daily";
  writeBag(bag);
  return true;
}

export function exportPresetsBag() {
  return loadPresetsBag();
}

export function importPresetsBag(payload) {
  if (!payload || typeof payload !== "object") return loadPresetsBag();
  const presets = mergeBuiltins(Array.isArray(payload.presets) ? payload.presets : []);
  let activePresetId = String(payload.activePresetId || "preset-daily");
  if (!presets.some((p) => p.id === activePresetId)) activePresetId = "preset-daily";
  const bag = { activePresetId, presets };
  writeBag(bag);
  return bag;
}
