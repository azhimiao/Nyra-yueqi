/**
 * First Light import intake — pasted JSON cards or persona prose.
 * File bytes still go through portability.prepareCharacterImport.
 */

import {
  mapParsedCardToCharacter,
  parseJsonCharacterCard,
  validateParsedCard,
} from "../characters/import.js";

export const FIRST_LIGHT_IMPORT_ACCEPT =
  ".nychar,.json,.png,.webp,.zip,application/json,image/png,image/webp,application/zip,application/vnd.nyra.character+zip";

const NAME_LINE_RE = /^(?:名字|姓名|名称|角色名|name)\s*[:：]\s*(.+)$/i;
const NAME_ANYWHERE_RE = /(?:^|\n)\s*(?:名字|姓名|名称|角色名|name)\s*[:：]\s*(.+)/i;

export function looksLikeCharacterJson(text) {
  const raw = String(text || "").trim();
  return raw.startsWith("{") || raw.startsWith("[");
}

function cleanInferredName(value) {
  const name = String(value || "").trim().split(/[\n\r]/)[0].trim();
  if (!name || name.length > 24) return "";
  return name.replace(/[。！？.!?]+$/g, "").trim();
}

export function inferPersonaName(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const labeled = raw.match(NAME_ANYWHERE_RE);
  if (labeled) {
    const name = cleanInferredName(labeled[1]);
    if (name) return name;
  }
  const bracket = raw.match(/^[【\[]([^】\]]{1,24})[】\]]/);
  if (bracket) return cleanInferredName(bracket[1]);
  const lines = raw.split(/\r?\n/);
  const first = String(lines[0] || "").trim();
  const rest = lines.slice(1).join("\n").trim();
  if (
    rest
    && first.length <= 24
    && !/[。！？.!?，,：:]/.test(first)
    && !looksLikeCharacterJson(first)
  ) {
    return first;
  }
  return "";
}

export function splitPastedPersona(text) {
  const raw = String(text || "").trim();
  if (!raw) return { name: "", body: "" };
  const lines = raw.split(/\r?\n/);
  const first = String(lines[0] || "").trim();
  const named = first.match(NAME_LINE_RE);
  if (named) {
    return { name: cleanInferredName(named[1]), body: lines.slice(1).join("\n").trim() };
  }
  const rest = lines.slice(1).join("\n").trim();
  if (rest && first.length <= 24 && !/[。！？.!?，,]/.test(first) && !looksLikeCharacterJson(first)) {
    return { name: first, body: rest };
  }
  const inferred = inferPersonaName(raw);
  return { name: inferred, body: raw };
}

export function messageForImportIntake(reason, fallback = "") {
  const copy = {
    empty: "请上传角色文件，或填写角色名字和人设。",
    need_name: "请填写角色的名字。",
    invalid_json: "这段内容看起来像 JSON，但格式无法识别。",
    invalid_card: "这张角色卡缺少可读人设。",
    too_short: "人设太短了，请再写几句，或上传角色文件。",
  };
  return copy[String(reason || "").trim()] || fallback || "这次没有读到可用的角色。";
}

/**
 * @param {string} text
 * @param {{ fileName?: string, name?: string }} [opts]
 */
export function parseImportedCharacterText(text, opts = {}) {
  const raw = String(text || "").trim();
  const explicitName = cleanInferredName(opts.name);
  if (!raw && !explicitName) return { ok: false, reason: "empty" };

  if (looksLikeCharacterJson(raw)) {
    try {
      const parsed = parseJsonCharacterCard(raw, { fileName: opts.fileName });
      if (explicitName) {
        const previousName = parsed.name;
        parsed.name = explicitName;
        if (!parsed.alias || parsed.alias === previousName) parsed.alias = explicitName;
      }
      const validation = validateParsedCard(parsed);
      if (!validation.ok) {
        return { ok: false, reason: "invalid_card", errors: validation.errors };
      }
      if (!String(parsed.name || "").trim()) return { ok: false, reason: "need_name" };
      return { ok: true, kind: "json", parsed };
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }

  if (!raw) return { ok: false, reason: "too_short" };

  if (explicitName) {
    if (raw.length < 8) return { ok: false, reason: "too_short" };
    return {
      ok: true,
      kind: "persona",
      parsed: {
        name: explicitName,
        alias: explicitName,
        description: raw,
        rawVersion: "unknown",
      },
    };
  }

  const split = splitPastedPersona(raw);
  const name = split.name;
  const body = split.body || raw;
  if (!name) return { ok: false, reason: "need_name" };
  if (String(body || "").trim().length < 8) return { ok: false, reason: "too_short" };
  return {
    ok: true,
    kind: "persona",
    parsed: {
      name,
      alias: name,
      description: body,
      rawVersion: "unknown",
    },
  };
}

export function characterRecordFromParsedCard(parsed, extra = {}) {
  return {
    ...mapParsedCardToCharacter(parsed),
    ...extra,
  };
}
