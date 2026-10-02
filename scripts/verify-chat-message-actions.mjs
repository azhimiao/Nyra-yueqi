import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  __setConversationStorageForTests,
  clearAllConversations,
  getOrCreateActiveSession,
  getSession,
  getSharedHistory,
  sendUser,
} from "../src/conversation/index.js";
import {
  markMessageReadState,
  persistMessageState,
  recallMessageState,
  toggleMessageReaction,
} from "../src/chat/message-actions.js";
import {
  applyMessageDelete,
  applyMessageEdit,
  resolveMessageMenuActions,
} from "../src/chat/message-ops.js";
import { renderMessageMenuHtml } from "../src/chat/message-menu.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

__setConversationStorageForTests(memoryStorage());
clearAllConversations();
const session = getOrCreateActiveSession({ characterId: "char-actions" });
const sent = sendUser(session.id, "hello", { clientMessageId: "ui-actions-1" });
assert.equal(sent.ok, true);

let state = toggleMessageReaction({}, "❤️", "local");
assert.deepEqual(state.reactions, { "❤️": ["local"] });
state = markMessageReadState({ messageState: state }, "2026-08-15T08:00:00.000Z");
assert.equal(state.readAt, "2026-08-15T08:00:00.000Z");
state = recallMessageState({ messageState: state }, "2026-08-15T08:01:00.000Z");
assert.equal(state.recalledAt, "2026-08-15T08:01:00.000Z");

let projection = null;
const persisted = await persistMessageState({
  message: {
    id: "ui-actions-1",
    sessionId: "chat-actions",
    role: "user",
    content: "hello",
    metadata: { conversationSessionId: session.id },
  },
  messageState: state,
  saveChatMessage: async (message) => {
    projection = message;
    return message;
  },
});
assert.equal(persisted.ok, true);
assert.equal(persisted.projected, true);
assert.equal(projection.metadata.messageState.recalledAt, "2026-08-15T08:01:00.000Z");
const updated = getSession(session.id);
assert.equal(updated.messageNodes[sent.node.id].meta.messageState.readAt, "2026-08-15T08:00:00.000Z");

// Menu contract: every role can edit and delete; regenerate is last-reply only.
const userActions = resolveMessageMenuActions({ role: "user" }, {});
assert.deepEqual(userActions, ["edit", "reply", "react", "delete"]);
const staleAssistant = resolveMessageMenuActions({ role: "assistant" }, {});
assert.deepEqual(staleAssistant, ["edit", "reply", "react", "delete"]);
const lastAssistant = resolveMessageMenuActions({ role: "assistant" }, { isLastAssistant: true });
assert.deepEqual(lastAssistant, ["edit", "reply", "regenerate", "react", "delete"]);
// Pending still gets menu chrome; CSS hides non-delete until the send settles.
assert.deepEqual(
  resolveMessageMenuActions({ role: "user" }, { pending: true }),
  ["edit", "reply", "react", "delete"],
);

const menuHtml = renderMessageMenuHtml(lastAssistant, { locale: "zh-CN" });
assert.match(menuHtml, /data-message-menu-trigger/);
assert.match(menuHtml, /data-message-menu-list/);
for (const action of lastAssistant) {
  assert.match(menuHtml, new RegExp(`data-message-action="${action}"`));
}
assert.equal(renderMessageMenuHtml([], {}), "");

// Edit rewrites the V2 candidate and the projection; delete tombstones both.
const editSent = sendUser(session.id, "before", { clientMessageId: "ui-actions-2" });
let editProjection = null;
const edited = await applyMessageEdit({
  message: {
    id: "ui-actions-2",
    role: "user",
    content: "before",
    metadata: { conversationSessionId: session.id },
  },
  text: "after",
  saveChatMessage: async (message) => {
    editProjection = message;
    return message;
  },
});
assert.equal(edited.ok, true);
assert.equal(editProjection.content, "after");
const editedNode = getSession(session.id).messageNodes[editSent.node.id];
const editedCandidate = editedNode.candidates.find((c) => c.id === editedNode.activeCandidateId);
assert.equal(editedCandidate.content, "after");
assert.equal(editedCandidate.revisions.at(-1).content, "before");
assert.equal((await applyMessageEdit({ message: { id: "x" }, text: "  " })).ok, false);

let deletedFrom = null;
const removed = await applyMessageDelete({
  message: { id: "ui-actions-2", role: "user", metadata: { conversationSessionId: session.id } },
  deleteRecord: async (storeName, id) => {
    deletedFrom = { storeName, id };
  },
});
assert.equal(removed.ok, true);
assert.deepEqual(deletedFrom, { storeName: "messages", id: "ui-actions-2" });
assert.ok(getSession(session.id).messageNodes[editSent.node.id].meta.deletedAt);
assert.equal(
  getSharedHistory(session.id).some((row) => row.content === "after" || row.content === "before"),
  false,
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const appSource = read("src/app.js");
const chatSource = read("src/panels/chat.js");
const phoneSource = read("src/phone-shell/phone-shell.js");
const css = read("src/ui/chat-message-visual.css");
assert.match(appSource, /message-reply-preview/);
assert.match(appSource, /wireMessageReadReceipts/);
assert.match(chatSource, /pendingReply/);
assert.match(phoneSource, /renderMessageMenuHtml/);
assert.match(appSource, /renderMessageMenuHtml/);
// The bubble no longer repeats the clock or paints delivery ticks.
assert.doesNotMatch(appSource, /footer\.className = "message-footer"/);
assert.doesNotMatch(phoneSource, /check-check/);
assert.doesNotMatch(css, /\.message-footer time/);
assert.match(css, /\.message-menu/);
assert.match(css, /\.message-reactions/);
assert.match(css, /\.message-recalled-copy/);
assert.match(css, /\.has-message-menu:not\(\.has-turn-activity\)[\s\S]*margin-bottom:\s*16px/);
assert.match(css, /:not\(\.has-turn-activity\)\s*>\s*\.message-menu[\s\S]*top:\s*calc\(100%/);
assert.match(appSource, /has-message-menu/);
assert.match(phoneSource, /has-message-menu/);

console.log("PASS chat message action contract");
