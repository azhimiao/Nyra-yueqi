/**
 * 栖店 orderId + C6 侧写投影（F3 §5.4）。
 */

/**
 * @returns {string} ord-{base36ts}-{8hex}
 */
export function generateOrderId() {
  const stamp = Date.now().toString(36);
  const hex = Math.random().toString(16).slice(2, 10).padEnd(8, "0").slice(0, 8);
  return `ord-${stamp}-${hex}`;
}

export function isValidOrderId(orderId) {
  return /^ord-[a-z0-9]+-[a-f0-9]{8}$/.test(String(orderId || ""));
}

/**
 * ShopOrder → F2b C6 sidewrite row (field-aligned).
 * @param {object} order
 */
export function shopOrderToSidewriteC6Row(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const first = items[0];
  let title = String(first?.title || order.note || "商品").trim() || "商品";
  if (items.length > 1) title = `${title}等 ${items.length} 件`;
  return {
    orderId: String(order.orderId || ""),
    amount: Math.round(Number(order.amount) * 100) / 100,
    currency: "nyra_coin",
    shopName: String(order.shopName || "栖店"),
    status: String(order.status || "paid"),
    title,
    placedAt: String(order.createdAt || order.placedAt || ""),
  };
}
