/**
 * Open, validate, and preview a .nyra archive (or legacy input via legacy bridge).
 */

import { openNyraArchive, looksLikeNyraEnvelope } from "../crypto.js";
import { sha256Hex, isSha256Hex } from "../hash.js";
import { safeUnzip, strFromU8, assertSafeArchivePath } from "../zip-safe.js";
import { PortabilityError } from "../errors.js";
import {
  NYRA_ARCHIVE_VERSION,
  NYRA_LIMITS,
  NYRA_MANIFEST_SCHEMA,
  FORBIDDEN_RESTORE_TOP_KEYS,
  SERVER_AUTHORITATIVE_DENYLIST,
} from "./constants.js";

/**
 * @param {Uint8Array} sealedBytes
 * @param {{ passphrase?: string }} [opts]
 */
export async function parseNyraArchive(sealedBytes, opts = {}) {
  const sealed = sealedBytes instanceof Uint8Array ? sealedBytes : new Uint8Array(sealedBytes || []);
  if (sealed.length > NYRA_LIMITS.maxCiphertextBytes) {
    throw new PortabilityError("archive_limit_exceeded", "ciphertext");
  }
  if (!looksLikeNyraEnvelope(sealed)) {
    throw new PortabilityError("archive_schema_invalid", "not_nyra_envelope");
  }

  const zipBytes = await openNyraArchive(sealed, { passphrase: opts.passphrase ?? "" });
  const files = safeUnzip(zipBytes, {
    maxEntries: NYRA_LIMITS.maxEntries,
    maxEntrySize: NYRA_LIMITS.maxEntryBytes,
    maxTotalUncompressed: NYRA_LIMITS.maxCiphertextBytes,
    maxPathLength: NYRA_LIMITS.maxPathLength,
    maxCompressionRatio: NYRA_LIMITS.maxCompressionRatio,
  });

  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) throw new PortabilityError("archive_schema_invalid", "missing_manifest");
  if (manifestRaw.length > NYRA_LIMITS.maxManifestBytes) {
    throw new PortabilityError("archive_limit_exceeded", "manifest");
  }

  let manifest;
  try {
    manifest = JSON.parse(strFromU8(manifestRaw));
  } catch {
    throw new PortabilityError("archive_schema_invalid", "manifest_json");
  }

  validateManifest(manifest);

  const declared = new Map();
  for (const entry of manifest.entries) {
    assertSafeArchivePath(entry.path, { maxPathLength: NYRA_LIMITS.maxPathLength });
    if (declared.has(entry.path)) {
      throw new PortabilityError("archive_invalid_path", `duplicate_entry:${entry.path}`);
    }
    declared.set(entry.path, entry);
  }

  const filePaths = Object.keys(files).filter((p) => p !== "manifest.json");
  for (const path of filePaths) {
    if (!declared.has(path)) {
      throw new PortabilityError("archive_schema_invalid", `undeclared:${path}`);
    }
  }
  for (const [path, entry] of declared) {
    const bytes = files[path];
    if (!bytes) {
      if (entry.required !== false) {
        throw new PortabilityError("archive_checksum_mismatch", `missing:${path}`);
      }
      continue;
    }
    if (bytes.length !== entry.size) {
      throw new PortabilityError("archive_checksum_mismatch", `size:${path}`);
    }
    const digest = await sha256Hex(bytes);
    if (digest !== entry.sha256) {
      throw new PortabilityError("archive_checksum_mismatch", path);
    }
  }

  const userData = readJsonFile(files, "data/user-data.json", true);
  const settings = readJsonFile(files, "data/settings.json", false) || {};
  const warnings = [];
  const stripped = stripForbidden(userData, warnings);
  const characters = {};
  for (const path of filePaths) {
    if (!path.startsWith("entities/characters/") || !path.endsWith(".json")) continue;
    const id = path.slice("entities/characters/".length, -".json".length);
    characters[id] = readJsonFile(files, path, true);
  }

  const resources = await collectResources(files, declared);

  return {
    kind: "nyra",
    version: manifest.version,
    manifest,
    userData: stripped,
    settings,
    characters,
    resources,
    files,
    warnings,
    preview: buildPreview(manifest, stripped, settings, characters, resources, warnings),
  };
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new PortabilityError("archive_schema_invalid", "manifest");
  }
  if (manifest.schema !== NYRA_MANIFEST_SCHEMA) {
    throw new PortabilityError("archive_schema_invalid", "schema");
  }
  if (Number(manifest.version) !== NYRA_ARCHIVE_VERSION) {
    if (Number(manifest.version) > NYRA_ARCHIVE_VERSION) {
      throw new PortabilityError("archive_unsupported_version");
    }
    throw new PortabilityError("archive_schema_invalid", "version");
  }
  if (!manifest.archiveId || !manifest.createdAt || !manifest.producer) {
    throw new PortabilityError("archive_schema_invalid", "required_fields");
  }
  if (!Array.isArray(manifest.entries) || !manifest.entries.length) {
    throw new PortabilityError("archive_schema_invalid", "entries");
  }
  if (manifest.restore?.strategy !== "staged-atomic") {
    throw new PortabilityError("archive_incompatible", "restore_strategy");
  }
  for (const entry of manifest.entries) {
    if (!entry?.path || !entry.category || !entry.mediaType) {
      throw new PortabilityError("archive_schema_invalid", "entry");
    }
    if (!isSha256Hex(entry.sha256)) {
      throw new PortabilityError("archive_schema_invalid", "entry_sha256");
    }
    if (!Number.isInteger(entry.size) || entry.size < 0) {
      throw new PortabilityError("archive_schema_invalid", "entry_size");
    }
  }
}

function readJsonFile(files, path, required) {
  const raw = files[path];
  if (!raw) {
    if (required) throw new PortabilityError("archive_schema_invalid", `missing:${path}`);
    return null;
  }
  try {
    return JSON.parse(strFromU8(raw));
  } catch {
    throw new PortabilityError("archive_schema_invalid", `json:${path}`);
  }
}

function stripForbidden(userData, warnings) {
  if (!userData || typeof userData !== "object") return {};
  const next = structuredClone(userData);
  for (const key of FORBIDDEN_RESTORE_TOP_KEYS) {
    if (key in next) {
      delete next[key];
      warnings.push({ code: "server_authoritative_stripped", field: key });
    }
  }
  scrubDeniedKeys(next, warnings);
  if (next.ecosystem) next.ecosystem = { ...next.ecosystem, token: "" };
  if (next.profile?.provider) {
    delete next.profile.provider;
    warnings.push({ code: "secret_stripped", field: "profile.provider" });
  }
  if (next.settings?.voice) {
    delete next.settings.voice.ttsApiKey;
    delete next.settings.voice.sttApiKey;
  }
  if (next.gatePrefs?.gateSessionToken) {
    next.gatePrefs.gateSessionToken = "";
    warnings.push({ code: "secret_stripped", field: "gatePrefs.gateSessionToken" });
  }
  return next;
}

function scrubDeniedKeys(value, warnings, path = "") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) scrubDeniedKeys(value[i], warnings, `${path}[${i}]`);
    return;
  }
  for (const key of Object.keys(value)) {
    const full = path ? `${path}.${key}` : key;
    if (SERVER_AUTHORITATIVE_DENYLIST.some((d) => d.toLowerCase() === key.toLowerCase())) {
      delete value[key];
      warnings.push({ code: "server_authoritative_stripped", field: full });
      continue;
    }
    scrubDeniedKeys(value[key], warnings, full);
  }
}

async function collectResources(files, declared) {
  const resources = [];
  for (const [path, entry] of declared) {
    if (entry.category !== "resource-original") continue;
    const match = path.match(/^resources\/([a-f0-9]{64})\/original$/);
    if (!match) continue;
    const digest = match[1];
    const metaPath = `resources/${digest}/metadata.json`;
    const metadata = readJsonFile(files, metaPath, false);
    resources.push({
      sha256: digest,
      bytes: files[path],
      metadata,
      mediaType: entry.mediaType,
      size: entry.size,
    });
  }
  return resources;
}

function buildPreview(manifest, userData, settings, characters, resources, warnings) {
  const characterCount = Object.keys(characters || {}).length
    || (Array.isArray(userData.characters) ? userData.characters.length : 0);
  const messages = countMessages(userData);
  const memories = Array.isArray(userData.memories) ? userData.memories.length : 0;
  const books = Array.isArray(userData.library?.books) ? userData.library.books.length : 0;
  const tracks = Array.isArray(userData.library?.tracks)
    ? userData.library.tracks.length
    : (Array.isArray(userData.library?.playlist) ? userData.library.playlist.length : 0);

  return {
    archiveId: manifest.archiveId,
    createdAt: manifest.createdAt,
    appVersion: manifest.producer?.version || "",
    producer: manifest.producer?.name || "Nyra",
    characterCount,
    messageCount: messages,
    memoryCount: memories,
    mediaCount: resources.length,
    bookCount: books,
    musicCount: tracks,
    hasSettings: Boolean(settings && Object.keys(settings).length),
    warnings: warnings.map((w) => w.code),
    technical: {
      archiveVersion: manifest.version,
      entryCount: manifest.entries.length,
      minimumAppVersion: manifest.restore?.minimumAppVersion || "",
      warningDetails: warnings,
    },
  };
}

function countMessages(userData) {
  if (Array.isArray(userData.messages)) return userData.messages.length;
  const bag = userData.conversationV2;
  if (!bag || typeof bag !== "object") return 0;
  let n = 0;
  const sessions = bag.sessions || bag.byId || bag;
  if (sessions && typeof sessions === "object") {
    for (const session of Object.values(sessions)) {
      if (Array.isArray(session?.messages)) n += session.messages.length;
      else if (Array.isArray(session?.turns)) n += session.turns.length;
    }
  }
  return n;
}

export { looksLikeNyraEnvelope };
