const ERROR_CODES = new Set([
  "missing_field",
  "invalid_type",
  "empty_ops",
  "quota_exceeded",
  "backend_failed",
  "journal_corrupt",
  "conflict",
]);

/**
 * @typedef {object} RepoOp
 * @property {"put"|"delete"} type
 * @property {string} store
 * @property {object} [record]
 * @property {string} [id]
 */

/**
 * @typedef {object} RepoTransactionInput
 * @property {string} idempotencyKey
 * @property {RepoOp[]} ops
 * @property {() => void | Promise<void>} [onCommitted]
 */

function errorResult(code, message) {
  return {
    ok: false,
    duplicate: false,
    committed: [],
    error: { code, ...(message ? { message } : {}) },
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

export function fingerprintRepositoryOps(ops) {
  return JSON.stringify(
    ops.map((op) => ({
      type: op.type,
      store: op.store,
      id: op.type === "put" ? op.record.id : op.id,
      ...(op.type === "put" ? { record: stableValue(op.record) } : {}),
    }))
  );
}

export function validateRepositoryTransactionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return errorResult("invalid_type");
  }
  if (!Object.hasOwn(input, "idempotencyKey")) return errorResult("missing_field");
  if (typeof input.idempotencyKey !== "string") return errorResult("invalid_type");
  if (!input.idempotencyKey.trim()) return errorResult("missing_field");
  if (!Object.hasOwn(input, "ops")) return errorResult("missing_field");
  if (!Array.isArray(input.ops)) return errorResult("invalid_type");
  if (input.ops.length === 0) return errorResult("empty_ops");
  if (
    Object.hasOwn(input, "onCommitted") &&
    input.onCommitted !== undefined &&
    typeof input.onCommitted !== "function"
  ) {
    return errorResult("invalid_type");
  }

  for (const op of input.ops) {
    if (!op || typeof op !== "object" || Array.isArray(op)) {
      return errorResult("invalid_type");
    }
    if (!Object.hasOwn(op, "type") || !Object.hasOwn(op, "store")) {
      return errorResult("missing_field");
    }
    if (!["put", "delete"].includes(op.type) || typeof op.store !== "string") {
      return errorResult("invalid_type");
    }
    if (!op.store.trim()) return errorResult("missing_field");
    if (op.type === "put") {
      if (!Object.hasOwn(op, "record") || !Object.hasOwn(op.record || {}, "id")) {
        return errorResult("missing_field");
      }
      if (
        !op.record ||
        typeof op.record !== "object" ||
        Array.isArray(op.record) ||
        typeof op.record.id !== "string"
      ) {
        return errorResult("invalid_type");
      }
      if (!op.record.id.trim()) return errorResult("missing_field");
    } else {
      if (!Object.hasOwn(op, "id")) return errorResult("missing_field");
      if (typeof op.id !== "string") return errorResult("invalid_type");
      if (!op.id.trim()) return errorResult("missing_field");
    }
  }
  return null;
}

export function repositoryErrorCode(error) {
  if (ERROR_CODES.has(error?.code)) return error.code;
  if (error?.name === "QuotaExceededError") return "quota_exceeded";
  return "backend_failed";
}

/**
 * @param {RepoTransactionInput} input
 * @param {{ backend?: { runTransaction: Function } }} [options]
 */
export async function runRepositoryTransaction(input, { backend } = {}) {
  const invalid = validateRepositoryTransactionInput(input);
  if (invalid) return invalid;
  if (!backend || typeof backend.runTransaction !== "function") {
    return errorResult("backend_failed", "Repository backend is unavailable");
  }

  const idempotencyKey = input.idempotencyKey.trim();
  const fingerprint = fingerprintRepositoryOps(input.ops);
  const committed = input.ops.map((op) => ({
    store: op.store,
    id: op.type === "put" ? op.record.id : op.id,
  }));
  const txRecord = {
    id: `tx:${idempotencyKey}`,
    idempotencyKey,
    opsFingerprint: fingerprint,
    committedAt: new Date().toISOString(),
    recordIds: committed,
  };

  try {
    const result = await backend.runTransaction({
      idempotencyKey,
      fingerprint,
      ops: input.ops,
      committed,
      txRecord,
      onCommitted: input.onCommitted,
    });
    if (result?.conflict) return errorResult("conflict");
    if (!result?.ok) {
      return errorResult(
        repositoryErrorCode(result?.error),
        result?.error?.message || result?.message
      );
    }

    if (!result.publicationHandled && !result.duplicate && input.onCommitted) {
      try {
        await input.onCommitted();
      } catch (error) {
        console.warn("Repository commit publication failed after durable commit", error);
      }
    }
    return {
      ok: true,
      duplicate: Boolean(result.duplicate),
      committed: result.committed || committed,
    };
  } catch (error) {
    return errorResult(repositoryErrorCode(error), error?.message);
  }
}

function abortQuietly(transaction) {
  try {
    transaction.abort();
  } catch {
    // The transaction may already be inactive.
  }
}

export function createIndexedDbBackend(db) {
  return {
    runTransaction({ fingerprint, ops, committed, txRecord }) {
      return new Promise((resolve) => {
        const storeNames = [...new Set(["settings", ...ops.map((op) => op.store)])];
        let transaction;
        let outcome = null;
        try {
          transaction = db.transaction(storeNames, "readwrite");
          const lookup = transaction.objectStore("settings").get(txRecord.id);
          lookup.onsuccess = () => {
            const previous = lookup.result;
            if (previous) {
              outcome =
                previous.opsFingerprint === fingerprint
                  ? {
                      ok: true,
                      duplicate: true,
                      committed: previous.recordIds || committed,
                    }
                  : { ok: false, conflict: true };
              if (outcome.conflict) abortQuietly(transaction);
              return;
            }
            try {
              for (const op of ops) {
                const store = transaction.objectStore(op.store);
                if (op.type === "put") store.put(op.record);
                else store.delete(op.id);
              }
              transaction.objectStore("settings").put(txRecord);
              outcome = { ok: true, duplicate: false, committed };
            } catch (error) {
              outcome = { ok: false, error };
              abortQuietly(transaction);
            }
          };
          lookup.onerror = () => {
            outcome = { ok: false, error: lookup.error || transaction.error };
            abortQuietly(transaction);
          };
          transaction.oncomplete = () =>
            resolve(outcome || { ok: false, error: transaction.error });
          transaction.onabort = () =>
            resolve(
              outcome?.conflict
                ? outcome
                : { ok: false, error: outcome?.error || transaction.error }
            );
          transaction.onerror = () => {
            // onabort/oncomplete owns settlement.
          };
        } catch (error) {
          resolve({ ok: false, error });
        }
      });
    },
  };
}
