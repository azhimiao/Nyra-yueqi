import { SCHEMA_VERSION } from "../constants.js";

export function emptyC8Payload() {
  return { schemaVersion: SCHEMA_VERSION, appKey: "c8", notes: [] };
}

/**
 * @param {unknown} raw
 */
export function validateC8Payload(raw) {
  try {
    if (!raw || typeof raw !== "object") {
      return { ok: false, value: emptyC8Payload(), reason: "not_object" };
    }
    const src = /** @type {Record<string, unknown>} */ (raw);
    const notesIn = Array.isArray(src.notes) ? src.notes : [];
    const notes = [];
    for (const row of notesIn.slice(0, 50)) {
      if (!row || typeof row !== "object") continue;
      const n = /** @type {Record<string, unknown>} */ (row);
      const id = String(n.id || "").trim();
      if (!id) continue;
      notes.push({
        id,
        title: String(n.title || "备忘").slice(0, 40),
        body: String(n.body || "").slice(0, 2000),
        updatedAt: String(n.updatedAt || new Date().toISOString()),
        pinned: Boolean(n.pinned),
      });
    }
    notes.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    return {
      ok: true,
      value: { schemaVersion: SCHEMA_VERSION, appKey: "c8", notes },
    };
  } catch {
    return { ok: false, value: emptyC8Payload(), reason: "validate_throw" };
  }
}
