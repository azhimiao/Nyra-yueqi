/**
 * Gift compose sheet — pick an owned 礼物 from shop inventory and sendGift.
 * Shared by App chat and mini-phone Pop (+ panel).
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import { listInventory } from "../shop/inventory.js";
import { getShopProduct, localizeShopProduct } from "../shop/catalog.js";
import { isGiftProduct, sendGift } from "../shop/gift-delivery.js";
import { getActiveCharacterId } from "../characters/store.js";

/**
 * Owned gift-category products (qty ≥ 1).
 * @returns {object[]}
 */
export function listSendableGifts() {
  return listInventory()
    .map((row) => {
      const product = getShopProduct(row.productId);
      if (!product || !isGiftProduct(product)) return null;
      if ((row.qty || 0) < 1) return null;
      return {
        ...localizeShopProduct(product),
        qty: row.qty || 1,
        lastOrderId: row.lastOrderId || "",
      };
    })
    .filter(Boolean);
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   onToast?: (msg: string) => void,
 *   onSent?: (result: object) => void,
 *   getCharacterId?: () => string,
 *   openShopBag?: () => void,
 *   labels?: {
 *     empty?: string,
 *     emptyHint?: string,
 *     goShop?: string,
 *     send?: string,
 *     qty?: string,
 *   },
 * }} [deps]
 */
export function bindGiftComposeSheet(root, deps = {}) {
  if (!root) return { open() {}, close() {}, refresh() {} };

  const labels = {
    empty: t("phone.shop.emptyBag"),
    emptyHint: t("phone.pop.sendGiftEmptyHint"),
    goShop: t("phone.shop.browse"),
    send: t("phone.shop.sendToTa"),
    qty: "×{n}",
    ...(deps.labels || {}),
  };

  function sheet() {
    return root.querySelector("[data-gift-compose]");
  }

  function listHost() {
    return sheet()?.querySelector("[data-gift-compose-list]");
  }

  function close() {
    const node = sheet();
    if (node) node.hidden = true;
  }

  function renderList() {
    const host = listHost();
    if (!host) return;
    const gifts = listSendableGifts();
    if (!gifts.length) {
      host.innerHTML = `
        <div class="gift-compose-empty">
          <p>${escapeHtml(labels.empty)}</p>
          <p class="gift-compose-empty__hint">${escapeHtml(labels.emptyHint)}</p>
          ${typeof deps.openShopBag === "function"
            ? `<button type="button" class="gift-compose-empty__cta" data-gift-compose-shop>${escapeHtml(labels.goShop)}</button>`
            : ""}
        </div>
      `;
      refreshIcons();
      return;
    }
    host.innerHTML = gifts.map((gift) => `
      <button type="button" class="gift-compose-row" data-gift-compose-send="${escapeHtml(gift.productId)}">
        <span class="gift-compose-row__art" data-tone="${escapeHtml(gift.coverTone || "coral")}" aria-hidden="true">${escapeHtml(gift.coverEmoji || "🎁")}</span>
        <span class="gift-compose-row__meta">
          <strong>${escapeHtml(gift.title)}</strong>
          <em>${escapeHtml(String(labels.qty).replace("{n}", String(gift.qty || 1)))}</em>
        </span>
        <span class="gift-compose-row__action">${escapeHtml(labels.send)}</span>
      </button>
    `).join("");
    refreshIcons();
  }

  function open() {
    const node = sheet();
    if (!node) return;
    node.hidden = false;
    renderList();
  }

  async function handleSend(productId) {
    const characterId = String(
      deps.getCharacterId?.() || getActiveCharacterId() || "",
    ).trim();
    const result = await sendGift({ productId, characterId });
    if (!result.ok) {
      const errKey = {
        missing_characterId: "phone.shop.giftNoCharacter",
        insufficient_inventory: "phone.shop.giftNotOwned",
        not_gift_product: "phone.shop.giftNotGift",
        product_not_found: "phone.shop.productNotFound",
      }[result.error] || "phone.shop.giftFailed";
      deps.onToast?.(t(errKey));
      renderList();
      return result;
    }
    deps.onToast?.(t("phone.shop.giftSent"));
    close();
    deps.onSent?.(result);
    return result;
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-gift-compose-close]")) {
      close();
      return;
    }
    if (event.target.closest("[data-gift-compose-shop]")) {
      close();
      deps.openShopBag?.();
      return;
    }
    const sendId = event.target.closest("[data-gift-compose-send]")?.dataset.giftComposeSend;
    if (sendId) {
      event.preventDefault();
      void handleSend(sendId);
    }
  });

  return { open, close, refresh: renderList };
}
