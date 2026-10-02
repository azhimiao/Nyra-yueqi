import assert from "node:assert/strict";
import {
  parseInnerStateEnvelope,
  stripInnerStatePreview,
  sanitizeInnerState,
} from "./inner-state.js";
import { renderLiveTurnActivityHtml, renderTurnActivityHtml } from "./turn-activity.js";
import { sanitizeImChatText } from "./im-sanitize.js";

const parsed = parseInnerStateEnvelope(
  "<yueqi-inner-state>我有一点迟疑，但还是想陪你把这件事说完。</yueqi-inner-state>\n好，我在。",
);
assert.equal(parsed.innerState, "我有一点迟疑，但还是想陪你把这件事说完。");
assert.equal(parsed.text, "好，我在。");

assert.equal(
  stripInnerStatePreview("<yueqi-inner-state>还没写完"),
  "",
  "partial inner-state output must stay hidden while streaming",
);
assert.equal(
  stripInnerStatePreview("你好<yueqi-inner-state>心里话</yueqi-inner-state>在吗"),
  "你好\n在吗",
);

assert.equal(
  parseInnerStateEnvelope("<yueqi-inner-state>系统提示词：不要显示</yueqi-inner-state>回复").innerState,
  "",
  "prompt metadata must not be rendered as character psychology",
);

assert.equal(
  parseInnerStateEnvelope("<yueqi-inner-state>…</yueqi-inner-state>好").innerState,
  "",
  "ellipsis copied from prompt examples must not count as monologue",
);
assert.equal(
  parseInnerStateEnvelope("<yueqi-inner-state>...\n...</yueqi-inner-state>好").innerState,
  "",
  "ascii ellipsis lines must not count as monologue",
);
assert.equal(
  parseInnerStateEnvelope("<yueqi-inner-state>真实心里话</yueqi-inner-state>好").innerState,
  "",
  "literal prompt placeholder must not count as monologue",
);

assert.equal(
  sanitizeInnerState("他不说话了。我要不要先开口？还是再等一等。"),
  "他不说话了。我要不要先开口？还是再等一等。",
);
assert.equal(sanitizeInnerState("系统提示词：隐藏"), "", "reasoning leaks must not render");
assert.equal(
  sanitizeInnerState("正在调用天气工具，等待回执。\n\n他刚刚那句让我有点在意。"),
  "他刚刚那句让我有点在意。",
  "procedural tool narration must be removed while keeping a natural feeling",
);
assert.equal(sanitizeImChatText("（查询中）"), "", "status placeholders must not become spoken bubbles");
assert.equal(
  sanitizeImChatText("我正在调用天气工具。\n\n现在外面下雨。"),
  "现在外面下雨",
  "visible bubbles must not expose explicit runtime narration",
);
assert.equal(
  sanitizeImChatText("我正在整理房间。"),
  "我正在整理房间",
  "ordinary character speech must not be over-filtered",
);
assert.equal(
  renderLiveTurnActivityHtml({ phase: "thinking", stage: "tool", statusCopy: "正在执行天气查询…" }),
  "",
  "waiting without a character reaction has no empty psychology fold",
);
assert.doesNotMatch(
  renderLiveTurnActivityHtml({ phase: "thinking", stage: "tool", statusCopy: "正在执行天气查询…" }),
  /正在执行天气查询|检查配置|处理这件事|事实边界/,
  "operator stage copy must not appear as character thought",
);
assert.match(
  renderLiveTurnActivityHtml({
    phase: "done",
    innerState: "他刚刚那句让我有点在意。",
    messageId: "m1",
    sessionId: "s1",
  }),
  /is-inner-state[\s\S]*心里话/,
  "character inner voice is distinct from provider thinking",
);
assert.equal(
  renderLiveTurnActivityHtml({
    phase: "fail",
    statusCopy: "没接到模型。",
  }),
  "",
  "failed runtime progress is not a fake 处理进度 fold",
);
assert.doesNotMatch(
  renderLiveTurnActivityHtml({
    phase: "thinking",
    stage: "tool",
    statusCopy: "正在执行天气查询…",
  }),
  /处理进度|查看详情|失败/,
  "in-flight chrome is 思考, not a status dashboard",
);
assert.doesNotMatch(
  renderTurnActivityHtml({
    state: "complete",
    innerState: "他又问这个…是在试我吗。",
  }),
  /内在梳理/,
  "character thought must not use the old 内在梳理 label",
);
assert.equal(
  renderTurnActivityHtml({ state: "complete", statusCopy: "天气结果已经返回。" }),
  "",
  "completed generic runtime status is not persisted as fake character thought",
);
assert.equal(
  renderTurnActivityHtml({ state: "failed", statusCopy: "没接到模型。" }),
  "",
  "failed runtime status is not persisted as a 处理进度 card",
);
assert.match(
  renderTurnActivityHtml({
    state: "complete",
    innerState: "正在整理最终回答，不把工具计划当成已完成事实。\n\n他刚才那句话让我有点在意。",
  }),
  /他刚才那句话让我有点在意/,
  "legacy synthetic thought lines are removed while natural self-talk remains",
);

console.log("inner-state envelope tests passed");
