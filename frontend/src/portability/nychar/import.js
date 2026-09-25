/**
 * Unified .nychar / generic character-card import.
 * Detect → validate → map → preview (with lossy report) → install via upsert callback.
 */

import {
  extractJsonFromImage,
  mapParsedCardToCharacter,
  parseJsonCharacterCard,
  validateParsedCard,
} from "../../characters/import.js";
import { createCharacterId } from "../../characters/ids.js";
import { PortabilityError } from "../errors.js";
import { isSha256Hex, sha256Hex } from "../hash.js";
import { safeUnzip, strFromU8 } from "../zip-safe.js";
import {
  NYCHAR_ACTIONS_SCHEMA,
  NYCHAR_APPEARANCE_SCHEMA,
  NYCHAR_ASSET_PATH_RE,
  NYCHAR_CHARACTER_SCHEMA,
  NYCHAR_COMPONENT_PATHS,
  NYCHAR_FORMAT_VERSION,
  NYCHAR_ID_RE,
  NYCHAR_LIMITS,
  NYCHAR_MANIFEST_SCHEMA,
  NYCHAR_RELATIONSHIP_SCHEMA,
  NYCHAR_RELATIONSHIP_TYPES,
  NYCHAR_REQUIRED_COMPONENTS,
  NYCHAR_SKILLS_SCHEMA,
  NYCHAR_VOICE_SCHEMA,
  NYCHAR_WORLDBOOK_SCHEMA,
} from "./constants.js";
import { assertNycharPrivacy } from "./privacy.js";

function asString(value) {
  return value == null ? "" : String(value).trim();
}

function emptyLossy() {
  return {
    dropped: [],
    transformed: [],
    unsupported: [],
    unsafe: [],
    unresolved: [],
  };
}

function remapZipError(err) {
  const code = err?.code || "";
  if (code === "archive_invalid_path") {
    return new PortabilityError("nychar_invalid_path", err.detail || err.message, err.extra);
  }
  if (code === "archive_limit_exceeded") {
    return new PortabilityError("nychar_limit_exceeded", err.detail || err.message, err.extra);
  }
  if (code === "archive_schema_invalid") {
    return new PortabilityError("nychar_schema_invalid", err.detail || err.message, err.extra);
  }
  return err;
}

function parseJsonBytes(bytes, label) {
  let text;
  try {
    text = strFromU8(bytes);
  } catch {
    throw new PortabilityError("nychar_schema_invalid", label);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new PortabilityError("nychar_schema_invalid", label);
  }
}

/**
 * Detect container/card type without trusting extension alone.
 * @param {Uint8Array|ArrayBuffer|string} input
 * @param {{ fileName?: string, mimeType?: string }} [meta]
 * @returns {"nychar"|"generic-json"|"generic-image"|"unknown"}
 */
export function detectCharacterPackage(input, meta = {}) {
  const fileName = asString(meta.fileName).toLowerCase();
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.startsWith("{")) return "generic-json";
    return "unknown";
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (!bytes.length) return "unknown";

  // ZIP local file header
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  if (isZip) {
    try {
      const entries = safeUnzip(bytes, {
        maxEntries: NYCHAR_LIMITS.maxEntries,
        maxTotalUncompressed: NYCHAR_LIMITS.maxPackageBytes,
        maxEntrySize: NYCHAR_LIMITS.maxAssetBytes,
        maxPathLength: NYCHAR_LIMITS.maxPathLength,
        maxCompressionRatio: NYCHAR_LIMITS.maxCompressionRatio,
      });
      if (entries["manifest.json"]) {
        const manifest = parseJsonBytes(entries["manifest.json"], "manifest.json");
        if (manifest?.schema === NYCHAR_MANIFEST_SCHEMA) return "nychar";
      }
    } catch {
      /* not a readable nychar */
    }
    if (fileName.endsWith(".nychar")) return "nychar";
    return "unknown";
  }

  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (isPng || isWebp || /\.(png|webp)$/i.test(fileName) || String(meta.mimeType || "").startsWith("image/")) {
    return "generic-image";
  }

  try {
    const text = strFromU8(bytes).trim();
    if (text.startsWith("{")) {
      const parsed = JSON.parse(text);
      if (parsed?.schema === NYCHAR_MANIFEST_SCHEMA) return "nychar";
      return "generic-json";
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new PortabilityError("nychar_schema_invalid", "manifest");
  }
  if (manifest.schema !== NYCHAR_MANIFEST_SCHEMA) {
    throw new PortabilityError("nychar_schema_invalid", "manifest.schema");
  }
  if (manifest.formatVersion !== NYCHAR_FORMAT_VERSION) {
    throw new PortabilityError("nychar_unsupported_version", String(manifest.formatVersion));
  }
  if (!asString(manifest.packageId) || !asString(manifest.characterId)) {
    throw new PortabilityError("nychar_schema_invalid", "manifest.ids");
  }
  if (!NYCHAR_ID_RE.test(asString(manifest.characterId))) {
    throw new PortabilityError("nychar_schema_invalid", "manifest.characterId");
  }
  if (!manifest.components || typeof manifest.components !== "object") {
    throw new PortabilityError("nychar_component_missing", "components");
  }
  for (const key of NYCHAR_REQUIRED_COMPONENTS) {
    const meta = manifest.components[key];
    const expectedPath = NYCHAR_COMPONENT_PATHS[key];
    if (!meta || meta.path !== expectedPath) {
      throw new PortabilityError("nychar_component_missing", key);
    }
    if (meta.mediaType !== "application/json" || meta.schemaVersion !== 1) {
      throw new PortabilityError("nychar_schema_invalid", key);
    }
    if (!isSha256Hex(meta.sha256) || typeof meta.size !== "number") {
      throw new PortabilityError("nychar_schema_invalid", `${key}.hash`);
    }
  }
  if (!Array.isArray(manifest.assets)) {
    throw new PortabilityError("nychar_schema_invalid", "assets");
  }
  for (const asset of manifest.assets) {
    if (!asset || !NYCHAR_ASSET_PATH_RE.test(asset.path)) {
      throw new PortabilityError("nychar_invalid_path", asset?.path || "asset");
    }
    if (!isSha256Hex(asset.sha256) || typeof asset.size !== "number" || asset.size < 1) {
      throw new PortabilityError("nychar_schema_invalid", asset.path);
    }
    if (!/^(image|audio)\//.test(String(asset.mediaType || ""))) {
      throw new PortabilityError("nychar_unsupported_media", asset.path);
    }
  }
}

function validateComponentSchemas(components) {
  const c = components.character;
  if (!c || c.schema !== NYCHAR_CHARACTER_SCHEMA || c.version !== 1) {
    throw new PortabilityError("nychar_schema_invalid", "character");
  }
  if (!asString(c.id) || !NYCHAR_ID_RE.test(c.id) || !asString(c.name) || !asString(c.persona?.description)) {
    throw new PortabilityError("nychar_schema_invalid", "character.required");
  }

  const wb = components.worldbook;
  if (!wb || wb.schema !== NYCHAR_WORLDBOOK_SCHEMA || wb.version !== 1 || !Array.isArray(wb.entries)) {
    throw new PortabilityError("nychar_schema_invalid", "worldbook");
  }

  const rel = components.relationship;
  if (
    !rel ||
    rel.schema !== NYCHAR_RELATIONSHIP_SCHEMA ||
    rel.version !== 1 ||
    rel.mode !== "initial-portable-config" ||
    !NYCHAR_RELATIONSHIP_TYPES.includes(rel.relationshipType)
  ) {
    throw new PortabilityError("nychar_schema_invalid", "relationship");
  }
  if (rel.relationshipType === "custom" && !asString(rel.customTypeLabel)) {
    throw new PortabilityError("nychar_schema_invalid", "relationship.customTypeLabel");
  }

  const appearance = components.appearance;
  if (!appearance || appearance.schema !== NYCHAR_APPEARANCE_SCHEMA || appearance.version !== 1) {
    throw new PortabilityError("nychar_schema_invalid", "appearance");
  }
  if (appearance.avatarPath && appearance.avatarPath !== "assets/avatar.png") {
    throw new PortabilityError("nychar_schema_invalid", "appearance.avatarPath");
  }
  if (appearance.portraitPath && appearance.portraitPath !== "assets/portrait.png") {
    throw new PortabilityError("nychar_schema_invalid", "appearance.portraitPath");
  }

  const actions = components.actions;
  if (!actions || actions.schema !== NYCHAR_ACTIONS_SCHEMA || actions.version !== 1 || !Array.isArray(actions.actions)) {
    throw new PortabilityError("nychar_schema_invalid", "actions");
  }

  const voice = components.voice;
  if (!voice || voice.schema !== NYCHAR_VOICE_SCHEMA || voice.version !== 1) {
    throw new PortabilityError("nychar_schema_invalid", "voice");
  }

  const skills = components.skills;
  if (
    !skills ||
    skills.schema !== NYCHAR_SKILLS_SCHEMA ||
    skills.version !== 1 ||
    skills.activation !== "manual" ||
    !Array.isArray(skills.skills)
  ) {
    throw new PortabilityError("nychar_schema_invalid", "skills");
  }
}

function assertAssetReferences(components, assetPaths) {
  const pathSet = new Set(assetPaths);
  const refs = [];
  if (components.appearance?.avatarPath) refs.push(components.appearance.avatarPath);
  if (components.appearance?.portraitPath) refs.push(components.appearance.portraitPath);
  for (const p of components.appearance?.pet?.assetPaths || []) refs.push(p);
  for (const a of components.actions?.actions || []) {
    if (a?.assetPath) refs.push(a.assetPath);
  }
  for (const p of components.voice?.samplePaths || []) refs.push(p);
  for (const ref of refs) {
    if (!pathSet.has(ref)) {
      throw new PortabilityError("nychar_reference_missing", ref);
    }
  }
}

function bytesToDataUrl(bytes, mediaType) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

/**
 * Map validated .nychar components into a staged Nyra character + lossy report.
 * @param {object} components
 * @param {Record<string, Uint8Array>} assets
 * @param {object} manifest
 */
export function mapNycharToCharacter(components, assets = {}, manifest = {}) {
  const lossy = emptyLossy();
  const c = components.character;
  let avatar = "";
  const avatarBytes = assets["assets/avatar.png"];
  if (avatarBytes?.length) {
    avatar = bytesToDataUrl(avatarBytes, "image/png");
  } else if (components.appearance?.avatarPath) {
    lossy.unresolved.push("assets/avatar.png");
  }

  if (components.worldbook?.entries?.length) {
    lossy.transformed.push("worldbook.entries previewed but not auto-linked into lore store");
  }
  if (components.relationship) {
    lossy.transformed.push("relationship kept as initial-portable-config only (not live relationship state)");
  }
  if (components.actions?.actions?.length) {
    lossy.unsupported.push("actions (declarative cues not applied to runtime pet)");
  }
  if (components.voice && (components.voice.displayName || components.voice.samplePaths?.length)) {
    lossy.unsupported.push("voice presentation metadata");
  }
  if (components.skills?.skills?.length) {
    lossy.unsupported.push("skills descriptors (manual activation metadata only)");
  }
  if (c.prompts?.system || c.prompts?.developer) {
    lossy.transformed.push("character.prompts mapped into profile prompt fields as untrusted persona text");
  }
  if (Array.isArray(c.greetings) && c.greetings.length) {
    lossy.transformed.push("greetings not stored on character record; available in preview.components");
  }
  for (const [path] of Object.entries(assets)) {
    if (path !== "assets/avatar.png") {
      lossy.unsupported.push(`asset:${path}`);
    }
  }

  const parsed = {
    name: asString(c.name),
    alias: asString(c.alias) || asString(c.name),
    identity: asString(c.identity) || "",
    description: asString(c.persona?.description) || "待补充人设",
    personality: asString(c.persona?.personality) || undefined,
    scenario: asString(c.persona?.scenario) || undefined,
    firstMessage: Array.isArray(c.greetings) && c.greetings[0] ? asString(c.greetings[0]) : undefined,
    tags: Array.isArray(c.tags) ? c.tags.map((t) => asString(t)).filter(Boolean) : [],
    avatar: avatar || undefined,
    rawVersion: "nychar",
  };

  const character = mapParsedCardToCharacter(parsed, { id: createCharacterId() });
  if (c.prompts?.system) character.profile.promptSystem = asString(c.prompts.system);
  if (c.prompts?.developer) character.profile.promptDeveloper = asString(c.prompts.developer);
  if (asString(c.persona?.scenario) && !String(character.profile.fields[4] || "").includes(c.persona.scenario)) {
    character.profile.fields[4] = [character.profile.fields[4], asString(c.persona.scenario)]
      .filter(Boolean)
      .join("\n\n");
  }

  return {
    character,
    components,
    assets,
    manifest,
    lossy,
    preview: {
      name: character.name,
      alias: character.alias,
      identity: character.profile.fields[2] || "",
      description: character.profile.fields[4] || "",
      tags: character.profile.tokens || [],
      avatarUrl: character.avatarUrl || "",
      worldbookEntryCount: components.worldbook?.entries?.length || 0,
      relationshipType: components.relationship?.relationshipType || "companion",
      actionCount: components.actions?.actions?.length || 0,
      skillCount: components.skills?.skills?.length || 0,
      assetCount: Object.keys(assets).length,
      packageCharacterId: asString(manifest.characterId) || c.id,
    },
  };
}

/**
 * Validate and stage a .nychar package (no writes).
 * @param {Uint8Array|ArrayBuffer} bytes
 */
export async function parseNycharPackage(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!raw.length || raw.length > NYCHAR_LIMITS.maxPackageBytes) {
    throw new PortabilityError("nychar_limit_exceeded", "package");
  }

  let entries;
  try {
    entries = safeUnzip(raw, {
      maxEntries: NYCHAR_LIMITS.maxEntries,
      maxTotalUncompressed: NYCHAR_LIMITS.maxPackageBytes,
      maxEntrySize: Math.max(NYCHAR_LIMITS.maxAssetBytes, NYCHAR_LIMITS.maxComponentJsonBytes),
      maxPathLength: NYCHAR_LIMITS.maxPathLength,
      maxCompressionRatio: NYCHAR_LIMITS.maxCompressionRatio,
    });
  } catch (err) {
    throw remapZipError(err);
  }

  if (!entries["manifest.json"]) {
    throw new PortabilityError("nychar_component_missing", "manifest.json");
  }

  const manifest = parseJsonBytes(entries["manifest.json"], "manifest.json");
  validateManifestShape(manifest);

  /** @type {Record<string, object>} */
  const components = {};
  for (const key of NYCHAR_REQUIRED_COMPONENTS) {
    const path = NYCHAR_COMPONENT_PATHS[key];
    const data = entries[path];
    if (!data) throw new PortabilityError("nychar_component_missing", path);
    if (data.length > NYCHAR_LIMITS.maxComponentJsonBytes) {
      throw new PortabilityError("nychar_limit_exceeded", path);
    }
    const digest = await sha256Hex(data);
    const meta = manifest.components[key];
    if (digest !== meta.sha256 || data.length !== meta.size) {
      throw new PortabilityError("nychar_checksum_mismatch", path);
    }
    components[key] = parseJsonBytes(data, path);
  }

  validateComponentSchemas(components);
  assertNycharPrivacy(components);

  if (asString(components.character.id) !== asString(manifest.characterId)) {
    throw new PortabilityError("nychar_schema_invalid", "characterId_mismatch");
  }

  /** @type {Record<string, Uint8Array>} */
  const assets = {};
  const listed = new Set(manifest.assets.map((a) => a.path));
  for (const asset of manifest.assets) {
    const data = entries[asset.path];
    if (!data) throw new PortabilityError("nychar_reference_missing", asset.path);
    if (data.length !== asset.size || (await sha256Hex(data)) !== asset.sha256) {
      throw new PortabilityError("nychar_checksum_mismatch", asset.path);
    }
    assets[asset.path] = data;
  }

  // Undeclared non-manifest files are forbidden
  for (const path of Object.keys(entries)) {
    if (path === "manifest.json") continue;
    const isComponent = Object.values(NYCHAR_COMPONENT_PATHS).includes(path);
    if (!isComponent && !listed.has(path)) {
      throw new PortabilityError("nychar_invalid_path", `undeclared:${path}`);
    }
  }

  assertAssetReferences(components, Object.keys(assets));

  // Executable / script sniff in asset bytes (lightweight)
  for (const [path, data] of Object.entries(assets)) {
    if (data[0] === 0x4d && data[1] === 0x5a) {
      throw new PortabilityError("nychar_forbidden_executable", path);
    }
    if (data[0] === 0x7f && data[1] === 0x45 && data[2] === 0x4c && data[3] === 0x46) {
      throw new PortabilityError("nychar_forbidden_executable", path);
    }
  }

  return mapNycharToCharacter(components, assets, manifest);
}

/**
 * Parse a generic open card (JSON text or image bytes) into the same preview shape.
 * @param {string|Uint8Array|ArrayBuffer} input
 * @param {{ fileName?: string }} [meta]
 */
export function parseGenericCharacterCard(input, meta = {}) {
  let text = "";
  if (typeof input === "string") {
    text = input;
  } else {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    text = extractJsonFromImage(bytes) || "";
    if (!text) {
      try {
        text = strFromU8(bytes);
      } catch {
        text = "";
      }
    }
  }
  if (!asString(text)) {
    throw new PortabilityError("card_embedded_json_missing", meta.fileName || "");
  }

  let parsed;
  try {
    parsed = parseJsonCharacterCard(text, { fileName: meta.fileName });
  } catch (err) {
    throw new PortabilityError("card_json_invalid", err?.message || "invalid");
  }

  const validation = validateParsedCard(parsed);
  const lossy = emptyLossy();
  for (const w of validation.warnings || []) lossy.transformed.push(w);
  if (parsed.extensions) lossy.unsupported.push("extensions");
  if (parsed.rawVersion === "unknown") lossy.transformed.push("unrecognized_card_version");

  if (!validation.ok) {
    const err = new PortabilityError("card_json_invalid", validation.errors[0] || "persona_missing");
    err.extra = { validation, lossy };
    throw err;
  }

  const character = mapParsedCardToCharacter(parsed);
  return {
    kind: "generic",
    character,
    parsed,
    validation,
    lossy,
    components: null,
    assets: {},
    manifest: null,
    preview: {
      name: character.name,
      alias: character.alias,
      identity: character.profile.fields[2] || "",
      description: character.profile.fields[4] || "",
      tags: character.profile.tokens || [],
      avatarUrl: character.avatarUrl || "",
      worldbookEntryCount: 0,
      relationshipType: "",
      actionCount: 0,
      skillCount: 0,
      assetCount: 0,
      packageCharacterId: "",
    },
  };
}

/**
 * Unified detect + parse entry point.
 * @param {Uint8Array|ArrayBuffer|string} input
 * @param {{ fileName?: string, mimeType?: string }} [meta]
 */
export async function prepareCharacterImport(input, meta = {}) {
  const kind = detectCharacterPackage(input, meta);
  if (kind === "nychar") {
    const staged = await parseNycharPackage(input);
    return { kind: "nychar", ...staged };
  }
  if (kind === "generic-json" || kind === "generic-image") {
    return parseGenericCharacterCard(input, meta);
  }
  // Fallback: try generic JSON text / image extract before failing
  try {
    return parseGenericCharacterCard(input, meta);
  } catch {
    throw new PortabilityError("nychar_schema_invalid", "unrecognized_package");
  }
}

/**
 * Install a staged import. Creates a new character by default (no implicit overwrite/activate).
 * @param {object} staged result of prepareCharacterImport / parseNycharPackage
 * @param {{
 *   upsertCharacter: (partial: object) => Promise<object>,
 *   overwriteId?: string,
 * }} deps
 */
export async function installCharacterImport(staged, deps) {
  if (!deps?.upsertCharacter) {
    throw new PortabilityError("nychar_schema_invalid", "upsertCharacter_required");
  }
  const base = staged?.character;
  if (!base) throw new PortabilityError("nychar_schema_invalid", "character_missing");
  const id = asString(deps.overwriteId) || createCharacterId();
  const toSave = {
    ...base,
    id,
    source: "import",
  };
  return deps.upsertCharacter(toSave);
}
