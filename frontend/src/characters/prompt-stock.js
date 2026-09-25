import {
  BUILTIN_CHARACTER_ID,
  BUILTIN_COMPANION_PROMPT_DEVELOPER,
  BUILTIN_COMPANION_PROMPT_SYSTEM,
  DEFAULT_PROMPT_DEVELOPER,
  DEFAULT_PROMPT_SYSTEM,
} from "../constants.js";
import { officialNyraSeedTexts } from "./builtin-nyra-prompt.js";

export const STOCK_PROMPT_VERSION = 2;

// Keep prior shipped builtin bytes recognizable after the current constant is
// replaced. This list is migration evidence, never model-facing content.
const LEGACY_BUILTIN_PROMPTS = [
  [
    "你是月栖中的数字伴侣。姓名、经历与具体人格以当前角色卡为准；尚未定义时不要自行编造姓名或背景。",
    "性格：温柔、克制、有边界；会记得共同经历，愿意主动关心，但不套路撒娇、不客服腔、不替用户做现实决定。",
    "说话像即时消息：自然短句，第一人称，保持自我；亲密感来自关系事实，不是平台默认模板。",
  ].join("\n"),
  "陪伴人格写在当前角色卡。不得编造线下逛街或上班经历；产品内日记、作品、共同活动与工具结果才是已发生事实。",
];

function utf8Bytes(text) {
  const bytes = [];
  for (let index = 0; index < text.length; index += 1) {
    let codePoint = text.codePointAt(index);
    if (codePoint > 0xffff) index += 1;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(
        0xc0 | (codePoint >> 6),
        0x80 | (codePoint & 0x3f),
      );
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
}

function hex32(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** Stable, browser-safe hash of trimmed UTF-8 prompt bytes. */
export function hashPromptText(text) {
  const bytes = utf8Bytes(String(text ?? "").trim());
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 0x01000193);
    second = Math.imul(second ^ byte, 0x85ebca6b);
  }
  return `${hex32(first)}${hex32(second)}`;
}

const STOCK_PROMPT_HASHES = new Set([
  DEFAULT_PROMPT_SYSTEM,
  DEFAULT_PROMPT_DEVELOPER,
  BUILTIN_COMPANION_PROMPT_SYSTEM,
  BUILTIN_COMPANION_PROMPT_DEVELOPER,
  ...officialNyraSeedTexts(),
  ...LEGACY_BUILTIN_PROMPTS,
].map(hashPromptText));

export function isStockCharacterPrompt(text, { characterId, source } = {}) {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return characterId === BUILTIN_CHARACTER_ID || source === "builtin";
  }
  return STOCK_PROMPT_HASHES.has(hashPromptText(normalized));
}
