/**
 * Bounded PNG tEXt / iTXt / zTXt extractor for character cards.
 * Rejects truncated files, oversized chunks, and inflate bombs.
 */

export const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);
export const PNG_LIMITS = Object.freeze({
  maxFileBytes: 8 * 1024 * 1024,
  maxChunkBytes: 512 * 1024,
  maxInflateBytes: 1024 * 1024,
});

function u32(buf, offset) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

export function isPngBuffer(buf) {
  if (!buf || buf.length < 8) return false;
  for (let i = 0; i < 8; i += 1) if (buf[i] !== PNG_SIGNATURE[i]) return false;
  return true;
}

function decodeLatin1(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return decodeLatin1(bytes);
  }
}

function splitNul(bytes) {
  const index = bytes.indexOf(0);
  if (index < 0) return { key: decodeLatin1(bytes), value: new Uint8Array() };
  return { key: decodeLatin1(bytes.subarray(0, index)), value: bytes.subarray(index + 1) };
}

/** @type {null | ((bytes: Uint8Array, maxOut: number) => Uint8Array)} */
let inflateImpl = typeof globalThis.__YUEQI_PNG_INFLATE__ === "function"
  ? globalThis.__YUEQI_PNG_INFLATE__
  : null;

export function setPngInflate(fn) {
  inflateImpl = typeof fn === "function" ? fn : null;
}

function tryInflate(bytes, maxOut) {
  if (bytes.length > PNG_LIMITS.maxChunkBytes) {
    throw Object.assign(new Error("png_chunk_too_large"), { code: "png_chunk_too_large" });
  }
  if (!inflateImpl) {
    throw Object.assign(new Error("png_inflate_unsupported"), { code: "png_inflate_unsupported" });
  }
  const out = inflateImpl(bytes, maxOut);
  if (!out || out.length > maxOut) {
    throw Object.assign(new Error("png_inflate_bomb"), { code: "png_inflate_bomb" });
  }
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

function parseTextPayload(type, data) {
  if (type === "tEXt") {
    const split = splitNul(data);
    return { keyword: split.key, text: decodeLatin1(split.value), compressed: false };
  }
  if (type === "zTXt") {
    const split = splitNul(data);
    const method = split.value[0];
    const payload = split.value.subarray(1);
    if (method !== 0) throw Object.assign(new Error("png_unknown_filter"), { code: "png_unknown_filter" });
    return { keyword: split.key, text: decodeLatin1(tryInflate(payload, PNG_LIMITS.maxInflateBytes)), compressed: true };
  }
  if (type === "iTXt") {
    const keywordEnd = data.indexOf(0);
    if (keywordEnd < 0) return { keyword: "", text: "", compressed: false };
    const keyword = decodeUtf8(data.subarray(0, keywordEnd));
    const compressed = data[keywordEnd + 1] === 1;
    let rest = data.subarray(keywordEnd + 3);
    const skipNul = () => {
      const idx = rest.indexOf(0);
      rest = idx < 0 ? rest : rest.subarray(idx + 1);
    };
    skipNul();
    skipNul();
    const textBytes = compressed ? tryInflate(rest, PNG_LIMITS.maxInflateBytes) : rest;
    return { keyword, text: decodeUtf8(textBytes), compressed };
  }
  return null;
}

export function extractPngTextChunks(buf, options = {}) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
  if (bytes.length > (options.maxFileBytes || PNG_LIMITS.maxFileBytes)) {
    throw Object.assign(new Error("png_file_too_large"), { code: "png_file_too_large" });
  }
  if (!isPngBuffer(bytes)) {
    throw Object.assign(new Error("png_signature_invalid"), { code: "png_signature_invalid" });
  }
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = u32(bytes, offset);
    if (length > PNG_LIMITS.maxChunkBytes) {
      throw Object.assign(new Error("png_chunk_too_large"), { code: "png_chunk_too_large" });
    }
    const type = decodeLatin1(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw Object.assign(new Error("png_truncated"), { code: "png_truncated" });
    }
    if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
      chunks.push({ type, ...parseTextPayload(type, bytes.subarray(dataStart, dataEnd)) });
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

export function extractCharacterJsonFromPng(buf) {
  const chunks = extractPngTextChunks(buf);
  for (const chunk of chunks) {
    if (!["chara", "ccv3"].includes(String(chunk.keyword || "").toLowerCase())) continue;
    const text = String(chunk.text || "").trim();
    const candidates = [text];
    try {
      candidates.push(globalThis.atob ? atob(text) : Buffer.from(text, "base64").toString("utf8"));
    } catch {
      /* ignore */
    }
    for (const candidate of candidates) {
      const trimmed = String(candidate || "").trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        JSON.parse(trimmed);
        return { ok: true, json: trimmed, keyword: chunk.keyword, compressed: chunk.compressed };
      } catch {
        /* next */
      }
    }
  }
  return { ok: false, reason: "card_embedded_json_missing" };
}
