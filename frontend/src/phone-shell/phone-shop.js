/**
 * Phone shop UI — virtual catalog, Qiji coins, no shipping.
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { loadWallet, canAfford, syncWalletProjection } from "../wallet/ledger.js";
import { listShopCatalog, getShopProduct, localizeShopProduct, SHOP_CATEGORIES } from "../shop/catalog.js";
import { listOrders, getOrder, recordRemoteOrder } from "../shop/orders.js";
import { listInventory } from "../shop/inventory.js";
import {
  isWishlisted,
  listWishlistProducts,
  removeFromWishlist,
  toggleWishlist,
} from "../shop/wishlist.js";
import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import {
  bootstrapEconomy,
  createEconomyIntent,
  createEconomyListing,
  fetchEconomyOverview,
  fetchGenerativeObject,
  fulfillProduction,
  listEconomyMarketplace,
  listProductionRecipes,
  purchaseOfficialProduct,
} from "../economy/client.js";
import { isGiftProduct, sendGift } from "../shop/gift-delivery.js";
import { pt } from "./i18n.js";

const ALL_CATEGORY = "全部";

const SHOP_CAT_KEYS = Object.freeze({
  全部: "shop.all",
  皮肤: "shop.catSkin",
  表情: "shop.catEmoji",
  场景: "shop.catScene",
  道具: "shop.catProp",
  礼物: "shop.catGift",
  限定: "shop.catLimited",
});

function shopCatLabel(cat) {
  const key = SHOP_CAT_KEYS[cat];
  return key ? pt(key) : cat;
}

function statusLabel(status) {
  const map = {
    paid: pt("shop.statusPaid"),
    pending: pt("shop.statusPending"),
    shipped: pt("shop.statusShipped"),
    done: pt("shop.statusDone"),
  };
  return map[status] || status;
}

function formatCoin(amount) {
  return pt("shop.coinAmount", { amount: Number(amount || 0).toFixed(0) });
}

function displayProduct(item) {
  if (!item?.productId) return item;
  const product = getShopProduct(item.productId);
  return product ? localizeShopProduct(product) : item;
}

function productTitle(item) {
  return displayProduct(item)?.title || item?.title || pt("shop.product");
}

function canSendGift(product) {
  return isGiftProduct(product);
}

function giftSendLabel() {
  return pt("shop.sendToTa");
}

function wishHeartHtml(productId, wishlisted) {
  const id = String(productId || "").trim();
  const on = Boolean(wishlisted);
  return `
    <button type="button"
      class="mini-shop-wish${on ? " is-on" : ""}"
      data-shop-wish="${escapeHtml(id)}"
      aria-pressed="${on ? "true" : "false"}"
      aria-label="${escapeHtml(on ? pt("shop.unwish") : pt("shop.wish"))}"
      title="${escapeHtml(on ? pt("shop.unwish") : pt("shop.wish"))}">
      <i data-lucide="heart"></i>
    </button>
  `;
}

function formatSales(n) {
  const v = Number(n) || 0;
  if (v >= 1000) return pt("shop.salesCountK", { n: (v / 1000).toFixed(1) });
  if (v > 0) return pt("shop.salesCount", { n: v });
  return pt("shop.salesNew");
}

function economyCoin(value) {
  return pt("shop.coinAmount", { amount: Math.max(0, Number(value) || 0).toFixed(0) });
}

function economyRequestKey(prefix) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

/**
 * @param {HTMLElement} root `[data-phone-screen="shop"]`
 */
export function mountPhoneShop(root, deps = {}) {
  if (!root) return { open() {}, destroy() {}, handleBack() { return false; } };

  const { onToast = null, onGiftSent = null } = deps;

  let category = ALL_CATEGORY;
  let query = "";
  let pendingProductId = "";
  let detailOrderId = "";
  let productViewId = "";
  let economyLoading = false;
  let economyState = {
    overview: null,
    marketplace: [],
    recipes: [],
    assets: [],
    userActorId: "",
    companionActorId: "",
    companionName: "TA",
  };
  /** @type {string} */
  let currentPane = "shop-catalog";
  /** Pane history for nested shop views — consumed only via handleBack()/goBack(). */
  let paneStack = [];

  function paneChrome(paneId) {
    if (paneId === "shop-bag") {
      return {
        title: pt("shop.bag"),
        sub: pt("jobs.shop"),
        aria: pt("shop.backToCatalog"),
      };
    }
    if (paneId === "shop-orders") {
      return {
        title: pt("shop.orders"),
        sub: pt("jobs.shop"),
        aria: pt("shop.backToCatalog"),
      };
    }
    if (paneId === "shop-product") {
      const product = productViewId ? localizeShopProduct(getShopProduct(productViewId)) : null;
      return {
        title: product?.title || pt("shop.productDetail"),
        sub: pt("apps.shop"),
        aria: currentReturnAria("shop-product"),
      };
    }
    if (paneId === "shop-detail") {
      return {
        title: pt("shop.orderDetail"),
        sub: pt("shop.orders"),
        aria: currentReturnAria("shop-detail"),
      };
    }
    if (paneId === "shop-studio") {
      return { title: pt("shop.creationStudio"), sub: pt("shop.creationStudioSub"), aria: pt("shop.backToShop") };
    }
    if (paneId === "shop-assets") {
      return { title: pt("shop.myWorks"), sub: pt("shop.myWorksLead"), aria: pt("shop.backToShop") };
    }
    return {
      title: pt("apps.shop"),
      sub: pt("jobs.shop"),
      aria: pt("screens.back"),
    };
  }

  function currentReturnAria(paneId) {
    const prev = paneStack[paneStack.length - 1]
      || (paneId === "shop-detail" ? "shop-orders" : "shop-catalog");
    if (prev === "shop-orders") return pt("shop.backToOrders");
    if (prev === "shop-bag") return pt("shop.backToBag");
    if (prev === "shop-product") return pt("shop.productDetail");
    return pt("shop.backToCatalog");
  }

  function syncChrome(paneId = currentPane) {
    const chrome = paneChrome(paneId);
    const titleEl = root.querySelector("[data-shop-appbar-title]");
    const subEl = root.querySelector("[data-shop-appbar-sub]");
    const [backBtn, ...duplicateBackButtons] = root.querySelectorAll("[data-phone-back]");
    // Shop owns one navigation affordance; nested panes reuse its label/state.
    duplicateBackButtons.forEach((button) => button.remove());
    if (titleEl) titleEl.textContent = chrome.title;
    if (subEl) subEl.textContent = chrome.sub;
    if (backBtn) backBtn.setAttribute("aria-label", chrome.aria);
  }

  function refreshPaneContent(id) {
    if (id === "shop-bag") renderBag();
    if (id === "shop-orders") renderOrders();
    if (id === "shop-catalog") {
      renderCategories();
      renderCatalog();
    }
    if (id === "shop-product" && productViewId) renderProduct(productViewId);
    if (id === "shop-detail" && detailOrderId) renderDetail(detailOrderId);
    if (id === "shop-studio") renderEconomyStudio();
    if (id === "shop-assets") renderEconomyAssets();
  }

  /**
   * @param {string} id
   * @param {{ push?: boolean, resetStack?: boolean }} [opts]
   */
  function showPane(id, opts = {}) {
    const { push = false, resetStack = false } = opts;
    if (resetStack) paneStack = [];
    if (push && currentPane && currentPane !== id) {
      if (paneStack[paneStack.length - 1] !== currentPane) {
        paneStack.push(currentPane);
        if (paneStack.length > 16) paneStack.shift();
      }
    }
    currentPane = id;
    root.querySelectorAll("[data-phone-pane-view]").forEach((pane) => {
      pane.hidden = pane.dataset.phonePaneView !== id;
    });
    root.querySelectorAll("[data-shop-tab]").forEach((btn) => {
      const tab = btn.dataset.shopTab;
      const active = (id === "shop-catalog" && tab === "catalog")
        || (id === "shop-bag" && tab === "bag")
        || ((id === "shop-orders" || id === "shop-detail") && tab === "orders")
        || (id === "shop-product" && (
          (tab === "bag" && productReturnIsBag())
          || (tab === "catalog" && !productReturnIsBag())
        ));
      btn.classList.toggle("is-active", active);
    });
    syncChrome(id);
  }

  function productReturnIsBag() {
    return paneStack[paneStack.length - 1] === "shop-bag";
  }

  /** @returns {boolean} true if a nested shop pane was popped */
  function handleBack() {
    if (paneStack.length) {
      const prev = paneStack.pop();
      showPane(prev);
      refreshPaneContent(prev);
      refreshIcons();
      return true;
    }
    if (currentPane !== "shop-catalog") {
      showPane("shop-catalog", { resetStack: true });
      refreshPaneContent("shop-catalog");
      refreshIcons();
      return true;
    }
    return false;
  }

  function renderBalance() {
    const wallet = loadWallet();
    const serverBalance = economyWallet(economyState.userActorId)?.balance;
    const balance = Number.isFinite(Number(serverBalance))
      ? Number(serverBalance)
      : wallet.balance;
    root.querySelectorAll("[data-shop-balance]").forEach((node) => {
      node.textContent = formatCoin(balance);
    });
  }

  function renderCategories() {
    const host = root.querySelector("[data-shop-cats]");
    if (!host) return;
    const cats = [ALL_CATEGORY, ...SHOP_CATEGORIES];
    host.innerHTML = cats.map((cat) => `
      <button type="button" class="mini-shop-cat${cat === category ? " is-active" : ""}" data-shop-cat="${escapeHtml(cat)}">${escapeHtml(shopCatLabel(cat))}</button>
    `).join("");
  }

  function renderCatalog() {
    const feed = root.querySelector("[data-shop-grid]");
    if (!feed) return;
    const products = listShopCatalog({
      category: category === ALL_CATEGORY ? "" : category,
      query,
    });
    if (!products.length) {
      feed.innerHTML = `<p class="mini-empty">${escapeHtml(pt("shop.emptyCatalog"))}</p>`;
      return;
    }
    feed.innerHTML = products.map((product) => {
      const row = localizeShopProduct(product);
      const wished = isWishlisted(row.productId);
      return `
      <article class="mini-shop-card" data-shop-open-product="${escapeHtml(row.productId)}">
        <div class="mini-shop-card__cover" data-tone="${escapeHtml(row.coverTone)}">
          <span aria-hidden="true">${escapeHtml(row.coverEmoji || "🎁")}</span>
          ${row.tag ? `<em class="mini-shop-card__tag">${escapeHtml(row.tag)}</em>` : ""}
          ${wishHeartHtml(row.productId, wished)}
        </div>
        <div class="mini-shop-card__body">
          <strong>${escapeHtml(row.title)}</strong>
          <em>${escapeHtml(row.subtitle || shopCatLabel(row.category))}</em>
          <div class="mini-shop-card__row">
            <span class="mini-shop-price">${escapeHtml(formatCoin(row.price))}</span>
            <button type="button" class="mini-shop-buy" data-shop-buy="${escapeHtml(row.productId)}">${escapeHtml(pt("shop.buy"))}</button>
          </div>
          <span class="mini-shop-card__sales">${escapeHtml(formatSales(row.salesHint))}</span>
        </div>
      </article>
    `;
    }).join("");
  }

  function renderProduct(productId) {
    const host = root.querySelector("[data-shop-product]");
    if (!host) return;
    const product = localizeShopProduct(getShopProduct(productId));
    if (!product) {
      host.innerHTML = `<p class="mini-empty">${escapeHtml(pt("shop.productNotFound"))}</p>`;
      return;
    }
    productViewId = product.productId;
    const owned = listInventory().find((row) => row.productId === product.productId);
    const wished = isWishlisted(product.productId);
    host.innerHTML = `
      <article class="mini-shop-product">
        <div class="mini-shop-product__hero" data-tone="${escapeHtml(product.coverTone)}">
          <span>${escapeHtml(product.coverEmoji || "🎁")}</span>
          ${product.tag ? `<em>${escapeHtml(product.tag)}</em>` : ""}
          ${wishHeartHtml(product.productId, wished)}
        </div>
        <div class="mini-shop-product__body">
          <strong>${escapeHtml(product.title)}</strong>
          <p class="mini-shop-product__price">${escapeHtml(formatCoin(product.price))}</p>
          <p class="mini-shop-product__meta">${escapeHtml(shopCatLabel(product.category))} · ${escapeHtml(formatSales(product.salesHint))} · ${escapeHtml(pt("shop.virtualProduct"))}</p>
          <p class="mini-shop-product__blurb">${escapeHtml(product.blurb || product.subtitle || "")}</p>
          <ul class="mini-shop-product__facts">
            <li>${escapeHtml(pt("shop.factCoin"))}</li>
            <li>${escapeHtml(pt("shop.factNoShipping"))}</li>
            ${owned ? `<li>${escapeHtml(pt("shop.owned", { qty: owned.qty || 1 }))}</li>` : `<li>${escapeHtml(pt("shop.ownedAfterBuy"))}</li>`}
          </ul>
          <div class="mini-shop-product__actions">
            <button type="button" class="mini-shop-wish-cta${wished ? " is-on" : ""}" data-shop-wish="${escapeHtml(product.productId)}" aria-pressed="${wished ? "true" : "false"}">
              <i data-lucide="heart"></i>
              <span>${escapeHtml(wished ? pt("shop.wished") : pt("shop.wish"))}</span>
            </button>
            ${owned && canSendGift(product) ? `<button type="button" class="mini-shop-send" data-shop-send="${escapeHtml(product.productId)}">${escapeHtml(giftSendLabel())}</button>` : ""}
            <button type="button" class="mini-app-cta" data-shop-buy="${escapeHtml(product.productId)}">${escapeHtml(pt("shop.buyNow"))}</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderBag() {
    const feed = root.querySelector("[data-shop-bag]");
    if (!feed) return;
    const wishes = listWishlistProducts().map((product) => localizeShopProduct(product));
    const items = listInventory();
    if (!wishes.length && !items.length) {
      feed.innerHTML = `
        <div class="mini-shop-empty">
          <p>${escapeHtml(pt("shop.emptyBag"))}</p>
          <p class="mini-shop-empty__hint">${escapeHtml(pt("shop.emptyBagHint"))}</p>
          <button type="button" class="mini-app-cta" data-shop-tab="catalog">${escapeHtml(pt("shop.browse"))}</button>
        </div>
      `;
      return;
    }
    const wishBlock = wishes.length ? `
      <section class="mini-shop-bag-section">
        <h3 class="mini-shop-bag-section__title">${escapeHtml(pt("shop.wishSection"))}</h3>
        <div class="mini-shop-bag-section__list">
          ${wishes.map((product) => `
            <div class="mini-shop-order-row-wrap">
              <button type="button" class="mini-shop-order-row" data-shop-open-product="${escapeHtml(product.productId)}">
                <span class="mini-shop-order-row__art" data-tone="${escapeHtml(product.coverTone || "coral")}">${escapeHtml(product.coverEmoji || "🎁")}</span>
                <span class="mini-shop-order-row__meta">
                  <strong>${escapeHtml(product.title)}</strong>
                  <em>${escapeHtml(formatCoin(product.price))} · ${escapeHtml(shopCatLabel(product.category))}</em>
                </span>
                <span class="mini-shop-pill is-wish">${escapeHtml(pt("shop.wishPill"))}</span>
              </button>
              <div class="mini-shop-order-row-wrap__actions">
                <button type="button" class="mini-shop-buy mini-shop-buy--row" data-shop-buy="${escapeHtml(product.productId)}">${escapeHtml(pt("shop.buy"))}</button>
                <button type="button" class="mini-shop-wish is-on mini-shop-wish--row" data-shop-wish="${escapeHtml(product.productId)}" aria-pressed="true" aria-label="${escapeHtml(pt("shop.unwish"))}">
                  <i data-lucide="heart"></i>
                </button>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    ` : "";
    const ownedBlock = items.length ? `
      <section class="mini-shop-bag-section">
        <h3 class="mini-shop-bag-section__title">${escapeHtml(pt("shop.ownedSection"))}</h3>
        <div class="mini-shop-bag-section__list">
          ${items.map((item) => {
            const product = getShopProduct(item.productId);
            const sendable = product && canSendGift(product) && (item.qty || 0) >= 1;
            return `
            <div class="mini-shop-order-row-wrap">
              <button type="button" class="mini-shop-order-row" data-shop-open-product="${escapeHtml(item.productId)}">
                <span class="mini-shop-order-row__art" data-tone="${escapeHtml(item.coverTone || "coral")}">${escapeHtml(item.coverEmoji || "🎁")}</span>
                <span class="mini-shop-order-row__meta">
                  <strong>${escapeHtml(productTitle(item))}</strong>
                  <em>${escapeHtml(shopCatLabel(item.category) || pt("shop.virtual"))} · ×${escapeHtml(String(item.qty || 1))}</em>
                </span>
                <span class="mini-shop-pill">${escapeHtml(pt("shop.ownedPill"))}</span>
              </button>
              ${sendable ? `<button type="button" class="mini-shop-send mini-shop-send--row" data-shop-send="${escapeHtml(item.productId)}">${escapeHtml(giftSendLabel())}</button>` : ""}
            </div>
          `;
          }).join("")}
        </div>
      </section>
    ` : "";
    feed.innerHTML = `${wishBlock}${ownedBlock}`;
  }

  function renderOrders() {
    const feed = root.querySelector("[data-shop-orders]");
    if (!feed) return;
    const orders = listOrders();
    if (!orders.length) {
      feed.innerHTML = `<p class="mini-empty">${escapeHtml(pt("shop.emptyOrders"))}</p>`;
      return;
    }
    feed.innerHTML = orders.map((order) => {
      const item = order.items?.[0] || {};
      return `
        <button type="button" class="mini-shop-order-row" data-shop-order="${escapeHtml(order.orderId)}">
          <span class="mini-shop-order-row__art" data-tone="${escapeHtml(item.coverTone || "coral")}">${escapeHtml(item.coverEmoji || "🎁")}</span>
          <span class="mini-shop-order-row__meta">
            <strong>${escapeHtml(productTitle(item))}</strong>
            <em>${escapeHtml(formatCoin(order.amount))}</em>
          </span>
          <span class="mini-shop-pill">${escapeHtml(statusLabel(order.status))}</span>
        </button>
      `;
    }).join("");
  }

  function renderDetail(orderId) {
    const host = root.querySelector("[data-shop-detail]");
    if (!host) return;
    const order = getOrder(orderId);
    if (!order) {
      host.innerHTML = `<p class="mini-empty">${escapeHtml(pt("shop.orderNotFound"))}</p>`;
      return;
    }
    const item = order.items?.[0] || {};
    host.innerHTML = `
      <article class="mini-shop-detail-card">
        <div class="mini-shop-detail-card__hero" data-tone="${escapeHtml(item.coverTone || "coral")}">
          <span>${escapeHtml(item.coverEmoji || "🎁")}</span>
          <strong>${escapeHtml(productTitle(item))}</strong>
          <em>${escapeHtml(formatCoin(order.amount))}</em>
        </div>
        <dl class="mini-shop-detail-card__facts">
          <div><dt>${escapeHtml(pt("shop.orderId"))}</dt><dd class="is-mono" data-shop-copy-id="${escapeHtml(order.orderId)}">${escapeHtml(order.orderId)}</dd></div>
          <div><dt>${escapeHtml(pt("shop.status"))}</dt><dd><span class="mini-shop-pill">${escapeHtml(statusLabel(order.status))}</span></dd></div>
          <div><dt>${escapeHtml(pt("shop.shopName"))}</dt><dd>${escapeHtml(order.shopName || pt("shop.defaultShop"))}</dd></div>
          <div><dt>${escapeHtml(pt("shop.type"))}</dt><dd>${escapeHtml(pt("shop.typeVirtual"))}</dd></div>
          <div><dt>${escapeHtml(pt("shop.quantity"))}</dt><dd>${escapeHtml(String(item.qty || 1))}</dd></div>
          <div><dt>${escapeHtml(pt("shop.orderTime"))}</dt><dd>${escapeHtml(String(order.createdAt || "").replace("T", " ").slice(0, 19))}</dd></div>
        </dl>
        <ol class="mini-shop-timeline">
          <li class="is-done">${escapeHtml(pt("shop.timelineOrder"))}</li>
          <li class="is-done">${escapeHtml(pt("shop.timelinePaid"))}</li>
          <li class="is-done">${escapeHtml(pt("shop.timelineStored"))}</li>
        </ol>
      </article>
    `;
  }

  function economyWallet(actorId) {
    return (economyState.overview?.wallets || []).find((row) => row.ownerActorId === actorId) || null;
  }

  function renderEconomyUnavailable(host) {
    if (!host) return;
    host.innerHTML = `
      <div class="mini-shop-economy-empty">
        <span><i data-lucide="cloud-off"></i></span>
        <strong>${pt("shop.studioUnavailable")}</strong>
        <p>${pt("shop.serverLedgerLead")}</p>
      </div>`;
    refreshIcons();
  }

  function renderEconomyStudio() {
    const host = root.querySelector("[data-shop-studio]");
    if (!host) return;
    if (!economyState.overview) {
      if (!economyLoading) return renderEconomyUnavailable(host);
      host.innerHTML = `<div class="mini-shop-economy-loading"><span></span><p>${pt("shop.loadingStudio")}</p></div>`;
      return;
    }
    const selfBalance = economyWallet(economyState.userActorId)?.balance || 0;
    const companionBalance = economyWallet(economyState.companionActorId)?.balance || 0;
    const intents = (economyState.overview?.intents || []).filter((row) => row.actorId === economyState.companionActorId && row.status === "active");
    host.innerHTML = `
      <section class="mini-shop-economy-summary">
        <div><span>${pt("shop.myCoins")}</span><strong>${economyCoin(selfBalance)}</strong></div>
        <div><span>${pt("shop.companionPool", { name: escapeHtml(economyState.companionName) })}</span><strong>${economyCoin(companionBalance)}</strong></div>
      </section>
      ${intents.length ? `<section class="mini-shop-economy-intents"><span>${pt("shop.continuingPlans")}</span>${intents.slice(0, 2).map((item) => `<p>${escapeHtml(item.desire || pt("shop.unnamedPlan"))}</p>`).join("")}</section>` : ""}
      <header class="mini-shop-economy-head"><div><strong>${pt("shop.pickOutput")}</strong><p>${pt("shop.pickOutputLead")}</p></div></header>
      <div class="mini-shop-recipe-list">
        ${(economyState.recipes || []).map((recipe) => `
          <button type="button" data-shop-compose="${escapeHtml(recipe.recipeId)}">
            <span><i data-lucide="${recipe.outputType === "playlist" ? "list-music" : recipe.outputType === "image_album" ? "images" : recipe.outputType === "skill_package" ? "blocks" : "pen-line"}"></i></span>
            <div><strong>${escapeHtml(recipe.title)}</strong><small>${escapeHtml(recipe.description)}</small></div>
            <em>${economyCoin(recipe.nyraCoinCost)}</em>
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>`).join("")}
      </div>`;
    refreshIcons();
  }

  function renderEconomyAssets() {
    const host = root.querySelector("[data-shop-assets]");
    if (!host) return;
    if (!economyState.overview) {
      if (!economyLoading) return renderEconomyUnavailable(host);
      host.innerHTML = `<div class="mini-shop-economy-loading"><span></span><p>${pt("shop.loadingWorks")}</p></div>`;
      return;
    }
    const resources = (economyState.overview?.resources || []).filter((row) => row.ownerActorId === economyState.userActorId);
    host.innerHTML = `
      ${resources.length ? `<div class="mini-shop-resource-row">${resources.map((row) => `<span>${escapeHtml(String(row.resourceType || pt("shop.resource")).replaceAll("_", " "))}<strong>×${Number(row.quantity) || 0}</strong></span>`).join("")}</div>` : ""}
      <header class="mini-shop-economy-head"><div><strong>${pt("shop.myWorks")}</strong><p>${pt("shop.myWorksLedgerLead")}</p></div></header>
      <div class="mini-shop-asset-list">
        ${economyState.assets.length ? economyState.assets.map((asset) => {
          const object = asset.object || {};
          const listing = (economyState.marketplace || []).find((row) => row.generativeObjectId === object.objectId && row.status === "active");
          const canList = object.controllerActorId === economyState.userActorId;
          return `<article>
            <span><i data-lucide="file-heart"></i></span>
            <div><strong>${escapeHtml(object.title || pt("shop.ownedWork"))}</strong><p>${escapeHtml(object.abstract || pt("shop.privateAsset"))}</p><small>${escapeHtml(asset.license === "creator_control" ? pt("shop.creatorOwnership") : pt("shop.privateUse"))}</small></div>
            ${canList ? (listing ? `<em>${pt("shop.listed")} · ${economyCoin(listing.price)}</em>` : `<button type="button" data-shop-list-object="${escapeHtml(object.objectId)}">${pt("shop.sell")}</button>`) : ""}
          </article>`;
        }).join("") : `<div class="mini-shop-economy-empty"><span><i data-lucide="archive"></i></span><strong>${pt("shop.noWorks")}</strong><p>${pt("shop.noWorksLead")}</p><button type="button" data-shop-open-studio>${pt("shop.goCreate")}</button></div>`}
      </div>`;
    refreshIcons();
  }

  function closeEconomySheet() {
    const sheet = root.querySelector("[data-shop-economy-sheet]");
    if (sheet) sheet.hidden = true;
    const panel = root.querySelector("[data-shop-economy-sheet-panel]");
    if (panel) panel.innerHTML = "";
  }

  function openEconomySheet(html) {
    const sheet = root.querySelector("[data-shop-economy-sheet]");
    const panel = root.querySelector("[data-shop-economy-sheet-panel]");
    if (!sheet || !panel) return;
    panel.innerHTML = html;
    sheet.hidden = false;
    refreshIcons();
    panel.querySelector("input, textarea, button")?.focus?.({ preventScroll: true });
  }

  function openComposeSheet(recipeId) {
    const recipe = economyState.recipes.find((row) => row.recipeId === recipeId);
    if (!recipe) return;
    openEconomySheet(`
      <header><div><small>${pt("shop.creationMode")}</small><strong>${escapeHtml(recipe.title)}</strong></div><button type="button" data-shop-economy-close aria-label="${pt("screens.close")}"><i data-lucide="x"></i></button></header>
      <p>${escapeHtml(recipe.description)}</p>
      <div class="mini-shop-mode-choice"><button type="button" class="is-active" data-shop-compose-mode="self">${pt("shop.createMyself")}</button><button type="button" data-shop-compose-mode="companion">${pt("shop.giveTo", { name: escapeHtml(economyState.companionName) })}</button></div>
      <form data-shop-compose-form data-recipe-id="${escapeHtml(recipe.recipeId)}" data-mode="self">
        <label><span>${pt("shop.workTitle")}</span><input name="title" maxlength="80" required placeholder="${pt("shop.workTitlePlaceholder")}" /></label>
        <label><span data-shop-compose-label>${pt("shop.workContent")}</span><textarea name="content" rows="5" maxlength="8000" required placeholder="${pt("shop.workContentPlaceholder")}"></textarea></label>
        ${recipe.sellable ? `<label class="mini-shop-check"><input type="checkbox" name="listForSale" /><span>${pt("shop.listWhenDone")}</span></label><label data-shop-compose-price hidden><span>${pt("shop.price")}</span><input name="price" type="number" min="1" max="99999" value="${Number(recipe.suggestedPrice) || 1}" inputmode="numeric" /></label>` : ""}
        <div class="mini-shop-economy-cost"><span>${pt("shop.productionCost")}</span><strong>${economyCoin(recipe.nyraCoinCost)}</strong><small data-shop-cost-owner>${pt("shop.payFromMyBalance")}</small></div>
        <button type="submit" class="mini-app-cta">${pt("shop.completeWork")}</button>
      </form>`);
  }

  function openListingSheet(objectId) {
    const asset = economyState.assets.find((row) => row.object?.objectId === objectId);
    if (!asset?.object) return;
    openEconomySheet(`
      <header><div><small>${pt("shop.sellWork")}</small><strong>${escapeHtml(asset.object.title || pt("shop.work"))}</strong></div><button type="button" data-shop-economy-close aria-label="${pt("screens.close")}"><i data-lucide="x"></i></button></header>
      <p>${pt("shop.sellWorkLead")}</p>
      <form data-shop-list-form data-object-id="${escapeHtml(objectId)}">
        <label><span>${pt("shop.price")}</span><input name="price" type="number" min="1" max="99999" value="8" required inputmode="numeric" /></label>
        <label><span>${pt("shop.workIntro")}</span><textarea name="description" rows="3" maxlength="300">${escapeHtml(asset.object.abstract || "")}</textarea></label>
        <button type="submit" class="mini-app-cta">${pt("shop.listToMarket")}</button>
      </form>`);
  }

  async function refreshEconomy() {
    if (economyLoading) return;
    economyLoading = true;
    try {
      const companionId = getActiveCharacterId?.() || "";
      const companion = getCharacterSync?.(companionId);
      const companionName = companion?.name || companion?.displayName || "TA";
      const boot = await bootstrapEconomy({ companionId, companionName });
      const userActorId = boot.economy?.user?.actorId || "";
      const companionActorId = boot.economy?.companion?.actorId || "";
      const [overviewPayload, recipesPayload, marketplacePayload] = await Promise.all([
        fetchEconomyOverview({ companionId, companionName }),
        listProductionRecipes(),
        listEconomyMarketplace({ sellerActorId: userActorId }),
      ]);
      const overview = overviewPayload.economy || {};
      const ownerships = (overview.ownerships || []).filter((row) => row.ownerActorId === userActorId && row.generativeObjectId);
      const assets = await Promise.all(ownerships.map(async (ownership) => {
        try {
          const payload = await fetchGenerativeObject(ownership.generativeObjectId);
          return { ...ownership, object: payload.object || null };
        } catch {
          return { ...ownership, object: null };
        }
      }));
      economyState = { overview, marketplace: marketplacePayload.listings || [], recipes: recipesPayload.recipes || [], assets: assets.filter((row) => row.object), userActorId, companionActorId, companionName };
      renderBalance();
      refreshPaneContent(currentPane);
    } catch (error) {
      economyState = { overview: null, marketplace: [], recipes: [], assets: [], userActorId: "", companionActorId: "", companionName: "TA" };
      onToast?.(pt("shop.studioUnavailable"));
      refreshPaneContent(currentPane);
    } finally {
      economyLoading = false;
    }
  }

  function openConfirm(productId) {
    pendingProductId = productId;
    const product = localizeShopProduct(getShopProduct(productId));
    const sheet = root.querySelector("[data-shop-confirm]");
    if (!sheet || !product) return;
    const wallet = loadWallet();
    const affordable = canAfford(product.price, wallet);
    sheet.hidden = false;
    sheet.querySelector("[data-confirm-emoji]").textContent = product.coverEmoji || "🎁";
    sheet.querySelector("[data-confirm-title]").textContent = product.title;
    sheet.querySelector("[data-confirm-amount]").textContent = formatCoin(product.price);
    sheet.querySelector("[data-confirm-balance]").textContent = formatCoin(wallet.balance);
    const err = sheet.querySelector("[data-confirm-error]");
    const btn = sheet.querySelector("[data-confirm-submit]");
    if (err) {
      err.hidden = affordable;
      err.textContent = affordable ? "" : pt("shop.insufficientBalance");
    }
    if (btn) {
      btn.disabled = !affordable;
      btn.classList.remove("is-loading");
      btn.textContent = pt("shop.confirmPurchase");
    }
  }

  function closeConfirm() {
    const sheet = root.querySelector("[data-shop-confirm]");
    if (sheet) sheet.hidden = true;
    pendingProductId = "";
  }

  async function handleSendGift(productId) {
    const characterId = getActiveCharacterId?.() || "";
    const result = await sendGift({ productId, characterId });
    if (!result.ok) {
      const errKey = {
        missing_characterId: "shop.giftNoCharacter",
        insufficient_inventory: "shop.giftNotOwned",
        not_gift_product: "shop.giftNotGift",
        product_not_found: "shop.productNotFound",
      }[result.error] || "shop.giftFailed";
      onToast?.(pt(errKey));
      return result;
    }
    onToast?.(pt("shop.giftSent"));
    renderBag();
    if (productViewId === productId) renderProduct(productId);
    onGiftSent?.(result);
    return result;
  }

  function openToOrder(orderId) {
    const id = String(orderId || "").trim();
    if (!id) return false;
    detailOrderId = id;
    renderDetail(id);
    paneStack = ["shop-catalog", "shop-orders"];
    showPane("shop-detail");
    refreshIcons();
    return true;
  }

  async function confirmPurchase() {
    const sheet = root.querySelector("[data-shop-confirm]");
    const btn = sheet?.querySelector("[data-confirm-submit]");
    if (!pendingProductId || !btn || btn.disabled) return;
    btn.classList.add("is-loading");
    btn.textContent = pt("shop.processing");
    btn.disabled = true;
    const characterId = getActiveCharacterId?.() || "";
    const character = getCharacterSync?.(characterId);
    let result;
    try {
      const remote = await purchaseOfficialProduct({
        productId: pendingProductId,
        productTitle: getShopProduct(pendingProductId)?.title || pendingProductId,
        companionId: characterId,
        companionName: character?.name || "",
      });
      const product = getShopProduct(pendingProductId);
      result = recordRemoteOrder({
        remoteOrder: remote.result?.order,
        transactionId: remote.result?.transaction?.transactionId,
        product,
        characterId,
      });
      const wallet = (remote.economy?.wallets || []).find((row) => row.ownerActorId === remote.buyerActorId);
      if (wallet) syncWalletProjection(wallet);
    } catch (error) {
      result = { ok: false, error: error?.code || error?.payload?.error || "order_failed" };
    }
    if (!result.ok) {
      const err = sheet.querySelector("[data-confirm-error]");
      if (err) {
        err.hidden = false;
        err.textContent = result.error === "insufficient_balance"
          ? pt("shop.insufficientBalance")
          : pt("shop.orderFailed");
      }
      btn.classList.remove("is-loading");
      btn.textContent = pt("shop.confirmPurchase");
      btn.disabled = result.error === "insufficient_balance";
      renderBalance();
      return;
    }
    const boughtId = String(
      result.order?.items?.[0]?.productId
      || pendingProductId
      || "",
    ).trim();
    closeConfirm();
    onToast?.(pt("shop.addedToBag"));
    if (boughtId) removeFromWishlist(boughtId);
    renderBalance();
    renderOrders();
    renderBag();
    renderCatalog();
    detailOrderId = result.order.orderId;
    renderDetail(detailOrderId);
    paneStack = ["shop-catalog", "shop-orders"];
    showPane("shop-detail");
    refreshIcons();
  }

  function onClick(event) {
    if (event.target.closest("[data-shop-economy-close]")) {
      closeEconomySheet();
      return;
    }
    if (event.target.closest("[data-shop-economy-login]")) {
      closeEconomySheet();
      document.querySelector('[data-phone-open="settings"]')?.click();
      return;
    }
    if (event.target.closest("[data-shop-open-studio]")) {
      showPane("shop-studio", { push: currentPane !== "shop-studio" });
      renderEconomyStudio();
      void refreshEconomy();
      return;
    }
    if (event.target.closest("[data-shop-open-assets]")) {
      showPane("shop-assets", { push: currentPane !== "shop-assets" });
      renderEconomyAssets();
      void refreshEconomy();
      return;
    }
    const recipeId = event.target.closest("[data-shop-compose]")?.dataset.shopCompose;
    if (recipeId) {
      openComposeSheet(recipeId);
      return;
    }
    const objectId = event.target.closest("[data-shop-list-object]")?.dataset.shopListObject;
    if (objectId) {
      openListingSheet(objectId);
      return;
    }
    const modeButton = event.target.closest("[data-shop-compose-mode]");
    if (modeButton) {
      const panel = root.querySelector("[data-shop-economy-sheet-panel]");
      const form = panel?.querySelector("[data-shop-compose-form]");
      if (!form) return;
      const mode = modeButton.dataset.shopComposeMode || "self";
      form.dataset.mode = mode;
      panel.querySelectorAll("[data-shop-compose-mode]").forEach((button) => button.classList.toggle("is-active", button === modeButton));
      const label = panel.querySelector("[data-shop-compose-label]");
      const owner = panel.querySelector("[data-shop-cost-owner]");
      const content = form.elements.content;
      const submit = form.querySelector('button[type="submit"]');
      if (mode === "companion") {
        if (label) label.textContent = pt("shop.creationRequest");
        if (owner) owner.textContent = pt("shop.reserveFromBalance", { name: economyState.companionName });
        if (content) content.placeholder = pt("shop.companionBriefPlaceholder", { name: economyState.companionName });
        if (submit) submit.textContent = pt("shop.joinCreationPlan");
      } else {
        if (label) label.textContent = pt("shop.workContent");
        if (owner) owner.textContent = pt("shop.payFromMyBalance");
        if (content) content.placeholder = pt("shop.workContentPlaceholder");
        if (submit) submit.textContent = pt("shop.completeWork");
      }
      return;
    }
    const saleToggle = event.target.closest('input[name="listForSale"]');
    if (saleToggle) {
      const price = root.querySelector("[data-shop-compose-price]");
      if (price) price.hidden = !saleToggle.checked;
      return;
    }
    const cat = event.target.closest("[data-shop-cat]")?.dataset.shopCat;
    if (cat) {
      category = cat;
      renderCategories();
      renderCatalog();
      return;
    }
    if (event.target.closest("[data-shop-tab='catalog']")) {
      showPane("shop-catalog", { resetStack: true });
      return;
    }
    if (event.target.closest("[data-shop-tab='bag']")) {
      paneStack = ["shop-catalog"];
      showPane("shop-bag");
      renderBag();
      return;
    }
    if (event.target.closest("[data-shop-tab='orders']")) {
      paneStack = ["shop-catalog"];
      showPane("shop-orders");
      renderOrders();
      return;
    }
    // Back is handled by phone-shell goBack() → handleBack(); do not intercept.
    const openProduct = event.target.closest("[data-shop-open-product]")?.dataset.shopOpenProduct;
    if (openProduct && !event.target.closest("[data-shop-buy], [data-shop-wish], [data-shop-send]")) {
      renderProduct(openProduct);
      showPane("shop-product", { push: true });
      return;
    }
    const wishId = event.target.closest("[data-shop-wish]")?.dataset.shopWish;
    if (wishId) {
      event.stopPropagation?.();
      const result = toggleWishlist(wishId);
      if (!result.ok) {
        onToast?.(pt("shop.productNotFound"));
        return;
      }
      onToast?.(result.wishlisted ? pt("shop.wishAdded") : pt("shop.wishRemoved"));
      renderCatalog();
      renderBag();
      if (productViewId === wishId) renderProduct(wishId);
      refreshIcons();
      return;
    }
    const sendId = event.target.closest("[data-shop-send]")?.dataset.shopSend;
    if (sendId) {
      event.stopPropagation?.();
      handleSendGift(sendId);
      return;
    }
    const buyId = event.target.closest("[data-shop-buy]")?.dataset.shopBuy;
    if (buyId) {
      event.stopPropagation?.();
      openConfirm(buyId);
      return;
    }
    if (event.target.closest("[data-confirm-close], [data-confirm-cancel]")) {
      closeConfirm();
      return;
    }
    if (event.target.closest("[data-confirm-submit]")) {
      confirmPurchase();
      return;
    }
    const orderId = event.target.closest("[data-shop-order]")?.dataset.shopOrder;
    if (orderId) {
      detailOrderId = orderId;
      renderDetail(orderId);
      showPane("shop-detail", { push: true });
      return;
    }
    const copyId = event.target.closest("[data-shop-copy-id]")?.dataset.shopCopyId;
    if (copyId && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(copyId).catch(() => {});
      onToast?.(pt("shop.orderCopied"));
    }
  }

  function onInput(event) {
    const input = event.target.closest("[data-shop-search]");
    if (!input) return;
    query = String(input.value || "").trim();
    renderCatalog();
  }

  async function onSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches("[data-shop-compose-form]")) {
      event.preventDefault();
      const recipe = economyState.recipes.find((row) => row.recipeId === form.dataset.recipeId);
      if (!recipe) return;
      const title = String(form.elements.title?.value || "").trim();
      const content = String(form.elements.content?.value || "").trim();
      const submit = form.querySelector('button[type="submit"]');
      if (!title || !content || !submit) return;
      submit.disabled = true;
      submit.textContent = pt("shop.writing");
      try {
        if (form.dataset.mode === "companion") {
          await createEconomyIntent({
            actorId: economyState.companionActorId,
            intentType: "creative",
            desire: `${title}：${content}`,
            motivation: "用户从小手机创作台明确提出",
            priority: 0.8,
            persistence: 0.9,
            recipeId: recipe.recipeId,
            expectedNextTrigger: "worker_next_tick",
          });
          onToast?.(pt("shop.joinedCreationPlan", { name: economyState.companionName }));
        } else {
          const listForSale = Boolean(form.elements.listForSale?.checked && recipe.sellable);
          await fulfillProduction({
            companionId: getActiveCharacterId?.() || "",
            actorId: economyState.userActorId,
            recipeId: recipe.recipeId,
            trigger: "phone_shop_studio",
            outputs: [{
              title,
              abstract: content.slice(0, 180),
              content,
              visibility: listForSale ? "public" : recipe.defaultVisibility || "private",
            }],
            listing: listForSale ? {
              title,
              description: content.slice(0, 260),
              price: Number(form.elements.price?.value) || recipe.suggestedPrice,
              license: "private_use",
            } : undefined,
          });
          onToast?.(listForSale ? pt("shop.workCompletedListed") : pt("shop.workAdded"));
        }
        closeEconomySheet();
        await refreshEconomy();
      } catch (error) {
        submit.disabled = false;
        submit.textContent = form.dataset.mode === "companion" ? pt("shop.joinCreationPlan") : pt("shop.completeWork");
        onToast?.(error?.code === "insufficient_balance" ? pt("toast.insufficientCoins") : pt("shop.writeFailed"));
      }
      return;
    }
    if (form.matches("[data-shop-list-form]")) {
      event.preventDefault();
      const objectId = form.dataset.objectId || "";
      const asset = economyState.assets.find((row) => row.object?.objectId === objectId);
      const submit = form.querySelector('button[type="submit"]');
      if (!asset?.object || !submit) return;
      submit.disabled = true;
      submit.textContent = pt("shop.listing");
      try {
        await createEconomyListing({
          sellerActorId: economyState.userActorId,
          generativeObjectId: objectId,
          title: asset.object.title || pt("shop.work"),
          description: String(form.elements.description?.value || "").trim(),
          kind: "artifact",
          price: Number(form.elements.price?.value),
          license: "private_use",
          idempotencyKey: economyRequestKey("phone-listing"),
        });
        closeEconomySheet();
        onToast?.(pt("shop.workListed"));
        await refreshEconomy();
      } catch {
        submit.disabled = false;
        submit.textContent = pt("shop.listToMarket");
        onToast?.(pt("shop.listFailed"));
      }
    }
  }

  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("submit", onSubmit);

  function open() {
    category = ALL_CATEGORY;
    query = "";
    const search = root.querySelector("[data-shop-search]");
    if (search) search.value = "";
    showPane("shop-catalog", { resetStack: true });
    renderBalance();
    renderCategories();
    renderCatalog();
    void refreshEconomy();
    refreshIcons();
  }

  function destroy() {
    root.removeEventListener("click", onClick);
    root.removeEventListener("input", onInput);
    root.removeEventListener("submit", onSubmit);
  }

  return { open, destroy, renderCatalog, renderOrders, renderBag, openToOrder, handleBack };
}
