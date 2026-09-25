/** MemPalace Recall Protocol — question-driven Deep Recall, not reflexive. */

const GREENFIELD_RE =
  /^(改|修|换|删|加|重命名|rename|fix|typo)\s*.{0,12}(名|变量|函数|bug|拼写|错别字)?$/i;

/** Explicit memory / past cues → Deep Recall. */
const RECALL_HINT_RE =
  /还记得|上次|之前|以前|那时候|经历过|你的过去|角色过去|怎么被创造|如何被创造|谁创造了你|制造史|开发期|诞生|出生史|名字|名号|起名|起源|形成|我们.{0,8}(过|说过|聊过|做过|谈过)|决定|说过|喜欢|讨厌|谁是|什么是|什么时候|哪天|那次|回忆|想起|日记|陪伴|难过|开心|生气|失眠|下雨|周年|在一起|你不是说过|你说过你/;

const KNOWLEDGE_RECALL_RE = /知道|了解|介绍|讲讲|说说|告诉我|是什么/;
const MEMORY_TOPIC_RE = /记忆|回忆|过去|经历|名字|起源|形成|日记|约定|发生|世界|设定|关系/;

/** Deixis / anaphora that needs prior grounding (“还是上次那个地方”). */
const DEIXIS_RECALL_RE =
  /还是上次|还是那里|那个地方|那家店|那个人|那件事|那条|那个项目|上次那个|继续上次|接着说|你刚说|刚才提到/;

/** Open thread / promise / project cues. */
const THREAD_RECALL_RE =
  /约定|答应|承诺|未完成|项目进度|还没做|跟进|待办/;

/**
 * Structured whyRecall for Inspector (not free-form model prose).
 * @param {string} query
 * @param {{ mode?: string, force?: boolean }} [opts]
 * @returns {{
 *   depth: "none"|"deep"|"forced",
 *   reason: string,
 *   whyRecall: string,
 *   shouldRecall: boolean,
 * }}
 */
export function classifyRecall(query, opts = {}) {
  const text = String(query || "").trim();
  if (opts.force === true || opts.mode === "always") {
    return {
      depth: "forced",
      reason: "forced",
      whyRecall: "forced",
      shouldRecall: true,
    };
  }
  if (!text) {
    return { depth: "none", reason: "empty", whyRecall: "empty", shouldRecall: false };
  }
  if (text.length < 4) {
    return {
      depth: "none",
      reason: "too_short",
      whyRecall: "continuous_context_only",
      shouldRecall: false,
    };
  }
  if (GREENFIELD_RE.test(text)) {
    return {
      depth: "none",
      reason: "greenfield_edit",
      whyRecall: "greenfield_edit",
      shouldRecall: false,
    };
  }
  if (DEIXIS_RECALL_RE.test(text)) {
    return {
      depth: "deep",
      reason: "deixis",
      whyRecall: "semantic_history_dependency",
      shouldRecall: true,
    };
  }
  if (THREAD_RECALL_RE.test(text)) {
    return {
      depth: "deep",
      reason: "open_thread",
      whyRecall: "unresolved_thread",
      shouldRecall: true,
    };
  }
  if (
    RECALL_HINT_RE.test(text)
    || (KNOWLEDGE_RECALL_RE.test(text) && MEMORY_TOPIC_RE.test(text))
    || (/[?？]/.test(text) && /吗|呢|么|什么|谁|哪|记得|想起/.test(text))
  ) {
    return {
      depth: "deep",
      reason: "memory_hint",
      whyRecall: "explicit_reference",
      shouldRecall: true,
    };
  }
  // no length>=18 hard force — long chit-chat must not dump Palace.
  return {
    depth: "none",
    reason: "continuous_only",
    whyRecall: "continuous_context_only",
    shouldRecall: false,
  };
}

export function shouldRecall(query, { mode = "protocol" } = {}) {
  return classifyRecall(query, { mode }).shouldRecall;
}

export function classifyRecallDepth(query, opts = {}) {
  return classifyRecall(query, opts).depth;
}

export function classifyRecallReason(query, opts = {}) {
  return classifyRecall(query, opts).whyRecall || classifyRecall(query, opts).reason;
}

export function inferWingRoom(query) {
  const text = String(query || "");
  // Product/world concepts belong to World Book, not the companion's private
  // autobiography. This must run before the generic "自己的记忆" pattern.
  if (/记忆宫殿|记忆库|世界书|月栖|小手机|Pop|First Light/.test(text)) {
    return { wing: "World", room: "General", worldConcept: true };
  }
  // Shared-life questions must win before the generic "你以前..." pattern.
  // Otherwise a question such as "我们以前一起做过什么" can accidentally
  // pull authored character history instead of lived relationship evidence.
  if (
    /我们|我和你|你和我|共同|一起|我说过|我以前|关于我/.test(text)
    || /你.{0,12}(记得|知道).{0,12}我/.test(text)
    || /我.{0,12}(喜欢|讨厌|说过|提过|告诉过|习惯|偏好|名字|生日)/.test(text)
  ) {
    return { wing: "Relationship", room: null };
  }

  // Diary as a product record is distinct from the character's own memory of
  // first learning to write one.
  if (/日记(里|中|本)?(?:有什么|写了什么|内容)|今天.*日记|昨晚.*日记|最近.*日记/.test(text)) {
    return { wing: "Relationship", room: "Diary" };
  }

  const asksCharacterPast = /你是谁|经历过|你的过去|角色过去|怎么被创造|如何被创造|谁创造了你|制造史|开发期|诞生|出生史|名字|名号|起名|起源|形成|哪里来的/.test(text)
    || (
      /你.{0,12}(第一次|曾经|以前|过去|自己的|记忆|听过|见过|怎么看|记得).{0,12}(什么|哪些|事情|吗|呢)?/.test(text)
      && !/今天|昨晚|这次/.test(text)
    );
  if (asksCharacterPast) {
    return { wing: "Character", room: null, characterPast: true };
  }
  if (/书|读|章节|摘录|共读/.test(text)) return { wing: "World", room: "Reading" };
  if (/日记|今天写|昨晚|24小时/.test(text)) return { wing: "Relationship", room: "Diary" };
  if (/场景|世界|设定|世界书/.test(text)) return { wing: "World", room: "General" };
  if (/雨|睡|夜|安|陪|亲|回|想|难过/.test(text)) return { wing: "Relationship", room: null };
  return { wing: null, room: null };
}
