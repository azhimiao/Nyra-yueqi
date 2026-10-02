/**
 * 栖店订单 — placeOrder 仅走 F1 ledger（reason: shop.purchase）。
 */

import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import {
  loadWallet,
  saveWallet,
  canAfford,
  applyDebit,
} from "../wallet/ledger.js";
import { appendCohabitEvent } from "../memory/cohabit-timeline.js";
import { getShopProduct } from "./catalog.js";
import { addToInventory } from "./inventory.js";
import { generateOrderId } from "./order-id.js";
import { normalizeShopOrder, validateShopOrder } from "./schema.js";

export const SHOP_ORDERS_KEY = LOCAL_KEYS.shopOrdersKey;

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function readOrdersBag() {
  const raw = readLocalObject(SHOP_ORDERS_KEY, null);
  if (Array.isArray(raw)) return raw.map((row) => normalizeShopOrder(row));
  if (raw && Array.isArray(raw.orders)) return raw.orders.map((row) => normalizeShopOrder(row));
  return [];
}

function writeOrders(orders) {
  writeLocalObject(SHOP_ORDERS_KEY, { orders, updatedAt: new Date().toISOString() });
  return orders;
}

export function listOrders() {
  return readOrdersBag().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function getOrder(orderId) {
  const id = String(orderId || "").trim();
  return listOrders().find((row) => row.orderId === id) || null;
}

export function clearOrdersFixture() {
  writeOrders([]);
}

/**
 * @param {{ productId: string, qty?: number, characterId?: string }} input
 * @returns {{ ok: boolean, error?: string, order?: object, balance?: number }}
 */
export function placeOrder(input = {}) {
  const product = getShopProduct(input.productId);
  if (!product) {
    return { ok: false, error: "product_not_found", balance: loadWallet().balance };
  }
  const qty = Math.max(1, Math.min(99, Math.floor(Number(input.qty) || 1)));
  const amount = roundMoney(product.price * qty);
  const wallet = loadWallet();
  if (!canAfford(amount, wallet)) {
    return { ok: false, error: "insufficient_balance", balance: wallet.balance };
  }

  const orderId = generateOrderId();
  const note = `栖店 · ${product.title}`.slice(0, 80);
  const debited = applyDebit(wallet, {
    amount,
    reason: "shop.purchase",
    note,
    refCharacterId: String(input.characterId || ""),
  });
  if (debited.error === "insufficient_balance") {
    return { ok: false, error: "insufficient_balance", balance: wallet.balance };
  }
  saveWallet(debited);
  const ledgerId = debited.ledger.at(-1)?.id || "";
  const now = new Date().toISOString();
  const order = normalizeShopOrder({
    orderId,
    amount,
    currency: "nyra_coin",
    shopName: "栖店",
    status: "paid",
    items: [{
      productId: product.productId,
      title: product.title,
      qty,
      unitPrice: product.price,
      coverTone: product.coverTone,
      coverEmoji: product.coverEmoji,
      category: product.category,
    }],
    createdAt: now,
    updatedAt: now,
    characterId: String(input.characterId || ""),
    ledgerId,
    note,
  });
  const checked = validateShopOrder(order);
  if (!checked.ok) {
    return { ok: false, error: checked.error || "invalid_order", balance: debited.balance };
  }

  const next = [order, ...readOrdersBag()];
  writeOrders(next);
  try {
    addToInventory({ productId: product.productId, qty, orderId });
  } catch {
    /* inventory best-effort */
  }

  try {
    appendCohabitEvent({
      appId: "shop",
      kind: "order",
      summary: `栖店下单：${product.title} · ${amount.toFixed(2)} 栖币 · ${orderId}`,
      characterId: order.characterId || "",
      meta: { orderId, ledgerId },
    });
  } catch {
    /* timeline optional */
  }

  return { ok: true, order, balance: debited.balance, ledgerId };
}

/**
 * Records a purchase already settled by the server. This function never
 * debits the legacy wallet, preventing double charging during migration.
 */
export function recordRemoteOrder(input = {}) {
  const remote = input.remoteOrder && typeof input.remoteOrder === "object" ? input.remoteOrder : {};
  const product = input.product || getShopProduct(remote.productId || input.productId);
  if (!product) return { ok: false, error: "product_not_found" };
  const transactionId = String(remote.transactionId || input.transactionId || "").trim();
  const existing = transactionId
    ? readOrdersBag().find((row) => row.ledgerId === transactionId)
    : null;
  if (existing) return { ok: true, duplicate: true, order: existing };
  const qty = Math.max(1, Math.min(99, Math.floor(Number(input.qty) || 1)));
  const amount = roundMoney(Number(remote.amount) || product.price * qty);
  const now = String(remote.createdAt || new Date().toISOString());
  const order = normalizeShopOrder({
    orderId: generateOrderId(),
    amount,
    currency: "nyra_coin",
    shopName: "栖店",
    status: "paid",
    items: [{
      productId: product.productId,
      title: product.title,
      qty,
      unitPrice: product.price,
      coverTone: product.coverTone,
      coverEmoji: product.coverEmoji,
      category: product.category,
    }],
    createdAt: now,
    updatedAt: now,
    characterId: String(input.characterId || ""),
    ledgerId: transactionId,
    note: `栖店 · ${product.title}`,
  });
  writeOrders([order, ...readOrdersBag()]);
  try { addToInventory({ productId: product.productId, qty, orderId: order.orderId }); } catch { /* optional */ }
  try {
    appendCohabitEvent({
      appId: "shop",
      kind: "order",
      summary: `栖店下单：${product.title} · ${amount} 栖币`,
      characterId: order.characterId,
      meta: { orderId: order.orderId, transactionId, remoteOrderId: remote.orderId || "" },
    });
  } catch { /* timeline optional */ }
  return { ok: true, duplicate: false, order, ledgerId: transactionId };
}

export function exportShopOrders() {
  return { orders: listOrders() };
}

export function importShopOrders(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.orders) ? payload.orders : []);
  writeOrders(rows.map((row) => normalizeShopOrder(row)).filter((row) => row.orderId));
  return exportShopOrders();
}
