import { getAllRecords, openMemoryDb, storeRecord, deleteRecord } from "../storage/db.js";
import { APP_KEYS, IDB_STORE, payloadRecordId } from "./constants.js";
import { degradePayload, validateSidewritePayload } from "./schema/validate.js";

/**
 * @param {string} characterId
 * @param {string} appKey
 */
export async function getPayload(characterId, appKey) {
  const cid = String(characterId || "").trim();
  const key = String(appKey || "").trim();
  if (!cid || !APP_KEYS.includes(key)) return degradePayload(key);
  await openMemoryDb();
  const id = payloadRecordId(cid, key);
  const all = await getAllRecords(IDB_STORE);
  const found = (all || []).find((row) => row?.id === id);
  if (!found?.payload) return null;
  return degradePayload(key, found.payload);
}

/**
 * @param {string} characterId
 * @param {string} appKey
 * @param {unknown} raw
 */
export async function setPayload(characterId, appKey, raw) {
  const cid = String(characterId || "").trim();
  const key = String(appKey || "").trim();
  if (!cid || !APP_KEYS.includes(key)) return degradePayload(key);
  const validated = validateSidewritePayload(key, raw);
  const payload = validated.ok ? validated.value : degradePayload(key, raw);
  await openMemoryDb();
  await storeRecord(IDB_STORE, {
    id: payloadRecordId(cid, key),
    kind: "payload",
    characterId: cid,
    appKey: key,
    payload,
    updatedAt: new Date().toISOString(),
  });
  return payload;
}

/**
 * @param {string} characterId
 * @param {string} appKey
 */
export async function clearPayload(characterId, appKey) {
  const cid = String(characterId || "").trim();
  const key = String(appKey || "").trim();
  if (!cid || !key) return;
  await openMemoryDb();
  await deleteRecord(IDB_STORE, payloadRecordId(cid, key));
}

/**
 * @param {string} characterId
 */
export async function listPayloadsForCharacter(characterId) {
  const cid = String(characterId || "").trim();
  await openMemoryDb();
  const all = await getAllRecords(IDB_STORE);
  /** @type {Record<string, object>} */
  const out = {};
  for (const row of all || []) {
    if (row?.kind === "payload" && row.characterId === cid && row.appKey && row.payload) {
      out[row.appKey] = degradePayload(row.appKey, row.payload);
    }
  }
  return out;
}
