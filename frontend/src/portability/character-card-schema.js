/**
 * Path-level character-card compatibility matrix (Task 5.1 / master plan §10.1).
 *
 * TARGET contract for later parser work (Task 5.2). This is not current
 * `src/characters/import.js` behavior. Unknown paths are unsupported — never preserved.
 *
 * Canonical lookup: SUPPORT_MATRIX[format][path] = { disposition, targetPath?, notes? }
 */

import { IMPORT_DISPOSITIONS } from "../contracts/character-import-report-v1.js";

export const CARD_COMPAT_FORMATS = Object.freeze([
  "tavern_v2_json",
  "tavern_v3_json",
  "png_chara",
  "webp",
  "nychar",
]);

/** Informal aliases; canonical ids are CARD_COMPAT_FORMATS. */
export const CARD_FORMAT_ALIASES = Object.freeze({
  json_v2: "tavern_v2_json",
  json_v3: "tavern_v3_json",
  v2_json: "tavern_v2_json",
  v3_json: "tavern_v3_json",
  png_text: "png_chara",
  tavern_v2_json: "tavern_v2_json",
  tavern_v3_json: "tavern_v3_json",
  png_chara: "png_chara",
  webp: "webp",
  nychar: "nychar",
});

const TO_FLAT_FORMAT = Object.freeze({
  tavern_v2_json: "json_v2",
  tavern_v3_json: "json_v3",
  png_chara: "png_chara",
  webp: "webp",
  nychar: "nychar",
});

export const CHARACTER_CARD_FORMATS = Object.freeze(["json_v2", "json_v3", "png_chara", "webp"]);

export const CARD_SOURCE_PATHS = Object.freeze([
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "alternate_greetings",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
  "creator",
  "character_version",
  "tags",
  "extensions",
  "character_book",
  "avatar",
  "macros",
  "regex_scripts",
]);

export const CHARACTER_CARD_REQUIRED_FIELDS = Object.freeze(CARD_SOURCE_PATHS.filter((path) => (
  path !== "macros" && path !== "regex_scripts"
)));

export const CARD_DISPOSITIONS = IMPORT_DISPOSITIONS;

export const WEBP_UNSUPPORTED_REASON =
  "No bounded WebP metadata extractor: EXIF/XMP/RIFF layouts are not signature-checked with decode limits. Scanning the whole file for JSON is unsafe (oversized payloads and coincidental matches). The webp column is unsupported; PNG tEXt/iTXt/zTXt `chara` is the image-card target.";

const BOOK_NOTES =
  "Maps to character-scoped lore. keys, secondary_keys, position, depth, priority, enabled, selective, and constant are transformed when the worldbook model can represent them. Unrepresentable book fields stay as raw metadata on the entry and appear in CharacterImportReportV1. Lore is untrusted character data, not platform kernel.";

const UNTRUSTED_PROMPT_NOTES =
  "Untrusted character supplement. Must not become platform kernel, tools, or permissions, and is never elevated into those layers.";

const EXTENSIONS_NOTES =
  "Unknown keys stored raw and never injected into Prompt. Executable keys are unsafe_ignored separately.";

const MACRO_NOTES =
  "Macro execution is ignored. Mapped text fields keep literal substrings; they are not rewritten by a macro engine.";

const REGEX_SCRIPT_NOTES =
  "Regex replacement scripts are not executed. The extensions blob may still be stored raw.";

const FORBIDDEN_PARITY_CLAIMS = Object.freeze([
  /full\s+parity/i,
  /完全兼容酒馆/,
]);

const SENSITIVE_TARGET_RE = /\b(platform|kernel|tools?|permissions?)\b/i;

function resolveFormat(format) {
  return CARD_FORMAT_ALIASES[String(format || "")] || "";
}

function canonicalPath(path) {
  let key = String(path || "").trim();
  if (key.endsWith("[]")) key = key.slice(0, -2);
  if (key.startsWith("data.")) key = key.slice(5);
  if (key === "extensions.regex_scripts") return "regex_scripts";
  if (key === "text.macros") return "macros";
  return key;
}

function sourcePathFor(field) {
  if (field === "macros") return "macros";
  if (field === "regex_scripts") return "data.extensions.regex_scripts";
  return `data.${field}`;
}

function collapsedPathFor(fieldOrPath) {
  const short = canonicalPath(fieldOrPath);
  if (short === "macros") return "text.macros";
  if (short === "alternate_greetings") return "data.alternate_greetings[]";
  if (CARD_SOURCE_PATHS.includes(short)) return sourcePathFor(short);
  return String(fieldOrPath || "").trim();
}

/**
 * @param {string} disposition
 * @param {string} [targetPath]
 * @param {string} [notes]
 */
function cell(disposition, targetPath, notes) {
  if (!IMPORT_DISPOSITIONS.includes(disposition)) {
    throw new Error(`invalid disposition: ${disposition}`);
  }
  const entry = { disposition };
  if (targetPath) entry.targetPath = targetPath;
  if (notes) entry.notes = notes;
  return Object.freeze(entry);
}

function freezeFormatMap(map, format) {
  const out = {};
  for (const path of CARD_SOURCE_PATHS) {
    const item = map[path];
    if (!item || !IMPORT_DISPOSITIONS.includes(item.disposition)) {
      throw new Error(`matrix gap: ${format}.${path}`);
    }
    out[path] = item;
  }
  for (const path of Object.keys(map)) {
    if (!CARD_SOURCE_PATHS.includes(path)) {
      throw new Error(`unexpected matrix path: ${format}.${path}`);
    }
  }
  return Object.freeze(out);
}

function jsonCardMap(overrides = {}) {
  return {
    name: cell("preserved", "name", "Display name. Filling an empty value from the file stem is transformed, not preserved."),
    description: cell("preserved", "persona.description", "Persona description. This schema does not merge it into other fields."),
    personality: cell("preserved", "persona.personality", "Today personality is concatenated into description and not stored separately. Task 5.3 will persist persona.personality."),
    scenario: cell("preserved", "scenario", "parseJsonCharacterCard reads scenario / world_scenario but mapParsedCardToCharacter does not persist it. Task 5.3 will persist CharacterProfileV2.scenario."),
    first_mes: cell(
      "preserved",
      "greetings.primary",
      "Parsed as firstMessage today, then dropped by mapParsedCardToCharacter — not written to the character record or chat history. Task 5.3 will persist greetings.primary. New sessions pick primary/alternate; greeting is not injected as prior chat.",
    ),
    alternate_greetings: cell(
      "preserved",
      "greetings.alternate",
      "Not parsed today. Task 5.3 will persist greetings.alternate. Same session-select policy as first_mes; not written into history.",
    ),
    mes_example: cell(
      "transformed",
      "exampleDialogue",
      "Parsed into example fragments and budgeted. Not a permanent Prompt block. Macro tokens stay literal.",
    ),
    system_prompt: cell("demoted_untrusted", "prompts.characterSystemSupplement", UNTRUSTED_PROMPT_NOTES),
    post_history_instructions: cell("demoted_untrusted", "prompts.postHistoryInstructions", UNTRUSTED_PROMPT_NOTES),
    creator_notes: cell("preserved", "extensions.cardMeta.creatorNotes", "Author notes stored raw. Never copied into Prompt layers."),
    creator: cell("preserved", "extensions.cardMeta.creator", "Card author metadata. Not persona text."),
    character_version: cell("preserved", "extensions.cardMeta.characterVersion", "Author version string. Distinct from CharacterProfileV2.revision."),
    tags: cell("transformed", "tags", "Normalized and capped at CharacterProfileV2 tag limits when applied."),
    extensions: cell("preserved", "extensions", EXTENSIONS_NOTES),
    character_book: cell("transformed", "loreEntryIds", BOOK_NOTES),
    avatar: cell(
      "transformed",
      "presentation.avatarMediaId",
      "Ignores 'none'. Accepts https or data after MIME checks. Remote URLs are not fetched. Other schemes dropped.",
    ),
    macros: cell("unsafe_ignored", undefined, MACRO_NOTES),
    regex_scripts: cell("unsafe_ignored", undefined, REGEX_SCRIPT_NOTES),
    ...overrides,
  };
}

function nycharMap() {
  const absent = (notes) => cell("unsupported", undefined, notes);
  return {
    name: cell("preserved", "name", "From character.name."),
    description: cell("preserved", "persona.description", "From character.persona.description."),
    personality: cell("preserved", "persona.personality", "From character.persona.personality."),
    scenario: cell("preserved", "scenario", "From character.persona.scenario."),
    first_mes: cell("transformed", "greetings.primary", "From character.greetings[0]; not written into chat history."),
    alternate_greetings: cell("transformed", "greetings.alternate", "From character.greetings[1…]; not written into chat history."),
    mes_example: absent("nychar character.json has no mes_example field."),
    system_prompt: cell(
      "demoted_untrusted",
      "prompts.characterSystemSupplement",
      `From character.prompts.system. ${UNTRUSTED_PROMPT_NOTES}`,
    ),
    post_history_instructions: absent("nychar character.json has no post_history_instructions field."),
    creator_notes: absent("nychar character.json has no creator_notes field."),
    creator: cell("transformed", "extensions.cardMeta.creator", "From character.creator object."),
    character_version: absent("nychar version is package schema version, not character_version."),
    tags: cell("transformed", "tags", "Normalized and capped."),
    extensions: absent("nychar component schemas reject additional properties; unknown card extensions are not a nychar source path."),
    character_book: cell(
      "transformed",
      "loreEntryIds",
      "From worldbook.json entries. nychar native fields (keywords/enabled/priority) transform; secondary_keys/position/depth/selective/constant are absent from the nychar worldbook schema.",
    ),
    avatar: cell(
      "transformed",
      "presentation.avatarMediaId",
      "From assets/avatar.png into the media store. Other packaged assets are out of this path.",
    ),
    macros: absent("nychar does not carry executable card macros."),
    regex_scripts: absent("nychar does not carry prompt-mutating regex scripts."),
  };
}

export const SUPPORT_MATRIX = Object.freeze({
  tavern_v2_json: freezeFormatMap(jsonCardMap(), "tavern_v2_json"),
  tavern_v3_json: freezeFormatMap(jsonCardMap(), "tavern_v3_json"),
  png_chara: freezeFormatMap(
    jsonCardMap({
      avatar: cell(
        "transformed",
        "presentation.avatarMediaId",
        "PNG pixel body is the avatar candidate (media store). Embedded card JSON is read from tEXt/iTXt/zTXt `chara` (V3 may also use `ccv3`). Compressed-bomb and oversized limits are Task 5.2. Remote URLs in the JSON are not fetched.",
      ),
    }),
    "png_chara",
  ),
  webp: freezeFormatMap(
    Object.fromEntries(CARD_SOURCE_PATHS.map((path) => [path, cell("unsupported", undefined, WEBP_UNSUPPORTED_REASON)])),
    "webp",
  ),
  nychar: freezeFormatMap(nycharMap(), "nychar"),
});

const PNG_DECODE_NOTE = " After PNG tEXt/iTXt/zTXt chara or ccv3 decode (Task 5.2).";

const BOOK_ENTRY_FIELDS = Object.freeze([
  ["data.character_book.entries", "loreEntryIds", "transformed", "Each entry becomes a character-linked lore row (Task 5.4)."],
  ["data.character_book.entries.keys", "", "preserved", "Map to worldbook keys/triggers."],
  ["data.character_book.entries.secondary_keys", "", "preserved", "Map to worldbook secondaryKeys."],
  ["data.character_book.entries.content", "", "preserved", "Untrusted lore text. Macros are not executed."],
  ["data.character_book.entries.position", "", "transformed", "Map onto insertPosition when representable; else raw metadata."],
  ["data.character_book.entries.depth", "", "transformed", "Map onto scanDepth when representable."],
  ["data.character_book.entries.insertion_order", "", "transformed", "Map onto priority/order."],
  ["data.character_book.entries.priority", "", "transformed", "Map onto priority when present."],
  ["data.character_book.entries.enabled", "", "preserved", "Map onto worldbook.enabled."],
  ["data.character_book.entries.selective", "", "transformed", "Map onto matchMode when representable; else raw metadata."],
  ["data.character_book.entries.constant", "", "preserved", "Map onto worldbook.constant."],
  ["data.character_book.entries.extensions", "", "preserved", "Unrepresentable book semantics stay as raw metadata. Not Prompt."],
]);

const PNG_CHUNKS = Object.freeze([
  ["png.tEXt.chara", "Latin-1 tEXt keyword chara; typically base64 JSON. Bounded decode is Task 5.2."],
  ["png.iTXt.chara", "UTF-8 iTXt keyword chara; compressed flag must inflate inside byte limits (Task 5.2)."],
  ["png.zTXt.chara", "zlib zTXt keyword chara. Inflate is bounded in Task 5.2; not implemented here."],
  ["png.tEXt.ccv3", "Latin-1 tEXt keyword ccv3 (V3 JSON). Bounded decode is Task 5.2."],
  ["png.iTXt.ccv3", "UTF-8 iTXt keyword ccv3. Compressed payloads follow the same inflate limits."],
  ["png.zTXt.ccv3", "zlib zTXt keyword ccv3. Inflate is bounded in Task 5.2; not implemented here."],
]);

function freezeRow(row) {
  if (!IMPORT_DISPOSITIONS.includes(row.disposition)) {
    throw new Error(`invalid disposition: ${row.disposition}`);
  }
  return Object.freeze({
    field: row.field,
    format: row.format,
    path: row.path,
    sourcePath: row.path,
    targetPath: row.targetPath || "",
    disposition: row.disposition,
    note: row.note,
  });
}

function buildFlatMatrix() {
  const rows = [];

  for (const format of CARD_COMPAT_FORMATS) {
    const flatFormat = TO_FLAT_FORMAT[format];
    const map = SUPPORT_MATRIX[format];
    for (const field of CARD_SOURCE_PATHS) {
      const item = map[field];
      const note = format === "png_chara" && item.disposition !== "unsupported" && field !== "macros" && field !== "regex_scripts"
        ? `${item.notes || ""}${PNG_DECODE_NOTE}`
        : (item.notes || "");
      rows.push(freezeRow({
        field,
        format: flatFormat,
        path: sourcePathFor(field),
        targetPath: item.targetPath || "",
        disposition: item.disposition,
        note,
      }));
    }
  }

  for (const format of ["json_v2", "json_v3", "png_chara"]) {
    for (const [path, targetPath, disposition, note] of BOOK_ENTRY_FIELDS) {
      rows.push(freezeRow({
        field: "character_book",
        format,
        path,
        targetPath,
        disposition,
        note,
      }));
    }
  }

  for (const [path, note] of PNG_CHUNKS) {
    rows.push(freezeRow({
      field: "png_chunk",
      format: "png_chara",
      path,
      targetPath: "",
      disposition: "transformed",
      note,
    }));
  }

  rows.push(freezeRow({
    field: "avatar",
    format: "png_chara",
    path: "png.image",
    targetPath: "presentation.avatarMediaId",
    disposition: "transformed",
    note: "PNG image body may become an avatar candidate after MIME, signature, pixel, and byte checks (Task 5.2).",
  }));

  rows.push(freezeRow({
    field: "avatar",
    format: "json_v3",
    path: "data.assets",
    targetPath: "presentation.avatarMediaId",
    disposition: "transformed",
    note: "icon/background assets may become media candidates. Remote URIs are not fetched. Other asset types stay unsupported.",
  }));

  rows.push(freezeRow({
    field: "nickname",
    format: "json_v3",
    path: "data.nickname",
    targetPath: "extensions.cardMeta.nickname",
    disposition: "preserved",
    note: "V3 nickname stored as card metadata. CharacterProfileV2 has no alias field.",
  }));

  rows.push(freezeRow({
    field: "group_only_greetings",
    format: "json_v3",
    path: "data.group_only_greetings",
    targetPath: "",
    disposition: "unsupported",
    note: "Group-only greetings have no CharacterProfileV2 landing path.",
  }));

  for (const path of ["webp.exif", "webp.xmp", "webp.riff"]) {
    rows.push(freezeRow({
      field: "webp_container",
      format: "webp",
      path,
      targetPath: "",
      disposition: "unsupported",
      note: WEBP_UNSUPPORTED_REASON,
    }));
  }

  return Object.freeze(rows);
}

export const CHARACTER_CARD_FORMAT_ROWS = buildFlatMatrix();

export const CARD_FORMATS = Object.freeze(["v2_json", "v3_json", "png_text", "webp"]);
export const CARD_STATUSES = Object.freeze(["planned", "implemented"]);
export const MASTER_PLAN_CARD_FIELDS = Object.freeze([
  "name",
  "description",
  "personality",
  "scenario",
  "first_mes",
  "alternate_greetings",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
  "creator_notes",
  "creator",
  "character_version",
  "tags",
  "extensions",
  "character_book",
  "avatar",
]);

const IMPLEMENTED_PATHS = new Set([
  "data.name",
  "data.description",
  "data.tags",
  "data.avatar",
  "data.extensions.regex_scripts",
  "container.webp",
]);

const FORMAT_TOKEN = Object.freeze({
  json_v2: "v2_json",
  json_v3: "v3_json",
  png_chara: "png_text",
  webp: "webp",
  nychar: "nychar",
});

const JSON_THEN_PNG_TOKENS = Object.freeze(["v2_json", "v3_json", "png_text"]);

function collapsePathMatrix() {
  /** @type {Map<string, { path: string, formats: string[], disposition: string, targetPath: string, notes: string, status: string }>} */
  const byPath = new Map();
  const extra = [
    ["container.webp", ["webp"], "unsupported", "", "No bounded EXIF/XMP/chunk extractor. A UTF-8 byte scan is not a compatibility claim."],
    ["container.png.tEXt.chara", ["png_text"], "transformed", "", "Latin-1 tEXt keyword=chara (often base64 JSON), then apply this matrix. Task 5.2: bounded decode."],
    ["container.png.iTXt.chara", ["png_text"], "transformed", "", "UTF-8 iTXt keyword=chara. Task 5.2: bounded inflate when compressed."],
    ["container.png.zTXt.chara", ["png_text"], "transformed", "", "zTXt keyword=chara is not decoded today. Task 5.2: bounded zlib inflate."],
    ["container.png.tEXt.ccv3", ["png_text"], "transformed", "", "V3 JSON in tEXt keyword=ccv3. Task 5.2."],
    ["container.png.iTXt.ccv3", ["png_text"], "transformed", "", "V3 JSON in iTXt keyword=ccv3. Task 5.2."],
    ["container.png.zTXt.ccv3", ["png_text"], "transformed", "", "V3 JSON in zTXt keyword=ccv3. Not decoded today. Task 5.2."],
    ["container.png.image_body", ["png_text"], "transformed", "presentation.avatarMediaId", "PNG pixels may become an avatar candidate after MIME/signature/size checks. Task 5.2 / §10.4."],
    ["data.character_book.entries[]", JSON_THEN_PNG_TOKENS, "transformed", "loreEntryIds", "Each entry becomes a character-linked lore row (Task 5.4)."],
    ["data.character_book.entries[].keys", JSON_THEN_PNG_TOKENS, "preserved", "", "Map to worldbook.keys / triggers. Task 5.4."],
    ["data.character_book.entries[].secondary_keys", JSON_THEN_PNG_TOKENS, "preserved", "", "Map to worldbook.secondaryKeys. Task 5.4."],
    ["data.character_book.entries[].content", JSON_THEN_PNG_TOKENS, "preserved", "", "Map to worldbook.content as untrusted lore text."],
    ["data.character_book.entries[].position", JSON_THEN_PNG_TOKENS, "transformed", "", "Map onto worldbook.insertPosition when representable."],
    ["data.character_book.entries[].depth", JSON_THEN_PNG_TOKENS, "transformed", "", "Map onto worldbook.scanDepth. Task 5.4."],
    ["data.character_book.entries[].insertion_order", JSON_THEN_PNG_TOKENS, "transformed", "", "Map onto worldbook.priority / order. Task 5.4."],
    ["data.character_book.entries[].priority", JSON_THEN_PNG_TOKENS, "transformed", "", "Map onto worldbook.priority when present."],
    ["data.character_book.entries[].enabled", JSON_THEN_PNG_TOKENS, "preserved", "", "Map onto worldbook.enabled."],
    ["data.character_book.entries[].selective", JSON_THEN_PNG_TOKENS, "transformed", "", "Map onto worldbook.matchMode when representable."],
    ["data.character_book.entries[].constant", JSON_THEN_PNG_TOKENS, "preserved", "", "Map onto worldbook.constant."],
    ["data.character_book.entries[].extensions", JSON_THEN_PNG_TOKENS, "preserved", "", "Unrepresentable book semantics stay as raw metadata. Not Prompt."],
    ["data.extensions.*", JSON_THEN_PNG_TOKENS, "preserved", "extensions", "Unknown extension keys: preserve raw, do not interpret."],
    ["data.nickname", ["v3_json", "png_text"], "preserved", "extensions.cardNickname", "V3 nickname. No first-class alias on CharacterProfileV2."],
    ["data.group_only_greetings[]", ["v3_json", "png_text"], "dropped", "", "V3 group-only greetings have no CharacterProfileV2 target. Report as dropped."],
    ["data.assets[]", ["v3_json", "png_text"], "unsupported", "", "V3 asset URIs are not fetched. Local PNG body is the avatar candidate."],
    ["text.macros", JSON_THEN_PNG_TOKENS, "transformed", "", "Tokens matching {{…}} are never executed. Keep as literal character text, or strip unknown {{…}} at compile time."],
    ["spec", JSON_THEN_PNG_TOKENS, "transformed", "provenance.importedFormat", "V2/V3 markers become importedFormat."],
  ];

  for (const format of ["json_v2", "json_v3", "png_chara"]) {
    const token = FORMAT_TOKEN[format];
    const canonical = format === "json_v2" ? "tavern_v2_json" : format === "json_v3" ? "tavern_v3_json" : "png_chara";
    const map = SUPPORT_MATRIX[canonical];
    for (const field of CARD_SOURCE_PATHS) {
      if (field === "macros") continue;
      const item = map[field];
      const path = collapsedPathFor(field);
      const existing = byPath.get(path);
      if (!existing) {
        byPath.set(path, {
          path,
          formats: [token],
          disposition: item.disposition,
          targetPath: item.targetPath || "",
          notes: item.notes || "",
          status: IMPLEMENTED_PATHS.has(path) ? "implemented" : "planned",
        });
      } else if (!existing.formats.includes(token)) {
        existing.formats.push(token);
      }
    }
  }

  for (const [path, formats, disposition, targetPath, notes] of extra) {
    if (byPath.has(path)) continue;
    byPath.set(path, {
      path,
      formats: [...formats],
      disposition,
      targetPath,
      notes,
      status: IMPLEMENTED_PATHS.has(path) ? "implemented" : "planned",
    });
  }

  return Object.freeze([...byPath.values()].map((row) => Object.freeze({
    ...row,
    formats: Object.freeze([...row.formats]),
  })));
}

export const CHARACTER_CARD_SUPPORT_MATRIX = collapsePathMatrix();

const PATH_INDEX = new Map(CHARACTER_CARD_SUPPORT_MATRIX.map((entry) => [entry.path, entry]));

export function normalizeCardFormat(format) {
  const canonical = resolveFormat(format);
  return TO_FLAT_FORMAT[canonical] || "";
}

function lookupByFormatAndPath(format, path) {
  const fmt = normalizeCardFormat(format);
  const sourcePath = String(path || "").trim().replace(/\[\]$/g, "");
  if (!fmt || !sourcePath) return null;
  const short = canonicalPath(sourcePath);
  const expectedPath = CARD_SOURCE_PATHS.includes(short) ? sourcePathFor(short) : sourcePath;
  const expectedBare = expectedPath.replace(/\[\]$/g, "");
  return CHARACTER_CARD_FORMAT_ROWS.find((row) => {
    if (row.format !== fmt) return false;
    const rowBare = String(row.path || "").replace(/\[\]$/g, "");
    return row.path === expectedPath || rowBare === expectedBare;
  }) || null;
}

/**
 * Look up a matrix row.
 * One argument: collapsed path row `{ path, formats, disposition, targetPath, notes, status }`.
 * Two arguments: format-specific flattened row (legacy).
 * @param {string} formatOrPath
 * @param {string} [path]
 */
export function lookupCardPath(formatOrPath, path) {
  if (path !== undefined) return lookupByFormatAndPath(formatOrPath, path);
  const key = String(formatOrPath || "").trim();
  if (!key) return null;
  const candidates = [key, collapsedPathFor(key)];
  if (key.endsWith("[]")) candidates.push(key.slice(0, -2));
  else candidates.push(`${key}[]`);
  for (const candidate of candidates) {
    if (PATH_INDEX.has(candidate)) return PATH_INDEX.get(candidate);
  }
  return null;
}

/**
 * Paths this format can ingest (anything other than unsupported).
 * @param {string} format
 * @returns {readonly string[]}
 */
export function listSupportedPaths(format) {
  const canonical = resolveFormat(format);
  const row = SUPPORT_MATRIX[canonical];
  if (!row) return Object.freeze([]);
  return Object.freeze(CARD_SOURCE_PATHS.filter((path) => row[path].disposition !== "unsupported"));
}

/**
 * @param {string} format
 * @param {string} path
 * @returns {typeof IMPORT_DISPOSITIONS[number]}
 */
export function dispositionFor(format, path) {
  const canonical = resolveFormat(format);
  const short = canonicalPath(path);
  const mapped = canonical ? SUPPORT_MATRIX[canonical]?.[short] : undefined;
  if (mapped) return mapped.disposition;
  const row = lookupCardPath(format, path);
  if (row) return row.disposition;
  return "unsupported";
}

/**
 * Reject documents that claim complete third-party client coverage.
 * @param {string} docText
 * @returns {true}
 */
export function assertNoFullParityClaim(docText) {
  const text = String(docText ?? "");
  for (const pattern of FORBIDDEN_PARITY_CLAIMS) {
    if (pattern.test(text)) {
      throw new Error("compatibility document contains a forbidden coverage claim");
    }
  }
  return true;
}

export function isSensitiveElevationTarget(targetPath) {
  return SENSITIVE_TARGET_RE.test(String(targetPath || ""));
}
