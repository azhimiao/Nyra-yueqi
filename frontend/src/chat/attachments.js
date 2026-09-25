import { validateChatAttachment } from "./attachment-message.js";

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export async function buildAttachmentContext(file) {
  if (!file) return null;
  const validation = validateChatAttachment(file);
  if (!validation.ok) {
    const error = new Error(validation.reason || "attachment_invalid");
    error.code = validation.reason || "attachment_invalid";
    throw error;
  }
  if (validation.type === "text") {
    const text = await file.text();
    return {
      type: "text",
      name: file.name,
      text,
      preview: text.slice(0, 500),
      mime: file.type || "text/plain",
      size: file.size || 0,
      file,
    };
  }
  if (validation.type === "image") {
    const dataUrl = await fileToDataUrl(file);
    return {
      type: "image",
      name: file.name,
      dataUrl,
      mime: file.type,
      size: file.size || 0,
      file,
    };
  }
  return {
    type: "file",
    name: file.name,
    preview: file.name,
    mime: file.type || "application/octet-stream",
    size: file.size || 0,
    file,
  };
}

export function composeUserText(text, attachment) {
  if (!attachment) return text;
  if (attachment.type === "text") {
    return `[附件全文: ${attachment.name}]\n${attachment.text}\n\n${text}`;
  }
  if (attachment.type === "image") {
    return `[图片附件: ${attachment.name}]\n${text}`;
  }
  return `[附件: ${attachment.name}]\n${text}`;
}

export function buildUserMessagePayload(text, attachment, options = {}) {
  const content = options.composed
    ? String(text || "")
    : composeUserText(text, attachment);
  if (attachment?.type === "image" && attachment.dataUrl) {
    return {
      role: "user",
      content: [
        { type: "text", text: content },
        { type: "image_url", image_url: { url: attachment.dataUrl } },
      ],
    };
  }
  return { role: "user", content };
}

/**
 * Upgrade the last user turn with multimodal content.
 * Never blindly overwrite messages.at(-1) — that is often a system block.
 */
export function injectAttachmentMessage(messages, attachment) {
  if (!attachment || attachment.type !== "image" || !attachment.dataUrl) {
    return messages;
  }
  const next = Array.isArray(messages) ? [...messages] : [];
  let userIndex = -1;
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.role === "user") {
      userIndex = index;
      break;
    }
  }
  if (userIndex < 0) {
    next.push(buildUserMessagePayload("", attachment, { composed: true }));
    return next;
  }
  const current = next[userIndex];
  const text = typeof current.content === "string"
    ? current.content
    : Array.isArray(current.content)
      ? String(current.content.find((block) => block?.type === "text")?.text || "")
      : "";
  next[userIndex] = buildUserMessagePayload(text, attachment, { composed: true });
  return next;
}
