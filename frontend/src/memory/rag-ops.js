import { normalizeMemory, deleteRecord, storeRecord, getAllRecords } from "../storage/db.js";

export async function deleteMemory(id) {
  await deleteRecord("memories", id);
}

export async function updateMemory(id, patch) {
  const records = await getAllRecords("memories");
  const target = records.find((record) => record.id === id);
  if (!target) throw new Error("memory_not_found");
  return storeRecord("memories", normalizeMemory({ ...target, ...patch, id }));
}
