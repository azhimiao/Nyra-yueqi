export const REPOSITORY_JOURNAL_KEY = "yueqi.storage.tx.journal.v1";
export const REPOSITORY_STAGING_KEY = "yueqi.storage.tx.staging.v1";

function parseJson(raw, fallback) {
  if (raw == null || raw === "") return fallback;
  return JSON.parse(raw);
}

function specialSettingsRecords(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.__repositoryRecords) ? value.__repositoryRecords : [];
}

function readRecords(storage, key, { settings = false } = {}) {
  const value = parseJson(storage.getItem(key), settings ? {} : []);
  const records = settings ? specialSettingsRecords(value) : value;
  if (!Array.isArray(records)) throw Object.assign(new Error("Invalid repository records"), {
    code: "journal_corrupt",
  });
  return { value, records };
}

function encodeRecords(current, records, { settings = false } = {}) {
  if (!settings || Array.isArray(current)) return JSON.stringify(records);
  return JSON.stringify({ ...(current || {}), __repositoryRecords: records });
}

function applyOps(records, ops) {
  const next = records.slice();
  for (const op of ops) {
    const id = op.type === "put" ? op.record.id : op.id;
    const index = next.findIndex((record) => record?.id === id);
    if (op.type === "delete") {
      if (index >= 0) next.splice(index, 1);
    } else if (index >= 0) {
      next[index] = op.record;
    } else {
      next.push(op.record);
    }
  }
  return next;
}

function crash(point) {
  const error = new Error(`Simulated crash after ${point}`);
  error.code = "backend_failed";
  error.simulatedCrash = true;
  throw error;
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Recovery will retry cleanup.
  }
}

export function createLocalStorageJournalBackend({
  storage,
  keyForStore,
  crashAfter,
  journalKey = REPOSITORY_JOURNAL_KEY,
  stagingKey = REPOSITORY_STAGING_KEY,
} = {}) {
  if (!storage || typeof keyForStore !== "function") {
    throw new TypeError("storage and keyForStore are required");
  }

  function readJournal() {
    try {
      const journal = parseJson(storage.getItem(journalKey), null);
      if (
        journal &&
        (journal.schemaVersion !== 1 ||
          !["prepared", "commit", "committed"].includes(journal.state))
      ) {
        throw new Error("Invalid repository journal");
      }
      return journal;
    } catch (error) {
      throw Object.assign(new Error(error.message || "Invalid repository journal"), {
        code: "journal_corrupt",
      });
    }
  }

  function readStaging() {
    try {
      const staging = parseJson(storage.getItem(stagingKey), null);
      if (!staging || !Array.isArray(staging.entries)) {
        throw new Error("Missing repository staging data");
      }
      return staging;
    } catch (error) {
      throw Object.assign(new Error(error.message || "Invalid repository staging data"), {
        code: "journal_corrupt",
      });
    }
  }

  function cleanup() {
    safeRemove(storage, stagingKey);
    safeRemove(storage, journalKey);
  }

  function writeJournal(journal) {
    storage.setItem(journalKey, JSON.stringify(journal));
  }

  function applyStaging(staging) {
    for (const entry of staging.entries) storage.setItem(entry.key, entry.after);
  }

  async function publishOnce(journal, context) {
    if (journal.published) return journal;
    const marked = { ...journal, published: true };
    writeJournal(marked);
    if (
      context?.idempotencyKey === journal.idempotencyKey &&
      typeof context.onCommitted === "function"
    ) {
      try {
        await context.onCommitted();
      } catch (error) {
        console.warn("Repository commit publication failed after durable commit", error);
      }
    }
    return marked;
  }

  async function recoverJournal(context = {}) {
    let journal = readJournal();
    if (!journal) return { recovered: false };

    if (journal.state === "prepared") {
      cleanup();
      return { recovered: true, rolledBack: true };
    }

    const staging = readStaging();
    if (staging.txId !== journal.txId) {
      throw Object.assign(new Error("Journal and staging transaction mismatch"), {
        code: "journal_corrupt",
      });
    }
    if (journal.state === "commit") {
      applyStaging(staging);
      journal = { ...journal, state: "committed", published: false };
      writeJournal(journal);
    }
    journal = await publishOnce(journal, context);
    cleanup();
    return { recovered: true, committed: true, published: journal.published };
  }

  async function runTransaction(context) {
    try {
      await recoverJournal(context);

      const settingsKey = keyForStore("settings");
      const { records: settingsRecords } = readRecords(storage, settingsKey, {
        settings: true,
      });
      const previous = settingsRecords.find((record) => record?.id === context.txRecord.id);
      if (previous) {
        if (previous.opsFingerprint !== context.fingerprint) {
          return { ok: false, conflict: true, publicationHandled: true };
        }
        return {
          ok: true,
          duplicate: true,
          committed: previous.recordIds || context.committed,
          publicationHandled: true,
        };
      }

      const txId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let journal = {
        schemaVersion: 1,
        txId,
        idempotencyKey: context.idempotencyKey,
        fingerprint: context.fingerprint,
        ops: context.ops,
        state: "prepared",
        published: false,
      };
      writeJournal(journal);
      if (crashAfter === "prepare") crash("prepare");

      const grouped = new Map();
      for (const op of [
        ...context.ops,
        { type: "put", store: "settings", record: context.txRecord },
      ]) {
        const key = keyForStore(op.store);
        if (!grouped.has(key)) grouped.set(key, { key, ops: [], stores: [] });
        const group = grouped.get(key);
        group.ops.push(op);
        group.stores.push(op.store);
      }
      const entries = [];
      for (const { key, ops, stores } of grouped.values()) {
        const settings = key === settingsKey;
        const current = readRecords(storage, key, { settings });
        const next = applyOps(current.records, ops);
        entries.push({
          stores: [...new Set(stores)],
          key,
          before: storage.getItem(key),
          after: encodeRecords(current.value, next, { settings }),
        });
      }
      const staging = { schemaVersion: 1, txId, entries };
      storage.setItem(stagingKey, JSON.stringify(staging));
      if (crashAfter === "stage") crash("stage");

      journal = { ...journal, state: "commit" };
      writeJournal(journal);
      if (crashAfter === "commit_marker") crash("commit_marker");

      const applied = [];
      try {
        for (const entry of entries) {
          storage.setItem(entry.key, entry.after);
          applied.push(entry);
        }
      } catch (error) {
        let restored = true;
        for (const entry of applied.reverse()) {
          try {
            if (entry.before == null) storage.removeItem(entry.key);
            else storage.setItem(entry.key, entry.before);
          } catch {
            restored = false;
          }
        }
        if (restored) cleanup();
        // Otherwise keep the commit marker and staging so restart recovery can finish.
        throw error;
      }
      if (crashAfter === "apply") crash("apply");

      journal = { ...journal, state: "committed", published: false };
      writeJournal(journal);
      journal = await publishOnce(journal, context);
      if (crashAfter === "publish") crash("publish");
      cleanup();
      return {
        ok: true,
        duplicate: false,
        committed: context.committed,
        publicationHandled: true,
      };
    } catch (error) {
      if (!error.simulatedCrash) {
        const journal = (() => {
          try {
            return readJournal();
          } catch {
            return null;
          }
        })();
        if (journal?.state === "prepared") cleanup();
      }
      return { ok: false, error, publicationHandled: true };
    }
  }

  return { runTransaction, recoverJournal };
}
