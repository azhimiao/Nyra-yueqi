/**
 * 虚拟商品收藏柜 — 购买成功后入库，无物流。
 */

import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { getShopProduct } from "./catalog.js";

export const SHOP_INVENTORY_KEY = LOCAL_KEYS.shopInventoryKey;

function readBag() {
  const raw = readLocalObject(SHOP_INVENTORY_KEY, null);
  if (raw && Array.isArray(raw.items)) return raw;
  return { items: [], updatedAt: "" };
}

function writeBag(bag) {
  const next = {
    items: Array.isArray(bag.items) ? bag.items : [],
    updatedAt: new Date().toISOString(),
  };
  writeLocalObject(SHOP_INVENTORY_KEY, next);
  return next;
}

export function listInventory() {
  return readBag().items.slice().sort((a, b) => String(b.acquiredAt).localeCompare(String(a.acquiredAt)));
}

export function getInventoryItem(productId) {
  const id = String(productId || "").trim();
  return listInventory().find((row) => row.productId === id) || null;
}

/**
 * Merge purchase into bag (qty stacks).
 * @param {{ productId: string, qty?: number, orderId?: string }} input
 */
export function addToInventory(input = {}) {
  const product = getShopProduct(input.productId);
  if (!product) return { ok: false, error: "product_not_found" };
  const qty = Math.max(1, Math.min(99, Math.floor(Number(input.qty) || 1)));
  const bag = readBag();
  const existing = bag.items.find((row) => row.productId === product.productId);
  const now = new Date().toISOString();
  if (existing) {
    existing.qty = Math.min(99, (existing.qty || 1) + qty);
    existing.updatedAt = now;
    if (input.orderId) existing.lastOrderId = String(input.orderId);
  } else {
    bag.items.push({
      productId: product.productId,
      title: product.title,
      category: product.category,
      coverTone: product.coverTone,
      coverEmoji: product.coverEmoji,
      qty,
      acquiredAt: now,
      updatedAt: now,
      lastOrderId: String(input.orderId || ""),
    });
  }
  writeBag(bag);
  return { ok: true, item: getInventoryItem(product.productId) };
}

/**
 * Consume qty from bag (e.g. gift send). Removes row when qty reaches 0.
 * @param {string} productId
 * @param {number} [qty]
 */
export function consumeFromInventory(productId, qty = 1) {
  const product = getShopProduct(productId);
  if (!product) return { ok: false, error: "product_not_found" };
  const need = Math.max(1, Math.min(99, Math.floor(Number(qty) || 1)));
  const bag = readBag();
  const idx = bag.items.findIndex((row) => row.productId === product.productId);
  if (idx < 0) return { ok: false, error: "not_in_inventory" };
  const row = bag.items[idx];
  const have = Math.max(0, Math.floor(Number(row.qty) || 0));
  if (have < need) return { ok: false, error: "insufficient_qty" };
  row.qty = have - need;
  row.updatedAt = new Date().toISOString();
  if (row.qty <= 0) bag.items.splice(idx, 1);
  writeBag(bag);
  return {
    ok: true,
    productId: product.productId,
    remainingQty: row.qty > 0 ? row.qty : 0,
  };
}

export function clearInventoryFixture() {
  writeBag({ items: [] });
}

export function exportShopInventory() {
  return readBag();
}

export function importShopInventory(payload) {
  const items = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.items) ? payload.items : []);
  writeBag({ items });
  return exportShopInventory();
}
