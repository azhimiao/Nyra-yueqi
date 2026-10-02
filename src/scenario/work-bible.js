/**
 * User-owned scenario archive — 名字 / 介绍 / 开场 / 剧情指令.
 * Built-in presets are samples. Older split fields fold into these four.
 */

export function isUserOwnedScript(script = {}) {
  const source = String(script.source || "").trim();
  return source === "user" || source === "cocreate";
}

function pickText(input, existing, key, fallback = "") {
  if (input[key] != null) return String(input[key]).trim();
  if (existing[key] != null) return String(existing[key]).trim();
  return fallback;
}

function joinLegacyInstruction(input = {}, existing = {}) {
  const direct = pickText(input, existing, "instruction");
  if (direct) return direct;
  return [
    pickText(input, existing, "worldview"),
    pickText(input, existing, "castSituation"),
    pickText(input, existing, "castHint"),
  ].filter(Boolean).filter((line, i, all) => all.indexOf(line) === i).join("\n");
}

function joinOpening(input = {}, existing = {}) {
  const beat = pickText(input, existing, "openingBeat")
    || pickText(input, existing, "opening");
  const dialogue = pickText(input, existing, "openingDialogue");
  if (beat && dialogue && !beat.includes(dialogue)) return `${beat}\n「${dialogue}」`;
  return beat || (dialogue ? `「${dialogue}」` : "");
}

/** Pull a closing quoted line out of 开场 so the first spoken line can stand alone. */
export function splitOpening(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return { narration: "", dialogue: "" };
  const match = raw.match(/[「"]([^」"]+)[」"]\s*$/);
  if (!match) return { narration: raw, dialogue: "" };
  return {
    narration: raw.slice(0, match.index).trim(),
    dialogue: String(match[1] || "").trim(),
  };
}

/**
 * @param {object} [input]
 * @param {object} [existing]
 */
export function normalizeWorkBible(input = {}, existing = {}) {
  const premise = pickText(input, existing, "premise")
    || pickText(input, existing, "synopsis")
    || pickText(input, existing, "worldBackground");
  const openingBeat = joinOpening(input, existing);
  const split = splitOpening(openingBeat);
  const instruction = joinLegacyInstruction(input, existing);
  return {
    premise,
    openingBeat,
    openingDialogue: split.dialogue,
    instruction,
    worldBackground: premise,
    worldview: instruction,
    castSituation: instruction,
    leadName: "对方",
    playerRole: "与ta共同经历这一场的人",
    relationshipPremise: premise,
    location: "",
    weather: "",
    actIndex: 1,
    actLabel: "",
  };
}

/**
 * @param {object} [script]
 * @param {object|null} [pkg]
 */
export function bibleFromScript(script = {}, pkg = null) {
  const opening = Array.isArray(pkg?.openings) ? pkg.openings[0] : null;
  const turn = opening?.openingTurns?.find((item) => item?.role === "assistant") || opening?.openingTurns?.[0];
  const openingFromPkg = [
    String(turn?.narration || "").trim(),
    String(turn?.dialogue || "").trim() ? `「${String(turn.dialogue).trim()}」` : "",
  ].filter(Boolean).join("\n");
  return normalizeWorkBible({
    premise: script.premise || pkg?.synopsis || "",
    openingBeat: script.openingBeat || openingFromPkg,
    openingDialogue: script.openingDialogue,
    instruction: script.instruction || pkg?.worldview || pkg?.scenarioOverride || "",
    worldview: script.worldview,
    castSituation: script.castSituation || script.castHint,
    worldBackground: script.worldBackground,
  }, script);
}

/** Prompt block the director must obey. */
export function formatWorkBiblePrompt(script = {}, pkg = null) {
  const bible = bibleFromScript(script, pkg);
  return [
    bible.premise ? `介绍：${bible.premise}` : "",
    bible.instruction ? `剧情指令：\n${bible.instruction}` : "",
  ].filter(Boolean).join("\n");
}

export function sceneSeedFromBible(bible = {}) {
  const premise = String(bible.premise || bible.worldBackground || "").trim();
  const instruction = String(bible.instruction || bible.worldview || "").trim();
  return {
    worldSetting: premise,
    worldview: instruction,
    castSituation: instruction,
    relationshipPremise: premise,
    location: premise.slice(0, 40),
  };
}

/** Prefill a user draft from a built-in sample. Does not keep the preset id. */
export function forkScriptToUserDraft(script = {}, pkg = null) {
  const bible = bibleFromScript(script, pkg);
  return {
    title: String(script.title || "未命名情景").trim() || "未命名情景",
    premise: bible.premise,
    openingBeat: bible.openingBeat,
    instruction: bible.instruction,
    tags: ["自写"],
    source: "user",
    loreEntryIds: Array.isArray(script.loreEntryIds) ? [...script.loreEntryIds] : [],
  };
}
