/**
 * Backup authority manifest — which export payload keys are fact authority
 * vs rebuildable indexes / projections (unified-memory M9).
 *
 * Consumed by backup export for documentation; does not change restore behavior.
 */

/**
 * @typedef {{
 *   key: string,
 *   role: "authority" | "projection" | "index" | "settings" | "media" | "mixed",
 *   rebuildable?: boolean,
 *   note?: string,
 * }} AuthorityEntry
 */

/** @type {AuthorityEntry[]} */
export const BACKUP_AUTHORITY_ENTRIES = Object.freeze([
  {
    key: "conversationV2",
    role: "authority",
    rebuildable: false,
    note: "Conversation V2 is dialogue authority.",
  },
  {
    key: "messages",
    role: "mixed",
    rebuildable: false,
    note: "Legacy message store; prefer conversationV2 when present.",
  },
  {
    key: "conversations",
    role: "mixed",
    rebuildable: false,
    note: "Legacy conversation list; prefer conversationV2.",
  },
  {
    key: "contextGraph",
    role: "projection",
    rebuildable: true,
    note: "When contextGraphProjectionOnlyV1 is on, graph is projection; Stable Memory + Timeline are upstream.",
  },
  {
    key: "contextSessionMap",
    role: "projection",
    rebuildable: true,
  },
  {
    key: "contextBranchSummaries",
    role: "projection",
    rebuildable: true,
  },
  {
    key: "memories",
    role: "index",
    rebuildable: true,
    note: "MemPalace drawers — rebuildable when palaceProjectionOnlyV1; not business authority for diary/books.",
  },
  {
    key: "palaceKg",
    role: "index",
    rebuildable: true,
    note: "KG edges derived from drawers; rebuildable from text.",
  },
  {
    key: "cohabitTimeline",
    role: "projection",
    rebuildable: true,
    note: "localStorage mirror; Canonical Timeline (sidewrite/timeline events) is event authority. Marked projection:true when unifiedMemoryAdaptersV1 is on.",
  },
  {
    key: "life",
    role: "mixed",
    rebuildable: false,
    note: "Life day packs may dual-run; prefer sourceEventId back-refs when adapters on.",
  },
  {
    key: "companionLife",
    role: "mixed",
    rebuildable: false,
  },
  {
    key: "worldbook",
    role: "authority",
    rebuildable: false,
  },
  {
    key: "characters",
    role: "authority",
    rebuildable: false,
  },
  {
    key: "profile",
    role: "authority",
    rebuildable: false,
  },
  {
    key: "library",
    role: "authority",
    rebuildable: false,
    note: "Book library authority; palace book.chunk rows are index projections.",
  },
  {
    key: "settings",
    role: "settings",
    rebuildable: false,
  },
  {
    key: "mediaManifest",
    role: "media",
    rebuildable: false,
  },
  {
    key: "scenario",
    role: "authority",
    rebuildable: false,
    note: "Scenario scripts/runs; fiction namespace must not promote to reality Stable Memory.",
  },
  {
    key: "skillPlatform",
    role: "authority",
    rebuildable: false,
  },
  {
    key: "wallet",
    role: "authority",
    rebuildable: false,
  },
  {
    key: "shopOrders",
    role: "authority",
    rebuildable: false,
  },
  {
    key: "shopInventory",
    role: "authority",
    rebuildable: false,
  },
]);

export const BACKUP_AUTHORITY_MANIFEST = Object.freeze({
  schemaVersion: 1,
  wave: "M9",
  entries: BACKUP_AUTHORITY_ENTRIES,
  rebuildableKeys: BACKUP_AUTHORITY_ENTRIES.filter((e) => e.rebuildable).map((e) => e.key),
  authorityKeys: BACKUP_AUTHORITY_ENTRIES.filter((e) => e.role === "authority").map((e) => e.key),
});

/**
 * @param {string} key
 * @returns {AuthorityEntry | null}
 */
export function getBackupAuthorityEntry(key) {
  const k = String(key || "").trim();
  return BACKUP_AUTHORITY_ENTRIES.find((e) => e.key === k) || null;
}
