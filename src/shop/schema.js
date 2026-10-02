/**
 * 栖店 / 商城 schema — normalize + validate (no throw on bad input).
 */

const STATUSES = new Set(["paid", "pending", "shipped", "done"]);

/** Virtual mall categories (淘宝感分区，全是虚拟货). */
export const SHOP_CATEGORY_SET = new Set(["皮肤", "表情", "场景", "道具", "礼物", "限定", "日常"]);

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeCategory(raw) {
  const cat = String(raw || "").trim();
  if (SHOP_CATEGORY_SET.has(cat)) return cat;
  // Legacy seed used 日常 for everyday goods
  if (cat === "daily") return "日常";
  return "道具";
}

export function normalizeProduct(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const category = normalizeCategory(src.category);
  return {
    productId: String(src.productId || src.id || "").trim(),
    title: String(src.title || "未命名商品").trim().slice(0, 40) || "未命名商品",
    subtitle: String(src.subtitle || "").trim().slice(0, 48),
    price: Math.max(0, roundMoney(src.price)),
    category,
    coverTone: String(src.coverTone || "coral").trim() || "coral",
    coverEmoji: String(src.coverEmoji || "🎁").trim().slice(0, 4) || "🎁",
    blurb: String(src.blurb || "").trim().slice(0, 200),
    tag: String(src.tag || "").trim().slice(0, 12),
    salesHint: Math.max(0, Math.floor(Number(src.salesHint) || 0)),
    virtual: src.virtual !== false,
  };
}

export function normalizeShopOrderItem(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    productId: String(src.productId || "").trim(),
    title: String(src.title || "商品").trim().slice(0, 40) || "商品",
    qty: Math.max(1, Math.min(99, Math.floor(Number(src.qty) || 1))),
    unitPrice: Math.max(0, roundMoney(src.unitPrice ?? src.price)),
    coverTone: String(src.coverTone || "coral"),
    coverEmoji: String(src.coverEmoji || "🎁").slice(0, 4),
    category: normalizeCategory(src.category),
  };
}

export function normalizeShopOrder(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(src.items) ? src.items.map(normalizeShopOrderItem) : [];
  const status = STATUSES.has(src.status) ? src.status : "paid";
  const createdAt = String(src.createdAt || new Date().toISOString());
  return {
    orderId: String(src.orderId || "").trim(),
    amount: Math.max(0, roundMoney(src.amount)),
    currency: "nyra_coin",
    shopName: String(src.shopName || "栖店").trim().slice(0, 20) || "栖店",
    status,
    items,
    createdAt,
    updatedAt: String(src.updatedAt || createdAt),
    characterId: String(src.characterId || "").trim(),
    ledgerId: String(src.ledgerId || "").trim(),
    note: String(src.note || "").trim().slice(0, 80),
  };
}

/**
 * @returns {{ ok: boolean, error?: string, order?: object }}
 */
export function validateShopOrder(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_order" };
  }
  const order = normalizeShopOrder(raw);
  if (!order.orderId) {
    return { ok: false, error: "missing_orderId" };
  }
  if (!/^ord-[a-z0-9]+-[a-f0-9]{8}$/.test(order.orderId)) {
    return { ok: false, error: "bad_orderId" };
  }
  if (!(order.amount > 0)) {
    return { ok: false, error: "bad_amount" };
  }
  if (order.currency !== "nyra_coin") {
    return { ok: false, error: "bad_currency" };
  }
  if (!order.items.length) {
    return { ok: false, error: "empty_items" };
  }
  return { ok: true, order };
}
