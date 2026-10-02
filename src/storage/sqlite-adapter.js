import { MEMORY_DB } from "../constants.js";
import { tokenize } from "../lib/utils.js";

const DB_NAME = MEMORY_DB;
const DB_VERSION = 2;

let connection = null;

function ftsQueryTerms(query) {
  return tokenize(query)
    .map((term) => term.replace(/"/g, ""))
    .filter(Boolean)
    .map((term) => `"${term}"`)
    .join(" OR ");
}

async function ensureSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS records (
      store TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (store, id)
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_records_store ON records(store);`);

  await db.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      drawer_id UNINDEXED,
      wing,
      room,
      raw_text,
      tokenize = 'unicode61'
    );
  `);
}

async function syncMemoryFts(db, record, transaction = true) {
  if (!record?.id) return;
  await db.run(`DELETE FROM memory_fts WHERE drawer_id = ?;`, [record.id], transaction);
  if (record.searchable === false) return;
  await db.run(
    `INSERT INTO memory_fts (drawer_id, wing, room, raw_text) VALUES (?, ?, ?, ?);`,
    [record.id, record.wing || "", record.room || "", record.rawText || ""],
    transaction,
  );
}

function memoryFtsTasks(record) {
  if (!record?.id) return [];
  const tasks = [
    {
      statement: `DELETE FROM memory_fts WHERE drawer_id = ?;`,
      values: [record.id],
    },
  ];
  if (record.searchable !== false) {
    tasks.push({
      statement: `INSERT INTO memory_fts (drawer_id, wing, room, raw_text) VALUES (?, ?, ?, ?);`,
      values: [record.id, record.wing || "", record.room || "", record.rawText || ""],
    });
  }
  return tasks;
}

async function rebuildMemoryFts(db) {
  const result = await db.query(`SELECT COUNT(*) AS count FROM memory_fts;`);
  const count = Number(result.values?.[0]?.count || 0);
  if (count > 0) return;

  const rows = await db.query(`SELECT payload FROM records WHERE store = 'memories';`);
  for (const row of rows.values || []) {
    try {
      const record = JSON.parse(row.payload);
      await syncMemoryFts(db, record);
    } catch {
      // skip corrupt payloads
    }
  }
}

export function createSqliteStore(db, { onClose } = {}) {
  return {
    async put(storeName, record) {
      await db.run(
        "INSERT OR REPLACE INTO records (store, id, payload) VALUES (?, ?, ?);",
        [storeName, record.id, JSON.stringify(record)]
      );
      if (storeName === "memories") {
        await syncMemoryFts(db, record);
      }
      return record;
    },
    async getAll(storeName) {
      const result = await db.query("SELECT payload FROM records WHERE store = ?;", [storeName]);
      return (result.values || [])
        .map((row) => {
          try {
            return JSON.parse(row.payload);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },
    async clear(storeName) {
      await db.run("DELETE FROM records WHERE store = ?;", [storeName]);
      if (storeName === "memories") {
        await db.run("DELETE FROM memory_fts;");
      }
    },
    async delete(storeName, id) {
      await db.run("DELETE FROM records WHERE store = ? AND id = ?;", [storeName, id]);
      if (storeName === "memories") {
        await db.run(`DELETE FROM memory_fts WHERE drawer_id = ?;`, [id]);
      }
    },
    async runTransaction({ fingerprint, ops, committed, txRecord }) {
      let began = false;
      try {
        const useNativeTransaction = typeof db.executeTransaction === "function";
        if (!useNativeTransaction) {
          // Test doubles and older adapters do not expose the native
          // transaction helper, so keep the explicit fallback self-contained.
          await db.execute("BEGIN IMMEDIATE;", false);
          began = true;
        }
        const found = await db.query(
          "SELECT payload FROM records WHERE store = ? AND id = ?;",
          ["settings", txRecord.id]
        );
        const raw = found.values?.[0]?.payload;
        if (raw) {
          const previous = JSON.parse(raw);
          if (previous.opsFingerprint !== fingerprint) {
            if (began) {
              await db.execute("ROLLBACK;", false);
              began = false;
            }
            return { ok: false, conflict: true };
          }
          if (began) {
            await db.execute("COMMIT;", false);
            began = false;
          }
          return {
            ok: true,
            duplicate: true,
            committed: previous.recordIds || committed,
          };
        }

        // Capacitor SQLite owns the native transaction lifecycle. Using its
        // executeTransaction() avoids Android nested-transaction errors while
        // still keeping every First Light record atomic. The manual branch is
        // retained for lightweight test doubles and older adapters.
        if (typeof db.executeTransaction === "function") {
          const tasks = [];
          for (const op of ops) {
            const id = op.type === "put" ? op.record.id : op.id;
            if (op.type === "put") {
              tasks.push({
                statement: "INSERT OR REPLACE INTO records (store, id, payload) VALUES (?, ?, ?);",
                values: [op.store, id, JSON.stringify(op.record)],
              });
              if (op.store === "memories") tasks.push(...memoryFtsTasks(op.record));
            } else {
              tasks.push({
                statement: "DELETE FROM records WHERE store = ? AND id = ?;",
                values: [op.store, id],
              });
              if (op.store === "memories") {
                tasks.push({
                  statement: "DELETE FROM memory_fts WHERE drawer_id = ?;",
                  values: [id],
                });
              }
            }
          }
          tasks.push({
            statement: "INSERT OR REPLACE INTO records (store, id, payload) VALUES (?, ?, ?);",
            values: ["settings", txRecord.id, JSON.stringify(txRecord)],
          });
          await db.executeTransaction(tasks);
          return { ok: true, duplicate: false, committed };
        }

        for (const op of ops) {
          const id = op.type === "put" ? op.record.id : op.id;
          if (op.type === "put") {
            await db.run(
              "INSERT OR REPLACE INTO records (store, id, payload) VALUES (?, ?, ?);",
              [op.store, id, JSON.stringify(op.record)],
              false,
            );
            if (op.store === "memories") await syncMemoryFts(db, op.record, false);
          } else {
            await db.run("DELETE FROM records WHERE store = ? AND id = ?;", [op.store, id], false);
            if (op.store === "memories") {
              await db.run("DELETE FROM memory_fts WHERE drawer_id = ?;", [id], false);
            }
          }
        }
        await db.run(
          "INSERT OR REPLACE INTO records (store, id, payload) VALUES (?, ?, ?);",
          ["settings", txRecord.id, JSON.stringify(txRecord)],
          false,
        );
        await db.execute("COMMIT;", false);
        began = false;
        return { ok: true, duplicate: false, committed };
      } catch (error) {
        if (began) {
          try {
            await db.execute("ROLLBACK;", false);
          } catch {
            // Preserve the original failure.
          }
        }
        return { ok: false, error };
      }
    },
    async searchMemoriesFts(query, { wing, room, limit = 15 } = {}) {
      const match = ftsQueryTerms(query);
      if (!match) return [];

      let sql = `
        SELECT drawer_id, bm25(memory_fts) AS rank
        FROM memory_fts
        WHERE memory_fts MATCH ?
      `;
      const params = [match];

      if (wing) {
        sql += ` AND wing = ?`;
        params.push(wing);
      }
      if (room) {
        sql += ` AND room = ?`;
        params.push(room);
      }
      sql += ` ORDER BY rank LIMIT ?;`;
      params.push(limit);

      try {
        const result = await db.query(sql, params);
        return (result.values || []).map((row) => ({
          id: row.drawer_id,
          ftsRank: row.rank,
        }));
      } catch (error) {
        console.warn("SQLite FTS 检索失败，回退内存检索", error);
        return [];
      }
    },
    async close() {
      await db.close();
      onClose?.();
    },
  };
}

export function resolveSqliteOpenPlan({
  encryptionEnabled,
  databaseExists,
  databaseEncrypted,
}) {
  if (!encryptionEnabled) {
    return { encrypted: false, mode: "no-encryption", needSecret: false, migrate: false };
  }
  if (databaseExists && databaseEncrypted) {
    return { encrypted: true, mode: "secret", needSecret: true, migrate: false };
  }
  if (databaseExists && !databaseEncrypted) {
    return { encrypted: true, mode: "encryption", needSecret: true, migrate: true };
  }
  return { encrypted: true, mode: "secret", needSecret: true, migrate: false };
}

export function createSqliteEncryptionSecret() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(32);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("secure random unavailable for SQLite passphrase");
}

async function flagResult(promise) {
  try {
    const result = await promise;
    return result?.result === true;
  } catch {
    return false;
  }
}

async function resetSqliteConnection(sqlite) {
  try {
    await sqlite.closeConnection(DB_NAME, false);
  } catch {
    /* ignore */
  }
  try {
    await sqlite.checkConnectionsConsistency();
  } catch {
    /* ignore */
  }
}

export async function connectSqliteDatabase(sqlite) {
  let encryptionError = null;
  try {
    const encryptionEnabled = await flagResult(sqlite.isInConfigEncryption());
    if (encryptionEnabled) {
      const databaseExists = await flagResult(sqlite.isDatabase(DB_NAME));
      const databaseEncrypted = databaseExists
        ? await flagResult(sqlite.isDatabaseEncrypted(DB_NAME))
        : false;
      const plan = resolveSqliteOpenPlan({
        encryptionEnabled: true,
        databaseExists,
        databaseEncrypted,
      });
      if (plan.needSecret && !(await flagResult(sqlite.isSecretStored()))) {
        await sqlite.setEncryptionSecret(createSqliteEncryptionSecret());
      }
      const db = await sqlite.createConnection(
        DB_NAME,
        plan.encrypted,
        plan.mode,
        DB_VERSION,
        false,
      );
      await db.open();
      return db;
    }
  } catch (error) {
    encryptionError = error;
    await resetSqliteConnection(sqlite);
  }

  try {
    const db = await sqlite.createConnection(DB_NAME, false, "no-encryption", DB_VERSION, false);
    await db.open();
    return db;
  } catch (plainError) {
    throw encryptionError || plainError;
  }
}

export async function openSqliteStore() {
  if (connection) return connection;

  const { CapacitorSQLite, SQLiteConnection } = await import("@capacitor-community/sqlite");
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const db = await connectSqliteDatabase(sqlite);
  await ensureSchema(db);
  await rebuildMemoryFts(db);

  connection = createSqliteStore(db, {
    onClose() {
      connection = null;
    },
  });
  return connection;
}
