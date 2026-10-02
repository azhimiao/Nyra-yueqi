import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeImChatText } from "./im-sanitize.js";

test("live regression: emphasis preserves names and corrected conditions", () => {
  assert.equal(sanitizeImChatText("称呼你：**林夏**。"), "称呼你：林夏");
  assert.equal(sanitizeImChatText("不是不喝咖啡，是**晚上不喝，白天可以**。"), "不是不喝咖啡，是晚上不喝，白天可以");
  assert.equal(sanitizeImChatText("我推荐**祁门红茶**，或**阿萨姆**。"), "我推荐祁门红茶，或阿萨姆");
  assert.equal(sanitizeImChatText("称呼你：**林夏", { streaming: true }), "称呼你：**林夏");
});
test("punctuated facts and roleplay actions are not guessed away", () => {
  const text = "我喝咖啡（但晚上八点以后不喝）。明天 (September 28) 在【紫藤园】见。";
  assert.equal(sanitizeImChatText(text), text.slice(0, -1));
  assert.match(sanitizeImChatText("*把伞递给你* 别淋湿了。"), /把伞递给你/);
  assert.match(sanitizeImChatText("我想了想，周六见吧。"), /周六见吧/);
});
test("explicit runtime chatter still does not become dialogue", () => {
  assert.equal(sanitizeImChatText("（查询中）"), "");
  assert.equal(sanitizeImChatText("我正在调用天气工具。\n今天下雨。"), "今天下雨");
  assert.equal(sanitizeImChatText("我正在整理房间。"), "我正在整理房间");
});
