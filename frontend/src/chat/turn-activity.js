/**
 * Character thinking fold for one companion turn.
 *
 * Collapsed: label only ("思考") — no peek of the body.
 * Expanded: one continuous, user-facing character thought stream.
 *
 * Important: do NOT strip the AI message card or hide the bubble until real
 * thinking text exists — otherwise every reply looks like “cards vanished”.
 */

import { ensureMessageBubbleShell, resolveMessageBodyParagraph, setMessageBodyText } from "./message-body.js";
import { emitChatTurnProgress } from "./turn-progress-event.js";
import { sanitizeInnerState } from "./inner-state.js";

const THINKING_LABEL = "思考";

const SYNTHETIC_RUNTIME_PHRASES = Object.freeze([
  "正在整理最终回答",
  "正在梳理回应方向",
  "正在把问题、角色状态和事实边界放在一起判断",
  "工具结果已经回来",
  "正在整理回答并逐字送达",
  "正在确认这句话是否包含需要处理的意图",
  "正在整理当前状态与相关记忆",
  "没有找到可用的相关记忆",
  "只显示阶段",
  "不展示模型私有推理",
  "不把工具计划当成已完成事实",
  "我先把这句话听完整",
  "正在执行天气查询",
]);
const SYNTHETIC_RUNTIME_STAGE = /^(?:正在)?(?:检查配置与权限|回看相关内容|理解这句话|想想怎么回应|执行请求|处理请求|核对结果|整理回复|保存结果|等待权限|准备|处理这件事)/;
const FOLD_STORAGE_PREFIX = "yueqi.turn-activity-fold.v1";
const COPY_REVEAL_STATE = new WeakMap();

function foldStorageKey(snapshot = {}) {
  const sessionId = String(snapshot.sessionId || "").trim();
  const messageId = String(snapshot.messageId || "").trim();
  if (!sessionId || !messageId || typeof window === "undefined") return "";
  return `${FOLD_STORAGE_PREFIX}:${sessionId}:${messageId}`;
}

function readFoldPreference(snapshot = {}) {
  const key = foldStorageKey(snapshot);
  if (!key) return null;
  try {
    const value = window.localStorage.getItem(key);
    return value === "1" ? true : value === "0" ? false : null;
  } catch {
    return null;
  }
}

function writeFoldPreference(snapshot = {}, collapsed = false) {
  const key = foldStorageKey(snapshot);
  writeFoldPreferenceByKey(key, collapsed);
}

function writeFoldPreferenceByKey(key, collapsed = false) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, collapsed ? "1" : "0");
  } catch {
    /* ignore quota/private mode */
  }
}

function makeNode(tag, className, text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function isSyntheticRuntimeThought(line) {
  const text = String(line || "").trim();
  if (!text) return true;
  if (/^找到\d+条相关记忆/.test(text)) return true;
  if (SYNTHETIC_RUNTIME_STAGE.test(text)) return true;
  return SYNTHETIC_RUNTIME_PHRASES.some((phrase) => text.includes(phrase));
}

/** Sanitize placeholders; do not truncate meaningful thinking. */
function sanitizeThinkingText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(?:[.．。…⋯\u2026\u22ef\s]|真实心里话)+$/u.test(text)) return "";
  if (isSyntheticRuntimeThought(text)) return "";
  return text;
}

function stripSyntheticRuntimeThought(text) {
  return String(text || "")
    .split(/\n{2,}|\n/)
    .map((line) => line.trim())
    .filter((line) => line && !isSyntheticRuntimeThought(line))
    .join("\n\n");
}

function escapeActivityHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveInnerState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "";
  return stripSyntheticRuntimeThought(sanitizeInnerState(snapshot.innerState || ""));
}

function foldActionLabel(open) {
  return open ? "收起" : "展开";
}

export function turnActivityFoldLabel(open, innerState) {
  return foldActionLabel(open, innerState);
}

function renderActivitySummary({ label, open, innerState } = {}) {
  return `<summary class="message-turn-activity__summary">
    <span class="message-turn-activity__label">${escapeActivityHtml(label || THINKING_LABEL)}</span>
    <span class="message-turn-activity__toggle" aria-hidden="true">${escapeActivityHtml(foldActionLabel(Boolean(open), Boolean(innerState)))}</span>
  </summary>`;
}

/**
 * Persistable HTML: collapsed by default; expand to read. No peek preview.
 * Same class names in App and Pop — shell chrome differs; thinking chrome does not.
 */
export function renderTurnActivityHtml(snapshot, _opts = {}) {
  const innerState = resolveInnerState(snapshot);
  if (!innerState) return "";
  const label = THINKING_LABEL;
  const body = innerState;
  const stateClass = snapshot?.state === "failed"
    ? "is-failed"
    : snapshot?.state === "awaiting_approval"
      ? "is-waiting"
      : "is-complete";
  const storedCollapsed = readFoldPreference(snapshot);
  const open = storedCollapsed == null ? Boolean(innerState) : !storedCollapsed;
  const foldKey = foldStorageKey(snapshot);
  return `<details class="message-turn-activity ${stateClass}${innerState ? " is-inner-state" : " is-runtime-progress"}" data-persisted-turn-activity data-inner-psychology${foldKey ? ` data-fold-key="${escapeActivityHtml(foldKey)}"` : ""} ${open ? "open" : ""}>
    ${renderActivitySummary({ label, open, innerState })}
    <div class="message-turn-activity__copy">${escapeActivityHtml(body)}</div>
  </details>`;
}

/** In-flight fold for Pop: show 思考 even before innerState text arrives. */
export function renderLiveTurnActivityHtml(turn = {}) {
  const phase = String(turn.phase || "start");
  const innerState = resolveInnerState(turn);
  if (!innerState && (phase === "done" || phase === "fail")) return "";
  if (!innerState && phase !== "done" && phase !== "fail") {
    const label = THINKING_LABEL;
    return `<details class="message-turn-activity is-waiting is-runtime-progress" open data-live-turn-activity data-turn-activity data-inner-psychology>
    ${renderActivitySummary({ label, open: true, innerState: "" })}
    <div class="message-turn-activity__copy"></div>
  </details>`;
  }
  if (!innerState) return "";
  const open = true;
  const cls = "is-complete is-inner-state";
  const label = THINKING_LABEL;
  return `<details class="message-turn-activity ${cls}" ${open ? "open" : ""} data-live-turn-activity data-turn-activity data-inner-psychology>
    ${renderActivitySummary({ label, open, innerState })}
    <div class="message-turn-activity__copy">${escapeActivityHtml(innerState)}</div>
  </details>`;
}

/** Bind fold state for messages restored from Conversation V2 / IndexedDB. */
export function bindTurnActivityFolds(root = document) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll("details[data-persisted-turn-activity]").forEach((details) => {
    if (details.dataset.foldBound === "1") return;
    details.dataset.foldBound = "1";
    const action = details.querySelector(".message-turn-activity__toggle");
    const inner = details.classList.contains("is-inner-state");
    const sync = ({ persist = false } = {}) => {
      if (action) action.textContent = foldActionLabel(details.open, inner);
      if (persist) writeFoldPreferenceByKey(details.dataset.foldKey || "", !details.open);
    };
    details.addEventListener("toggle", () => sync({ persist: true }));
    // WebView versions differ on whether the non-bubbling toggle event fires
    // before or after a summary click; this keeps the label and storage in sync.
    details.addEventListener("click", (event) => {
      if (!event.target.closest?.("summary")) return;
      window.setTimeout(() => sync({ persist: true }), 0);
    });
    sync();
  });
}

/** Use the same restrained typewriter pacing for phone-rendered live turns. */
export function revealTurnActivityText(node, text = "", { animate = true } = {}) {
  if (!node) return;
  const target = stripSyntheticRuntimeThought(String(text || "").trim());
  const previous = COPY_REVEAL_STATE.get(node);
  if (!animate) {
    if (previous?.timer) window.clearInterval(previous.timer);
    COPY_REVEAL_STATE.set(node, { target, shown: target, timer: 0 });
    node.textContent = target;
    return;
  }
  if (previous?.target === target && previous.shown.length >= target.length) return;
  let shown = previous?.target && target.startsWith(previous.shown) ? previous.shown : "";
  if (previous?.timer) window.clearInterval(previous.timer);
  const state = { target, shown, timer: 0 };
  const tick = () => {
    const remaining = state.target.length - state.shown.length;
    if (remaining <= 0) {
      if (state.timer) window.clearInterval(state.timer);
      state.timer = 0;
      return;
    }
    state.shown = state.target.slice(0, state.shown.length + (remaining > 180 ? 4 : remaining > 70 ? 3 : 2));
    node.textContent = state.shown;
    if (state.shown.length >= state.target.length && state.timer) {
      window.clearInterval(state.timer);
      state.timer = 0;
    }
  };
  COPY_REVEAL_STATE.set(node, state);
  tick();
  state.timer = window.setInterval(tick, 52);
}

function mountPsychologyHost(article, host) {
  if (!article || !host) return;
  const reply = article.querySelector(".message-reply-preview");
  if (reply?.nextSibling) {
    article.insertBefore(host, reply.nextSibling);
    return;
  }
  if (reply) {
    article.append(host);
    return;
  }
  const recalled = article.querySelector(".message-recalled-copy");
  if (recalled?.nextSibling) {
    article.insertBefore(host, recalled.nextSibling);
    return;
  }
  const body = resolveMessageBodyParagraph(article)
    || article.querySelector(
      ".message-bubble, .message-row, .message-attachment-card, .message-sticker, .message-token, .message-location-wrap, .message-artifact, .chat-activity-note, .message-diary-card, [data-voice-bar]",
    );
  if (body) {
    article.insertBefore(host, body.closest?.(".message-bubble") || body);
    return;
  }
  article.prepend(host);
}

/**
 * Live controller for one in-flight assistant bubble.
 */
export function createTurnActivityView(article, options = {}) {
  if (!article || typeof document === "undefined") return null;
  const existing = article.querySelector("[data-turn-activity]");
  if (existing?.__turnActivityController) return existing.__turnActivityController;

  const startedAt = Date.now();
  const host = document.createElement("details");
  host.className = "message-turn-activity is-waiting";
  host.dataset.turnActivity = "true";
  host.dataset.innerPsychology = "true";
  host.open = true;
  host.hidden = true;
  const foldSnapshot = {
    sessionId: String(options.sessionId || "").trim(),
    messageId: String(options.messageId || article.dataset.messageId || "").trim(),
  };
  const storedCollapsed = readFoldPreference(foldSnapshot);
  if (storedCollapsed != null) host.open = !storedCollapsed;
  const initialFoldKey = foldStorageKey(foldSnapshot);
  if (initialFoldKey) host.dataset.foldKey = initialFoldKey;

  const summary = makeNode("summary", "message-turn-activity__summary");
  const label = makeNode("span", "message-turn-activity__label", THINKING_LABEL);
  const state = makeNode("span", "message-turn-activity__state", "");
  const toggle = makeNode("span", "message-turn-activity__toggle", foldActionLabel(host.open, true));
  toggle.setAttribute("aria-hidden", "true");
  summary.append(label, state, toggle);
  const copy = makeNode("div", "message-turn-activity__copy", "");
  host.append(summary, copy);
  mountPsychologyHost(article, host);
  ensureMessageBubbleShell(article);

  const snapshot = {
    version: 4,
    state: "running",
    phase: "inner_state",
    phaseLabel: THINKING_LABEL,
    memoryCount: null,
    mood: String(options.mood || "").trim() || "平静",
    innerState: "",
    stateCopy: "",
    statusCopy: "",
    stage: "start",
    operation: "",
    approvalPending: false,
    thoughtMs: 0,
    thoughtSeconds: 0,
    steps: [],
    tools: [],
    sessionId: foldSnapshot.sessionId,
    messageId: foldSnapshot.messageId,
  };

  let finished = false;
  let psychologyComplete = false;
  let psychologyActive = false;
  let revealTimer = 0;
  let revealTarget = "";
  let revealedText = "";
  let foldEventsReady = false;
  window.setTimeout(() => {
    foldEventsReady = true;
  }, 0);

  function syncToggleCopy() {
    toggle.textContent = foldActionLabel(host.open, Boolean(snapshot.innerState));
  }

  function persistFoldState() {
    syncToggleCopy();
    if (!foldEventsReady) return;
    if (host.dataset.foldSync === "1") {
      delete host.dataset.foldSync;
      return;
    }
    writeFoldPreference(snapshot, !host.open);
  }

  host.addEventListener("toggle", persistFoldState);

  function paintInnerStateSlowly(value) {
    const target = String(value || "");
    if (!target) {
      revealTarget = "";
      revealedText = "";
      if (revealTimer) window.clearInterval(revealTimer);
      revealTimer = 0;
      copy.textContent = "";
      return;
    }
    if (target === revealTarget && revealedText.length >= target.length) return;
    revealTarget = target;
    if (revealedText.length > target.length || !target.startsWith(revealedText)) {
      revealedText = "";
    }
    const reveal = () => {
      if (!revealTarget) return;
      const remaining = revealTarget.length - revealedText.length;
      if (remaining <= 0) {
        if (revealTimer) window.clearInterval(revealTimer);
        revealTimer = 0;
        return;
      }
      const step = remaining > 220 ? 4 : remaining > 90 ? 3 : 2;
      revealedText = revealTarget.slice(0, revealedText.length + step);
      copy.textContent = stripSyntheticRuntimeThought(revealedText);
      if (revealedText.length >= revealTarget.length && revealTimer) {
        window.clearInterval(revealTimer);
        revealTimer = 0;
      }
    };
    reveal();
    if (!revealTimer) revealTimer = window.setInterval(reveal, 52);
  }

  function emitProgress(phase = snapshot.stage || "thinking") {
    const messageId = String(options.messageId || article.dataset.messageId || "").trim();
    if (!messageId) return;
    emitChatTurnProgress({
      sessionId: String(options.sessionId || article.dataset.conversationSessionId || "").trim(),
      characterId: String(options.characterId || "").trim(),
      messageId,
      phase,
      stage: snapshot.stage,
      statusCopy: snapshot.statusCopy || snapshot.stateCopy,
      operation: snapshot.operation,
      innerState: snapshot.innerState,
      visibleText: String(options.visibleText || ""),
    });
  }

  function setBubblePending(pending) {
    article.classList.toggle("is-psychology-pending", Boolean(pending) && psychologyActive);
  }

  function activatePsychologyChrome() {
    if (psychologyActive) return;
    psychologyActive = true;
    host.hidden = false;
    ensureMessageBubbleShell(article, { psychology: true });
    article.classList.add("has-turn-activity");
  }

  function deactivatePsychologyChrome() {
    psychologyActive = false;
    host.dataset.foldSync = "1";
    host.hidden = true;
    host.open = false;
    article.classList.remove("has-turn-activity", "is-psychology-pending");
  }

  function paint(text, { waiting = false, failed = false } = {}) {
    const value = sanitizeThinkingText(text);
    const body = snapshot.innerState || value;
    if (snapshot.innerState) {
      paintInnerStateSlowly(snapshot.innerState);
    } else {
      copy.textContent = body;
    }
    host.classList.toggle("is-waiting", waiting && !finished);
    host.classList.toggle("is-failed", failed);
    host.classList.toggle("is-complete", finished && !failed);
    host.classList.toggle("is-inner-state", Boolean(snapshot.innerState));
    host.classList.toggle("is-runtime-progress", !snapshot.innerState);
    if (body || waiting || failed) {
      activatePsychologyChrome();
      if (!finished && readFoldPreference(snapshot) == null) {
        if (!host.open) {
          host.dataset.foldSync = "1";
          host.open = true;
        }
      }
      label.textContent = THINKING_LABEL;
      state.textContent = "";
      syncToggleCopy();
      setBubblePending(waiting && !psychologyComplete);
    }
  }

  const controller = {
    setHeadline(text) {
      setMessageBodyText(article, text);
    },
    setPhase(phase = "thinking", status = "active", copyText = "") {
      snapshot.stage = String(phase || "thinking");
      snapshot.phase = snapshot.stage;
      const safe = sanitizeThinkingText(copyText);
      if (safe) {
        snapshot.statusCopy = safe;
        snapshot.stateCopy = safe;
      }
      paint(safe, { waiting: status === "active", failed: status === "failed" });
      emitProgress(
        status === "failed"
          ? "fail"
          : status === "awaiting_approval"
            ? "awaiting_approval"
            : "thinking",
      );
    },
    recordTool(operation = "tool", status = "planned", copyText = "") {
      snapshot.operation = String(operation || "tool").trim();
      snapshot.approvalPending = status === "awaiting_approval";
      const safe = sanitizeThinkingText(copyText);
      if (safe) {
        snapshot.statusCopy = safe;
        snapshot.stateCopy = safe;
      }
      snapshot.tools = [
        ...snapshot.tools.filter((item) => item.operation !== snapshot.operation),
        { operation: snapshot.operation, status: String(status || "planned"), summary: safe },
      ].slice(-8);
      paint(safe, { waiting: status !== "succeeded" && status !== "failed", failed: status === "failed" });
      emitProgress(
        status === "failed"
          ? "fail"
          : status === "awaiting_approval"
            ? "awaiting_approval"
            : status === "succeeded"
              ? "thinking"
              : "thinking",
      );
    },
    setState(next = {}) {
      if (next.memoryCount != null) snapshot.memoryCount = Number(next.memoryCount) || 0;
      if (next.mood != null) snapshot.mood = String(next.mood || "").trim() || snapshot.mood;
      if (next.copy) {
        snapshot.stateCopy = sanitizeThinkingText(next.copy);
        snapshot.statusCopy = snapshot.stateCopy;
        paint(snapshot.statusCopy, { waiting: !finished });
      }
      emitProgress(snapshot.stage || "start");
    },
    setInnerState(text = "", { complete = false } = {}) {
      const value = stripSyntheticRuntimeThought(sanitizeInnerState(text));
      if (!value && !complete) return;
      if (value) {
        snapshot.innerState = value;
        snapshot.statusCopy = "";
        paint(value, { waiting: !complete });
      }
      if (complete) {
        psychologyComplete = true;
        snapshot.statusCopy = "";
        setBubblePending(false);
      }
      syncToggleCopy();
      emitProgress(complete ? "stream" : "thinking");
    },
    markPsychologyComplete() {
      psychologyComplete = true;
      setBubblePending(false);
    },
    isPsychologyComplete() {
      return psychologyComplete;
    },
    clear() {
      snapshot.innerState = "";
      if (revealTimer) window.clearInterval(revealTimer);
      revealTimer = 0;
      revealTarget = "";
      revealedText = "";
      deactivatePsychologyChrome();
    },
    finish() {
      finished = true;
      const elapsed = Math.max(0, Date.now() - startedAt);
      snapshot.thoughtMs = elapsed;
      snapshot.thoughtSeconds = Math.max(1, Math.round(elapsed / 1000) || 1);
      snapshot.state = "complete";
      host.classList.remove("is-waiting");
      setBubblePending(false);
      if (!snapshot.innerState) {
        controller.clear();
        return;
      }
      activatePsychologyChrome();
      host.classList.add("is-complete");
      label.textContent = THINKING_LABEL;
      state.textContent = "";
      paintInnerStateSlowly(snapshot.innerState);
      snapshot.phaseLabel = THINKING_LABEL;
      if (readFoldPreference(snapshot) == null && !host.open) {
        host.dataset.foldSync = "1";
        host.open = true;
      }
      syncToggleCopy();
      emitProgress("done");
    },
    fail(message = "这一步没有完成。") {
      finished = true;
      const elapsed = Math.max(0, Date.now() - startedAt);
      snapshot.thoughtMs = elapsed;
      snapshot.thoughtSeconds = Math.max(1, Math.round(elapsed / 1000) || 1);
      snapshot.state = "failed";
      host.classList.remove("is-waiting");
      setBubblePending(false);
      if (!snapshot.innerState) {
        snapshot.statusCopy = sanitizeThinkingText(message) || "这一步没有完成。";
        snapshot.stateCopy = snapshot.statusCopy;
        controller.clear();
        emitProgress("fail");
        return;
      }
      activatePsychologyChrome();
      host.classList.add("is-failed");
      label.textContent = THINKING_LABEL;
      state.textContent = "";
      toggle.textContent = foldActionLabel(host.open, true);
      emitProgress("fail");
    },
    getSnapshot() {
      return {
        version: 4,
        state: snapshot.state,
        phase: "inner_state",
        phaseLabel: snapshot.phaseLabel,
        memoryCount: snapshot.memoryCount,
        mood: snapshot.mood,
        innerState: snapshot.innerState,
        stateCopy: snapshot.stateCopy,
        statusCopy: snapshot.statusCopy,
        stage: snapshot.stage,
        operation: snapshot.operation,
        approvalPending: snapshot.approvalPending,
        thoughtMs: snapshot.thoughtMs,
        thoughtSeconds: snapshot.thoughtSeconds,
        sessionId: snapshot.sessionId,
        messageId: snapshot.messageId,
        steps: [],
        tools: snapshot.tools.map((item) => ({ ...item })),
      };
    },
    element: host,
  };

  host.__turnActivityController = controller;
  return controller;
}

/** @deprecated kept for callers that still import the label helper */
export function labelForOperation(operation) {
  const raw = String(operation || "").trim();
  if (/weather|天气/i.test(raw)) return "天气查询";
  if (/location|定位/i.test(raw)) return "定位";
  if (/diary|日记/i.test(raw)) return "写日记";
  if (/calendar|日历/i.test(raw)) return "日历";
  if (/search|检索|搜索/i.test(raw)) return "检索";
  return raw.slice(0, 18) || "工具";
}
