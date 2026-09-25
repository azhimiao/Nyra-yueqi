/**
 * 栖币钱包 — append-only ledger (I3 / B7).
 * Storage key: yueqi.wallet.v1
 */

import { LOCAL_KEYS } from "../constants.js";

export const WALLET_KEY = LOCAL_KEYS.walletKey;
export const WALLET_STORAGE_KEY = WALLET_KEY;
export const LEDGER_MAX = 500;
export const INITIAL_BALANCE = 200;

function nowIso() {
  return new Date().toISOString();
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function createInitialWallet() {
  const balance = INITIAL_BALANCE;
  const createdAt = nowIso();
  return {
    balance,
    currency: "nyra_coin",
    updatedAt: createdAt,
    ledger: [{
      id: `ldg-${Date.now()}-grant`,
      type: "credit",
      amount: balance,
      balanceAfter: balance,
      reason: "system.grant",
      note: "系统赠送",
      createdAt,
    }],
  };
}

function normalizeLedgerEntry(entry = {}, index = 0) {
  const amount = roundMoney(Math.abs(Number(entry.amount) || 0));
  return {
    id: String(entry.id || `ldg-${Date.now()}-${index}`),
    type: entry.type === "debit" ? "debit" : "credit",
    amount,
    balanceAfter: roundMoney(Number(entry.balanceAfter ?? entry.balance ?? 0) || 0),
    reason: String(entry.reason || "unknown").slice(0, 80),
    refMessageId: String(entry.refMessageId || entry.messageId || "").slice(0, 80),
    refCharacterId: String(entry.refCharacterId || "").slice(0, 80),
    note: String(entry.note || entry.summary || "").slice(0, 80),
    createdAt: String(entry.createdAt || entry.at || nowIso()),
  };
}

export function normalizeWallet(raw) {
  if (!raw || typeof raw !== "object") return createInitialWallet();
  const ledger = Array.isArray(raw.ledger)
    ? raw.ledger.map(normalizeLedgerEntry).slice(-LEDGER_MAX)
    : [];
  const balance = roundMoney(Number(raw.balance));
  return {
    balance: Number.isFinite(balance) && balance >= 0 ? balance : INITIAL_BALANCE,
    currency: "nyra_coin",
    authority: raw.authority === "server_projection" ? "server_projection" : "local_legacy",
    serverWalletId: String(raw.serverWalletId || ""),
    updatedAt: String(raw.updatedAt || nowIso()),
    ledger: ledger.length ? ledger : createInitialWallet().ledger,
  };
}

function readStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(WALLET_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStorage(state) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(WALLET_KEY, JSON.stringify(state));
    document?.dispatchEvent?.(new CustomEvent("yueqi:wallet-changed", { detail: { wallet: state } }));
  } catch {
    /* ignore quota */
  }
}

export function loadWallet() {
  const stored = readStorage();
  if (stored) return normalizeWallet(stored);
  const initial = createInitialWallet();
  writeStorage(initial);
  return initial;
}

export const getWallet = loadWallet;

export function saveWallet(state) {
  const normalized = normalizeWallet(state);
  normalized.updatedAt = nowIso();
  writeStorage(normalized);
  return normalized;
}

/**
 * Mirrors the authoritative server balance for legacy UI surfaces. It never
 * performs settlement; the server transaction has already done that.
 */
export function syncWalletProjection(serverWallet = {}) {
  const balance = roundMoney(Number(serverWallet.balance));
  if (!Number.isFinite(balance) || balance < 0) return loadWallet();
  const current = loadWallet();
  const delta = roundMoney(balance - current.balance);
  const createdAt = String(serverWallet.updatedAt || nowIso());
  const ledger = delta === 0 ? current.ledger : [
    ...current.ledger,
    normalizeLedgerEntry({
      id: `ldg-${Date.now()}-server-sync`,
      type: delta < 0 ? "debit" : "credit",
      amount: Math.abs(delta),
      balanceAfter: balance,
      reason: "server.projection",
      note: "服务器账本同步",
      createdAt,
    }),
  ].slice(-LEDGER_MAX);
  return saveWallet({
    ...current,
    balance,
    ledger,
    authority: "server_projection",
    serverWalletId: String(serverWallet.walletId || ""),
    updatedAt: createdAt,
  });
}

export function canAfford(amount, wallet = loadWallet()) {
  const need = roundMoney(amount);
  if (!Number.isFinite(need) || need <= 0) return true;
  return roundMoney(wallet.balance) >= need;
}

export function applyDebit(wallet, { amount, reason = "token.transfer", note = "", refMessageId = "", refCharacterId = "" } = {}) {
  const next = normalizeWallet(wallet);
  const debitAmount = roundMoney(Math.abs(Number(amount) || 0));
  if (debitAmount <= 0) return next;
  if (next.balance < debitAmount) {
    return { ...next, ok: false, error: "insufficient_balance" };
  }
  next.balance = roundMoney(next.balance - debitAmount);
  next.ledger = [
    ...next.ledger,
    normalizeLedgerEntry({
      type: "debit",
      amount: debitAmount,
      balanceAfter: next.balance,
      reason,
      note,
      refMessageId,
      refCharacterId,
    }),
  ].slice(-LEDGER_MAX);
  next.updatedAt = nowIso();
  return next;
}

export function applyCredit(wallet, { amount, reason = "token.transfer", note = "", refMessageId = "", refCharacterId = "" } = {}) {
  const next = normalizeWallet(wallet);
  const creditAmount = roundMoney(Math.abs(Number(amount) || 0));
  if (creditAmount <= 0) return next;
  next.balance = roundMoney(next.balance + creditAmount);
  next.ledger = [
    ...next.ledger,
    normalizeLedgerEntry({
      type: "credit",
      amount: creditAmount,
      balanceAfter: next.balance,
      reason,
      note,
      refMessageId,
      refCharacterId,
    }),
  ].slice(-LEDGER_MAX);
  next.updatedAt = nowIso();
  return next;
}

export function resetWalletFixture(overrides = {}) {
  const base = createInitialWallet();
  return normalizeWallet({ ...base, ...overrides, ledger: overrides.ledger || base.ledger });
}

const settledMessageIds = new Set();

export function applyTokenSettlement(tokenPayload, messageId, opts = {}) {
  const token = tokenPayload && typeof tokenPayload === "object" ? tokenPayload : {};
  const msgId = String(messageId || "").trim();
  const kind = String(token.kind || "").trim();
  const amount = roundMoney(Number(token.amount) || 0);
  const persist = opts.persist !== false;

  if (!msgId || !kind || amount <= 0 || amount > 999999.99) {
    return { ok: false, error: "invalid_token", balance: loadWallet().balance };
  }

  if (settledMessageIds.has(msgId)) {
    const wallet = loadWallet();
    const existing = wallet.ledger.find((row) => row.refMessageId === msgId || row.messageId === msgId);
    return { ok: true, duplicate: true, ledgerId: existing?.id || "", balance: wallet.balance };
  }

  let wallet = loadWallet();
  const note = String(token.note || token.blessing || "").slice(0, 80);
  const refCharacterId = String(token.counterpartyId || "").trim();
  let updated = wallet;

  if (kind === "redpacket" || (kind === "transfer" && token.direction !== "out")) {
    updated = applyCredit(wallet, {
      amount,
      reason: kind === "redpacket" ? "token.redpacket" : "token.transfer",
      note,
      refMessageId: msgId,
      refCharacterId,
    });
  } else if (kind === "transfer" && token.direction === "out") {
    if (!canAfford(amount, wallet)) {
      return { ok: false, error: "insufficient_balance", balance: wallet.balance };
    }
    updated = applyDebit(wallet, {
      amount,
      reason: "token.transfer",
      note,
      refMessageId: msgId,
      refCharacterId,
    });
  } else if (kind === "collect") {
    if (!canAfford(amount, wallet)) {
      return { ok: false, error: "insufficient_balance", balance: wallet.balance };
    }
    updated = applyDebit(wallet, {
      amount,
      reason: "token.collect",
      note,
      refMessageId: msgId,
      refCharacterId,
    });
  } else {
    return { ok: false, error: "unsupported_kind", balance: wallet.balance };
  }

  if (updated.error) {
    return { ok: false, error: updated.error, balance: wallet.balance };
  }

  settledMessageIds.add(msgId);
  const ledgerRow = updated.ledger.at(-1);
  if (persist) saveWallet(updated);

  return {
    ok: true,
    duplicate: false,
    ledgerId: ledgerRow?.id || "",
    balance: updated.balance,
  };
}

/** @deprecated use applyTokenSettlement */
export function debit(reason, amount) {
  const result = applyDebit(loadWallet(), { amount, reason, note: reason });
  if (result.error) return { ok: false, error: result.error, balance: loadWallet().balance };
  saveWallet(result);
  return { ok: true, ledgerId: result.ledger.at(-1)?.id || "", balance: result.balance };
}

export function formatLedgerRow(entry = {}) {
  const sign = entry.type === "debit" ? "−" : "+";
  return `${sign}${roundMoney(entry.amount).toFixed(2)} 栖币 · ${entry.note || entry.reason || ""}`;
}

export function exportWallet() {
  return loadWallet();
}

export function importWallet(payload) {
  saveWallet(normalizeWallet(payload));
  return loadWallet();
}

export function clearSettlementCache() {
  settledMessageIds.clear();
}
