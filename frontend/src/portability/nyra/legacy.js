/**
 * Legacy backup detection + migration into the .nyra import staging shape.
 * Old formats remain readable; new exports must not write them.
 */

import { unzipSync, strFromU8 } from "fflate";
import { looksLikeNyraEnvelope } from "../crypto.js";
import { PortabilityError } from "../errors.js";
import { scrubExportPayload } from "../../memory/privacy.js";
import { SYNC_PAYLOAD_VERSION } from "../../constants.js";
import {
  FORBIDDEN_RESTORE_TOP_KEYS,
  SERVER_AUTHORITATIVE_DENYLIST,
} from "./constants.js";

/**
 * @param {Uint8Array|ArrayBuffer|string|object} input
 * @param {{ fileName?: string }} [opts]
 */
export function detectLegacyBackup(input, opts = {}) {
  const fileName = String(opts.fileName || "").toLowerCase();

  if (input && typeof input === "object" && !(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) {
    if (input.schema === "yueqi-companion-export") {
      return { kind: "legacy-json", version: Number(input.version) || 1 };
    }
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed?.schema === "yueqi-companion-export") {
        return { kind: "legacy-json", version: Number(parsed.version) || 1 };
      }
    } catch {
      /* fall through */
    }
  }

  const bytes = toBytes(input);
  if (!bytes) return { kind: "unknown" };
  if (looksLikeNyraEnvelope(bytes)) return { kind: "nyra", version: 1 };

  // ZIP PK\x03\x04
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const entries = unzipSync(bytes);
      if (entries["backup.json"]) return { kind: "legacy-zip", version: null };
      if (entries["manifest.json"] && entries["persona.json"]) {
        return { kind: "character-pack-zip", version: null };
      }
      if (fileName.endsWith(".nychar") || entries["character.json"]) {
        return { kind: "nychar-or-character-zip", version: null };
      }
      return { kind: "zip-unknown", version: null };
    } catch {
      return { kind: "zip-invalid", version: null };
    }
  }

  // JSON text bytes
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    if (parsed?.schema === "yueqi-companion-export") {
      return { kind: "legacy-json", version: Number(parsed.version) || 1 };
    }
    if (parsed?.name || parsed?.data || parsed?.spec) {
      return { kind: "generic-character-card", version: parsed.spec_version || parsed.spec || "unknown" };
    }
  } catch {
    /* ignore */
  }

  return { kind: "unknown" };
}

/**
 * Convert legacy JSON / full ZIP into a staged import package compatible with commitNyraImport.
 * @param {Uint8Array|object|string} input
 * @param {{ fileName?: string }} [opts]
 */
export function migrateLegacyBackup(input, opts = {}) {
  const detected = detectLegacyBackup(input, opts);
  const warnings = [];

  if (detected.kind === "nyra") {
    throw new PortabilityError("archive_schema_invalid", "use_parseNyraArchive");
  }

  let payload = null;
  /** @type {Array<{ id: string, bytes: Uint8Array, type: string, name: string, kind: string, createdAt: string }>} */
  const media = [];

  if (detected.kind === "legacy-json") {
    payload = typeof input === "string" ? JSON.parse(input) : (input instanceof Uint8Array
      ? JSON.parse(new TextDecoder().decode(input))
      : structuredClone(input));
  } else if (detected.kind === "legacy-zip") {
    const bytes = toBytes(input);
    const entries = unzipSync(bytes);
    const raw = entries["backup.json"];
    if (!raw) throw new PortabilityError("archive_schema_invalid", "missing_backup_json");
    payload = JSON.parse(strFromU8(raw));
    const manifest = Array.isArray(payload.mediaManifest) ? payload.mediaManifest : [];
    for (const item of manifest) {
      const id = String(item.id || "").trim();
      if (!id || id.includes("..") || id.includes("/")) {
        warnings.push({ code: "media_skipped_unsafe_id", field: id });
        continue;
      }
      const fileBytes = entries[`media/${id}`];
      if (!fileBytes?.length) {
        warnings.push({ code: "media_missing", field: id });
        continue;
      }
      media.push({
        id,
        bytes: fileBytes,
        type: item.type || "application/octet-stream",
        name: item.name || id,
        kind: item.kind || "file",
        createdAt: item.createdAt || new Date().toISOString(),
      });
    }
  } else {
    throw new PortabilityError("archive_incompatible", detected.kind);
  }

  if (!payload || payload.schema !== "yueqi-companion-export") {
    throw new PortabilityError("archive_schema_invalid", "legacy_schema");
  }
  if (payload.version != null && Number(payload.version) > SYNC_PAYLOAD_VERSION) {
    throw new PortabilityError("archive_unsupported_version");
  }

  payload = scrubExportPayload(payload);
  stripServerFields(payload, warnings);

  const characters = {};
  for (const character of payload.characters || []) {
    if (character?.id) characters[character.id] = character;
  }

  const preview = {
    archiveId: `legacy-${Date.now()}`,
    createdAt: payload.exportedAt || new Date().toISOString(),
    appVersion: payload.appVersion || "",
    producer: "legacy-migrator",
    characterCount: Object.keys(characters).length,
    messageCount: Array.isArray(payload.messages) ? payload.messages.length : 0,
    memoryCount: Array.isArray(payload.memories) ? payload.memories.length : 0,
    mediaCount: media.length || (payload.mediaManifest?.length || 0),
    bookCount: Array.isArray(payload.library?.books) ? payload.library.books.length : 0,
    musicCount: Array.isArray(payload.library?.tracks) ? payload.library.tracks.length : 0,
    hasSettings: Boolean(payload.settings),
    warnings: [...warnings.map((w) => w.code), "legacy_format_migrated"],
    technical: {
      archiveVersion: "legacy",
      legacySchema: payload.schema,
      legacyVersion: payload.version,
      warningDetails: warnings,
    },
  };

  return {
    kind: "legacy",
    detected,
    userData: payload,
    settings: payload.settings || {},
    characters,
    resources: media.map((m) => ({
      legacyMediaId: m.id,
      bytes: m.bytes,
      mediaType: m.type,
      size: m.bytes.length,
      metadata: {
        title: m.name,
        original: { filename: m.name, mediaType: m.type, size: m.bytes.length, immutable: true },
        extensions: { legacyMediaId: m.id, legacyKind: m.kind },
      },
    })),
    warnings: [...warnings, { code: "legacy_format_migrated" }],
    preview,
    legacyMedia: media,
  };
}

function stripServerFields(payload, warnings) {
  for (const key of FORBIDDEN_RESTORE_TOP_KEYS) {
    if (key in payload) {
      delete payload[key];
      warnings.push({ code: "server_authoritative_stripped", field: key });
    }
  }
  const walk = (obj, path) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    for (const key of Object.keys(obj)) {
      if (SERVER_AUTHORITATIVE_DENYLIST.some((d) => d.toLowerCase() === key.toLowerCase())) {
        delete obj[key];
        warnings.push({ code: "server_authoritative_stripped", field: path ? `${path}.${key}` : key });
      } else {
        walk(obj[key], path ? `${path}.${key}` : key);
      }
    }
  };
  walk(payload, "");
  if (payload.ecosystem) payload.ecosystem.token = "";
}

function toBytes(input) {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return null;
}
