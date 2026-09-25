/**
 * User-defined adventure worlds (no bundled stories).
 */

export const USER_WORLDS_KEY = "yueqi.adventure.user-worlds.v1";

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return `world-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

function readBag() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(USER_WORLDS_KEY) || "{}");
    return { worlds: Array.isArray(raw?.worlds) ? raw.worlds : [] };
  } catch {
    return { worlds: [] };
  }
}

function writeBag(bag) {
  try {
    window.localStorage.setItem(USER_WORLDS_KEY, JSON.stringify(bag));
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a minimal playable package from user fields.
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   openingTitle?: string,
 *   openingText: string,
 *   locationName?: string,
 * }} input
 */
export function createUserWorld(input = {}) {
  const title = String(input.title || "").trim().slice(0, 40);
  const openingText = String(input.openingText || "").trim().slice(0, 800);
  if (!title || !openingText) {
    return { ok: false, reason: "title_and_opening_required" };
  }
  const locationName = String(input.locationName || "起点").trim().slice(0, 40) || "起点";
  const locationId = "start";
  const openingId = "opening-1";
  const world = {
    schemaVersion: 2,
    version: 2,
    id: uid(),
    title,
    subtitle: String(input.subtitle || "").trim().slice(0, 80),
    summary: openingText.slice(0, 160),
    tags: ["自定义"],
    tone: "harbor",
    tutorial: false,
    userDefined: true,
    rules: {
      perspective: "second-person",
      principles: ["尊重玩家行动自由", "世界事实保持连续"],
      stats: ["体魄", "洞察", "交涉"],
    },
    openings: [
      {
        id: openingId,
        title: String(input.openingTitle || "开场").trim().slice(0, 40) || "开场",
        description: openingText.slice(0, 120),
        startLocationId: locationId,
        openingText,
        initialQuestIds: [],
        initialInventory: [],
        initialFlags: {},
        initialClock: { day: 1, hour: 8 },
      },
    ],
    locations: [
      {
        id: locationId,
        name: locationName,
        summary: "你定义的起点",
        description: openingText.slice(0, 200),
        position: { x: 50, y: 50 },
        exits: [],
      },
    ],
    quests: [],
    npcs: [],
    loreEntries: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const bag = readBag();
  bag.worlds = [world, ...bag.worlds.filter((item) => item.id !== world.id)].slice(0, 40);
  if (!writeBag(bag)) return { ok: false, reason: "save_failed" };
  return { ok: true, world };
}

export function listUserWorlds() {
  return readBag().worlds.slice();
}

export function getUserWorld(id) {
  return readBag().worlds.find((item) => item.id === String(id || "")) || null;
}

export function deleteUserWorld(id) {
  const bag = readBag();
  const next = bag.worlds.filter((item) => item.id !== String(id || ""));
  if (next.length === bag.worlds.length) return false;
  bag.worlds = next;
  return writeBag(bag);
}
