function readSyncSafe(view, offset, length) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = view.getUint8(offset + index);
  }
  return bytes;
}

function decodeLatin1(bytes) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

export function parseId3Title(buffer) {
  if (!buffer || buffer.byteLength < 10) return "";
  const view = new DataView(buffer);
  const header = decodeLatin1(readSyncSafe(view, 0, 3));
  if (header !== "ID3") return "";

  const tagSize =
    (view.getUint8(6) << 21) |
    (view.getUint8(7) << 14) |
    (view.getUint8(8) << 7) |
    view.getUint8(9);

  let offset = 10;
  const end = Math.min(buffer.byteLength, 10 + tagSize);
  while (offset + 10 < end) {
    const frameId = decodeLatin1(readSyncSafe(view, offset, 4));
    const frameSize = view.getUint32(offset + 4);
    offset += 10;
    if (!frameId.trim() || frameSize <= 0) break;
    if (frameId === "TIT2" || frameId === "TPE1") {
      const payload = readSyncSafe(view, offset + 1, Math.max(0, frameSize - 1));
      const text = decodeLatin1(payload).replace(/\0/g, "").trim();
      if (text) return text;
    }
    offset += frameSize;
  }
  return "";
}

export async function enrichAudioMetadata(file) {
  try {
    const header = await file.slice(0, 256 * 1024).arrayBuffer();
    const title = parseId3Title(header);
    return { title: title || file.name.replace(/\.[^.]+$/, ""), artist: "" };
  } catch {
    return { title: file.name.replace(/\.[^.]+$/, ""), artist: "" };
  }
}
