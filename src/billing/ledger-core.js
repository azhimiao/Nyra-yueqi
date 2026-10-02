/**
 * Server Billing Core contracts (R8/B1) — NyraCoin stays local; BillingCredit is server-authoritative.
 * This module is the in-repo contract + in-memory reference ledger for tests.
 * Production must use transactional DB; never reuse src/wallet/ledger.js.
 */
export const BILLING_CREDIT_SCHEMA_VERSION = 1;

export function createCreditAccount(input = {}) {
  return {
    schemaVersion: BILLING_CREDIT_SCHEMA_VERSION,
    userId: String(input.userId || ""),
    balance: Math.max(0, Number(input.balance) || 0),
    currency: "billing_credit",
    updatedAt: new Date().toISOString(),
  };
}

export function createLedgerEntry(input = {}) {
  return {
    schemaVersion: BILLING_CREDIT_SCHEMA_VERSION,
    entryId: String(input.entryId || `ble_${Date.now().toString(36)}`),
    userId: String(input.userId || ""),
    kind: String(input.kind || "adjust"), // purchase | redeem | reserve | settle | release | adjust
    amount: Number(input.amount) || 0,
    idempotencyKey: String(input.idempotencyKey || ""),
    reservationId: String(input.reservationId || ""),
    meta: input.meta && typeof input.meta === "object" ? input.meta : {},
    createdAt: new Date().toISOString(),
  };
}

/** In-memory reference implementation for concurrent redeem tests. */
export function createInMemoryBillingLedger() {
  /** @type {Map<string, { balance: number, entries: object[], reservations: Map<string, number>, usedCodes: Set<string> }>} */
  const accounts = new Map();

  function acct(userId) {
    if (!accounts.has(userId)) {
      accounts.set(userId, { balance: 0, entries: [], reservations: new Map(), usedCodes: new Set() });
    }
    return accounts.get(userId);
  }

  return {
    redeemCode({ userId, code, credits }) {
      const a = acct(userId);
      const key = String(code || "").trim();
      if (!key) return { ok: false, reason: "missing_code" };
      if (a.usedCodes.has(key)) return { ok: false, reason: "code_already_used" };
      a.usedCodes.add(key);
      const amount = Math.max(0, Number(credits) || 0);
      a.balance += amount;
      const entry = createLedgerEntry({ userId, kind: "redeem", amount, idempotencyKey: `redeem:${key}` });
      a.entries.push(entry);
      return { ok: true, balance: a.balance, entry };
    },
    reserve({ userId, amount, reservationId, idempotencyKey }) {
      const a = acct(userId);
      const need = Math.max(0, Number(amount) || 0);
      if (a.entries.some((e) => e.idempotencyKey === idempotencyKey)) {
        return { ok: true, deduped: true, balance: a.balance };
      }
      if (a.balance < need) return { ok: false, reason: "insufficient" };
      a.balance -= need;
      a.reservations.set(reservationId, need);
      a.entries.push(createLedgerEntry({
        userId, kind: "reserve", amount: -need, reservationId, idempotencyKey,
      }));
      return { ok: true, balance: a.balance };
    },
    settle({ userId, reservationId, actual, idempotencyKey }) {
      const a = acct(userId);
      if (a.entries.some((e) => e.idempotencyKey === idempotencyKey)) {
        return { ok: true, deduped: true, balance: a.balance };
      }
      // Reserve already debited `reserved`. Settle only refunds unused (net entry = +refund).
      const reserved = a.reservations.get(reservationId) || 0;
      const used = Math.max(0, Math.min(reserved, Number(actual) || 0));
      const refund = reserved - used;
      if (refund > 0) a.balance += refund;
      a.reservations.delete(reservationId);
      a.entries.push(createLedgerEntry({
        userId,
        kind: "settle",
        amount: refund,
        reservationId,
        idempotencyKey,
        meta: { reserved, used },
      }));
      return { ok: true, balance: a.balance, used, refund };
    },
    recompute(userId) {
      const a = acct(userId);
      return a.entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    },
    getBalance(userId) {
      return acct(userId).balance;
    },
  };
}

export const NYRA_COIN_ISOLATION_RULE = Object.freeze({
  localWalletModule: "src/wallet/ledger.js",
  billingModule: "src/billing/ledger-core.js",
  mayExchange: false,
  mayShareTable: false,
});
