import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");
const index = read("index.html");
const popLayout = read("src/ui/pop-im-layout.css");
const phoneCss = read("src/ui/phone-shell.css");
const authority = read("src/ui/chat-message-visual.css");

assert.ok(index.indexOf("chat-message-visual.css") > index.indexOf("pop-im-layout.css"));
assert.ok(index.indexOf("chat-message-visual.css") > index.indexOf("phone-shell.css"));
assert.doesNotMatch(popLayout, /\.mini-phone \.mini-message(?:\.is-(?:ai|user))?\s*\{/);
assert.doesNotMatch(popLayout, /\.mini-phone \.mini-message (?:p|footer|time)\s*\{/);
assert.doesNotMatch(phoneCss, /is-redpacket/);
assert.match(phoneCss, /\.mini-message\s*\{\s*width:\s*fit-content;\s*\}/);
assert.match(authority, /Chat message visual authority/);
assert.match(authority, /\.message-menu/);
assert.match(authority, /\.message-diary-card/);
assert.match(authority, /\.message-game-card/);
assert.match(authority, /\.message-call-card/);
assert.match(authority, /\.message-attachment-card/);

console.log("PASS chat visual authority contract");
