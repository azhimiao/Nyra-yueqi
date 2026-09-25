/**
 * Build a conforming .nyra archive from current local world collectors.
 * Reuses scrubbed legacy export payload as data/user-data.json content,
 * content-addresses media under resources/<sha256>/, then seals the ZIP.
 */

import { APP_VERSION } from "../../constants.js";
import { scrubExportPayload } from "../../memory/privacy.js";
import { buildExportPayload } from "../../memory/backup.js";
import { readMediaBytes as defaultReadMediaBytes } from "../../platform/media-files.js";
import { sealNyraArchive } from "../crypto.js";
import { sha256Hex } from "../hash.js";
import { safeZip, strToU8 } from "../zip-safe.js";
import { PortabilityError } from "../errors.js";
import {
  NYRA_ARCHIVE_VERSION,
  NYRA_LIMITS,
  NYRA_MANIFEST_SCHEMA,
  NYRA_RESOURCE_SCHEMA,
} from "./constants.js";

function uuidV4() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function platformLabel() {
  try {
    const ua = navigator?.userAgent || "";
    if (/Android/i.test(ua)) return "android";
    if (/iPhone|iPad/i.test(ua)) return "ios";
    if (/Windows/i.test(ua)) return "windows";
    if (/Mac/i.test(ua)) return "macos";
    return "web";
  } catch {
    return "node";
  }
}

/**
 * @param {object} deps same collectors as buildExportPayload
 * @param {{
 *   passphrase?: string,
 *   includeMedia?: boolean,
 *   producerName?: string,
 *   minimumAppVersion?: string,
 * }} [options]
 */
export async function buildNyraArchive(deps, options = {}) {
  const includeMedia = options.includeMedia !== false;
  const payload = scrubExportPayload(await buildExportPayload(deps, {
    omitMedia: !includeMedia,
  }));

  // Never ship provider secrets / billing authority even if scrub missed a path.
  if (payload.profile?.provider) delete payload.profile.provider;
  if (payload.ecosystem) {
    payload.ecosystem = { ...payload.ecosystem, token: "" };
  }
  delete payload.billingCredits;
  delete payload.serverLedger;

  const files = {};
  /** @type {import('./constants.js').never[]} */
  const entries = [];

  async function putJson(path, value, category, authority = "authoritative") {
    const bytes = strToU8(JSON.stringify(value));
    if (bytes.length > NYRA_LIMITS.maxEntryBytes) {
      throw new PortabilityError("archive_limit_exceeded", path);
    }
    files[path] = bytes;
    entries.push({
      path,
      category,
      mediaType: "application/json",
      size: bytes.length,
      sha256: await sha256Hex(bytes),
      required: true,
      authority,
    });
  }

  const settings = payload.settings || {};
  const characters = Array.isArray(payload.characters) ? payload.characters : [];
  const { characters: _chars, settings: _settings, mediaManifest, ...userData } = payload;

  await putJson("data/user-data.json", {
    ...userData,
    mediaManifest: includeMedia ? (mediaManifest || []) : [],
    characterIds: characters.map((c) => c?.id).filter(Boolean),
  }, "user-data");
  await putJson("data/settings.json", settings, "user-data");

  for (const character of characters) {
    const id = String(character?.id || "").trim();
    if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) continue;
    await putJson(`entities/characters/${id}.json`, character, "entity");
  }

  if (includeMedia && deps.getAllRecords) {
    const readMedia = deps.readMediaBytes || defaultReadMediaBytes;
    const mediaRecords = await deps.getAllRecords("media");
    const seen = new Set();
    for (const record of mediaRecords || []) {
      const bytes = await readMedia(record);
      if (!bytes?.length) continue;
      if (bytes.length > NYRA_LIMITS.maxEntryBytes) {
        throw new PortabilityError("archive_limit_exceeded", record.id);
      }
      const digest = await sha256Hex(bytes);
      if (seen.has(digest)) continue;
      seen.add(digest);

      const originalPath = `resources/${digest}/original`;
      files[originalPath] = bytes;
      entries.push({
        path: originalPath,
        category: "resource-original",
        mediaType: record.type || "application/octet-stream",
        size: bytes.length,
        sha256: digest,
        required: false,
        authority: "authoritative",
      });

      const metadata = {
        schema: NYRA_RESOURCE_SCHEMA,
        version: 1,
        id: `sha256:${digest}`,
        kind: guessResourceKind(record),
        title: record.name || record.id,
        importedAt: record.createdAt || new Date().toISOString(),
        source: { type: "legacy-import", label: record.id },
        original: {
          filename: sanitizeFilename(record.name || `${record.id}.bin`),
          mediaType: record.type || "application/octet-stream",
          size: bytes.length,
          sha256: digest,
          immutable: true,
        },
        extensions: {
          legacyMediaId: record.id,
          legacyKind: record.kind || "file",
        },
      };
      await putJson(`resources/${digest}/metadata.json`, metadata, "resource-metadata");
    }
  }

  if (entries.length > NYRA_LIMITS.maxEntries) {
    throw new PortabilityError("archive_limit_exceeded", "entries");
  }

  const manifest = {
    schema: NYRA_MANIFEST_SCHEMA,
    version: NYRA_ARCHIVE_VERSION,
    archiveId: uuidV4(),
    createdAt: new Date().toISOString(),
    producer: {
      name: options.producerName || "Nyra",
      version: APP_VERSION,
      platform: platformLabel(),
    },
    source: {
      legacySchema: "yueqi-companion-export",
      legacyVersion: Number(payload.version) || 2,
    },
    entries,
    restore: {
      strategy: "staged-atomic",
      minimumAppVersion: options.minimumAppVersion || "1.0.0",
    },
  };

  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2));
  if (manifestBytes.length > NYRA_LIMITS.maxManifestBytes) {
    throw new PortabilityError("archive_limit_exceeded", "manifest");
  }
  files["manifest.json"] = manifestBytes;

  const zipBytes = safeZip(files, 6);
  const sealed = await sealNyraArchive(zipBytes, { passphrase: options.passphrase ?? "" });
  if (sealed.length > NYRA_LIMITS.maxCiphertextBytes) {
    throw new PortabilityError("archive_limit_exceeded", "ciphertext");
  }

  return {
    bytes: sealed,
    manifest,
    archiveId: manifest.archiveId,
    createdAt: manifest.createdAt,
    mediaCount: entries.filter((e) => e.category === "resource-original").length,
    characterCount: characters.length,
  };
}

function guessResourceKind(record) {
  const type = String(record?.type || "");
  if (type.startsWith("audio/")) return "music";
  if (type.startsWith("image/")) return "image";
  if (type.includes("epub") || type.startsWith("text/")) return "book";
  const name = String(record?.name || "").toLowerCase();
  if (/\.(mp3|flac|m4a|aac|wav|ogg)$/.test(name)) return "music";
  if (/\.(epub|txt|md|pdf|docx)$/.test(name)) return "book";
  return "image";
}

function sanitizeFilename(name) {
  const base = String(name || "file.bin").replace(/[\\/]/g, "_").trim();
  return base.slice(0, 255) || "file.bin";
}
