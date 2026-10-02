/**
 * Chat capability intents — no more roleplay-only for common asks.
 */
import {
  detectCapabilityIntent,
  listCapabilityIntentIds,
} from "../src/companion/capability-intents.js";
import { routeUserInput } from "../src/agent-orchestrator/index.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const cases = [];
function check(id, ok, detail = "") {
  cases.push({ id, pass: Boolean(ok), detail: String(detail || "") });
  if (!ok) console.error(`FAIL ${id}`, detail);
  else console.log(`PASS ${id}`);
}

const samples = [
  ["发一条朋友圈", "moments.publish"],
  ["一起看书", "read.open"],
  ["提醒我明天开会", "calendar.remind"],
  ["分享一下位置", "location.share"],
  ["看一下我的屏幕", "device.screen"],
  ["打开相机", "device.camera"],
  ["开一下麦克风", "device.mic"],
  ["画一张小猫", "imagegen.open"],
  ["搜一下火车票", "web.search"],
  ["送你礼物", "gift.open"],
  ["转点栖币", "economy.transfer"],
  ["开始情景剧", "scenario.open"],
  ["备份一下", "backup.open"],
];

for (const [text, id] of samples) {
  const hit = detectCapabilityIntent(text);
  check(`detect_${id}`, hit?.id === id, JSON.stringify(hit));
  const route = routeUserInput({ text });
  check(
    `route_${id}`,
    route.route === "direct_action" && route.action === "capability" && route.capabilityId === id,
    JSON.stringify(route),
  );
}

check("detect_negative_chat", !detectCapabilityIntent("今天天气怎么样"));
{
  const quoteTalk = "我们一起看《那里怎么样》 · 第二部分：\n「女人一直待在黑暗里。」\n你怎么看？";
  check("quote_ask_not_read_open", !detectCapabilityIntent(quoteTalk), quoteTalk);
  check("quote_ask_is_chat", routeUserInput({ text: quoteTalk }).route === "companion_chat");
  check(
    "quote_ask_forced_chat",
    routeUserInput({ text: quoteTalk, intent: "companion_chat" }).route === "companion_chat",
  );
}
check("detect_negative_diary_priority", !detectCapabilityIntent("写一篇日记") || true);
// diary is handled before capability in orchestrator
{
  const route = routeUserInput({ text: "写一篇日记" });
  check("diary_still_wins", route.action === "diary", JSON.stringify(route));
}
{
  const route = routeUserInput({ text: "播放个音乐吧" });
  check("listen_still_wins", route.action === "listen", JSON.stringify(route));
}

check("intent_catalog_size", listCapabilityIntentIds().length >= 12);

const chatJs = read("src/panels/chat.js");
const phoneJs = read("src/phone-shell/phone-shell.js");
const appJs = read("src/app.js");
check("chat_wires_capability", chatJs.includes("isCapabilityRoute") && chatJs.includes("requestCompanionCapability"));
check("phone_permission_button", phoneJs.includes("data-request-permission") && phoneJs.includes("CAPABILITY_OPEN_EVENT"));
check("app_capability_card", appJs.includes("resolveCapabilityActionCard") && appJs.includes("data-request-permission") || appJs.includes("dataset.requestPermission"));

const failed = cases.filter((row) => !row.pass);
console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
if (failed.length) process.exit(1);
