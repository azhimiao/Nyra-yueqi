import { SCHEMA_VERSION } from "../constants.js";

export function emptyC2Payload() {
  return { schemaVersion: SCHEMA_VERSION, appKey: "c2", threads: [], messagesByThread: {} };
}

/**
 * @param {unknown} raw
 */
export function validateC2Payload(raw) {
  try {
    if (!raw || typeof raw !== "object") {
      return { ok: false, value: emptyC2Payload(), reason: "not_object" };
    }
    const src = /** @type {Record<string, unknown>} */ (raw);
    const threadsIn = Array.isArray(src.threads) ? src.threads : [];
    const messagesIn =
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
        contactName: String(t.contactName || "联系人").slice(0, 24),
        contactHint: String(t.contactHint || "138****0000").slice(0, 20),
        lastPreview: String(t.lastPreview || "").slice(0, 60),
        lastAt: String(t.lastAt || new Date().toISOString()),
        unread: Math.max(0, Math.min(99, Number(t.unread) || 0)),
      });
    }

    /** @type {Record<string, object[]>} */
    const messagesByThread = {};
    for (const thread of threads) {
      const list = Array.isArray(messagesIn[thread.id])
        ? /** @type {unknown[]} */ (messagesIn[thread.id])
        : [];
      const msgs = [];
      for (const row of list) {
        if (!row || typeof row !== "object") continue;
        const m = /** @type {Record<string, unknown>} */ (row);
        const direction = String(m.direction || "");
        if (direction !== "in" && direction !== "out") continue;
        msgs.push({
          id: String(m.id || `s-${msgs.length}`),
          direction,
          body: String(m.body || "").slice(0, 500),
          sentAt: String(m.sentAt || new Date().toISOString()),
        });
      }
      msgs.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
      messagesByThread[thread.id] = msgs;
    }

    return {
      ok: true,
      value: {
        schemaVersion: SCHEMA_VERSION,
        appKey: "c2",
        threads,
        messagesByThread,
      },
    };
  } catch {
    return { ok: false, value: emptyC2Payload(), reason: "validate_throw" };
  }
}
