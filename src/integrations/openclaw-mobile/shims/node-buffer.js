/** Uint8Array-backed Buffer-like for mobile slice. */
function from(input, encoding) {
  if (input instanceof Uint8Array) return input;
  if (typeof input === "string") {
    return encoding === "base64"
      ? Uint8Array.from(atob(input), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(input);
  }
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input || 0);
}

function alloc(size) {
  return new Uint8Array(size);
}

function concat(list) {
  const total = list.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const b of list) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

function isBuffer(v) {
  return v instanceof Uint8Array;
}

export const Buffer = {
  from,
  alloc,
  concat,
  isBuffer,
  byteLength(str, enc) {
    return from(String(str), enc).length;
  },
};

export default { Buffer };
export { Buffer as defaultBuffer };
if (!globalThis.Buffer) globalThis.Buffer = Buffer;
