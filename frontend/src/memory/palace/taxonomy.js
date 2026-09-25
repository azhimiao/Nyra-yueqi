import { getAllRecords, normalizeMemory } from "../../storage/db.js";
import { inferHall } from "./drawer.js";

export async function listDrawers({ wing, room, hall, limit = 24, offset = 0 } = {}) {
  const records = (await getAllRecords("memories")).map(normalizeMemory);
  return records
    .filter((record) => {
      if (wing && record.wing !== wing) return false;
      if (room && record.room !== room) return false;
      if (hall && (record.hall || inferHall(record.source)) !== hall) return false;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(offset, offset + limit);
}

export async function listWings() {
  const records = (await getAllRecords("memories")).map(normalizeMemory);
  const counts = new Map();

  records.forEach((record) => {
    const wing = record.wing || "Relationship";
    counts.set(wing, (counts.get(wing) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([name, drawers]) => ({ name, drawers }))
    .sort((a, b) => b.drawers - a.drawers);
}

export async function listRooms(wing) {
  const records = (await getAllRecords("memories")).map(normalizeMemory);
  const counts = new Map();

  records
    .filter((record) => !wing || record.wing === wing)
    .forEach((record) => {
      const room = record.room || "General";
      counts.set(room, (counts.get(room) || 0) + 1);
    });

  return [...counts.entries()]
    .map(([name, drawers]) => ({ name, drawers }))
    .sort((a, b) => b.drawers - a.drawers);
}

export async function getTaxonomy() {
  const records = (await getAllRecords("memories")).map(normalizeMemory);
  const tree = {};

  records.forEach((record) => {
    const wing = record.wing || "Relationship";
    const room = record.room || "General";
    const hall = record.hall || inferHall(record.source);
    tree[wing] ||= {};
    tree[wing][room] ||= { drawers: 0, halls: {} };
    tree[wing][room].drawers += 1;
    tree[wing][room].halls[hall] = (tree[wing][room].halls[hall] || 0) + 1;
  });

  return tree;
}
