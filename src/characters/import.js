/**
 * Open JSON character card import — pure parse / map (F5 / F1).
 * Documents open field shapes; no third-party product names.
 */

import { createCharacterId } from "./ids.js";
import { normalizeCharacter } from "./store.js";
import { defaultProfile } from "../constants.js";
import { extractCharacterJsonFromPng } from "../portability/png-metadata.js";

export const IMPORT_SOURCE = "import";

/**
 * @typedef {{
 *   name: string,
 *   alias?: string,
 *   identity?: string,
 *   description: string,
 *   personality?: string,
 *   scenario?: string,
 *   firstMessage?: string,
 *   tags?: string[],
 *   avatar?: string,
 *   extensions?: Record<string, unknown>,
 *   rawVersion?: "v2"|"v3"|"unknown",
 * }} ParsedCharacterCard
 */

/**
 * @param {unknown} value
 */
function asString(value) {
  return value == null ? "" : String(value).trim();
}

/**
 * Pull nested data from common open card shapes.
 * @param {object} root
 */
function unwrapCardData(root) {
  if (!root || typeof root !== "object") return {};
  if (root.data && typeof root.data === "object") return { ...root, ...root.data };
  if (root.character && typeof root.character === "object") return { ...root, ...root.character };
  return root;
}

/**
 * @param {string} text
 * @param {{ fileName?: string }} [opts]
 * @returns {ParsedCharacterCard}
 */
export function parseJsonCharacterCard(text, opts = {}) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("JSON 格式无法识别");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式无法识别");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON 格式无法识别");
  }

  const data = unwrapCardData(parsed);
  const name =
    asString(data.name) ||
    asString(data.char_name) ||
    asString(data.character_name) ||
    stemFromFileName(opts.fileName) ||
    "未命名角色";

  const descriptionParts = [
    asString(data.description) || asString(data.char_persona) || asString(data.persona),
    asString(data.personality),
  ].filter(Boolean);

  const description = descriptionParts.join("\n\n") || "待补充人设";
  const tags = Array.isArray(data.tags)
    ? data.tags.map((t) => asString(t)).filter(Boolean)
    : Array.isArray(data.token)
      ? data.token.map((t) => asString(t)).filter(Boolean)
      : [];

  const avatarRaw = asString(data.avatar) || asString(data.avatarUrl) || asString(data.image);
  let rawVersion = "unknown";
  if (data.spec === "chara_card_v3" || data.spec_version === "3.0") rawVersion = "v3";
  else if (data.spec === "chara_card_v2" || data.data) rawVersion = "v2";

  const alternate = Array.isArray(data.alternate_greetings)
    ? data.alternate_greetings.map((item) => asString(item)).filter(Boolean)
    : [];
  const examples = asString(data.mes_example)
    ? asString(data.mes_example).split(/\r?\n{2,}/).map((item) => item.trim()).filter(Boolean)
    : [];

  return {
    name,
    alias: asString(data.alias) || asString(data.nickname) || name,
    identity: asString(data.identity) || asString(data.role) || "",
    description,
    personality: asString(data.personality) || undefined,
    scenario: asString(data.scenario) || asString(data.world_scenario) || undefined,
    firstMessage: asString(data.first_mes) || asString(data.firstMessage) || asString(data.greeting) || undefined,
    alternateGreetings: alternate,
    exampleDialogue: examples,
    systemPrompt: asString(data.system_prompt) || undefined,
    postHistoryInstructions: asString(data.post_history_instructions) || undefined,
    tags,
    avatar: avatarRaw || undefined,
    extensions: data.extensions && typeof data.extensions === "object" ? data.extensions : undefined,
    rawVersion,
  };
}

function stemFromFileName(fileName) {
  const base = String(fileName || "").replace(/\.[^.]+$/, "").trim();
  return base || "";
}

/**
 * @param {ParsedCharacterCard} card
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateParsedCard(card) {
  const errors = [];
  const warnings = [];
  if (!card || typeof card !== "object") {
    return { ok: false, errors: ["这张卡缺少可读人设"], warnings };
  }
  if (!asString(card.name)) {
    warnings.push("缺少姓名，将使用文件名或占位名");
  }
  if (!asString(card.description) || card.description === "待补充人设") {
    warnings.push("人设摘要较空，导入后可再用栖笺补充");
  }
  if (card.avatar) {
    const av = asString(card.avatar);
    if (!(av.startsWith("https://") || av.startsWith("data:"))) {
      warnings.push("头像地址非 https/data，已丢弃");
    }
  }
  if (!asString(card.name) && !asString(card.description)) {
    errors.push("这张卡缺少可读人设");
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * @param {ParsedCharacterCard} parsed
 * @param {{ id?: string }} [opts]
 */
export function mapParsedCardToCharacter(parsed, opts = {}) {
  const name = asString(parsed?.name) || "未命名角色";
  const alias = asString(parsed?.alias) || name;
  const identity = asString(parsed?.identity) || "未设定身份";
  let description = asString(parsed?.description) || "待补充人设";
  if (parsed?.personality && !description.includes(parsed.personality)) {
    description = [description, asString(parsed.personality)].filter(Boolean).join("\n\n");
  }
  let avatarUrl = asString(parsed?.avatar);
  if (avatarUrl && !(avatarUrl.startsWith("https://") || avatarUrl.startsWith("data:"))) {
    avatarUrl = "";
  }
  const tokens = Array.isArray(parsed?.tags)
    ? parsed.tags.map((t) => asString(t)).filter(Boolean).slice(0, 24)
    : [];

  const fields = [...defaultProfile.fields];
  fields[0] = name;
  fields[1] = alias;
  fields[2] = identity;
  fields[3] = fields[3] || defaultProfile.fields[3];
  fields[4] = description;
  const systemPrompt = asString(parsed?.systemPrompt);
  const personaPrompt = systemPrompt
    || (description && description !== "待补充人设" ? description : "");

  return normalizeCharacter({
    id: opts.id || createCharacterId(),
    name,
    alias,
    avatarUrl,
    profile: {
      ...defaultProfile,
      fields,
      tokens: tokens.length ? tokens : [...defaultProfile.tokens],
      promptSystem: personaPrompt,
      promptDeveloper: "",
      postHistoryInstructions: asString(parsed?.postHistoryInstructions),
      scenario: asString(parsed?.scenario),
      firstMessage: asString(parsed?.firstMessage),
    },
    scenario: asString(parsed?.scenario),
    greetings: {
      primary: asString(parsed?.firstMessage),
      alternate: Array.isArray(parsed?.alternateGreetings) ? parsed.alternateGreetings : [],
    },
    exampleDialogue: Array.isArray(parsed?.exampleDialogue) ? parsed.exampleDialogue : [],
    loreEntryIds: [],
    source: IMPORT_SOURCE,
    provenance: {
      source: IMPORT_SOURCE,
      importedFormat: parsed?.rawVersion === "v3" ? "tavern_v3_json" : parsed?.rawVersion === "v2" ? "tavern_v2_json" : "unknown",
    },
  });
}

/**
 * Extract embedded JSON from PNG/WebP bytes (best-effort).
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {string|null} JSON text
 */
export function extractJsonFromImage(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (buf.length < 16) return null;

  // PNG signature
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (isPng) {
    try {
      const extracted = extractCharacterJsonFromPng(buf);
      if (extracted?.ok && extracted.json) return extracted.json;
    } catch {
      /* fall through to legacy walker */
    }
    const fromChunks = extractFromPngTextChunks(buf);
    if (fromChunks) return fromChunks;
  }

  // Fallback: scan UTF-8 for a JSON object with a name-like field
  const asText = decodeUtf8Loose(buf);
  const match = asText.match(/\{[\s\S]{20,}?\}/);
  if (match) {
    try {
      JSON.parse(match[0]);
      return match[0];
    } catch {
      /* continue */
    }
  }
  return null;
}

function decodeUtf8Loose(buf) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    let s = "";
    for (let i = 0; i < buf.length; i += 1) s += String.fromCharCode(buf[i]);
    return s;
  }
}

function extractFromPngTextChunks(buf) {
  let offset = 8;
  while (offset + 8 < buf.length) {
    const length =
      (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
    const type = String.fromCharCode(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buf.length) break;
    if (type === "tEXt" || type === "iTXt") {
      const slice = buf.subarray(dataStart, dataEnd);
      const text = decodeUtf8Loose(slice);
      const nul = text.indexOf("\0");
      const body = nul >= 0 ? text.slice(nul + 1) : text;
      const json = tryParseEmbeddedPayload(body);
      if (json) return json;
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return null;
}

function tryParseEmbeddedPayload(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      /* try base64 */
    }
  }
  try {
    const decoded = atob(trimmed.replace(/\s+/g, ""));
    if (decoded.trim().startsWith("{")) {
      JSON.parse(decoded);
      return decoded;
    }
    // nested base64 JSON (common open-card embedding)
    try {
      const inner = atob(decoded.replace(/\s+/g, ""));
      if (inner.trim().startsWith("{")) {
        JSON.parse(inner);
        return inner;
      }
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
  return null;
}
