import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CHAT_FEEDBACK_EVENT, notifyChatFeedback } from "../src/chat/feedback.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const appSource = read("src/app.js");
const chatSource = read("src/panels/chat.js");
const css = read("src/ui/chat-message-visual.css");

assert.equal(CHAT_FEEDBACK_EVENT, "yueqi:chat-feedback");
assert.equal(notifyChatFeedback("server-side no-op"), false);
assert.match(appSource, /mountChatFeedbackCenter\(document\)/);
assert.match(chatSource, /notifyChatFeedback/);
assert.doesNotMatch(chatSource, /window\.alert/);
assert.match(css, /\.chat-feedback-host/);
assert.match(css, /\.chat-feedback-host\[data-visible="true"\]/);

console.log("PASS chat feedback contract");
