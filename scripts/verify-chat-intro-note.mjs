import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CHAT_INTRO_DESTINATIONS,
  renderChatIntroNote,
} from "../src/chat/intro-note.js";
import { shouldPinChatIntroNote } from "../src/chat/opening-intro.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

const appHtml = renderChatIntroNote({ locale: "zh-CN", surface: "app", collapsed: false });
const popHtml = renderChatIntroNote({ locale: "zh-CN", surface: "phone", collapsed: false });
const englishHtml = renderChatIntroNote({ locale: "en", surface: "app", collapsed: false });

for (const html of [appHtml, popHtml]) {
  assert.match(html, /class="chat-intro-note(?:\s|")/);
  assert.match(html, /data-chat-intro-note/);
  assert.match(html, /来自Nyra|来自 Nyra/);
  assert.match(html, /欢迎来到月栖/);
  assert.match(html, /我是\s*Nyra/);
  assert.match(html, /月栖/);
  assert.doesNotMatch(html, /被调用的工具|想找我的时候/);
  assert.match(html, /这里不只有聊天/);
  assert.match(html, /选我用的大脑/);
  assert.match(html, /和我一起说话/);
  assert.match(html, /让我不只住在聊天窗口里/);
  assert.doesNotMatch(html, /选择ta的大脑|和ta一起|让ta不只/);
  assert.match(html, /模型与 API/);
  assert.match(html, /权限设置/);
  assert.match(html, /这里还有更多世界/);
  assert.match(html, /栖机助手/);
  assert.match(html, /联系开发团队/);
  assert.match(html, /自己设定角色/);
  assert.match(html, /data-chat-intro-action="customize"/);
  assert.doesNotMatch(html, /书架|歌单|相册/);
  assert.doesNotMatch(html, /选择她的大脑|和她一起/);

  // Not a modal, not an onboarding step.
  assert.doesNotMatch(html, /role="dialog"|aria-modal|data-intro-close|知道了|下一步/);

  assert.equal((html.match(/class="chat-intro-note__note"/g) || []).length, 5);
  assert.doesNotMatch(html, /arrow-up-right|chat-intro-note__arrow/);
  const clickable = html.match(/<button[^>]*>/g) || [];
  assert.ok(clickable.length >= 10);
  assert.ok(clickable.some((button) => /class="chat-intro-note__link"/.test(button)));
  assert.ok(clickable.some((button) => /class="opening-setup-cta"/.test(button)));
  assert.ok(clickable.some((button) => /data-chat-intro-toggle/.test(button)));
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, />收起指南</);
}

assert.match(englishHtml, /Choose how I think/);
assert.match(englishHtml, /with me/);
assert.doesNotMatch(englishHtml, /Choose their mind|Let them live|explore with them/);
assert.match(englishHtml, /Welcome to Yueqi/);
assert.match(englishHtml, /I live in Yueqi/);
assert.match(englishHtml, /Qiji Assistant/);
assert.match(englishHtml, /Set up this character/);
assert.match(englishHtml, /Models and API/);
assert.match(englishHtml, /Botden/);
assert.doesNotMatch(englishHtml, /Books, songs/);
assert.match(englishHtml, />Close guide</);

const collapsedHtml = renderChatIntroNote({ locale: "zh-CN", surface: "app", collapsed: true });
assert.match(collapsedHtml, /is-collapsed/);
assert.match(collapsedHtml, /aria-expanded="false"/);
assert.match(collapsedHtml, /data-chat-intro-body hidden/);
assert.match(collapsedHtml, />设置与更多</);
assert.match(renderChatIntroNote(), /data-chat-intro-body hidden/);
assert.match(renderChatIntroNote(), /data-chat-intro-compose/);
assert.equal(shouldPinChatIntroNote([{ role: "user", content: "你好" }]), true);

assert.deepEqual(CHAT_INTRO_DESTINATIONS.customize, {
  app: ["settings", "identity"],
  phone: ["phone-app", "profile"],
});

assert.deepEqual(Object.keys(CHAT_INTRO_DESTINATIONS).sort(), [
  "assist",
  "botden",
  "brain",
  "contact",
  "customize",
  "explore",
  "games",
  "interface",
  "market",
  "permissions",
]);

const appSource = read("src/app.js");
const phoneSource = read("src/phone-shell/phone-shell.js");
const css = read("src/ui/chat-message-visual.css");
const emptyCss = read("src/ui/nyra-refactor.css");

assert.match(appSource, /renderChatIntroNote/);
assert.match(appSource, /data-chat-intro-action/);
assert.match(appSource, /createOpeningSetupCtaButton/);
assert.match(appSource, /insertAdjacentHTML\("afterbegin"/);
assert.match(appSource, /if \(!messages\.length\)/);
assert.match(phoneSource, /renderChatIntroNote/);
assert.match(phoneSource, /data-chat-intro-action/);
assert.match(phoneSource, /renderOpeningSetupCtaHtml/);
assert.match(phoneSource, /mini-message-list__pin[^]*chatIntroNoteHtml/);
assert.match(css, /\.chat-intro-note\b/);
assert.match(css, /\.chat-intro-note__link/);
assert.match(css, /\.opening-setup-cta\b/);
assert.match(css, /@media \(max-width:/);
assert.doesNotMatch(css, /chat-intro-guide/);
assert.doesNotMatch(emptyCss, /message-list:not\(:has\(\.message\)\)::before/);

for (const source of [appSource, phoneSource, read("src/chat/intro-note.js")]) {
  assert.doesNotMatch(source, /introSeen|onboardingSeen|intro-seen|onboarding-seen/);
}

// The first companion line must not sound like a work assistant.
for (const locale of ["src/first-light/locales/zh-CN.js", "src/first-light/locales/en.js"]) {
  const source = read(locale);
  assert.doesNotMatch(source, /对齐一下节奏|最想解决的一件事|let's sync|clear today/i);
}

console.log("PASS chat intro note contract");
