import assert from "node:assert/strict";
import { createLocalStorageJournalBackend } from "../src/storage/journal.js";
import {
  createIndexedDbBackend,
  runRepositoryTransaction,
} from "../src/storage/transaction.js";
import { createSqliteStore } from "../src/storage/sqlite-adapter.js";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const ops3 = [
  { type: "put", store: "characters", record: { id: "char-1", name: "月栖" } },
  { type: "put", store: "preferences", record: { id: "user-1::char-1" } },
  { type: "put", store: "openings", record: { id: "opening-1", text: "你好" } },
];
const firstLightOps = [
  ...ops3,
  { type: "put", store: "conversations", record: { id: "conversation-1" } },
  { type: "put", store: "onboarding", record: { id: "onboarding:user-1", complete: true } },
];

class FakeIndexedDb {
  constructor({ failAt, quota = false, failBeforeComplete = false } = {}) {
    this.failAt = failAt;
    this.quota = quota;
    this.failBeforeComplete = failBeforeComplete;
    this.data = new Map();
    for (const name of ["settings", "characters", "preferences", "openings"]) {
      this.data.set(name, new Map());
    }
  }

  transaction(storeNames, mode) {
    assert.equal(mode, "readwrite");
    assert.deepEqual(new Set(storeNames), new Set(["settings", "characters", "preferences", "openings"]));
    const working = new Map(
      [...this.data].map(([name, rows]) => [
        name,
        new Map([...rows].map(([id, value]) => [id, structuredClone(value)])),
      ])
    );
    let writes = 0;
    let settled = false;
    const tx = {
      error: null,
      objectStore: (name) => {
        if (!working.has(name)) throw new DOMException("Missing store", "NotFoundError");
        return {
          get: (id) => {
            const request = { result: undefined, error: null };
            queueMicrotask(() => {
              if (settled) return;
              request.result = working.get(name).get(id);
              request.onsuccess?.();
              queueMicrotask(() => {
                if (settled) return;
                if (this.failBeforeComplete) {
                  tx.error = new Error("failed before complete");
                  tx.abort();
                  return;
                }
                settled = true;
                this.data = working;
                tx.oncomplete?.();
              });
            });
            return request;
          },
          put: (record) => {
            writes += 1;
            if (this.quota) throw new DOMException("quota", "QuotaExceededError");
            if (this.failAt === writes) throw new Error(`put ${writes} failed`);
            working.get(name).set(record.id, structuredClone(record));
          },
          delete: (id) => working.get(name).delete(id),
        };
      },
      abort: () => {
        if (settled) return;
        settled = true;
        queueMicrotask(() => tx.onabort?.());
      },
    };
    return tx;
  }

  rows(store) {
    return [...this.data.get(store).values()];
  }
}

class FakeSqliteDb {
  constructor({ failAt, failCommit = false } = {}) {
    this.rows = new Map();
    this.working = null;
    this.failAt = failAt;
    this.failCommit = failCommit;
    this.statements = 0;
  }

  async execute(sql) {
    if (/BEGIN IMMEDIATE/i.test(sql)) {
      this.working = new Map(this.rows);
      return;
    }
    if (/ROLLBACK/i.test(sql)) {
      this.working = null;
      return;
    }
    if (/COMMIT/i.test(sql)) {
      if (this.failCommit) throw new Error("commit failed");
      this.rows = this.working;
      this.working = null;
    }
  }

  async run(sql, params = []) {
    this.statements += 1;
    if (this.failAt === this.statements) throw new Error(`statement ${this.statements} failed`);
    if (/INSERT OR REPLACE INTO records/i.test(sql)) {
      const [store, id, payload] = params;
      this.working.set(`${store}\0${id}`, payload);
    } else if (/DELETE FROM records/i.test(sql)) {
      this.working.delete(`${params[0]}\0${params[1]}`);
    }
  }

  async query(sql, params = []) {
    if (/SELECT payload FROM records WHERE store = \? AND id = \?/i.test(sql)) {
      const payload = this.working.get(`${params[0]}\0${params[1]}`);
      return { values: payload ? [{ payload }] : [] };
    }
    return { values: [] };
  }

  visibleBusinessRows() {
    return [...this.rows.keys()].filter((key) => !key.startsWith("settings\0tx:"));
  }
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
    this.throwRule = null;
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    if (this.throwRule?.(key)) {
      this.throwRule = null;
      throw new DOMException("quota", "QuotaExceededError");
    }
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

const keyForStore = (store) => `records:${store}`;

function localRows(storage, store) {
  const value = JSON.parse(storage.getItem(keyForStore(store)) || (store === "settings" ? "{}" : "[]"));
  return store === "settings" && !Array.isArray(value)
    ? value.__repositoryRecords || []
    : value;
}

function localBackend(storage, options = {}) {
  return createLocalStorageJournalBackend({ storage, keyForStore, ...options });
}

await test("IndexedDB fake commits three stores in one transaction", async () => {
  const idb = new FakeIndexedDb();
  const result = await runRepositoryTransaction(
    { idempotencyKey: "idb-ok", ops: ops3 },
    { backend: createIndexedDbBackend(idb) }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(ops3.map((op) => idb.rows(op.store).length), [1, 1, 1]);
});

await test("IndexedDB aborts without partial writes after an injected put failure", async () => {
  const idb = new FakeIndexedDb({ failAt: 1 });
  const result = await runRepositoryTransaction(
    { idempotencyKey: "idb-fail", ops: ops3 },
    { backend: createIndexedDbBackend(idb) }
  );
  assert.equal(result.error.code, "backend_failed");
  assert.deepEqual(ops3.map((op) => idb.rows(op.store).length), [0, 0, 0]);
});

await test("IndexedDB aborts queued writes before transaction completion", async () => {
  const idb = new FakeIndexedDb({ failBeforeComplete: true });
  const result = await runRepositoryTransaction(
    { idempotencyKey: "idb-before-complete", ops: ops3 },
    { backend: createIndexedDbBackend(idb) }
  );
  assert.equal(result.ok, false);
  assert.deepEqual(ops3.map((op) => idb.rows(op.store).length), [0, 0, 0]);
});

await test("IndexedDB maps quota failures and leaves authority empty", async () => {
  const idb = new FakeIndexedDb({ quota: true });
  const result = await runRepositoryTransaction(
    { idempotencyKey: "idb-quota", ops: ops3 },
    { backend: createIndexedDbBackend(idb) }
  );
  assert.equal(result.error.code, "quota_exceeded");
  assert.deepEqual(ops3.map((op) => idb.rows(op.store).length), [0, 0, 0]);
});

await test("SQLite rolls back when the second statement fails", async () => {
  const db = new FakeSqliteDb({ failAt: 2 });
  const result = await runRepositoryTransaction(
    { idempotencyKey: "sqlite-fail", ops: ops3 },
    { backend: createSqliteStore(db) }
  );
  assert.equal(result.error.code, "backend_failed");
  assert.equal(db.visibleBusinessRows().length, 0);
});

await test("SQLite commits three records atomically", async () => {
  const db = new FakeSqliteDb();
  const result = await runRepositoryTransaction(
    { idempotencyKey: "sqlite-ok", ops: ops3 },
    { backend: createSqliteStore(db) }
  );
  assert.equal(result.ok, true);
  assert.equal(db.visibleBusinessRows().length, 3);
});

await test("SQLite commit failure rolls back all visible records", async () => {
  const db = new FakeSqliteDb({ failCommit: true });
  const result = await runRepositoryTransaction(
    { idempotencyKey: "sqlite-commit-fail", ops: ops3 },
    { backend: createSqliteStore(db) }
  );
  assert.equal(result.ok, false);
  assert.equal(db.visibleBusinessRows().length, 0);
});

await test("localStorage publishes only after authoritative records are readable", async () => {
  const storage = new MemoryStorage();
  let observed = false;
  const result = await runRepositoryTransaction(
    {
      idempotencyKey: "local-ok",
      ops: ops3,
      onCommitted() {
        observed = ops3.every((op) => localRows(storage, op.store).length === 1);
      },
    },
    { backend: localBackend(storage) }
  );
  assert.equal(result.ok, true);
  assert.equal(observed, true);
});

for (const point of ["prepare", "stage"]) {
  await test(`localStorage crash after ${point} recovers by rollback`, async () => {
    const storage = new MemoryStorage();
    let published = 0;
    const input = {
      idempotencyKey: `local-${point}`,
      ops: ops3,
      onCommitted: () => {
        published += 1;
      },
    };
    const failed = await runRepositoryTransaction(input, {
      backend: localBackend(storage, { crashAfter: point }),
    });
    assert.equal(failed.ok, false);
    await localBackend(storage).recoverJournal(input);
    assert.deepEqual(ops3.map((op) => localRows(storage, op.store).length), [0, 0, 0]);
    assert.equal(published, 0);
  });
}

await test("localStorage commit marker recovery resumes and publishes once", async () => {
  const storage = new MemoryStorage();
  let published = 0;
  const input = {
    idempotencyKey: "local-commit-marker",
    ops: ops3,
    onCommitted: () => {
      published += 1;
    },
  };
  await runRepositoryTransaction(input, {
    backend: localBackend(storage, { crashAfter: "commit_marker" }),
  });
  const recovered = await runRepositoryTransaction(input, { backend: localBackend(storage) });
  assert.equal(recovered.duplicate, true);
  assert.deepEqual(ops3.map((op) => localRows(storage, op.store).length), [1, 1, 1]);
  assert.equal(published, 1);
});

await test("localStorage apply crash recovery publishes exactly once", async () => {
  const storage = new MemoryStorage();
  let published = 0;
  const input = {
    idempotencyKey: "local-apply",
    ops: ops3,
    onCommitted: () => {
      published += 1;
    },
  };
  await runRepositoryTransaction(input, {
    backend: localBackend(storage, { crashAfter: "apply" }),
  });
  await runRepositoryTransaction(input, { backend: localBackend(storage) });
  assert.equal(published, 1);
  assert.deepEqual(ops3.map((op) => localRows(storage, op.store).length), [1, 1, 1]);
});

await test("localStorage publish crash does not publish twice after restart", async () => {
  const storage = new MemoryStorage();
  let published = 0;
  const input = {
    idempotencyKey: "local-publish",
    ops: ops3,
    onCommitted: () => {
      published += 1;
    },
  };
  await runRepositoryTransaction(input, {
    backend: localBackend(storage, { crashAfter: "publish" }),
  });
  await runRepositoryTransaction(input, { backend: localBackend(storage) });
  assert.equal(published, 1);
});

await test("localStorage quota during apply restores unchanged authority", async () => {
  const storage = new MemoryStorage();
  storage.throwRule = (key) => key === keyForStore("settings");
  const result = await runRepositoryTransaction(
    { idempotencyKey: "local-quota", ops: ops3 },
    { backend: localBackend(storage) }
  );
  assert.equal(result.error.code, "quota_exceeded");
  assert.deepEqual(ops3.map((op) => localRows(storage, op.store).length), [0, 0, 0]);
});

await test("same idempotency key is a duplicate without duplicate First Light rows", async () => {
  const storage = new MemoryStorage();
  const input = { idempotencyKey: "first-light-once", ops: firstLightOps };
  assert.equal(
    (await runRepositoryTransaction(input, { backend: localBackend(storage) })).duplicate,
    false
  );
  assert.equal(
    (await runRepositoryTransaction(input, { backend: localBackend(storage) })).duplicate,
    true
  );
  assert.deepEqual(firstLightOps.map((op) => localRows(storage, op.store).length), [1, 1, 1, 1, 1]);
});

await test("localStorage merges logical stores sharing one authority key", async () => {
  const storage = new MemoryStorage();
  const sharedKeyForStore = (store) =>
    ["settings", "preferences", "onboarding"].includes(store)
      ? "records:settings"
      : `records:${store}`;
  const input = { idempotencyKey: "shared-settings", ops: firstLightOps };
  const backend = createLocalStorageJournalBackend({
    storage,
    keyForStore: sharedKeyForStore,
  });
  const result = await runRepositoryTransaction(input, { backend });
  assert.equal(result.ok, true);
  const settings = JSON.parse(storage.getItem("records:settings"));
  const ids = settings.__repositoryRecords.map((record) => record.id);
  assert.equal(ids.filter((id) => id === "user-1::char-1").length, 1);
  assert.equal(ids.filter((id) => id === "onboarding:user-1").length, 1);
  assert.equal(ids.filter((id) => id === "tx:shared-settings").length, 1);
});

await test("same idempotency key with a different fingerprint conflicts", async () => {
  const storage = new MemoryStorage();
  await runRepositoryTransaction(
    { idempotencyKey: "fingerprint", ops: ops3 },
    { backend: localBackend(storage) }
  );
  const changed = structuredClone(ops3);
  changed[0].record.name = "另一个角色";
  const result = await runRepositoryTransaction(
    { idempotencyKey: "fingerprint", ops: changed },
    { backend: localBackend(storage) }
  );
  assert.equal(result.error.code, "conflict");
  assert.equal(localRows(storage, "characters")[0].name, "月栖");
});

await test("onCommitted failure cannot roll back durable records", async () => {
  const storage = new MemoryStorage();
  const originalWarn = console.warn;
  let warnings = 0;
  console.warn = () => {
    warnings += 1;
  };
  try {
    const result = await runRepositoryTransaction(
      {
        idempotencyKey: "publish-throws",
        ops: ops3,
        onCommitted() {
          throw new Error("subscriber failed");
        },
      },
      { backend: localBackend(storage) }
    );
    assert.equal(result.ok, true);
    assert.equal(warnings, 1);
    assert.deepEqual(ops3.map((op) => localRows(storage, op.store).length), [1, 1, 1]);
  } finally {
    console.warn = originalWarn;
  }
});

await test("empty transaction returns the stable empty_ops code", async () => {
  const result = await runRepositoryTransaction(
    { idempotencyKey: "empty", ops: [] },
    { backend: { runTransaction: assert.fail } }
  );
  assert.equal(result.error.code, "empty_ops");
});

await test("restart recovery uses a new journal backend over the same storage", async () => {
  const storage = new MemoryStorage();
  const input = { idempotencyKey: "restart", ops: ops3 };
  await runRepositoryTransaction(input, {
    backend: localBackend(storage, { crashAfter: "commit_marker" }),
  });
  const restartedBackend = localBackend(storage);
  const result = await runRepositoryTransaction(input, { backend: restartedBackend });
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.deepEqual(ops3.map((op) => localRows(storage, op.store).length), [1, 1, 1]);
});

console.log(`\n${passed} PASS`);
