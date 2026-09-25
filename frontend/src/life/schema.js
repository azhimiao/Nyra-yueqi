/**
 * Character life ledger — schema, versions, and enums (CEV2 §4).
 */

export const LIFE_SCHEMA_VERSION = 1;

/** localStorage / export module key */
export const LIFE_STORE_KEY = "yueqi.life.v1";

export const LIFE_VISIBILITY = Object.freeze(["private", "shared", "discoverable"]);
export const LIFE_EVENT_SOURCES = Object.freeze(["seed", "model", "chat", "scenario", "user"]);
export const EVIDENCE_APPS = Object.freeze([
  "messages",
  "album",
  "calendar",
  "memo",
  "browser",
  "orders",
]);
export const OBSERVATION_REACTION = Object.freeze(["unseen", "eligible", "used"]);

/** Minimum sizes for an acceptable product DayPack */
export const DAY_PACK_MIN = Object.freeze({
  events: 4,
  evidence: 12,
  crossRefs: 5,
});

export const DAY_PACK_EVENT_RANGE = Object.freeze({ min: 4, max: 6 });

/**
 * @typedef {{ id: string, name: string, relation: string }} LifeParticipant
 *
 * @typedef {{
 *   id: string,
 *   schemaVersion: number,
 *   characterId: string,
 *   occurredAt: string,
 *   durationMinutes: number,
 *   type: string,
 *   summary: string,
 *   participants: LifeParticipant[],
 *   location: string,
 *   emotionBefore: string,
 *   emotionAfter: string,
 *   privateFacts: string[],
 *   memoryRefs: string[],
 *   relatedEventIds: string[],
 *   evidenceIds: string[],
 *   visibility: "private"|"shared"|"discoverable",
 *   source: "seed"|"model"|"chat"|"scenario"|"user",
 * }} CharacterLifeEvent
 *
 * @typedef {{
 *   id: string,
 *   eventId: string,
 *   app: "messages"|"album"|"calendar"|"memo"|"browser"|"orders",
 *   kind: string,
 *   occurredAt: string,
 *   title: string,
 *   content: string,
 *   assetRef: string|null,
 *   counterpart: string|null,
 *   crossRefs: string[],
 *   discoverable: boolean,
 * }} EvidenceItem
 *
 * @typedef {{
 *   id: string,
 *   schemaVersion: number,
 *   characterId: string,
 *   localDate: string,
 *   theme: string,
 *   generatedAt: string,
 *   source: "seed"|"model"|"chat"|"scenario"|"user"|"legacy",
 *   events: CharacterLifeEvent[],
 *   evidence: EvidenceItem[],
 *   appSummary: Record<string, { count: number, headline: string }>,
 *   consistency: { checkedAt: string, errors: string[], warnings: string[] },
 * }} CharacterDayPack
 *
 * @typedef {{
 *   id: string,
 *   characterId: string,
 *   dayPackId: string,
 *   evidenceId: string,
 *   observedAt: string,
 *   dwellMs: number,
 *   reactionState: "unseen"|"eligible"|"used",
 * }} ObservationEvent
 */

/**
 * @param {string} localDate YYYY-MM-DD
 */
export function dayPackId(characterId, localDate) {
  return `day:${String(characterId || "").trim()}:${String(localDate || "").trim()}`;
}

/**
 * @param {string} iso
 */
export function localDateFromIso(iso) {
  const s = String(iso || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function isValidLocalDate(value) {
  const s = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidIsoTime(value) {
  const t = Date.parse(String(value || ""));
  return Number.isFinite(t);
}
