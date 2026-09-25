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

export function looksLikeCharacterJson(text) {
  const raw = String(text || "").trim();
  return raw.startsWith("{") || raw.startsWith("[");
}

export function splitPastedPersona(text) {
  const raw = String(text || "").trim();
  if (!raw) return { name: "", body: "" };
  const lines = raw.split(/\r?\n/);
  const first = String(lines[0] || "").trim();
  const named = first.match(/^(?:名字|姓名|name)\s*[:：]\s*(.+)$/i);
  if (named) {
    return { name: named[1].trim(), body: lines.slice(1).join("\n").trim() };
  }
  const rest = lines.slice(1).join("\n").trim();
  if (rest && first.length <= 24 && !/[。！？.!?，,]/.test(first)) {
    return { name: first, body: rest };
  }
  return { name: "", body: raw };
}

export function messageForImportIntake(reason, fallback = "") {
  const copy = {
    empty: "请上传角色文件，或在输入框里填写人设。",
    need_name: "请在第一行写上角色名字，下面再写人设。",
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
  if (!raw) return { ok: false, reason: "empty" };

  if (looksLikeCharacterJson(raw)) {
    try {
      const parsed = parseJsonCharacterCard(raw, { fileName: opts.fileName });
      const validation = validateParsedCard(parsed);
      if (!validation.ok) {
        return { ok: false, reason: "invalid_card", errors: validation.errors };
      }
      const name = String(opts.name || "").trim();
      if (name) parsed.name = name;
      return { ok: true, kind: "json", parsed };
    } catch {
      return { ok: false, reason: "invalid_json" };
    }
  }

  const split = splitPastedPersona(raw);
  const name = String(opts.name || "").trim() || split.name;
  const body = split.body || (!split.name ? raw : "");
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
    skipOpeningIntro: false,
    ...extra,
  };
}
