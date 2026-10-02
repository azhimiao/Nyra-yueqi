import { SCHEMA_VERSION } from "../constants.js";

export function emptyC4Payload() {
  return { schemaVersion: SCHEMA_VERSION, appKey: "c4", albums: [], itemsByAlbum: {} };
}

/**
 * @param {unknown} raw
 */
export function validateC4Payload(raw) {
  try {
    if (!raw || typeof raw !== "object") {
      return { ok: false, value: emptyC4Payload(), reason: "not_object" };
    }
    const src = /** @type {Record<string, unknown>} */ (raw);
    const albumsIn = Array.isArray(src.albums) ? src.albums : [];
    const itemsIn =
      src.itemsByAlbum && typeof src.itemsByAlbum === "object"
        ? /** @type {Record<string, unknown>} */ (src.itemsByAlbum)
        : {};

    const albums = [];
    for (const row of albumsIn.slice(0, 30)) {
      if (!row || typeof row !== "object") continue;
      const a = /** @type {Record<string, unknown>} */ (row);
      const id = String(a.id || "").trim();
      if (!id) continue;
      albums.push({
        id,
        title: String(a.title || "相册").slice(0, 16),
        coverHint: String(a.coverHint || "📷").slice(0, 8),
        count: Math.max(0, Number(a.count) || 0),
        updatedAt: String(a.updatedAt || new Date().toISOString()),
      });
    }

    /** @type {Record<string, object[]>} */
    const itemsByAlbum = {};
    for (const album of albums) {
      const list = Array.isArray(itemsIn[album.id]) ? /** @type {unknown[]} */ (itemsIn[album.id]) : [];
      const items = [];
      for (const row of list.slice(0, 80)) {
        if (!row || typeof row !== "object") continue;
        const it = /** @type {Record<string, unknown>} */ (row);
        const ph =
          it.placeholder && typeof it.placeholder === "object"
            ? /** @type {Record<string, unknown>} */ (it.placeholder)
            : {};
        items.push({
          id: String(it.id || `p-${items.length}`),
          caption: String(it.caption || "").slice(0, 120),
          takenAt: String(it.takenAt || new Date().toISOString()),
          placeholder: {
            tone: String(ph.tone || "mint"),
            label: String(ph.label || album.coverHint || "图").slice(0, 4),
          },
          locationHint: it.locationHint == null ? null : String(it.locationHint).slice(0, 40),
        });
      }
      itemsByAlbum[album.id] = items;
      album.count = items.length;
    }

    return {
      ok: true,
      value: {
        schemaVersion: SCHEMA_VERSION,
        appKey: "c4",
        albums,
        itemsByAlbum,
      },
    };
  } catch {
    return { ok: false, value: emptyC4Payload(), reason: "validate_throw" };
  }
}
