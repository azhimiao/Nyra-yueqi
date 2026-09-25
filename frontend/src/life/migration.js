/**
 * Migrate legacy F2a sidewrite payloads → DayPack legacy evidence (viewable, not lost).
 */

import { LIFE_SCHEMA_VERSION, dayPackId, localDateFromIso } from "./schema.js";
import { validateDayPack } from "./validate.js";
import { getDayPack, saveDayPack } from "./store.js";

const APP_KEY_TO_LIFE = Object.freeze({
  c5: "messages",
  c4: "album",
  c8: "memo",
  c2: "messages",
});

/**
 * @param {string} characterId
 * @param {Record<string, object>} payloads  appKey → sidewrite payload
 * @param {{ localDate?: string, merge?: boolean }} [opts]
 */
export function migrateSidewritePayloadsToLegacyEvidence(characterId, payloads = {}, opts = {}) {
  const cid = String(characterId || "").trim();
  if (!cid) return { ok: false, reason: "missing_characterId", pack: null };

  const entries = Object.entries(payloads || {}).filter(([, v]) => v && typeof v === "object");
  if (!entries.length) return { ok: false, reason: "empty_payloads", pack: null };

  /** @type {object[]} */
  const evidence = [];
  /** @type {string[]} */
  const times = [];

  for (const [appKey, payload] of entries) {
    const lifeApp = APP_KEY_TO_LIFE[appKey] || "memo";
    const extracted = extractEvidenceFromPayload(appKey, lifeApp, payload);
    for (const item of extracted) {
      evidence.push(item);
      if (item.occurredAt) times.push(item.occurredAt);
    }
  }

  if (!evidence.length) return { ok: false, reason: "no_evidence", pack: null };

  times.sort();
  const anchor = times[Math.floor(times.length / 2)] || new Date().toISOString();
  const localDate = String(opts.localDate || localDateFromIso(anchor) || "").trim();
  if (!localDate) return { ok: false, reason: "bad_localDate", pack: null };

  // Normalize all evidence onto the pack localDate before building the event.
  for (const item of evidence) {
    const d = localDateFromIso(item.occurredAt);
    if (!d || d !== localDate) {
      const raw = String(item.occurredAt || `${localDate}T12:00:00.000Z`);
      item.occurredAt = /^\d{4}-\d{2}-\d{2}/.test(raw)
        ? raw.replace(/^\d{4}-\d{2}-\d{2}/, localDate)
        : `${localDate}T12:00:00.000Z`;
    }
  }

  const eventId = `ev-legacy-${cid}-${localDate}`;
  const eventAt =
    evidence.map((e) => e.occurredAt).sort()[0] || `${localDate}T12:00:00.000Z`;
  const event = {
    id: eventId,
    schemaVersion: LIFE_SCHEMA_VERSION,
    characterId: cid,
    occurredAt: eventAt,
    durationMinutes: 180,
    type: "legacy",
    summary: "从侧写痕迹迁移的生活证据（可查看，不丢弃）。",
    participants: [{ id: "p-self", name: "角色", relation: "self" }],
    location: "",
    emotionBefore: "",
    emotionAfter: "",
    privateFacts: [],
    memoryRefs: [],
    relatedEventIds: [],
    evidenceIds: evidence.map((e) => e.id),
    visibility: "discoverable",
    source: "user",
  };

  for (const item of evidence) {
    item.eventId = eventId;
  }

  // Cross-link a few legacy items so pack has crossRefs for discoverability
  if (evidence.length >= 2) {
    evidence[0].crossRefs = [evidence[1].id];
    evidence[1].crossRefs = [evidence[0].id, evidence[2]?.id].filter(Boolean);
  }
  if (evidence.length >= 3) {
    evidence[2].crossRefs = [evidence[0].id];
  }

  let pack = {
    id: dayPackId(cid, localDate),
    schemaVersion: LIFE_SCHEMA_VERSION,
    characterId: cid,
    localDate,
    theme: "侧写迁移日",
    generatedAt: new Date().toISOString(),
    source: "legacy",
    events: [event],
    evidence,
    appSummary: {},
    consistency: { checkedAt: new Date().toISOString(), errors: [], warnings: [] },
  };

  if (opts.merge !== false) {
    const existing = getDayPack(cid, localDate);
    if (existing) {
      pack = mergeLegacyIntoPack(existing, pack);
    }
  }

  const validated = validateDayPack(pack, { characterId: cid });
  if (!validated.ok || !validated.value) {
    // Legacy packs may be below product scale — still persist as viewable legacy
    // by relaxing: attach as-is if only scale-related soft issues.
    // Force-save minimal structure after soft validate of events/evidence individually.
    const forced = {
      ...pack,
      consistency: {
        checkedAt: new Date().toISOString(),
        errors: [validated.reason || "legacy_unvalidated"],
        warnings: ["legacy_scale_below_product_min"],
      },
    };
    // Try again — validateDayPack requires ≥1 event; we have that.
    // Failure is usually bad time / duplicate — return error rather than wipe.
    return { ok: false, reason: validated.reason || "invalid", pack: null, legacyEvidence: evidence };
  }

  const saved = saveDayPack(validated.value);
  return {
    ok: saved.ok,
    reason: saved.reason,
    pack: saved.pack,
    migratedEvidence: evidence.length,
  };
}

/**
 * Merge without dropping either side's evidence ids.
 */
function mergeLegacyIntoPack(existing, legacy) {
  const eventIds = new Set((existing.events || []).map((e) => e.id));
  const evidenceIds = new Set((existing.evidence || []).map((e) => e.id));
  const events = [...(existing.events || [])];
  const evidence = [...(existing.evidence || [])];

  for (const ev of legacy.events || []) {
    if (!eventIds.has(ev.id)) {
      events.push(ev);
      eventIds.add(ev.id);
    }
  }
  for (const item of legacy.evidence || []) {
    if (!evidenceIds.has(item.id)) {
      evidence.push(item);
      evidenceIds.add(item.id);
    }
  }

  return {
    ...existing,
    theme: existing.theme || legacy.theme,
    source: existing.source === "seed" || existing.source === "model" ? existing.source : "legacy",
    events,
    evidence,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {string} appKey
 * @param {string} lifeApp
 * @param {object} payload
 */
function extractEvidenceFromPayload(appKey, lifeApp, payload) {
  /** @type {object[]} */
  const out = [];
  const prefix = `legacy-${appKey}`;

  if (appKey === "c5" || appKey === "c2") {
    const threads = Array.isArray(payload.threads) ? payload.threads : [];
    const messagesByThread =
      payload.messagesByThread && typeof payload.messagesByThread === "object"
        ? payload.messagesByThread
        : {};
    for (const thread of threads) {
      const tid = String(thread.id || "").trim();
      if (!tid) continue;
      const title = String(thread.title || thread.contactName || "会话").slice(0, 80);
      const preview = String(
        thread.lastMessagePreview || thread.lastPreview || "",
      ).slice(0, 800);
      const at = String(
        thread.lastMessageAt || thread.lastAt || new Date().toISOString(),
      );
      out.push({
        id: `${prefix}-thread-${tid}`,
        eventId: "",
        app: lifeApp,
        kind: "legacy_thread",
        occurredAt: at,
        title,
        content: preview,
        assetRef: null,
        counterpart: title.slice(0, 40),
        crossRefs: [],
        discoverable: true,
      });
      const msgs = Array.isArray(messagesByThread[tid]) ? messagesByThread[tid] : [];
      for (const m of msgs.slice(0, 12)) {
        const mid = String(m.id || "").trim();
        if (!mid) continue;
        out.push({
          id: `${prefix}-msg-${mid}`,
          eventId: "",
          app: lifeApp,
          kind: "legacy_message",
          occurredAt: String(m.sentAt || at),
          title: String(m.senderName || title || "消息").slice(0, 80),
          content: String(m.content || m.body || "").slice(0, 800),
          assetRef: null,
          counterpart: m.senderName == null ? null : String(m.senderName).slice(0, 40),
          crossRefs: [`${prefix}-thread-${tid}`],
          discoverable: true,
        });
      }
    }
  }

  if (appKey === "c4") {
    const albums = Array.isArray(payload.albums) ? payload.albums : [];
    const itemsByAlbum =
      payload.itemsByAlbum && typeof payload.itemsByAlbum === "object"
        ? payload.itemsByAlbum
        : {};
    const flatItems = Array.isArray(payload.items) ? payload.items : [];
    for (const album of albums) {
      const aid = String(album.id || "").trim();
      if (!aid) continue;
      out.push({
        id: `${prefix}-album-${aid}`,
        eventId: "",
        app: "album",
        kind: "legacy_album",
        occurredAt: String(album.updatedAt || new Date().toISOString()),
        title: String(album.title || "相册").slice(0, 80),
        content: `共 ${Number(album.count) || 0} 项`,
        assetRef: null,
        counterpart: null,
        crossRefs: [],
        discoverable: true,
      });
      const albumItems = Array.isArray(itemsByAlbum[aid]) ? itemsByAlbum[aid] : [];
      for (const photo of albumItems.slice(0, 24)) {
        const pid = String(photo.id || "").trim();
        if (!pid) continue;
        out.push({
          id: `${prefix}-photo-${pid}`,
          eventId: "",
          app: "album",
          kind: "legacy_photo",
          occurredAt: String(photo.takenAt || photo.createdAt || album.updatedAt || new Date().toISOString()),
          title: String(photo.caption || photo.title || "照片").slice(0, 80),
          content: String(photo.caption || photo.locationHint || photo.location || "").slice(0, 800),
          assetRef: photo.assetRef == null ? null : String(photo.assetRef),
          counterpart: null,
          crossRefs: [`${prefix}-album-${aid}`],
          discoverable: true,
        });
      }
    }
    for (const photo of flatItems.slice(0, 24)) {
      const pid = String(photo.id || "").trim();
      if (!pid) continue;
      out.push({
        id: `${prefix}-photo-${pid}`,
        eventId: "",
        app: "album",
        kind: "legacy_photo",
        occurredAt: String(photo.takenAt || photo.createdAt || new Date().toISOString()),
        title: String(photo.caption || photo.title || "照片").slice(0, 80),
        content: String(photo.caption || photo.location || "").slice(0, 800),
        assetRef: photo.assetRef == null ? null : String(photo.assetRef),
        counterpart: null,
        crossRefs: photo.albumId ? [`${prefix}-album-${photo.albumId}`] : [],
        discoverable: true,
      });
    }
  }

  if (appKey === "c8") {
    const notes = Array.isArray(payload.notes) ? payload.notes : [];
    for (const note of notes.slice(0, 40)) {
      const nid = String(note.id || "").trim();
      if (!nid) continue;
      out.push({
        id: `${prefix}-note-${nid}`,
        eventId: "",
        app: "memo",
        kind: "legacy_memo",
        occurredAt: String(note.updatedAt || note.createdAt || new Date().toISOString()),
        title: String(note.title || "备忘").slice(0, 80),
        content: String(note.body || note.content || "").slice(0, 800),
        assetRef: null,
        counterpart: null,
        crossRefs: [],
        discoverable: true,
      });
    }
  }

  return out;
}

/**
 * Convenience: migrate from exportSidewrite-shaped bag.
 * @param {string} characterId
 * @param {{ payloads?: Record<string, object> }} sidewriteExport
 */
export function migrateFromSidewriteExport(characterId, sidewriteExport) {
  const payloads = sidewriteExport?.payloads || sidewriteExport || {};
  return migrateSidewritePayloadsToLegacyEvidence(characterId, payloads);
}
