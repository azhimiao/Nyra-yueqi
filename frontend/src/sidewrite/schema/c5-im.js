import { SCHEMA_VERSION } from "../constants.js";

/** @returns {import("./validate.js").SidewriteImPayload} */
export function emptyC5Payload() {
  return { schemaVersion: SCHEMA_VERSION, appKey: "c5", threads: [], messagesByThread: {} };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, value: object, reason?: string }}
 */
export function validateC5Payload(raw) {
  try {
    if (!raw || typeof raw !== "object") {
      return { ok: false, value: emptyC5Payload(), reason: "not_object" };
    }
    const src = /** @type {Record<string, unknown>} */ (raw);
    const threadsIn = Array.isArray(src.threads) ? src.threads : [];
    const messagesByThreadIn =
      src.messagesByThread && typeof src.messagesByThread === "object"
        ? /** @type {Record<string, unknown>} */ (src.messagesByThread)
        : {};

    const threads = [];
    for (const row of threadsIn.slice(0, 20)) {
      if (!row || typeof row !== "object") continue;
      const t = /** @type {Record<string, unknown>} */ (row);
      const id = String(t.id || "").trim();
      if (!id) continue;
      threads.push({
        id,
        title: String(t.title || "会话").slice(0, 24),
        avatarHint: String(t.avatarHint || "话").slice(0, 4),
        lastMessagePreview: String(t.lastMessagePreview || "").slice(0, 60),
        lastMessageAt: String(t.lastMessageAt || new Date().toISOString()),
        unreadCount: Math.max(0, Math.min(99, Number(t.unreadCount) || 0)),
        pinned: Boolean(t.pinned),
      });
    }

    /** @type {Record<string, object[]>} */
    const messagesByThread = {};
    for (const thread of threads) {
      const list = Array.isArray(messagesByThreadIn[thread.id])
        ? /** @type {unknown[]} */ (messagesByThreadIn[thread.id])
        : [];
      const msgs = [];
      for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const m = /** @type {Record<string, unknown>} */ (row);
        const role = String(m.role || "");
        if (role !== "self" && role !== "other" && role !== "system") continue;
        msgs.push({
          id: String(m.id || `m-${msgs.length}`),
          role,
          senderName: m.senderName == null ? null : String(m.senderName).slice(0, 24),
          content: String(m.content || "").slice(0, 500),
          sentAt: String(m.sentAt || new Date().toISOString()),
          type: ["text", "image", "voice", "sticker"].includes(String(m.type))
            ? String(m.type)
            : "text",
          meta: m.meta && typeof m.meta === "object" ? m.meta : null,
        });
      }
      msgs.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
      messagesByThread[thread.id] = msgs;
    }

    return {
      ok: true,
      value: {
        schemaVersion: SCHEMA_VERSION,
        appKey: "c5",
        threads,
        messagesByThread,
      },
    };
  } catch {
    return { ok: false, value: emptyC5Payload(), reason: "validate_throw" };
  }
}
