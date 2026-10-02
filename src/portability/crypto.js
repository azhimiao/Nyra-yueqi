/**
 * Nyra archive encryption envelope v1 (frozen).
 *
 * Outer layout (big-endian where noted):
 *   magic[5] = "NYRA1"
 *   kdfId u8 = 1 (PBKDF2-SHA-256)
 *   iterations u32 BE = 600000
 *   saltLen u8 = 16; salt
 *   nonceLen u8 = 12; nonce
 *   ciphertext+tag (AES-256-GCM)
 *
 * Empty passphrase is allowed for seamless local/cloud use; the blob is still
 * authenticated ciphertext. Wrong passphrase => archive_auth_failed.
 */

import { PortabilityError } from "./errors.js";

export const NYRA_MAGIC = new TextEncoder().encode("NYRA1");
export const NYRA_KDF_PBKDF2_SHA256 = 1;
export const NYRA_PBKDF2_ITERATIONS = 600_000;
export const NYRA_SALT_BYTES = 16;
export const NYRA_NONCE_BYTES = 12;
export const NYRA_KEY_BITS = 256;

function requireSubtle() {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new PortabilityError("archive_incompatible", "Web Crypto unavailable");
  }
  return crypto.subtle;
}

function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function writeU32BE(value) {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value >>> 0, false);
  return buf;
}

function readU32BE(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, false);
}

async function deriveKey(passphrase, salt, iterations) {
  const subtle = requireSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(String(passphrase ?? "")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: NYRA_KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * @param {Uint8Array} plaintextZip
 * @param {{ passphrase?: string }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function sealNyraArchive(plaintextZip, opts = {}) {
  const subtle = requireSubtle();
  const salt = crypto.getRandomValues(new Uint8Array(NYRA_SALT_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NYRA_NONCE_BYTES));
  const key = await deriveKey(opts.passphrase ?? "", salt, NYRA_PBKDF2_ITERATIONS);
  const cipherBuf = await subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintextZip);
  const cipher = new Uint8Array(cipherBuf);
  return concatBytes([
    NYRA_MAGIC,
    Uint8Array.of(NYRA_KDF_PBKDF2_SHA256),
    writeU32BE(NYRA_PBKDF2_ITERATIONS),
    Uint8Array.of(NYRA_SALT_BYTES),
    salt,
    Uint8Array.of(NYRA_NONCE_BYTES),
    nonce,
    cipher,
  ]);
}

/**
 * @param {Uint8Array} sealed
 * @param {{ passphrase?: string }} [opts]
 * @returns {Promise<Uint8Array>} plaintext zip bytes
 */
export async function openNyraArchive(sealed, opts = {}) {
  const bytes = sealed instanceof Uint8Array ? sealed : new Uint8Array(sealed || []);
  if (bytes.length < NYRA_MAGIC.length + 1 + 4 + 1 + NYRA_SALT_BYTES + 1 + NYRA_NONCE_BYTES + 16) {
    throw new PortabilityError("archive_schema_invalid", "envelope too short");
  }
  for (let i = 0; i < NYRA_MAGIC.length; i += 1) {
    if (bytes[i] !== NYRA_MAGIC[i]) {
      throw new PortabilityError("archive_schema_invalid", "bad magic");
    }
  }
  let offset = NYRA_MAGIC.length;
  const kdfId = bytes[offset++];
  if (kdfId !== NYRA_KDF_PBKDF2_SHA256) {
    throw new PortabilityError("archive_unsupported_version", `kdf ${kdfId}`);
  }
  const iterations = readU32BE(bytes, offset);
  offset += 4;
  if (iterations < 100_000 || iterations > 5_000_000) {
    throw new PortabilityError("archive_schema_invalid", "bad iterations");
  }
  const saltLen = bytes[offset++];
  if (saltLen !== NYRA_SALT_BYTES) {
    throw new PortabilityError("archive_schema_invalid", "bad salt length");
  }
  const salt = bytes.subarray(offset, offset + saltLen);
  offset += saltLen;
  const nonceLen = bytes[offset++];
  if (nonceLen !== NYRA_NONCE_BYTES) {
    throw new PortabilityError("archive_schema_invalid", "bad nonce length");
  }
  const nonce = bytes.subarray(offset, offset + nonceLen);
  offset += nonceLen;
  const cipher = bytes.subarray(offset);
  try {
    const subtle = requireSubtle();
    const key = await deriveKey(opts.passphrase ?? "", salt, iterations);
    const plain = await subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher);
    return new Uint8Array(plain);
  } catch {
    throw new PortabilityError("archive_auth_failed");
  }
}

/**
 * @param {Uint8Array} bytes
 */
export function looksLikeNyraEnvelope(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (buf.length < NYRA_MAGIC.length) return false;
  for (let i = 0; i < NYRA_MAGIC.length; i += 1) {
    if (buf[i] !== NYRA_MAGIC[i]) return false;
  }
  return true;
}
