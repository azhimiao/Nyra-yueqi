/**
 * Deterministic merge rules for .nyra import (no random overwrite, no array concat).
 */

/**
 * @param {object} current
 * @param {object} incoming
 * @param {{ mode?: "merge"|"replace" }} [opts]
 */
export function mergeUserWorld(current, incoming, opts = {}) {
  const mode = opts.mode || "merge";
  if (mode === "replace") {
    return {
      result: structuredClone(incoming),
      conflicts: [],
      policy: "replace",
    };
  }

  const conflicts = [];
  const result = structuredClone(current || {});
  const src = incoming || {};

  // Settings: key-level last-write-wins by updatedAt when present, else prefer incoming.
  result.settings = mergeSettings(result.settings || {}, src.settings || {}, conflicts);

  // Profile / library / avatar: object LWW
  for (const key of ["profile", "library", "avatar", "dailyStatus"]) {
    if (src[key] == null) continue;
    result[key] = mergeByUpdatedAt(result[key], src[key], key, conflicts);
  }

  // Character map
  result.characters = mergeByIdList(
    asArray(result.characters),
    asArray(src.characters),
    "characters",
    conflicts,
  );

  // Record arrays with stable ids
  for (const key of [
    "memories",
    "messages",
    "conversations",
    "palaceKg",
    "worldbook",
    "mediaManifest",
  ]) {
    if (!Array.isArray(src[key])) continue;
    result[key] = mergeByIdList(asArray(result[key]), src[key], key, conflicts);
  }

  // Opaque bags: prefer newer bag.updatedAt / exportedAt, else incoming fills missing keys only
  for (const key of [
    "conversationV2",
    "contextGraph",
    "contextSessionMap",
    "contextBranchSummaries",
    "moments",
    "scenario",
    "story",
    "cocreate",
    "cocreateSession",
    "cocreateArtifact",
    "games",
    "yeosGames",
    "yeosSaves",
    "multiplayer",
    "cohabitTimeline",
    "life",
    "wallet",
    "shopOrders",
    "shopInventory",
    "shopWishlist",
    "sidewrite",
    "presets",
    "regex",
    "assetsHub",
    "extensions",
    "gatePrefs",
    "reports",
    "skillPlatform",
    "companionLife",
    "appEvents",
  ]) {
    if (src[key] == null) continue;
    result[key] = mergeOpaqueBag(result[key], src[key], key, conflicts);
  }

  if (src.ecosystem && typeof src.ecosystem === "object") {
    const cur = result.ecosystem || {};
    result.ecosystem = {
      ...cur,
      ...src.ecosystem,
      token: cur.token || "",
    };
  }

  return { result, conflicts, policy: "merge" };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function mergeSettings(current, incoming, conflicts) {
  const out = { ...current };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value == null) continue;
    if (out[key] == null) {
      out[key] = value;
      continue;
    }
    out[key] = mergeByUpdatedAt(out[key], value, `settings.${key}`, conflicts);
  }
  return out;
}

function mergeByUpdatedAt(current, incoming, label, conflicts) {
  if (current == null) return structuredClone(incoming);
  if (incoming == null) return current;
  const a = timestampOf(current);
  const b = timestampOf(incoming);
  if (a === b) {
    if (stableStringify(current) === stableStringify(incoming)) return current;
    conflicts.push({ path: label, policy: "prefer_incoming_on_tie" });
    return structuredClone(incoming);
  }
  if (b > a) {
    conflicts.push({ path: label, policy: "incoming_newer" });
    return structuredClone(incoming);
  }
  conflicts.push({ path: label, policy: "keep_current_newer" });
  return current;
}

function mergeByIdList(currentList, incomingList, label, conflicts) {
  const map = new Map();
  for (const item of currentList) {
    const id = stableId(item);
    if (id) map.set(id, item);
  }
  for (const item of incomingList) {
    const id = stableId(item);
    if (!id) {
      conflicts.push({ path: `${label}[anonymous]`, policy: "skip_no_id" });
      continue;
    }
    if (!map.has(id)) {
      map.set(id, item);
      continue;
    }
    map.set(id, mergeByUpdatedAt(map.get(id), item, `${label}.${id}`, conflicts));
  }
  return [...map.values()];
}

function mergeOpaqueBag(current, incoming, label, conflicts) {
  if (current == null) return structuredClone(incoming);
  if (incoming == null) return current;
  if (typeof current !== "object" || typeof incoming !== "object") {
    return mergeByUpdatedAt(current, incoming, label, conflicts);
  }
  const a = timestampOf(current);
  const b = timestampOf(incoming);
  if (b > a) {
    conflicts.push({ path: label, policy: "incoming_bag_newer" });
    return structuredClone(incoming);
  }
  if (a > b) {
    conflicts.push({ path: label, policy: "keep_current_bag" });
    return current;
  }
  // Same age: shallow fill missing keys only (deterministic, no concat)
  const out = structuredClone(current);
  for (const [key, value] of Object.entries(incoming)) {
    if (out[key] == null && value != null) out[key] = structuredClone(value);
  }
  conflicts.push({ path: label, policy: "fill_missing_keys" });
  return out;
}

function stableId(item) {
  if (!item || typeof item !== "object") return "";
  return String(item.id || item.messageId || item.memoryId || item.eventId || item.uuid || "").trim();
}

function timestampOf(value) {
  if (!value || typeof value !== "object") return 0;
  const raw = value.updatedAt || value.exportedAt || value.createdAt || value.ts || value.timestamp || 0;
  const n = Date.parse(String(raw));
  return Number.isFinite(n) ? n : 0;
}

function stableStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
