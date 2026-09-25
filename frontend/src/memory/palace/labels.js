/** Memory palace partitions: English keys internally; labels via i18n. */

import { t } from "../../i18n/index.js";

const WING_KEYS = Object.freeze({
  Relationship: "mePanels.memory.wings.Relationship",
  World: "mePanels.memory.wings.World",
  Self: "mePanels.memory.wings.Self",
  Work: "mePanels.memory.wings.Work",
});

const ROOM_KEYS = Object.freeze({
  General: "mePanels.memory.rooms.General",
  Current: "mePanels.memory.rooms.Current",
  Chat: "mePanels.memory.rooms.Chat",
  Proactive: "mePanels.memory.rooms.Proactive",
  Diary: "mePanels.memory.rooms.Diary",
  "Video Call": "mePanels.memory.rooms.Video Call",
  Bookshop: "mePanels.memory.rooms.Bookshop",
  Reading: "mePanels.memory.rooms.Reading",
  Music: "mePanels.memory.rooms.Music",
  Calendar: "mePanels.memory.rooms.Calendar",
  Worldbook: "mePanels.memory.rooms.Worldbook",
});

export function palaceWingLabel(wing) {
  const key = String(wing || "").trim();
  const path = WING_KEYS[key];
  return path ? t(path) : (key || t("mePanels.memory.wingUncategorized"));
}

export function palaceRoomLabel(room) {
  const key = String(room || "").trim();
  const path = ROOM_KEYS[key];
  return path ? t(path) : (key || t("mePanels.memory.roomOther"));
}

export function palaceRoomSummary(rooms, limit = 3) {
  const names = Object.keys(rooms || {}).map(palaceRoomLabel).filter(Boolean);
  if (!names.length) return t("mePanels.memory.roomNone");
  return names.slice(0, limit).join(" · ");
}
