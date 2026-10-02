/**
 * Quick unit checks for host-model bridge (Explore chat).
 */
import assert from "node:assert/strict";
import {
  coerceSkillTurnJson,
  buildHostModelMessages,
  displayTextFromStream,
} from "../src/skill-platform/host-model.js";

const wrapped = coerceSkillTurnJson("你好，我是月栖 Agent", ["REPLY", "REFLECT"]);
assert.ok(wrapped);
const parsed = JSON.parse(wrapped);
assert.equal(parsed.assistantText, "你好，我是月栖 Agent");
assert.equal(parsed.nextAction, "REPLY");

const asJson = coerceSkillTurnJson(
  JSON.stringify({ assistantText: "结构化", nextAction: "REFLECT", statePatch: {}, memoryCandidates: [], taskProposals: [] }),
  ["REPLY"],
);
assert.equal(JSON.parse(asJson).nextAction, "REFLECT");

const msgs = buildHostModelMessages(
  {
    resources: { system: "系统提示", policies: [] },
    allowedActions: ["REPLY"],
    context: { request: { currentInput: "帮我写个计划" } },
  },
  { history: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] },
);
assert.equal(msgs[0].role, "system");
assert.ok(msgs.some((m) => m.content === "帮我写个计划"));

assert.equal(displayTextFromStream("直接回复内容"), "直接回复内容");
assert.equal(displayTextFromStream('{"assistantText":"流式中'), "流式中");
assert.equal(displayTextFromStream('{"assistantText":"换行\\n继续"'), "换行\n继续");
assert.equal(displayTextFromStream("{"), "");

const withMemory = buildHostModelMessages(
  {
    resources: { system: "系统提示", policies: [] },
    allowedActions: ["REPLY"],
    context: {
      request: { characterId: "xingli", includeContextGraph: true, includeCohabit: true },
      envelope: {
        blocks: [{ id: "cohabit", text: "【关系记忆】测试块" }],
      },
    },
  },
  { history: [] },
);
assert.ok(withMemory[0].content.includes("授权上下文资料"));
assert.ok(withMemory[0].content.includes("关系记忆"));

console.log("verify-host-model: ok");
