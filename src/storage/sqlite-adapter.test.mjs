import assert from "node:assert/strict";
import {
  connectSqliteDatabase,
  createSqliteEncryptionSecret,
  resolveSqliteOpenPlan,
} from "./sqlite-adapter.js";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

await test("plain config keeps the historical no-encryption open", () => {
  assert.deepEqual(
    resolveSqliteOpenPlan({
      encryptionEnabled: false,
      databaseExists: true,
      databaseEncrypted: false,
    }),
    { encrypted: false, mode: "no-encryption", needSecret: false, migrate: false },
  );
});

await test("new databases open encrypted with the stored secret", () => {
  assert.deepEqual(
    resolveSqliteOpenPlan({
      encryptionEnabled: true,
      databaseExists: false,
      databaseEncrypted: false,
    }),
    { encrypted: true, mode: "secret", needSecret: true, migrate: false },
  );
});

await test("existing plaintext databases migrate in place once", () => {
  assert.deepEqual(
    resolveSqliteOpenPlan({
      encryptionEnabled: true,
      databaseExists: true,
      databaseEncrypted: false,
    }),
    { encrypted: true, mode: "encryption", needSecret: true, migrate: true },
  );
});

await test("already encrypted databases reopen with secret mode", () => {
  assert.deepEqual(
    resolveSqliteOpenPlan({
      encryptionEnabled: true,
      databaseExists: true,
      databaseEncrypted: true,
    }),
    { encrypted: true, mode: "secret", needSecret: true, migrate: false },
  );
});

await test("passphrase is 256-bit hex from CSPRNG", () => {
  const secret = createSqliteEncryptionSecret();
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.notEqual(secret, createSqliteEncryptionSecret());
});

function fakeSqlite({
  encryptionEnabled = true,
  exists = false,
  encryptedFile = false,
  secretStored = false,
  failMode = "",
} = {}) {
  const opens = [];
  return {
    opens,
    secretStored,
    passphrase: "",
    async isInConfigEncryption() {
      return { result: encryptionEnabled };
    },
    async isDatabase() {
      return { result: exists };
    },
    async isDatabaseEncrypted() {
      return { result: encryptedFile };
    },
    async isSecretStored() {
      return { result: this.secretStored };
    },
    async setEncryptionSecret(passphrase) {
      this.secretStored = true;
      this.passphrase = passphrase;
    },
    async createConnection(_name, encrypted, mode) {
      opens.push({ encrypted, mode });
      if (failMode && mode === failMode) throw new Error(`open ${mode} failed`);
      return {
        async open() {},
        async close() {},
      };
    },
    async closeConnection() {
      this.closed = true;
    },
    async checkConnectionsConsistency() {
      return { result: true };
    },
  };
}

await test("connects a new encrypted store and records a passphrase", async () => {
  const sqlite = fakeSqlite({ exists: false });
  await connectSqliteDatabase(sqlite);
  assert.equal(sqlite.secretStored, true);
  assert.match(sqlite.passphrase, /^[0-9a-f]{64}$/);
  assert.deepEqual(sqlite.opens, [{ encrypted: true, mode: "secret" }]);
});

await test("migrates an existing plaintext store then opens it", async () => {
  const sqlite = fakeSqlite({ exists: true, encryptedFile: false });
  await connectSqliteDatabase(sqlite);
  assert.deepEqual(sqlite.opens, [{ encrypted: true, mode: "encryption" }]);
});

await test("encryption failure falls back to the old plaintext open", async () => {
  const sqlite = fakeSqlite({
    exists: true,
    encryptedFile: false,
    failMode: "encryption",
  });
  await connectSqliteDatabase(sqlite);
  assert.deepEqual(sqlite.opens, [
    { encrypted: true, mode: "encryption" },
    { encrypted: false, mode: "no-encryption" },
  ]);
  assert.equal(sqlite.closed, true);
});

await test("config encryption off never touches the passphrase APIs", async () => {
  const sqlite = fakeSqlite({ encryptionEnabled: false, exists: true });
  await connectSqliteDatabase(sqlite);
  assert.equal(sqlite.secretStored, false);
  assert.deepEqual(sqlite.opens, [{ encrypted: false, mode: "no-encryption" }]);
});

console.log(`\n${passed} PASS`);
