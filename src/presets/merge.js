/**
 * Merge active reply preset into prompt texts (F5 / F3).
 */

/**
 * @param {{ promptSystem?: string, promptDeveloper?: string }} base
 * @param {{ promptSystemPrefix?: string, promptDeveloperAppend?: string, toneHints?: string[] }|null} preset
 */
export function applyPresetToPromptTexts(base = {}, preset = null) {
  const promptSystemBase = String(base.promptSystem || "");
  const promptDeveloperBase = String(base.promptDeveloper || "");
  if (!preset) {
    return {
      promptSystem: promptSystemBase,
      promptDeveloper: promptDeveloperBase,
    };
  }
  const prefix = String(preset.promptSystemPrefix || "").trim();
  const append = String(preset.promptDeveloperAppend || "").trim();
  let promptSystem = [prefix, promptSystemBase].filter(Boolean).join("\n\n");
  let promptDeveloper = [promptDeveloperBase, append].filter(Boolean).join("\n\n");
  const hints = Array.isArray(preset.toneHints)
    ? preset.toneHints.map((h) => String(h).trim()).filter(Boolean)
    : [];
  if (hints.length) {
    const hintLine = `语气提示：${hints.join("、")}`;
    promptDeveloper = [promptDeveloper, hintLine].filter(Boolean).join("\n\n");
  }
  return { promptSystem, promptDeveloper };
}
