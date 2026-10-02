/** Web Crypto backed — no Node OpenSSL binding. */
function getCrypto() {
  const c = globalThis.crypto;
  if (!c) throw new Error("Web Crypto unavailable");
  return c;
}

export function randomBytes(size) {
  const out = new Uint8Array(size);
  getCrypto().getRandomValues(out);
  return BufferCompat.from(out);
}

export function randomUUID() {
  return getCrypto().randomUUID();
}

export function createHash() {
  throw new Error("createHash unavailable in Nyra mobile runtime");
}

export function createHmac() {
  throw new Error("createHmac unavailable in Nyra mobile runtime");
}

const BufferCompat = {
  from(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data === "string") return new TextEncoder().encode(data);
    return new Uint8Array(data);
  },
};

export default { randomBytes, randomUUID, createHash, createHmac };
