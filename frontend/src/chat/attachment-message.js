const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const FILE_TYPES = new Set(["application/pdf"]);

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function safePreviewUrl(value) {
  const url = clean(value, 2_000_000);
  return /^(?:blob:|data:image\/(?:jpeg|png|webp|gif);base64,)/i.test(url) ? url : "";
}

export function validateChatAttachment(file = {}) {
  const name = clean(file.name, 240);
  const mime = clean(file.type, 120).toLowerCase();
  const size = Math.max(0, Number(file.size) || 0);
  const text = mime.startsWith("text/") || /\.(txt|md|json)$/i.test(name);
  if (text) {
    return size <= MAX_TEXT_BYTES
      ? { ok: true, type: "text" }
      : { ok: false, reason: "text_too_large", maxBytes: MAX_TEXT_BYTES };
  }
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp|gif|svg)$/i.test(name)) {
    if (!IMAGE_TYPES.has(mime)) return { ok: false, reason: "image_type_not_allowed" };
    return size <= MAX_IMAGE_BYTES
      ? { ok: true, type: "image" }
      : { ok: false, reason: "image_too_large", maxBytes: MAX_IMAGE_BYTES };
  }
  if (FILE_TYPES.has(mime) || /\.pdf$/i.test(name)) {
    return size <= MAX_FILE_BYTES
      ? { ok: true, type: "file" }
      : { ok: false, reason: "file_too_large", maxBytes: MAX_FILE_BYTES };
  }
  return { ok: false, reason: "file_type_not_allowed" };
}

export function createAttachmentMessageMetadata(context = {}, mediaRecord = null) {
  const type = context.type === "image" || context.type === "text" ? context.type : "file";
  return {
    kind: "attachment",
    mediaType: "attachment",
    attachment: {
      type,
      name: clean(context.name, 240) || (type === "image" ? "图片" : "附件"),
      mime: clean(context.mime || context.typeName, 120),
      size: Math.max(0, Number(context.size) || Number(mediaRecord?.size) || 0),
      mediaId: clean(mediaRecord?.id || context.mediaId, 120),
      preview: type === "text" ? clean(context.preview, 280) : "",
    },
  };
}

export function resolveAttachmentMessageCard(metadata = {}) {
  const kind = clean(metadata?.kind || metadata?.mediaType, 80);
  const attachment = metadata?.attachment && typeof metadata.attachment === "object"
    ? metadata.attachment
    : null;
  if (kind !== "attachment" || !attachment) return null;
  const type = attachment.type === "image" || attachment.type === "text"
    ? attachment.type
    : "file";
  return {
    type,
    name: clean(attachment.name, 240) || (type === "image" ? "图片" : "附件"),
    mime: clean(attachment.mime, 120),
    size: Math.max(0, Number(attachment.size) || 0),
    mediaId: clean(attachment.mediaId, 120),
    preview: type === "text" ? clean(attachment.preview, 280) : "",
    previewUrl: safePreviewUrl(attachment.previewUrl),
  };
}

export {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_TEXT_BYTES,
};
