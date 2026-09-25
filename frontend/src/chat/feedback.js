/**
 * One transient feedback contract for chat surfaces.
 *
 * Durable events (game rounds, calls, diary writes, attachments) still belong
 * in Conversation V2. This channel is only for short-lived UI outcomes.
 */
export const CHAT_FEEDBACK_EVENT = "yueqi:chat-feedback";
const LEGACY_TOAST_EVENT = "yueqi:toast";

function normalizeTone(value) {
  if (value === "success" || value === "warning" || value === "danger") return value;
  return "neutral";
}

export function notifyChatFeedback(message, options = {}) {
  const text = String(message || "").trim();
  if (!text || typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(CHAT_FEEDBACK_EVENT, {
    detail: {
      message: text,
      tone: normalizeTone(options.tone),
      source: String(options.source || "chat"),
      duration: Math.max(1600, Math.min(8000, Number(options.duration) || 3600)),
    },
  }));
  return true;
}

export function mountChatFeedbackCenter(doc = document) {
  if (!doc?.body || typeof window === "undefined") return () => {};
  let host = doc.querySelector("[data-chat-feedback-host]");
  if (!host) {
    host = doc.createElement("div");
    host.className = "chat-feedback-host";
    host.dataset.chatFeedbackHost = "";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    host.setAttribute("aria-atomic", "true");
    doc.body.appendChild(host);
  }

  let dismissTimer = 0;
  const show = (detail = {}) => {
    const message = String(detail.message || "").trim();
    if (!message) return;
    window.clearTimeout(dismissTimer);
    host.textContent = message;
    host.dataset.tone = normalizeTone(detail.tone);
    host.dataset.visible = "true";
    dismissTimer = window.setTimeout(() => {
      delete host.dataset.visible;
    }, Math.max(1600, Math.min(8000, Number(detail.duration) || 3600)));
  };
  const onFeedback = (event) => show(event.detail);
  const onLegacyToast = (event) => show(event.detail);
  window.addEventListener(CHAT_FEEDBACK_EVENT, onFeedback);
  window.addEventListener(LEGACY_TOAST_EVENT, onLegacyToast);

  return () => {
    window.clearTimeout(dismissTimer);
    window.removeEventListener(CHAT_FEEDBACK_EVENT, onFeedback);
    window.removeEventListener(LEGACY_TOAST_EVENT, onLegacyToast);
    host.remove();
  };
}
