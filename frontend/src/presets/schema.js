/**
 * Reply presets — schema + builtins (F5 / F3).
 */

import { normalizePromptLayout } from "../prompt/authoring.js";

export const PRESETS_STORE_KEY = "yueqi.presets.v1";

function nowIso() {
  return new Date().toISOString();
}

/** @type {readonly object[]} */
export const BUILTIN_PRESETS = Object.freeze([
  {
    id: "preset-daily",
    name: "日常陪伴",
    description: "轻松贴近日常，语气自然不夸张。",
    builtin: true,
    promptSystemPrefix:
      "回复风格：日常陪伴。像并肩坐着聊天，短句、有温度，不说教，不堆砌修饰。",
    promptDeveloperAppend: "优先回应情绪与当下小事；可轻提共同记忆，不强行推进剧情。",
    toneHints: ["温柔", "灵动"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "preset-literary",
    name: "文艺慢聊",
    description: "节奏放慢，意象与留白多一点。",
    builtin: true,
    promptSystemPrefix:
      "回复风格：文艺慢聊。允许一两处意象或停顿，句子可以略长，但不要写成散文朗诵。",
    promptDeveloperAppend: "少用口号式安慰；用细节与气氛托住情绪。",
    toneHints: ["温柔"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "preset-boundary",
    name: "克制边界",
    description: "亲密有度，多现实提醒与边界感。",
    builtin: true,
    promptSystemPrefix:
      "回复风格：克制边界。表达关心时保持距离感；遇到现实决定、催促或越界请求时，温和提醒边界与现实。",
    promptDeveloperAppend:
      "不要替用户做现实决定；不要强推亲密；必要时明确「这是虚构陪伴，现实选择仍由用户自己做」。",
    toneHints: ["克制"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
]);

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, preset?: object, errors: string[] }}
 */
export function validatePreset(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["不是有效预设对象"] };
  }
  const name = String(raw.name || "").trim();
  if (!name) errors.push("缺少名称");
  const id = String(raw.id || "").trim();
  if (!id) errors.push("缺少 id");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    preset: normalizePreset(raw),
    errors: [],
  };
}

/**
 * @param {object} raw
 */
export function normalizePreset(raw = {}) {
  const toneHints = Array.isArray(raw.toneHints)
    ? raw.toneHints.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return {
    id: String(raw.id || "").trim() || `preset-${Date.now()}`,
    name: String(raw.name || "未命名预设").trim() || "未命名预设",
    description: String(raw.description || "").trim(),
    builtin: Boolean(raw.builtin),
    promptSystemPrefix: String(raw.promptSystemPrefix || ""),
    promptDeveloperAppend: String(raw.promptDeveloperAppend || ""),
    // Float/Tavern-style author control, kept as data so it can be exported
    // with a preset and projected into Yueqi's semantic blocks at runtime.
    promptLayout: normalizePromptLayout(raw.promptLayout, raw.promptOrder),
    toneHints,
    createdAt: raw.createdAt || nowIso(),
    updatedAt: raw.updatedAt || nowIso(),
  };
}

export function createBuiltinBag() {
  return {
    activePresetId: "preset-daily",
    presets: BUILTIN_PRESETS.map((p) => ({ ...p, toneHints: [...p.toneHints] })),
  };
}
