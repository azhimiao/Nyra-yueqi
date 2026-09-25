/**
 * SHA-256 helpers for archive / resource content addressing.
 */

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toUint8(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof input === "string") return new TextEncoder().encode(input);
  throw new TypeError("hash_input_invalid");
}

/**
 * @param {Uint8Array|ArrayBuffer|string} input
 * @returns {Promise<string>} lowercase hex
 */
export async function sha256Hex(input) {
  const bytes = toUint8(input);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/**
 * @param {Uint8Array|ArrayBuffer|string} input
 * @returns {Promise<string>} `sha256:<hex>`
 */
export async function sha256ResourceId(input) {
  return `sha256:${await sha256Hex(input)}`;
}

/**
 * @param {string} hex
 */
export function isSha256Hex(hex) {
  return typeof hex === "string" && /^[a-f0-9]{64}$/.test(hex);
}
