/**
 * Build a conforming .nychar ZIP from a Nyra character record.
 * Never includes private user history (conversations, memories, relationship timeline, billing, auth).
 */

import { APP_VERSION } from "../../constants.js";
import { PortabilityError } from "../errors.js";
import { sha256Hex } from "../hash.js";
import { safeZip, strToU8 } from "../zip-safe.js";
import { assertNycharPrivacy } from "./privacy.js";
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
  NYCHAR_MIME,
  NYCHAR_RELATIONSHIP_SCHEMA,
  NYCHAR_RELATIONSHIP_TYPES,
  NYCHAR_SKILLS_SCHEMA,
  NYCHAR_VOICE_SCHEMA,
  NYCHAR_WORLDBOOK_SCHEMA,
} from "./constants.js";

function uuidV4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function asString(value) {
  return value == null ? "" : String(value).trim();
}

function sanitizeCharacterId(raw, fallback = "character") {
  const id = asString(raw).replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "");
  if (id && NYCHAR_ID_RE.test(id) && id.length <= 96) return id;
  const fb = asString(fallback).replace(/[^A-Za-z0-9._-]/g, "-") || "character";
  return fb.slice(0, 96);
}

function guessMediaType(path) {
  const lower = String(path || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  return "application/octet-stream";
}

/**
 * Decode data: URL avatar into PNG bytes when possible.
 * @param {string} dataUrl
 * @returns {{ bytes: Uint8Array, mediaType: string } | null}
 */
export function decodeDataUrlAsset(dataUrl) {
  const raw = asString(dataUrl);
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;
  const mediaType = match[1].toLowerCase();
  try {
    const bin = atob(match[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    if (!bytes.length) return null;
    return { bytes, mediaType };
  } catch {
    return null;
  }
}

/**
 * Build portable component JSON objects from a local character + optional extras.
 * @param {object} character
 * @param {{
 *   worldbook?: object,
 *   relationship?: object,
 *   appearance?: object,
 *   actions?: object,
 *   voice?: object,
 *   skills?: object,
 *   greetings?: string[],
 *   creator?: object,
 * }} [options]
 */
export function buildNycharComponents(character, options = {}) {
  const profile = character?.profile && typeof character.profile === "object" ? character.profile : {};
  const fields = Array.isArray(profile.fields) ? profile.fields : [];
  const name = asString(character?.name) || asString(fields[0]) || "未命名";
  const alias = asString(character?.alias) || asString(fields[1]) || name;
  const identity = asString(fields[2]) || undefined;
  const description = asString(fields[4]) || asString(character?.description) || "待补充人设";
  const tags = Array.isArray(profile.tokens)
    ? profile.tokens.map((t) => asString(t)).filter(Boolean).slice(0, 64)
    : [];

  const prompts = {};
  if (asString(profile.promptSystem)) prompts.system = asString(profile.promptSystem);
  if (asString(profile.promptDeveloper)) prompts.developer = asString(profile.promptDeveloper);

  const greetings = Array.isArray(options.greetings)
    ? options.greetings.map((g) => asString(g)).filter(Boolean).slice(0, 32)
    : [];

  /** @type {object} */
  const characterJson = {
    schema: NYCHAR_CHARACTER_SCHEMA,
    version: 1,
    id: sanitizeCharacterId(character?.id, name),
    name: name.slice(0, 120),
    persona: {
      description: description.slice(0, 100000),
    },
  };
  if (alias) characterJson.alias = alias.slice(0, 120);
  if (identity) characterJson.identity = identity.slice(0, 500);
  if (Object.keys(prompts).length) characterJson.prompts = prompts;
  if (greetings.length) characterJson.greetings = greetings;
  if (tags.length) characterJson.tags = [...new Set(tags)];
  if (options.creator && typeof options.creator === "object") {
    characterJson.creator = options.creator;
  }

  const worldbook = options.worldbook && typeof options.worldbook === "object"
    ? options.worldbook
    : {
        schema: NYCHAR_WORLDBOOK_SCHEMA,
        version: 1,
        entries: [],
      };
  if (!worldbook.schema) worldbook.schema = NYCHAR_WORLDBOOK_SCHEMA;
  if (worldbook.version == null) worldbook.version = 1;
  if (!Array.isArray(worldbook.entries)) worldbook.entries = [];

  const relType = asString(options.relationship?.relationshipType) || "companion";
  const relationship = {
    schema: NYCHAR_RELATIONSHIP_SCHEMA,
    version: 1,
    mode: "initial-portable-config",
    relationshipType: NYCHAR_RELATIONSHIP_TYPES.includes(relType) ? relType : "companion",
  };
  if (options.relationship && typeof options.relationship === "object") {
    const src = options.relationship;
    if (relationship.relationshipType === "custom" && asString(src.customTypeLabel)) {
      relationship.customTypeLabel = asString(src.customTypeLabel).slice(0, 80);
    }
    if (asString(src.communicationStyle)) {
      relationship.communicationStyle = asString(src.communicationStyle).slice(0, 2000);
    }
    if (src.addressPreferences && typeof src.addressPreferences === "object") {
      relationship.addressPreferences = {};
      if (Array.isArray(src.addressPreferences.characterTerms)) {
        relationship.addressPreferences.characterTerms = [
          ...new Set(src.addressPreferences.characterTerms.map((t) => asString(t)).filter(Boolean)),
        ].slice(0, 16);
      }
      if (Array.isArray(src.addressPreferences.genericUserTerms)) {
        relationship.addressPreferences.genericUserTerms = [
          ...new Set(src.addressPreferences.genericUserTerms.map((t) => asString(t)).filter(Boolean)),
        ].slice(0, 16);
      }
    }
    if (Array.isArray(src.boundaries)) {
      relationship.boundaries = [
        ...new Set(src.boundaries.map((b) => asString(b)).filter(Boolean)),
      ].slice(0, 64);
    }
  }

  const appearance = {
    schema: NYCHAR_APPEARANCE_SCHEMA,
    version: 1,
  };
  if (options.appearance && typeof options.appearance === "object") {
    const src = options.appearance;
    if (asString(src.description)) appearance.description = asString(src.description).slice(0, 10000);
    if (src.avatarPath === "assets/avatar.png") appearance.avatarPath = "assets/avatar.png";
    if (src.portraitPath === "assets/portrait.png") appearance.portraitPath = "assets/portrait.png";
    if (src.pet && typeof src.pet === "object") appearance.pet = src.pet;
    if (Array.isArray(src.styleTags)) {
      appearance.styleTags = [
        ...new Set(src.styleTags.map((t) => asString(t)).filter(Boolean)),
      ].slice(0, 64);
    }
  }

  const actions = options.actions && typeof options.actions === "object"
    ? options.actions
    : { schema: NYCHAR_ACTIONS_SCHEMA, version: 1, actions: [] };
  if (!actions.schema) actions.schema = NYCHAR_ACTIONS_SCHEMA;
  if (actions.version == null) actions.version = 1;
  if (!Array.isArray(actions.actions)) actions.actions = [];

  const voice = options.voice && typeof options.voice === "object"
    ? options.voice
    : { schema: NYCHAR_VOICE_SCHEMA, version: 1 };
  if (!voice.schema) voice.schema = NYCHAR_VOICE_SCHEMA;
  if (voice.version == null) voice.version = 1;

  const skills = options.skills && typeof options.skills === "object"
    ? options.skills
    : { schema: NYCHAR_SKILLS_SCHEMA, version: 1, activation: "manual", skills: [] };
  if (!skills.schema) skills.schema = NYCHAR_SKILLS_SCHEMA;
  if (skills.version == null) skills.version = 1;
  if (skills.activation !== "manual") skills.activation = "manual";
  if (!Array.isArray(skills.skills)) skills.skills = [];

  return {
    character: characterJson,
    worldbook,
    relationship,
    appearance,
    actions,
    voice,
    skills,
  };
}

/**
 * @param {object} character local character record
 * @param {{
 *   assets?: Record<string, Uint8Array>,
 *   worldbook?: object,
 *   relationship?: object,
 *   appearance?: object,
 *   actions?: object,
 *   voice?: object,
 *   skills?: object,
 *   greetings?: string[],
 *   creator?: object,
 *   packageId?: string,
 *   producer?: { name?: string, version?: string },
 *   createdAt?: string,
 * }} [options]
 */
export async function buildNycharPackage(character, options = {}) {
  if (!character || typeof character !== "object") {
    throw new PortabilityError("nychar_schema_invalid", "character_required");
  }

  const components = buildNycharComponents(character, options);
  assertNycharPrivacy(components);

  /** @type {Record<string, Uint8Array>} */
  const files = {};
  /** @type {Record<string, { path: string, mediaType: string, size: number, sha256: string, schemaVersion: number }>} */
  const componentMeta = {};

  for (const [key, path] of Object.entries(NYCHAR_COMPONENT_PATHS)) {
    const json = components[key];
    const bytes = strToU8(JSON.stringify(json));
    if (bytes.length > NYCHAR_LIMITS.maxComponentJsonBytes) {
      throw new PortabilityError("nychar_limit_exceeded", path);
    }
    if (bytes.length < 2) {
      throw new PortabilityError("nychar_schema_invalid", path);
    }
    files[path] = bytes;
    componentMeta[key] = {
      path,
      mediaType: "application/json",
      size: bytes.length,
      sha256: await sha256Hex(bytes),
      schemaVersion: 1,
    };
  }

  /** @type {Array<{ path: string, mediaType: string, size: number, sha256: string }>} */
  const assetEntries = [];
  const assetMap = { ...(options.assets || {}) };

  // Auto-pack data: PNG avatar when caller did not supply assets/avatar.png
  if (!assetMap["assets/avatar.png"] && asString(character.avatarUrl).startsWith("data:")) {
    const decoded = decodeDataUrlAsset(character.avatarUrl);
    if (decoded?.mediaType === "image/png" && decoded.bytes.length) {
      assetMap["assets/avatar.png"] = decoded.bytes;
      if (!components.appearance.avatarPath) {
        components.appearance.avatarPath = "assets/avatar.png";
        const appearanceBytes = strToU8(JSON.stringify(components.appearance));
        files["appearance.json"] = appearanceBytes;
        componentMeta.appearance = {
          path: "appearance.json",
          mediaType: "application/json",
          size: appearanceBytes.length,
          sha256: await sha256Hex(appearanceBytes),
          schemaVersion: 1,
        };
      }
    }
  }

  for (const [path, bytes] of Object.entries(assetMap)) {
    if (!NYCHAR_ASSET_PATH_RE.test(path)) {
      throw new PortabilityError("nychar_invalid_path", path);
    }
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!data.length) continue;
    if (data.length > NYCHAR_LIMITS.maxAssetBytes) {
      throw new PortabilityError("nychar_limit_exceeded", path);
    }
    const mediaType = guessMediaType(path);
    if (!/^(image|audio)\//.test(mediaType)) {
      throw new PortabilityError("nychar_unsupported_media", path);
    }
    files[path] = data;
    assetEntries.push({
      path,
      mediaType,
      size: data.length,
      sha256: await sha256Hex(data),
    });
  }

  if (assetEntries.some((a) => a.path === "assets/avatar.png") && !components.appearance.avatarPath) {
    components.appearance.avatarPath = "assets/avatar.png";
    const appearanceBytes = strToU8(JSON.stringify(components.appearance));
    files["appearance.json"] = appearanceBytes;
    componentMeta.appearance = {
      path: "appearance.json",
      mediaType: "application/json",
      size: appearanceBytes.length,
      sha256: await sha256Hex(appearanceBytes),
      schemaVersion: 1,
    };
  }

  const entryCount = Object.keys(files).length + 1; // + manifest
  if (entryCount > NYCHAR_LIMITS.maxEntries) {
    throw new PortabilityError("nychar_limit_exceeded", "entries");
  }

  const manifest = {
    schema: NYCHAR_MANIFEST_SCHEMA,
    formatVersion: NYCHAR_FORMAT_VERSION,
    packageId: options.packageId || uuidV4(),
    characterId: components.character.id,
    createdAt: options.createdAt || new Date().toISOString(),
    producer: {
      name: asString(options.producer?.name) || "Nyra",
      version: asString(options.producer?.version) || APP_VERSION,
    },
    components: componentMeta,
    assets: assetEntries,
  };

  assertNycharPrivacy(manifest);
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  files["manifest.json"] = manifestBytes;

  const zipBytes = safeZip(files, 6);
  if (zipBytes.length > NYCHAR_LIMITS.maxPackageBytes) {
    throw new PortabilityError("nychar_limit_exceeded", "package");
  }

  return {
    bytes: zipBytes,
    manifest,
    components,
    mimeType: NYCHAR_MIME,
    fileName: `${components.character.id}.nychar`,
  };
}
