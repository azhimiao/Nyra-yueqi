/**
 * Safe, user-facing character thinking envelope.
 *
 * Tolerant of case / spacing variants so a missed tag does not wipe the bar.
 * Length is not artificially capped — keep only safety / placeholder filters.
 */

export const INNER_STATE_OPEN = "<yueqi-inner-state>";
export const INNER_STATE_CLOSE = "</yueqi-inner-state>";

const UNSAFE_META_PATTERN = /(?:system prompt|developer message|chain[- ]of[- ]thought|private reasoning|私有原始推理|系统提示词|开发者消息|提示词内容)/i;
const PROCEDURAL_META_PATTERN = /(?:工具(?:调用|结果|回执)|调用(?:工具|接口|API)|(?:执行|使用|检索|查询|获取)(?:工具|接口|API|模型|权限|结果|回执|记忆|天气|位置)|(?:查询|转换|调用|生成|处理|读取|检索)中|tool[_ -]?call|tool result|function call|runtime|prompt|api|operation|回合机制|能力状态|上下文状态|权限(?:申请|确认)|阶段(?:状态)?|正在(?:整理|梳理|组织)(?:回答|回复|语言|思路|上下文|相关记忆|最终结果|这个问题)|正在(?:检查|确认|检索|调用|执行|获取|处理|等待)(?:工具|接口|API|模型|权限|结果|回执|记忆|天气|位置|这件事|这个问题)|(?:我先|接下来|下一步)(?:整理|梳理|组织)(?:回答|回复|思路|上下文))/i;
/** Models often copy "…" from prompt examples — treat that as empty. */
const PLACEHOLDER_ONLY_PATTERN = /^(?:[.．。…⋯\u2026\u22ef\s]|真实心里话)+$/u;
const OPEN_RE = /<\s*yueqi-inner-state\s*>/i;
const CLOSE_RE = /<\s*\/\s*yueqi-inner-state\s*>/i;

/** Public sanitizer for live thinking / native reasoning_content. */
export function sanitizeInnerState(text) {
  const value = String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<\/?\s*yueqi-(?:inner-state|runtime)[^>]*>/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!value || UNSAFE_META_PATTERN.test(value)) return "";
  if (PLACEHOLDER_ONLY_PATTERN.test(value)) return "";

  // Models sometimes mix one real feeling with a procedural line. Keep the
  // feeling, but never let execution narration become a character thought.
  const visibleLines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !PROCEDURAL_META_PATTERN.test(line));
  const cleaned = visibleLines.join("\n\n").trim();
  if (!cleaned || PLACEHOLDER_ONLY_PATTERN.test(cleaned)) return "";
  return cleaned;
}

function joinVisible(before, after) {
  const left = String(before || "").trim();
  const right = String(after || "").trim();
  return [left, right].filter(Boolean).join("\n").trim();
}

function findOpen(raw) {
  const match = OPEN_RE.exec(raw);
  if (!match) return null;
  return { index: match.index, end: match.index + match[0].length, token: match[0] };
}

function findClose(raw, from) {
  CLOSE_RE.lastIndex = 0;
  const slice = raw.slice(from);
  const match = CLOSE_RE.exec(slice);
  if (!match) return null;
  return { index: from + match.index, end: from + match.index + match[0].length, token: match[0] };
}

function partialOpenMarkerStart(text) {
  const raw = String(text || "");
  const needle = "<yueqi-inner-state>";
  const max = Math.min(needle.length - 1, raw.length);
  const lower = raw.toLowerCase();
  for (let size = max; size >= 3; size -= 1) {
    if (lower.endsWith(needle.slice(0, size))) return raw.length - size;
  }
  if (/<\s*yueqi-inner-st?\s*$/i.test(raw)) {
    const at = raw.search(/<\s*yueqi-inner-st?\s*$/i);
    return at >= 0 ? at : -1;
  }
  return -1;
}

/**
 * Hide the envelope while a streamed assistant message is still arriving.
 */
export function stripInnerStatePreview(content = "") {
  const raw = String(content || "");
  const open = findOpen(raw);
  if (open) {
    const close = findClose(raw, open.end);
    if (close) return joinVisible(raw.slice(0, open.index), raw.slice(close.end));
    return raw.slice(0, open.index).trimEnd();
  }
  const partialStart = partialOpenMarkerStart(raw);
  return partialStart >= 0 ? raw.slice(0, partialStart).trimEnd() : raw;
}

/**
 * Extract the safe render layer and leave the ordinary assistant reply.
 */
export function parseInnerStateEnvelope(content = "") {
  const raw = String(content || "")
    .replace(/＜\s*yueqi-inner-state\s*＞/gi, INNER_STATE_OPEN)
    .replace(/＜\s*\/\s*yueqi-inner-state\s*＞/gi, INNER_STATE_CLOSE);
  const open = findOpen(raw);
  if (!open) {
    return { text: raw.trim(), innerState: "", complete: false, found: false };
  }
  const close = findClose(raw, open.end);
  if (!close) {
    return {
      text: raw.slice(0, open.index).trim(),
      innerState: sanitizeInnerState(raw.slice(open.end)),
      complete: false,
      found: true,
    };
  }
  return {
    text: joinVisible(raw.slice(0, open.index), raw.slice(close.end)),
    innerState: sanitizeInnerState(raw.slice(open.end, close.index)),
    complete: true,
    found: true,
  };
}
