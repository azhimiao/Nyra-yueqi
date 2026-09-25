/**
 * Strip novel/stage-direction fluff from IM chat bubbles.
 * Keeps short emoticon-like parentheses (≤3 chars), e.g. （笑）.
 */

const LONG_FULLWIDTH_PAREN = /（[^）]{4,}）/g;
const LONG_HALFWIDTH_PAREN = /\([^)]{4,}\)/g;
const ASTERISK_ACTION = /\*[^*\n]{1,48}\*/g;
const BRACKET_STAGE = /【[^】\n]{1,48}】/g;
const NARRATIVE_SHE_LINE = /^(?:她|他|我)(?:轻轻|微微|慢慢)?(?:地)?(?:顿了顿|看了看|笑了笑|想了想|叹了口气).*$/gm;
// The visible bubble is spoken by the character, never by the runtime. Only
// remove explicit implementation language; ordinary phrases such as “我查
// 一下” remain valid character dialogue.
const INTERNAL_RUNTIME_LINE = /(?:工具(?:调用|结果|回执)|调用(?:工具|接口|API)|(?:执行|使用|检索|查询|获取)(?:工具|接口|API|模型|权限|结果|回执|记忆|天气|位置)|(?:查询|转换|调用|生成|处理|读取|检索)中|tool[_ -]?call|function call|runtime|prompt|回合机制|能力状态|上下文状态|权限(?:申请|确认)|正在(?:整理|梳理|组织)(?:回答|回复|语言|思路|上下文|相关记忆|最终结果|这个问题)|正在(?:检查|确认|检索|调用|执行|获取|处理|等待)(?:工具|接口|API|模型|权限|结果|回执|记忆|天气|位置|这件事|这个问题)|(?:我先|接下来|下一步)(?:整理|梳理|组织)(?:回答|回复|思路|上下文))/i;

/**
 * @param {string} text
 * @param {{ streaming?: boolean }} [opts]
 *   streaming: skip trailing punctuation trim so mid-reply chars do not flicker.
 * @returns {string}
 */
export function sanitizeImChatText(text, opts = {}) {
  const streaming = Boolean(opts.streaming);
  let s = String(text || "");
  if (!s) return "";

  s = s.replace(ASTERISK_ACTION, "");
  s = s.replace(BRACKET_STAGE, "");
  s = s.replace(LONG_FULLWIDTH_PAREN, "");
  s = s.replace(LONG_HALFWIDTH_PAREN, "");
  s = s.replace(NARRATIVE_SHE_LINE, "");
  s = s
    .split(/\n+/)
    .filter((line) => line.trim() && !INTERNAL_RUNTIME_LINE.test(line))
    .join("\n\n");

  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ");

  if (streaming) {
    // Only peel leading junk while tokens are still arriving.
    return s.replace(/^[，。、；：\s]+/g, "");
  }

  return s
    .replace(/^[，。、；：\s]+|[，。、；：\s]+$/g, "")
    .trim();
}
