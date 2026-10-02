import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAttachmentMessageMetadata,
  resolveAttachmentMessageCard,
  validateChatAttachment,
} from "../src/chat/attachment-message.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

assert.deepEqual(
  validateChatAttachment({ name: "photo.webp", type: "image/webp", size: 1024 }),
  { ok: true, type: "image" },
);
assert.equal(validateChatAttachment({ name: "vector.svg", type: "image/svg+xml", size: 1024 }).ok, false);
assert.equal(validateChatAttachment({ name: "huge.png", type: "image/png", size: 11 * 1024 * 1024 }).ok, false);

const metadata = createAttachmentMessageMetadata({
  type: "image",
  name: "photo.webp",
  mime: "image/webp",
  size: 1024,
  dataUrl: "data:image/webp;base64,do-not-persist",
}, {
  id: "media-001",
});
assert.equal(metadata.kind, "attachment");
assert.equal(metadata.attachment.mediaId, "media-001");
assert.equal(JSON.stringify(metadata).includes("data:image"), false);
assert.deepEqual(
  resolveAttachmentMessageCard(metadata),
  {
    type: "image",
    name: "photo.webp",
    mime: "image/webp",
    size: 1024,
    mediaId: "media-001",
    preview: "",
    previewUrl: "",
  },
);

const appSource = read("src/app.js");
const chatSource = read("src/panels/chat.js");
const phoneSource = read("src/phone-shell/phone-shell.js");
const composerSource = read("src/chat/composer-chrome.js");
const visualCss = read("src/ui/chat-message-visual.css");
const composerCss = read("src/ui/message-composer-unified.css");
assert.match(chatSource, /createAttachmentMessageMetadata/);
assert.match(chatSource, /storeMediaFile/);
assert.match(chatSource, /if \(!rawInput && !attachmentState\.pending\) return;/);
assert.match(chatSource, /failedSendPayloads\.set\(userUiMsgId,[\s\S]*attachmentContext/);
assert.match(chatSource, /attachmentState\.pending = failedPayload\.attachmentContext/);
assert.match(chatSource, /yueqi:chat-send-result/);
assert.match(chatSource, /retryText: text/);
assert.match(chatSource, /injectAttachmentMessage\([\s\S]*isFreshTurn \? attachmentContext/);
assert.match(chatSource, /hasPendingAttachment: \(\) => Boolean\(attachmentState\.pending\)/);
assert.match(chatSource, /getPendingAttachment: \(\) => attachmentState\.pending/);
assert.match(chatSource, /image media persistence failed; sending inline/);
assert.match(composerSource, /composerAttachmentPreview/);
assert.match(composerSource, /if \(!text && !hasAttachment\) return;/);
assert.match(composerSource, /onClearAttachment/);
assert.match(composerCss, /composer-attachment-preview__media/);
assert.match(appSource, /message-attachment-card/);
assert.match(appSource, /attachment: meta\.attachment/);
assert.match(appSource, /externalAttachment/);
assert.match(appSource, /yueqi:chat-send-result/);
assert.match(phoneSource, /message-attachment-card/);
assert.match(phoneSource, /attachment: options\.attachment/);
assert.match(phoneSource, /await sendPhoneMessage\(caption, "", \{ attachment \}\)/);
assert.doesNotMatch(phoneSource, /composeUserText\(caption, attachment\)/);
assert.match(visualCss, /\.message-attachment-card/);

const { injectAttachmentMessage, composeUserText } = await import("../src/chat/attachments.js");
const composed = composeUserText("发了一张图片", { type: "image", name: "a.png" });
const upgraded = injectAttachmentMessage(
  [
    { role: "system", content: "runtime" },
    { role: "user", content: composed },
    { role: "system", content: "caps" },
  ],
  { type: "image", name: "a.png", dataUrl: "data:image/png;base64,abc" },
);
assert.equal(upgraded.at(-1).role, "system");
assert.equal(upgraded.at(-2).role, "user");
assert.equal(Array.isArray(upgraded.at(-2).content), true);
assert.equal(upgraded.at(-2).content[0].text, composed);

console.log("PASS chat attachment message contract");
