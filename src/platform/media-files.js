import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { getMediaBlob } from "../storage/media-blobs.js";
import { isNativePlatform } from "./runtime.js";

/** Capacitor bridge messages stay small; never send a whole song as one base64 string. */
const BRIDGE_CHUNK = 256 * 1024;

export function bytesToBase64(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < input.length; index += step) {
    binary += String.fromCharCode(...input.subarray(index, index + step));
  }
  return btoa(binary);
}

function base64ToBlob(base64, mimeType = "application/octet-stream") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function persistRemoteMedia(id, url, { onProgress } = {}) {
  if (!isNativePlatform()) return null;
  const source = String(url || "").trim();
  const key = String(id || "").trim();
  if (!source || !key) return null;
  const path = `media/${key}`;
  let handle = null;
  if (typeof onProgress === "function" && typeof Filesystem.addListener === "function") {
    handle = await Filesystem.addListener("progress", (status) => {
      if (String(status?.url || "") !== source) return;
      const total = Number(status.contentLength || 0);
      const received = Number(status.bytes || 0);
      if (total > 0) onProgress(Math.min(99, (received / total) * 100), received);
      else onProgress(0, received);
    });
  }
  try {
    const result = await Filesystem.downloadFile({
      url: source,
      path,
      directory: Directory.Data,
      recursive: true,
      progress: Boolean(onProgress),
    });
    return String(result?.path || path);
  } finally {
    await handle?.remove?.();
  }
}

export async function persistMediaFile(id, file) {
  if (!isNativePlatform()) return null;
  const existing = String(file?.nativePath || "").trim();
  if (existing) return existing;
  if (typeof Blob === "undefined" || !(file instanceof Blob)) return null;
  const path = `media/${id}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  for (let offset = 0; offset < bytes.length; offset += BRIDGE_CHUNK) {
    const data = bytesToBase64(bytes.subarray(offset, offset + BRIDGE_CHUNK));
    if (offset === 0) {
      await Filesystem.writeFile({
        path,
        data,
        directory: Directory.Data,
        recursive: true,
      });
    } else {
      await Filesystem.appendFile({
        path,
        data,
        directory: Directory.Data,
      });
    }
  }
  return path;
}

export async function resolveNativeFileUrl(filePath) {
  if (!isNativePlatform() || !filePath) return "";
  try {
    const { uri } = await Filesystem.getUri({
      path: filePath,
      directory: Directory.Data,
    });
    return uri ? Capacitor.convertFileSrc(uri) : "";
  } catch {
    return "";
  }
}

export async function readMediaBlob(record) {
  if (record?.blob instanceof Blob) return record.blob;
  if (record?.id) {
    const stored = await getMediaBlob(record.id);
    if (stored) return stored;
  }
  if (!record?.filePath || !isNativePlatform()) return null;
  try {
    const result = await Filesystem.readFile({
      path: record.filePath,
      directory: Directory.Data,
    });
    return base64ToBlob(result.data, record.type || "application/octet-stream");
  } catch {
    return null;
  }
}

/** Persist raw bytes on native (used by character-pack / full backup restore). */
export async function persistMediaBytes(id, bytes, mimeType = "application/octet-stream") {
  if (!isNativePlatform()) return null;
  const blob = new Blob([bytes], { type: mimeType });
  return persistMediaFile(id, blob);
}

export async function readMediaBytes(record) {
  const blob = await readMediaBlob(record);
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}
