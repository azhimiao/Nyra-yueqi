/**
 * Project a DayPack into per-App view models (no independent story generation).
 */

import { EVIDENCE_APPS } from "./schema.js";

/**
 * @param {object|null} pack
 * @param {string} app
 */
export function projectAppEvidence(pack, app) {
  if (!pack || !EVIDENCE_APPS.includes(app)) return [];
  return (pack.evidence || [])
    .filter((e) => e.app === app)
    .slice()
    .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
}

/**
 * @param {object|null} pack
 */
export function projectAllApps(pack) {
  /** @type {Record<string, object[]>} */
  const out = {};
  for (const app of EVIDENCE_APPS) {
    out[app] = projectAppEvidence(pack, app);
  }
  return out;
}

/**
 * Lock-screen style notifications from DayPack (2–4 items).
 * @param {object|null} pack
 * @param {{ limit?: number }} [opts]
 */
export function projectLockNotifications(pack, opts = {}) {
  if (!pack) return [];
  const limit = Math.min(4, Math.max(2, Number(opts.limit) || 3));
  const sharedish = (pack.evidence || []).filter(
    (e) => e.discoverable !== false,
  );
  const ranked = sharedish.slice().sort((a, b) =>
    String(b.occurredAt).localeCompare(String(a.occurredAt)),
  );
  return ranked.slice(0, limit).map((e) => ({
    id: e.id,
    app: e.app,
    title: e.title,
    body: String(e.content || "").slice(0, 80),
    occurredAt: e.occurredAt,
    eventId: e.eventId,
  }));
}

/**
 * Resolve evidence by id and follow one crossRef hop.
 * @param {object|null} pack
 * @param {string} evidenceId
 */
export function projectEvidenceDetail(pack, evidenceId) {
  if (!pack) return null;
  const item = (pack.evidence || []).find((e) => e.id === evidenceId);
  if (!item) return null;
  const event = (pack.events || []).find((e) => e.id === item.eventId) || null;
  const linked = (item.crossRefs || [])
    .map((id) => (pack.evidence || []).find((e) => e.id === id))
    .filter(Boolean);
  return { evidence: item, event, linked };
}

/**
 * Desktop widget summary — one headline per populated app.
 * @param {object|null} pack
 */
export function projectDesktopSummary(pack) {
  if (!pack) {
    return { theme: "", apps: {}, eventCount: 0, evidenceCount: 0 };
  }
  return {
    theme: pack.theme || "",
    localDate: pack.localDate,
    characterId: pack.characterId,
    apps: pack.appSummary || {},
    eventCount: (pack.events || []).length,
    evidenceCount: (pack.evidence || []).length,
  };
}

/**
 * Find sibling evidence for the same life event across apps.
 * @param {object|null} pack
 * @param {string} eventId
 */
export function projectEventTrail(pack, eventId) {
  if (!pack) return { event: null, evidence: [] };
  const event = (pack.events || []).find((e) => e.id === eventId) || null;
  const evidence = (pack.evidence || []).filter((e) => e.eventId === eventId);
  return { event, evidence };
}

function eventById(pack, eventId) {
  return (pack?.events || []).find((e) => e.id === eventId) || null;
}

function formatClock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayKey(iso) {
  return String(iso || "").slice(0, 10);
}

/**
 * Messages VM: ≥ threads from thread_preview + message bubbles.
 * @param {object|null} pack
 * @param {{ readIds?: Set<string> }} [opts]
 */
export function projectMessagesVm(pack, opts = {}) {
  const readIds = opts.readIds || new Set();
  const items = projectAppEvidence(pack, "messages");
  const threadsMap = new Map();

  for (const item of items) {
    const threadId = item.kind === "message"
      ? `thread:${item.counterpart || item.title}`
      : item.id.startsWith("evd-msg-") && item.kind === "thread_preview"
        ? item.id
        : `thread:${item.counterpart || item.title}`;

    // Prefer stable thread ids from thread_preview
    let key = threadId;
    if (item.kind === "thread_preview") {
      key = item.id;
    } else {
      const preview =
        items.find((t) => t.kind === "thread_preview" && t.title === item.title) ||
        items.find(
          (t) =>
            t.kind === "thread_preview" &&
            t.counterpart &&
            t.counterpart === item.counterpart &&
            t.title === item.title,
        );
      key = preview?.id || `thread:${item.title || item.counterpart}`;
    }

    if (!threadsMap.has(key)) {
      threadsMap.set(key, {
        id: key,
        title: item.title,
        counterpart: item.counterpart || item.title,
        avatarHint: String(item.counterpart || item.title || "?").slice(0, 1),
        lastMessagePreview: "",
        lastMessageAt: item.occurredAt,
        unreadCount: 0,
        eventId: item.eventId,
        evidenceIds: [],
        messages: [],
        crossRefs: [],
      });
    }
    const thread = threadsMap.get(key);
    thread.evidenceIds.push(item.id);
    thread.crossRefs = [...new Set([...(thread.crossRefs || []), ...(item.crossRefs || [])])];
    const isBubble =
      item.kind === "message" ||
      item.kind === "message_self" ||
      item.kind === "message_other";
    if (item.kind === "thread_preview" || isBubble) {
      if (isBubble) {
        const role = item.kind === "message_self" ? "self" : "other";
        thread.messages.push({
          id: item.id,
          role,
          content: item.content,
          sentAt: item.occurredAt,
          crossRefs: item.crossRefs || [],
          evidenceId: item.id,
          discoverable: item.discoverable !== false,
        });
      } else if (!thread.messages.some((m) => m.evidenceId === item.id)) {
        // Only use preview as bubble if no dedicated messages yet (filled later)
        thread._preview = {
          id: `${item.id}__preview`,
          role: "other",
          content: item.content,
          sentAt: item.occurredAt,
          crossRefs: item.crossRefs || [],
          evidenceId: item.id,
          discoverable: item.discoverable !== false,
        };
      }
    }
  }

  const threads = [...threadsMap.values()].map((t) => {
    if (!t.messages.length && t._preview) t.messages.push(t._preview);
    delete t._preview;
    t.messages.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)));
    const last = t.messages[t.messages.length - 1];
    t.lastMessagePreview = last?.content || "";
    t.lastMessageAt = last?.sentAt || t.lastMessageAt;
    const unread = t.evidenceIds.filter((id) => !readIds.has(id)).length;
    t.unreadCount = unread > 0 ? Math.min(unread, 9) : 0;
    return t;
  });

  threads.sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
  return { threads, count: threads.length };
}

/**
 * @param {object|null} pack
 * @param {string} threadId
 * @param {{ readIds?: Set<string> }} [opts]
 */
export function projectMessageThreadDetail(pack, threadId, opts = {}) {
  const vm = projectMessagesVm(pack, opts);
  const thread = vm.threads.find((t) => t.id === threadId) || null;
  if (!thread) return null;
  const linked = (thread.crossRefs || [])
    .map((id) => (pack?.evidence || []).find((e) => e.id === id))
    .filter(Boolean);
  const event = eventById(pack, thread.eventId);
  return { thread, linked, event };
}

/**
 * Album VM: albums + photos.
 * @param {object|null} pack
 * @param {{ readIds?: Set<string> }} [opts]
 */
export function projectAlbumVm(pack, opts = {}) {
  const readIds = opts.readIds || new Set();
  const items = projectAppEvidence(pack, "album");
  /** @type {Map<string, object>} */
  const albums = new Map();

  for (const item of items) {
    if (item.kind === "album") {
      if (!albums.has(item.id)) {
        albums.set(item.id, {
          id: item.id,
          title: item.title,
          coverAsset: item.assetRef,
          count: 0,
          items: [],
          updatedAt: item.occurredAt,
        });
      }
      continue;
    }

    const albumTitle = inferAlbumTitle(item);
    const albumId =
      item.counterpart && String(item.counterpart).startsWith("album-")
        ? item.counterpart
        : albumIdFromTitle(albumTitle);

    if (!albums.has(albumId)) {
      albums.set(albumId, {
        id: albumId,
        title: albumTitle,
        coverAsset: item.assetRef,
        count: 0,
        items: [],
        updatedAt: item.occurredAt,
      });
    }

    const album = albums.get(albumId);
    if (item.counterpart && albums.has(item.counterpart) && item.counterpart !== albumId) {
      // photo explicitly linked to album-* counterpart
    }
    album.items.push({
      id: item.id,
      title: item.title,
      caption: item.content,
      occurredAt: item.occurredAt,
      location: eventById(pack, item.eventId)?.location || "",
      assetRef: item.assetRef,
      eventId: item.eventId,
      crossRefs: item.crossRefs || [],
      discoverable: item.discoverable !== false,
      unread: !readIds.has(item.id),
    });
    album.count = album.items.length;
    album.coverAsset = album.coverAsset || item.assetRef;
    if (String(item.occurredAt) > String(album.updatedAt)) {
      album.updatedAt = item.occurredAt;
    }
  }

  const list = [...albums.values()]
    .map((a) => {
      a.items.sort((x, y) => String(y.occurredAt).localeCompare(String(x.occurredAt)));
      return a;
    })
    .filter((a) => a.items.length > 0)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const allPhotos = list.flatMap((a) => a.items);
  return { albums: list, photos: allPhotos, count: allPhotos.length };
}

function albumIdFromTitle(title) {
  if (title === "实验室") return "album-lab";
  if (title === "西河夜晚") return "album-river";
  return "album-today";
}

function inferAlbumTitle(item) {
  if (item.counterpart === "album-lab") return "实验室";
  if (item.counterpart === "album-river") return "西河夜晚";
  if (item.counterpart === "album-today") return "今日随拍";
  const t = `${item.title || ""} ${item.content || ""}`;
  if (/实验室|B2|样本|仪器/.test(t)) return "实验室";
  if (/桥|河|晚霞|西河/.test(t)) return "西河夜晚";
  return "今日随拍";
}

/**
 * @param {object|null} pack
 * @param {string} photoId
 */
export function projectAlbumItemDetail(pack, photoId) {
  const detail = projectEvidenceDetail(pack, photoId);
  if (!detail || detail.evidence.app !== "album") return null;
  const ev = detail.evidence;
  return {
    item: {
      id: ev.id,
      title: ev.title,
      caption: ev.content,
      occurredAt: ev.occurredAt,
      location: detail.event?.location || "",
      assetRef: ev.assetRef,
      eventId: ev.eventId,
      crossRefs: ev.crossRefs || [],
      discoverable: ev.discoverable !== false,
    },
    event: detail.event,
    linked: detail.linked,
  };
}

/**
 * Calendar VM for the pack's local week.
 * @param {object|null} pack
 */
export function projectCalendarVm(pack) {
  const items = projectAppEvidence(pack, "calendar");
  const events = items.map((item) => {
    const life = eventById(pack, item.eventId);
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      occurredAt: item.occurredAt,
      timeLabel: formatClock(item.occurredAt),
      day: dayKey(item.occurredAt),
      location: life?.location || "",
      participants: (life?.participants || []).map((p) => p.name),
      counterpart: item.counterpart,
      eventId: item.eventId,
      crossRefs: item.crossRefs || [],
      discoverable: item.discoverable !== false,
    };
  });
  events.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
  return { events, localDate: pack?.localDate || "", count: events.length };
}

/**
 * @param {object|null} pack
 * @param {string} evidenceId
 */
export function projectCalendarDetail(pack, evidenceId) {
  const detail = projectEvidenceDetail(pack, evidenceId);
  if (!detail || detail.evidence.app !== "calendar") return null;
  const life = detail.event;
  return {
    item: {
      id: detail.evidence.id,
      title: detail.evidence.title,
      content: detail.evidence.content,
      occurredAt: detail.evidence.occurredAt,
      location: life?.location || "",
      participants: (life?.participants || []).map((p) => p.name),
      counterpart: detail.evidence.counterpart,
      eventId: detail.evidence.eventId,
      crossRefs: detail.evidence.crossRefs || [],
      discoverable: detail.evidence.discoverable !== false,
    },
    event: life,
    linked: detail.linked,
  };
}

/**
 * Memo VM.
 * @param {object|null} pack
 * @param {{ readIds?: Set<string> }} [opts]
 */
export function projectMemoVm(pack, opts = {}) {
  const readIds = opts.readIds || new Set();
  const items = projectAppEvidence(pack, "memo");
  const notes = items.map((item, index) => ({
    id: item.id,
    title: item.title,
    body: item.content,
    occurredAt: item.occurredAt,
    pinned: item.kind === "pinned" || index === 0,
    level: item.kind === "pinned" ? 1 : 2,
    eventId: item.eventId,
    crossRefs: item.crossRefs || [],
    discoverable: item.discoverable !== false,
    unread: !readIds.has(item.id),
  }));
  notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return String(b.occurredAt).localeCompare(String(a.occurredAt));
  });
  return { notes, count: notes.length };
}

/**
 * @param {object|null} pack
 * @param {string} noteId
 */
export function projectMemoDetail(pack, noteId) {
  const detail = projectEvidenceDetail(pack, noteId);
  if (!detail || detail.evidence.app !== "memo") return null;
  return {
    note: {
      id: detail.evidence.id,
      title: detail.evidence.title,
      body: detail.evidence.content,
      occurredAt: detail.evidence.occurredAt,
      eventId: detail.evidence.eventId,
      crossRefs: detail.evidence.crossRefs || [],
      discoverable: detail.evidence.discoverable !== false,
    },
    event: detail.event,
    linked: detail.linked,
  };
}

/**
 * Browser history VM — grouped by day.
 * @param {object|null} pack
 */
export function projectBrowserVm(pack) {
  const items = projectAppEvidence(pack, "browser");
  /** @type {Map<string, object[]>} */
  const groups = new Map();
  for (const item of items) {
    const key = dayKey(item.occurredAt) || "未知";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      id: item.id,
      title: item.title,
      snippet: item.content,
      occurredAt: item.occurredAt,
      timeLabel: formatClock(item.occurredAt),
      eventId: item.eventId,
      crossRefs: item.crossRefs || [],
      discoverable: item.discoverable !== false,
    });
  }
  const grouped = [...groups.entries()]
    .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    .map(([day, rows]) => ({
      day,
      items: rows.sort((x, y) => String(y.occurredAt).localeCompare(String(x.occurredAt))),
    }));
  return { groups: grouped, count: items.length, items: items.map((i) => ({
    id: i.id,
    title: i.title,
    snippet: i.content,
    occurredAt: i.occurredAt,
    eventId: i.eventId,
    crossRefs: i.crossRefs || [],
    discoverable: i.discoverable !== false,
  })) };
}

/**
 * @param {object|null} pack
 * @param {string} evidenceId
 */
export function projectBrowserDetail(pack, evidenceId) {
  const detail = projectEvidenceDetail(pack, evidenceId);
  if (!detail || detail.evidence.app !== "browser") return null;
  return {
    item: {
      id: detail.evidence.id,
      title: detail.evidence.title,
      snippet: detail.evidence.content,
      occurredAt: detail.evidence.occurredAt,
      eventId: detail.evidence.eventId,
      crossRefs: detail.evidence.crossRefs || [],
      discoverable: detail.evidence.discoverable !== false,
    },
    event: detail.event,
    linked: detail.linked,
  };
}

/**
 * Orders VM.
 * @param {object|null} pack
 */
export function projectOrdersVm(pack) {
  const items = projectAppEvidence(pack, "orders");
  const orders = items.map((item) => {
    const status =
      item.kind === "cart"
        ? "购物车"
        : /已送达/.test(item.content)
          ? "已送达"
          : /待确认|待取/.test(item.content)
            ? "待确认"
            : "进行中";
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      status,
      occurredAt: item.occurredAt,
      eventId: item.eventId,
      crossRefs: item.crossRefs || [],
      discoverable: item.discoverable !== false,
      currencyNote: "栖币记录 · 非真实支付",
    };
  });
  return { orders, count: orders.length };
}

/**
 * @param {object|null} pack
 * @param {string} evidenceId
 */
export function projectOrderDetail(pack, evidenceId) {
  const detail = projectEvidenceDetail(pack, evidenceId);
  if (!detail || detail.evidence.app !== "orders") return null;
  const vm = projectOrdersVm(pack);
  const order = vm.orders.find((o) => o.id === evidenceId);
  return {
    order: order || {
      id: detail.evidence.id,
      title: detail.evidence.title,
      content: detail.evidence.content,
      status: "进行中",
      occurredAt: detail.evidence.occurredAt,
      eventId: detail.evidence.eventId,
      crossRefs: detail.evidence.crossRefs || [],
      discoverable: detail.evidence.discoverable !== false,
      currencyNote: "栖币记录 · 非真实支付",
    },
    event: detail.event,
    linked: detail.linked,
  };
}

/**
 * Unread badge counts per app for desktop.
 * @param {object|null} pack
 * @param {Set<string>} readIds
 */
export function projectUnreadBadges(pack, readIds = new Set()) {
  /** @type {Record<string, number>} */
  const badges = {};
  for (const app of EVIDENCE_APPS) {
    const items = projectAppEvidence(pack, app).filter((e) => e.discoverable !== false);
    badges[app] = items.filter((e) => !readIds.has(e.id)).length;
  }
  return badges;
}

/**
 * Density checklist vs §5.2 (for verify).
 * @param {object|null} pack
 */
export function measureAppDensity(pack) {
  const messages = projectMessagesVm(pack);
  const album = projectAlbumVm(pack);
  const calendar = projectCalendarVm(pack);
  const memo = projectMemoVm(pack);
  const browser = projectBrowserVm(pack);
  const orders = projectOrdersVm(pack);
  return {
    messages: messages.count,
    albumAlbums: album.albums.length,
    albumItems: album.count,
    calendar: calendar.count,
    memo: memo.count,
    browser: browser.count,
    orders: orders.count,
    ok:
      messages.count >= 5 &&
      album.albums.length >= 3 &&
      album.count >= 8 &&
      calendar.count >= 3 &&
      memo.count >= 4 &&
      browser.count >= 8 &&
      orders.count >= 3,
  };
}
