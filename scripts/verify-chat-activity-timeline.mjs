import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatMessageTimelineTime,
  messageTimelineLabel,
  shouldShowMessageTime,
} from "../src/chat/message-timeline.js";
import { resolveDiaryMessageCard } from "../src/chat/diary-message.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const now = new Date("2026-08-08T12:00:00+08:00");
assert.equal(
  formatMessageTimelineTime("2026-08-08T09:05:00+08:00", { now, locale: "zh-CN" }),
  "09:05",
);
assert.match(
  formatMessageTimelineTime("2026-08-07T21:16:00+08:00", { now, locale: "zh-CN" }),
  /^昨天 21:16$/,
);
assert.match(
  formatMessageTimelineTime("2025-12-31T23:59:00+08:00", { now, locale: "zh-CN" }),
  /2025.*23:59/,
);
assert.equal(
  shouldShowMessageTime("2026-08-08T09:00:00+08:00", "2026-08-08T09:04:59+08:00"),
  false,
);
assert.equal(
  shouldShowMessageTime("2026-08-08T09:00:00+08:00", "2026-08-08T09:05:00+08:00"),
  true,
);
assert.equal(
  messageTimelineLabel("2026-08-07T23:59:00+08:00", "2026-08-08T00:01:00+08:00", { now }),
  "00:01",
);
assert.deepEqual(
  resolveDiaryMessageCard({
    activityType: "diary",
    diaryId: "diary-001",
    diaryDay: "2026-08-08",
    diaryTitle: "雨停以后",
    diaryPreview: "我们沿着湿漉漉的路慢慢走。",
    deepLink: "yueqi://artifact/diary:diary-001",
    actionLabel: "查看日记",
  }),
  {
    diaryId: "diary-001",
    day: "2026-08-08",
    title: "雨停以后",
    preview: "我们沿着湿漉漉的路慢慢走。",
    deepLink: "yueqi://artifact/diary:diary-001",
    actionLabel: "查看日记",
  },
);

const appSource = read("src/app.js");
const chatSource = read("src/panels/chat.js");
const phoneSource = read("src/phone-shell/phone-shell.js");
const deliverySource = read("src/artifacts/project-delivery.js");
const productCss = read("src/ui/product-shell.css");
const phoneCss = read("src/ui/phone-shell.css");
const messageVisualCss = read("src/ui/chat-message-visual.css");

assert.match(appSource, /messageTimelineLabel/);
assert.match(appSource, /renderPersistedChatMessage/);
assert.match(appSource, /resolveDiaryMessageCard/);
assert.match(appSource, /dataset\.messageId/);
assert.match(appSource, /updateMessageDeliveryState/);
assert.match(chatSource, /deliveryState:\s*"sending"/);
assert.match(chatSource, /updateMessageDeliveryState\?\.\(userUiMsgId,\s*"failed"\)/);
assert.match(chatSource, /data-message-retry/);
assert.match(appSource, /flushPopDeliveries\(\{ companionId \}\)/);
assert.match(appSource, /dataset\.appMode === "phone" && typeof smallPhone\?\.openDeepLink/);
assert.match(phoneSource, /mini-chat-time-separator/);
assert.match(phoneSource, /chat-activity-note/);
assert.match(phoneSource, /data-artifact-open[\s\S]*data-deep-link/);
assert.match(phoneSource, /message-diary-card/);
assert.match(phoneSource, /flushPopDeliveries\(\{ companionId \}\)/);
assert.match(deliverySource, /projectActivityToChat/);
assert.match(deliverySource, /新的日记已经写好/);
assert.match(deliverySource, /查看日记/);
assert.match(deliverySource, /diaryTitle/);
assert.match(productCss, /\.chat-time-separator/);
assert.match(productCss, /\.chat-activity-note/);
assert.match(phoneCss, /\.mini-chat-time-separator/);
assert.match(messageVisualCss, /\.mini-activity-action/);
assert.match(messageVisualCss, /\.message-delivery/);
assert.match(messageVisualCss, /\.message-retry/);
assert.match(messageVisualCss, /\.message-diary-card/);

const storage = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
globalThis.document = { dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const { projectActivityToChat } = await import("../src/chat/activity-projection.js");
const { ensureDmConversation } = await import("../src/characters/session-context.js");
const { getMessagesBySession } = await import("../src/storage/db.js");

const companionId = "verify-activity-companion";
const projection = {
  companionId,
  kind: "diary",
  sourceId: "diary:verify-001",
  text: "新的日记已经写好",
  actionLabel: "查看日记",
  deepLink: "yueqi://artifact/diary:verify-001",
};
const first = await projectActivityToChat(projection);
const second = await projectActivityToChat(projection);
assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.equal(second.deduped, true);
const sessionId = await ensureDmConversation(companionId);
const persisted = await getMessagesBySession(sessionId, 20);
assert.equal(persisted.filter((message) => message.id === first.message.id).length, 1);
assert.equal(first.message.role, "system");
assert.equal(first.message.metadata?.kind, "activity");
assert.equal(first.message.metadata?.actionLabel, "查看日记");
assert.equal(first.message.metadata?.deepLink, projection.deepLink);

console.log("PASS chat activity timeline contract");
