/**
 * Hardened audio/music import wrapper.
 * Accepts mp3/flac/m4a/aac/wav/ogg; never mutates original bytes.
 */

import { PortabilityError } from "../errors.js";
import { enrichAudioMetadata } from "../../library/audio.js";
import { sha256Hex } from "../hash.js";
import { registerResource } from "./registry.js";

const AUDIO_MAX_BYTES = 1 * 1024 * 1024 * 1024;

export const AUDIO_CURRENT_EXTENSIONS = Object.freeze(["mp3", "flac", "m4a", "aac", "wav", "ogg"]);

const EXT_MIME = Object.freeze({
  mp3: "audio/mpeg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
});

const MIME_TO_EXT = Object.freeze({
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "application/ogg": "ogg",
});

function fileExtension(name = "") {
  const parts = String(name || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function mimeHint(file) {
  return String(file?.type || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

/**
 * @param {File|Blob & { name?: string }} file
 */
export function classifyAudioFormat(file) {
  const ext = fileExtension(file?.name);
  const mime = mimeHint(file);

  if (AUDIO_CURRENT_EXTENSIONS.includes(ext)) {
    return {
      ext,
      status: "current",
      mediaType: EXT_MIME[ext] || mime || "application/octet-stream",
    };
  }
  if (mime && MIME_TO_EXT[mime]) {
    const mapped = MIME_TO_EXT[mime];
    return {
      ext: mapped,
      status: "current",
      mediaType: EXT_MIME[mapped] || mime,
    };
  }
  if (mime.startsWith("audio/")) {
    // Host may decode other audio/*; still reject unknown extensions without audio MIME map
    // unless MIME alone is enough — prefer explicit allowlist for registry hardening.
    return { ext: ext || "unknown", status: "unsupported", mediaType: mime };
  }
  return { ext: ext || "unknown", status: "unsupported", mediaType: mime || "application/octet-stream" };
}

/**
 * @param {File|Blob & { name?: string }} file
 */
export function assertAudioFormatSupported(file) {
  if (!file) throw new PortabilityError("audio_decode_failed", "audio_file_required");
  const classified = classifyAudioFormat(file);
  if (classified.status === "current") return classified;
  throw new PortabilityError(
    "audio_unsupported_format",
    `Unsupported audio format "${classified.ext || classified.mediaType}". Accepted: ${AUDIO_CURRENT_EXTENSIONS.join(", ")}.`,
    { format: classified.ext, mediaType: classified.mediaType }
  );
}

/**
 * Import audio: validate → hash → enrich tags → register (original immutable).
 * Does not mutate the caller's File/Blob.
 * @param {File} file
 * @param {{ deps?: object, register?: boolean, storeBytes?: boolean, enrich?: Function }} [opts]
 */
export async function importAudioResource(file, opts = {}) {
  const classified = assertAudioFormatSupported(file);
  if (file.size > AUDIO_MAX_BYTES) {
    throw new PortabilityError("audio_limit_exceeded", `Audio exceeds ${AUDIO_MAX_BYTES} byte limit`, {
      size: file.size,
      limit: AUDIO_MAX_BYTES,
    });
  }

  // Snapshot hash from a copy of bytes so later UI transforms cannot rewrite "original"
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = await sha256Hex(bytes);
  const originalSnapshot = bytes.slice(0);

  const enrich = opts.enrich || enrichAudioMetadata;
  let meta;
  try {
    meta = await enrich(file);
  } catch (error) {
    // Partial metadata failure may warn while retaining a playable original
    meta = {
      title: String(file.name || "").replace(/\.[^.]+$/, "") || "audio",
      artist: "",
      warning: error?.message || "audio_metadata_invalid",
    };
  }

  let registration = null;
  if (opts.register !== false) {
    registration = await registerResource({
      kind: "music",
      bytesOrBlob: new Blob([originalSnapshot], { type: classified.mediaType || file.type || "audio/mpeg" }),
      filename: file.name,
      mediaType: classified.mediaType || file.type,
      title: meta.title,
      creator: meta.artist || meta.creator || "",
      durationMs: meta.durationMs,
      source: { type: "local-file", label: file.name },
      extensions: {
        format: classified.ext,
        ...(meta.album ? { album: meta.album } : {}),
        ...(meta.warning ? { metadataWarning: meta.warning } : {}),
      },
      deps: opts.deps,
      storeBytes: opts.storeBytes !== false,
    });
  }

  // Immutability claim: snapshot must still match hashed original
  const verify = await sha256Hex(originalSnapshot);
  if (verify !== sha256) {
    throw new PortabilityError("archive_checksum_mismatch", "audio_original_mutated");
  }

  return {
    track: {
      title: meta.title || String(file.name || "").replace(/\.[^.]+$/, ""),
      artist: meta.artist || "",
      album: meta.album || "",
      fileName: file.name,
      format: classified.ext,
      resourceId: registration?.id || "",
      sha256,
      originalImmutable: true,
      mediaId: registration?.mediaId || "",
    },
    meta,
    resource: registration?.resource || null,
    metadata: registration?.metadata || null,
    duplicate: Boolean(registration?.duplicate),
    mediaId: registration?.mediaId || "",
    sha256,
    id: registration?.id || "",
    classified,
    originalBytes: originalSnapshot,
  };
}
