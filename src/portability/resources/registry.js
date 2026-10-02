/**
 * Content-addressed resource registry (Book / Music / Image).
 * Metadata conforms to schemas/nyra-resource-metadata-v1.schema.json.
 * Lightweight index: localStorage `yueqi.resources.v1`.
 * Original bytes prefer IndexedDB `media` (+ native persist via media-files).
 */

import { sha256Hex, sha256ResourceId, isSha256Hex } from "../hash.js";
import { PortabilityError } from "../errors.js";
import { NYRA_RESOURCE_SCHEMA } from "../nyra/constants.js";
import { persistMediaFile } from "../../platform/media-files.js";

export const RESOURCES_STORAGE_KEY = "yueqi.resources.v1";
export const RESOURCE_INDEX_VERSION = 1;

/** @type {Storage | null} */
let resourcesStorage = null;

/**
 * @param {Storage | null} storage
 */
export function __setResourcesStorageForTests(storage) {
  resourcesStorage = storage;
}

function getStorage() {
  if (resourcesStorage) return resourcesStorage;
  if (typeof localStorage !== "undefined") return localStorage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

function emptyIndex() {
  return { version: RESOURCE_INDEX_VERSION, byId: {} };
}

/**
 * @returns {{ version: number, byId: Record<string, object> }}
 */
export function readResourceIndex() {
  const storage = getStorage();
  if (!storage) return emptyIndex();
  try {
    const raw = storage.getItem(RESOURCES_STORAGE_KEY);
    if (!raw) return emptyIndex();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.byId) return emptyIndex();
    return {
      version: Number(parsed.version) || RESOURCE_INDEX_VERSION,
      byId: { ...parsed.byId },
    };
  } catch {
    return emptyIndex();
  }
}

/**
 * @param {{ version?: number, byId: Record<string, object> }} index
 */
export function writeResourceIndex(index) {
  const storage = getStorage();
  if (!storage) {
    throw new PortabilityError("book_storage_failed", "resource_index_storage_unavailable");
  }
  const payload = {
    version: index.version || RESOURCE_INDEX_VERSION,
    byId: index.byId || {},
  };
  storage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

/**
 * Basename only — schema forbids path separators.
 * @param {string} name
 */
export function safeResourceFilename(name = "file") {
  const base = String(name || "file").replace(/^.*[/\\]/, "").trim() || "file";
  return base.slice(0, 255);
}

/**
 * @param {string} mediaType
 */
export function normalizeMediaType(mediaType = "application/octet-stream") {
  const raw = String(mediaType || "application/octet-stream").split(";")[0].trim().toLowerCase();
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(raw)) return raw;
  return "application/octet-stream";
}

/**
 * Build nyra.resource.metadata v1 object (does not persist).
 * @param {object} opts
 */
export function buildResourceMetadata(opts = {}) {
  const sha256 = String(opts.sha256 || "").toLowerCase();
  if (!isSha256Hex(sha256)) {
    throw new PortabilityError("archive_schema_invalid", "resource_sha256_invalid");
  }
  const kind = opts.kind;
  if (kind !== "book" && kind !== "music" && kind !== "image") {
    throw new PortabilityError("archive_schema_invalid", "resource_kind_invalid");
  }
  const id = opts.id || `sha256:${sha256}`;
  const meta = {
    schema: NYRA_RESOURCE_SCHEMA,
    version: 1,
    id,
    kind,
    importedAt: opts.importedAt || new Date().toISOString(),
    original: {
      filename: safeResourceFilename(opts.filename || "file"),
      mediaType: normalizeMediaType(opts.mediaType),
      size: Math.max(0, Number(opts.size) || 0),
      sha256,
      immutable: true,
    },
  };
  if (opts.title != null && String(opts.title).trim()) meta.title = String(opts.title).slice(0, 500);
  if (opts.creator != null && String(opts.creator).trim()) meta.creator = String(opts.creator).slice(0, 500);
  if (opts.language != null && String(opts.language).trim()) meta.language = String(opts.language).slice(0, 35);
  if (opts.source && typeof opts.source === "object") {
    meta.source = {
      type: opts.source.type || "local-file",
      ...(opts.source.label ? { label: String(opts.source.label).slice(0, 500) } : {}),
      ...(opts.source.uri ? { uri: String(opts.source.uri).slice(0, 2048) } : {}),
    };
  } else {
    meta.source = { type: "local-file" };
  }
  if (opts.durationMs != null && Number.isFinite(Number(opts.durationMs))) {
    meta.durationMs = Math.max(0, Math.min(86400000, Math.floor(Number(opts.durationMs))));
  }
  if (Array.isArray(opts.derivatives) && opts.derivatives.length) {
    meta.derivatives = opts.derivatives.slice(0, 256);
  }
  if (opts.extensions && typeof opts.extensions === "object") {
    meta.extensions = { ...opts.extensions };
  }
  return meta;
}

/**
 * Media store id for an original (ASCII-safe; maps 1:1 with content hash).
 * @param {string} sha256HexValue
 */
export function mediaIdForSha256(sha256HexValue) {
  return `sha256-${String(sha256HexValue).toLowerCase()}`;
}

/**
 * @param {string} resourceIdOrHex
 */
export function findResourceById(resourceIdOrHex) {
  const index = readResourceIndex();
  const raw = String(resourceIdOrHex || "");
  if (index.byId[raw]) return index.byId[raw];
  if (isSha256Hex(raw) && index.byId[`sha256:${raw}`]) return index.byId[`sha256:${raw}`];
  return null;
}

/**
 * @param {string} [kind]
 */
export function listResources(kind) {
  const index = readResourceIndex();
  const rows = Object.values(index.byId);
  if (!kind) return rows;
  return rows.filter((row) => row.kind === kind);
}

/**
 * Store original bytes via media APIs when available. Never overwrites an existing original.
 * @param {object} opts
 * @param {string} opts.sha256
 * @param {Blob|File} opts.blob
 * @param {string} opts.kind book|music|image
 * @param {string} [opts.filename]
 * @param {string} [opts.mediaType]
 * @param {object} [opts.deps]
 */
export async function storeOriginalMedia(opts = {}) {
  const sha256 = String(opts.sha256 || "").toLowerCase();
  if (!isSha256Hex(sha256)) {
    throw new PortabilityError("archive_checksum_mismatch", "resource_sha256_invalid");
  }
  const mediaId = mediaIdForSha256(sha256);
  const blob = opts.blob;
  if (!(blob instanceof Blob)) {
    throw new PortabilityError("book_storage_failed", "resource_blob_required");
  }

  const deps = opts.deps || {};
  const getAllRecords = deps.getAllRecords;
  const storeRecord = deps.storeRecord;
  const persist = deps.persistMediaFile || persistMediaFile;

  if (typeof getAllRecords === "function") {
    const existing = (await getAllRecords("media")).find(
      (row) => row?.id === mediaId || row?.sha256 === sha256 || row?.resourceId === `sha256:${sha256}`
    );
    if (existing) {
      if (existing.immutable === true || existing.role === "original") {
        return { record: existing, created: false, mediaId: existing.id };
      }
      // Do not mutate a non-original collision; surface as storage failure.
      throw new PortabilityError("book_storage_failed", "resource_media_id_collision");
    }
  }

  const kind =
    opts.kind === "music" ? "audio" : opts.kind === "book" ? "book" : opts.kind === "image" ? "image" : "resource";
  const filename = safeResourceFilename(opts.filename || (blob instanceof File ? blob.name : "file"));
  const mediaType = normalizeMediaType(opts.mediaType || blob.type || "application/octet-stream");

  let filePath = "";
  try {
    filePath = (await persist(mediaId, blob)) || "";
  } catch {
    filePath = "";
  }

  const record = {
    id: mediaId,
    kind,
    name: filename,
    type: mediaType,
    size: blob.size,
    createdAt: new Date().toISOString(),
    filePath,
    blob: filePath ? null : blob,
    sha256,
    resourceId: `sha256:${sha256}`,
    immutable: true,
    role: "original",
  };

  if (typeof storeRecord === "function") {
    await storeRecord("media", record);
  }

  return { record, created: true, mediaId };
}

/**
 * Register (or return existing) a content-addressed resource.
 * @param {object} opts
 * @param {"book"|"music"|"image"} opts.kind
 * @param {Blob|File|Uint8Array|ArrayBuffer} opts.bytesOrBlob
 * @param {string} [opts.filename]
 * @param {string} [opts.mediaType]
 * @param {string} [opts.title]
 * @param {string} [opts.creator]
 * @param {string} [opts.language]
 * @param {number} [opts.durationMs]
 * @param {object} [opts.source]
 * @param {object} [opts.extensions]
 * @param {boolean} [opts.storeBytes=true]
 * @param {object} [opts.deps]
 */
export async function registerResource(opts = {}) {
  const kind = opts.kind;
  const input = opts.bytesOrBlob;
  let blob;
  let bytes;

  if (input instanceof Blob) {
    blob = input;
    bytes = new Uint8Array(await input.arrayBuffer());
  } else if (input instanceof Uint8Array) {
    bytes = input;
    blob = new Blob([bytes], { type: opts.mediaType || "application/octet-stream" });
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
    blob = new Blob([bytes], { type: opts.mediaType || "application/octet-stream" });
  } else {
    throw new PortabilityError("book_storage_failed", "resource_bytes_required");
  }

  const sha256 = await sha256Hex(bytes);
  const resourceId = await sha256ResourceId(bytes);
  const existing = findResourceById(resourceId);
  if (existing) {
    return {
      resource: existing,
      metadata: existing.metadata || existing,
      duplicate: true,
      mediaId: existing.mediaId || mediaIdForSha256(sha256),
      sha256,
      id: resourceId,
    };
  }

  const filename =
    opts.filename ||
    (input instanceof File ? input.name : null) ||
    "file";
  const mediaType =
    opts.mediaType ||
    (input instanceof Blob ? input.type : "") ||
    "application/octet-stream";

  const metadata = buildResourceMetadata({
    kind,
    sha256,
    id: resourceId,
    filename,
    mediaType,
    size: bytes.byteLength,
    title: opts.title,
    creator: opts.creator,
    language: opts.language,
    durationMs: opts.durationMs,
    source: opts.source,
    extensions: opts.extensions,
    importedAt: opts.importedAt,
  });

  let mediaId = mediaIdForSha256(sha256);
  if (opts.storeBytes !== false) {
    const stored = await storeOriginalMedia({
      sha256,
      blob,
      kind,
      filename,
      mediaType,
      deps: opts.deps,
    });
    mediaId = stored.mediaId;
  }

  const entry = {
    ...metadata,
    mediaId,
    metadata,
  };

  const index = readResourceIndex();
  index.byId[resourceId] = entry;
  writeResourceIndex(index);

  return {
    resource: entry,
    metadata,
    duplicate: false,
    mediaId,
    sha256,
    id: resourceId,
  };
}

/**
 * Link a derivative to an existing original. Does not mutate original bytes.
 * @param {string} resourceId
 * @param {object} derivative
 */
export function linkDerivative(resourceId, derivative = {}) {
  const index = readResourceIndex();
  const entry = index.byId[resourceId] || index.byId[`sha256:${resourceId}`];
  if (!entry) {
    throw new PortabilityError("nychar_reference_missing", "resource_not_found");
  }
  const sourceSha256 = entry.original?.sha256 || String(resourceId).replace(/^sha256:/, "");
  const path =
    derivative.path ||
    `resources/${sourceSha256}/derivatives/${String(derivative.id || `d-${Date.now()}`).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)}`;
  const item = {
    id: String(derivative.id || path.split("/").pop()),
    role: derivative.role || "other",
    path,
    mediaType: normalizeMediaType(derivative.mediaType || "application/octet-stream"),
    size: Math.max(0, Number(derivative.size) || 0),
    sha256: String(derivative.sha256 || "").toLowerCase(),
    sourceSha256,
    ...(derivative.tool ? { tool: String(derivative.tool).slice(0, 160) } : {}),
  };
  if (!isSha256Hex(item.sha256)) {
    throw new PortabilityError("archive_schema_invalid", "derivative_sha256_invalid");
  }
  const list = Array.isArray(entry.derivatives) ? [...entry.derivatives] : [];
  list.push(item);
  entry.derivatives = list.slice(0, 256);
  if (entry.metadata) {
    entry.metadata = { ...entry.metadata, derivatives: entry.derivatives };
  }
  index.byId[entry.id] = entry;
  writeResourceIndex(index);
  return entry;
}

/**
 * Assert an original media record was not mutated (immutable claim).
 * @param {object} record
 * @param {string} expectedSha256
 */
export function assertOriginalImmutable(record, expectedSha256) {
  const hex = String(expectedSha256 || "").toLowerCase();
  if (!record) throw new PortabilityError("book_storage_failed", "original_missing");
  if (record.immutable !== true) {
    throw new PortabilityError("book_storage_failed", "original_not_marked_immutable");
  }
  if (record.sha256 && String(record.sha256).toLowerCase() !== hex) {
    throw new PortabilityError("archive_checksum_mismatch", "original_sha256_changed");
  }
  return true;
}
