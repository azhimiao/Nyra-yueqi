/**
 * Shop wishlist — heart “收藏” before purchase (separate from owned inventory bag).
 */

import { LOCAL_KEYS } from "../constants.js";
import { readLocalObject, writeLocalObject } from "../lib/utils.js";
import { getShopProduct } from "./catalog.js";

export const SHOP_WISHLIST_KEY = LOCAL_KEYS.shopWishlistKey;

function readWishlist() {
  const raw = readLocalObject(SHOP_WISHLIST_KEY, null);
  if (raw && Array.isArray(raw.productIds)) {
    return {
      productIds: raw.productIds.map((id) => String(id || "").trim()).filter(Boolean),
      updatedAt: String(raw.updatedAt || ""),
    };
  }
  return { productIds: [], updatedAt: "" };
}

function writeWishlist(state) {
  const ids = [];
  const seen = new Set();
  for (const raw of Array.isArray(state?.productIds) ? state.productIds : []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  const next = {
    productIds: ids,
    updatedAt: new Date().toISOString(),
  };
  writeLocalObject(SHOP_WISHLIST_KEY, next);
  return next;
}

export function listWishlistIds() {
  return readWishlist().productIds.slice();
}

export function isWishlisted(productId) {
  const id = String(productId || "").trim();
  if (!id) return false;
  return listWishlistIds().includes(id);
}

export function listWishlistProducts() {
  return listWishlistIds()
    .map((id) => getShopProduct(id))
    .filter(Boolean);
}

/**
 * @param {string} productId
 * @returns {{ ok: boolean, wishlisted: boolean, error?: string }}
 */
export function toggleWishlist(productId) {
  const product = getShopProduct(productId);
  if (!product) return { ok: false, wishlisted: false, error: "product_not_found" };
  const state = readWishlist();
  const idx = state.productIds.indexOf(product.productId);
  if (idx >= 0) {
    state.productIds.splice(idx, 1);
    writeWishlist(state);
    return { ok: true, wishlisted: false };
  }
  state.productIds.unshift(product.productId);
  writeWishlist(state);
  return { ok: true, wishlisted: true };
}

export function removeFromWishlist(productId) {
  const id = String(productId || "").trim();
  if (!id) return { ok: false, error: "missing_productId" };
  const state = readWishlist();
  const next = state.productIds.filter((row) => row !== id);
  if (next.length === state.productIds.length) return { ok: true, removed: false };
  writeWishlist({ productIds: next });
  return { ok: true, removed: true };
}

export function exportShopWishlist() {
  return readWishlist();
}

export function importShopWishlist(payload) {
  const productIds = Array.isArray(payload)
    ? payload
    : (payload && Array.isArray(payload.productIds) ? payload.productIds : []);
  writeWishlist({ productIds });
  return exportShopWishlist();
}
