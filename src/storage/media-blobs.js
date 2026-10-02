const DB_NAME = "yueqi-media-blobs";
const STORE = "blobs";

function openBlobDb() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexeddb_unavailable"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("media_blob_db"));
  });
}

export function isMediaBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

/** SQLite / localStorage cannot hold File/Blob. Keep only metadata. */
export function serializeMediaRecord(record) {
  if (!record || !isMediaBlob(record.blob)) return record;
  const { blob, ...rest } = record;
  return { ...rest, hasBlob: true };
}

export async function putMediaBlob(id, blob) {
  const key = String(id || "").trim();
  if (!key || !isMediaBlob(blob)) return false;
  const db = await openBlobDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(blob, key);
    });
    return true;
  } finally {
    db.close();
  }
}

export async function getMediaBlob(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  try {
    const db = await openBlobDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
