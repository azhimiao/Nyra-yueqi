import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { t } from "../i18n/index.js";
import {
  bootstrapEconomy,
  createEconomyIntent,
  createEconomyListing,
  fetchEconomyOverview,
  fetchGenerativeObject,
  listEconomyMarketplace,
  listProductionRecipes,
  purchaseEconomyListing,
  purchaseOfficialProduct,
} from "./client.js";
import { MARKET_MEDIA, marketCoverSizeLabel } from "./media-spec.js";

function et(key, vars) {
  return t(`phone.economy.${key}`, vars);
}

function workTypes() {
  return Object.freeze({
    image_album: { label: et("imageAlbum"), icon: "image" },
    story_chapter: { label: et("storyChapter"), icon: "book-open" },
  });
}

const FAVORITES_KEY = "yueqi.market.favorites.v1";

function loadFavoriteKeys() {
  try {
    const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveFavoriteKeys(keys) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...keys]));
  } catch {
    // Favorites still work for this session if storage is unavailable.
  }
}

function coin(value) {
  return et("coinAmount", { amount: Math.max(0, Number(value) || 0).toFixed(0) });
}

function requestKey(prefix) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function displayCompanionName(name) {
  const raw = String(name || "").trim();
  return !raw || raw === "未命名" || raw === "Unnamed" || raw === "TA" ? et("brandFallback") : raw;
}

function workInfo(listing = {}) {
  const product = listing.product || {};
  const object = listing.object || listing.objectDigest || {};
  const type = product.artifactType || object.artifactType || "";
  return {
    listing,
    product,
    object,
    type,
    title: listing.title || product.title || object.title || et("unnamedWork"),
    subtitle: product.subtitle || listing.description || object.abstract || "",
    description: product.description || listing.description || object.abstract || "",
    creator: product.creatorDisplayName || listing.seller?.displayName || et("brandFallback"),
    theme: product.coverTheme || object.coverTheme || (type === "story_chapter" ? "blue-room" : "night-butterfly"),
    coverUrl: product.coverUrl || object.coverUrl || "",
    previewUrls: product.previewUrls || object.previewUrls || [],
    deliverable: product.deliverable || object.deliverable || {},
  };
}

function isWorkListing(listing) {
  return Boolean(workTypes()[workInfo(listing).type]);
}

function actorWallet(state, actorId) {
  return (state.overview?.wallets || []).find((item) => item.ownerActorId === actorId) || null;
}

function ownsListing(state, listing) {
  if (listing.sellerActorId && listing.sellerActorId === state.userActorId) return true;
  return (state.overview?.ownerships || []).some((row) => (
    (listing.productId && row.productId === listing.productId)
    || (listing.generativeObjectId && row.generativeObjectId === listing.generativeObjectId)
  ));
}

function coverMarkup(info, { compact = false, badge = true, titleOverlay = true } = {}) {
  const types = workTypes();
  const type = types[info.type]?.label || et("work");
  const image = info.coverUrl
    ? `<img src="${escapeHtml(info.coverUrl)}" alt="${escapeHtml(info.title)}" loading="lazy" draggable="false" />`
    : "";
  return `
    <div class="economy-work-cover economy-work-cover--${escapeHtml(info.theme)} ${compact ? "is-compact" : ""}">
      ${image}
      <span class="economy-work-cover__veil" aria-hidden="true"></span>
      <span class="economy-work-cover__stars" aria-hidden="true"></span>
      ${badge ? `<span class="economy-work-cover__badge"><i data-lucide="${types[info.type]?.icon || "sparkles"}"></i>${escapeHtml(type)}</span>` : ""}
      ${titleOverlay && info.type === "story_chapter" ? `<span class="economy-work-cover__story"><small>NYRA ORIGINAL</small><strong>${escapeHtml(info.title)}</strong></span>` : ""}
    </div>`;
}

export function ensureEconomyUiShell() {
  const content = document.querySelector(".content-shell");
  if (!content) return null;
  let root = content.querySelector('[data-panel="economy"]');
  if (!root) {
    root = document.createElement("section");
    root.className = "app-page economy-page";
    root.dataset.panel = "economy";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <header class="economy-topbar">
        <button type="button" class="economy-icon-button" data-tab="me" aria-label="${escapeHtml(et("back"))}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${escapeHtml(et("title"))}</strong><span>${escapeHtml(et("subtitle"))}</span></div>
        <button type="button" class="economy-icon-button" data-economy-refresh aria-label="${escapeHtml(et("refresh"))}"><i data-lucide="refresh-cw"></i></button>
      </header>
      <div class="economy-chrome" data-economy-chrome hidden></div>
      <div class="economy-scroll" data-economy-root><div class="economy-loading"><span></span><p>${escapeHtml(et("opening"))}</p></div></div>
      <div class="economy-sheet" data-economy-sheet hidden>
        <button type="button" class="economy-sheet__scrim" data-economy-sheet-close aria-label="${escapeHtml(et("close"))}"></button>
        <section class="economy-sheet__panel" role="dialog" aria-modal="true" data-economy-sheet-panel></section>
      </div>`;
    content.append(root);
  }

  const topbarCopy = root.querySelector(".economy-topbar > div");
  if (topbarCopy) topbarCopy.innerHTML = `<strong>${escapeHtml(et("title"))}</strong><span>${escapeHtml(et("subtitle"))}</span>`;

  const companionBlock = document.querySelector(".me-home .me-group-block");
  if (companionBlock && !document.querySelector("[data-economy-entry]")) {
    companionBlock.insertAdjacentHTML("afterend", `
      <div class="me-group-block me-economy-entry" data-economy-entry>
        <p class="me-group-title">${escapeHtml(et("entryTitle"))}</p>
        <section class="me-group" aria-label="${escapeHtml(et("entryLabel"))}">
          <button type="button" class="me-cell" data-tab="economy">
            <span class="me-cell__icon" aria-hidden="true"><i data-lucide="store"></i></span>
            <span class="me-cell__copy"><strong>${escapeHtml(et("title"))}</strong><small>${escapeHtml(et("entryLead"))}</small></span>
            <em class="me-cell__value" data-economy-entry-balance>—</em>
            <span class="me-cell__chevron" aria-hidden="true"></span>
          </button>
        </section>
      </div>`);
  }

  const sideMe = document.querySelector('.side-tabs [data-tab="me"]');
  if (sideMe && !document.querySelector('.side-tabs [data-tab="economy"]')) {
    sideMe.insertAdjacentHTML("beforebegin", `<button data-tab="economy"><i data-lucide="store"></i><span>${escapeHtml(et("title"))}</span></button>`);
  }
  const drawerMe = document.querySelector('.drawer-nav [data-drawer-nav="me"]');
  if (drawerMe && !document.querySelector('.drawer-nav [data-drawer-nav="economy"]')) {
    drawerMe.insertAdjacentHTML("afterend", `<button type="button" data-drawer-nav="economy"><i data-lucide="store"></i><span>${escapeHtml(et("title"))}</span><em>${escapeHtml(et("drawerLead"))}</em></button>`);
  }
  return root;
}

function renderChrome(state) {
  const balance = actorWallet(state, state.userActorId)?.balance;
  return `
    <div class="economy-market-strip">
      <span><i data-lucide="gem"></i><strong>${escapeHtml(coin(balance))}</strong></span>
      <button type="button" data-economy-compose="chooser"><i data-lucide="sparkles"></i>${escapeHtml(et("createWork"))}</button>
    </div>
    <nav class="economy-tabs" role="tablist" aria-label="${escapeHtml(et("tabsLabel"))}">
      <button type="button" role="tab" data-economy-tab="market" class="${state.tab === "market" ? "is-active" : ""}" aria-selected="${state.tab === "market"}"><i data-lucide="store"></i><span>${escapeHtml(et("tabMarket"))}</span></button>
      <button type="button" role="tab" data-economy-tab="favorites" class="${state.tab === "favorites" ? "is-active" : ""}" aria-selected="${state.tab === "favorites"}"><i data-lucide="heart"></i><span>${escapeHtml(et("tabFavorites"))}</span></button>
      <button type="button" role="tab" data-economy-tab="assets" class="${state.tab === "assets" ? "is-active" : ""}" aria-selected="${state.tab === "assets"}"><i data-lucide="archive"></i><span>${escapeHtml(et("tabAssets"))}</span></button>
    </nav>`;
}

function marketCard(listing, state, featured = false) {
  const info = workInfo(listing);
  const owned = ownsListing(state, listing);
  if (featured) {
    return `
      <article class="economy-featured" data-economy-open="${escapeHtml(listing.listingId)}">
        ${coverMarkup(info)}
        <div class="economy-featured__copy">
          <span>${escapeHtml(workTypes()[info.type]?.label || et("work"))}</span>
          <h3>${escapeHtml(info.title)}</h3>
          <p><b>${escapeHtml(info.creator)}</b><i data-lucide="badge-check"></i></p>
          <small>${escapeHtml(info.subtitle)}</small>
          <footer><strong>${coin(listing.price)}</strong><button type="button" data-economy-buy="${escapeHtml(listing.listingId)}">${owned ? et("viewFull") : et("viewDetails")}</button></footer>
        </div>
      </article>`;
  }
  return `
    <article class="economy-work-card" data-economy-open="${escapeHtml(listing.listingId)}">
      ${coverMarkup(info, { compact: true })}
      <div class="economy-work-card__body">
        <h3>${escapeHtml(info.title)}</h3>
        <p><span class="economy-creator-avatar">${escapeHtml(info.creator.slice(0, 1))}</span>${escapeHtml(info.creator)}</p>
        <footer><strong>${owned ? et("favorited") : coin(listing.price)}</strong><button type="button" data-economy-buy="${escapeHtml(listing.listingId)}" aria-label="${escapeHtml(et("viewWorkAria", { title: info.title }))}"><i data-lucide="${owned ? "book-open" : "shopping-bag"}"></i></button></footer>
      </div>
    </article>`;
}

function renderMarket(state) {
  const market = state.marketplace.filter((row) => row.sellerActorId !== state.userActorId && isWorkListing(row));
  const type = state.marketType;
  const filtered = market.filter((row) => workInfo(row).type === type);
  const featured = filtered[0];
  const rest = featured ? filtered.slice(1) : [];
  return `
    <section class="economy-view economy-view--market">
      <header class="economy-market-head"><div><h1>${escapeHtml(et("marketTitle"))}</h1><p>${escapeHtml(et("marketLead"))}</p></div></header>
      <div class="economy-work-switch" role="tablist">
        ${Object.entries(workTypes()).map(([id, item]) => `<button type="button" data-economy-kind="${id}" class="${type === id ? "is-active" : ""}"><i data-lucide="${item.icon}"></i>${item.label}</button>`).join("")}
      </div>
      ${featured ? `
        <div class="economy-section-title"><h2>${escapeHtml(et("featuredToday"))}</h2><span>${escapeHtml(et("worksCount", { n: filtered.length }))}</span></div>
        ${marketCard(featured, state, true)}
        ${rest.length ? `<div class="economy-section-title"><h2>${escapeHtml(et("popularWorks"))}</h2><span>${escapeHtml(et("newlyListed"))}</span></div><div class="economy-market-grid">${rest.map((item) => marketCard(item, state)).join("")}</div>` : ""}
      ` : `<div class="economy-empty"><span class="economy-empty__icon"><i data-lucide="images"></i></span><h2>${escapeHtml(et("emptyTypeTitle"))}</h2><p>${escapeHtml(et("emptyTypeBody"))}</p></div>`}
      <p class="economy-market-promise"><i data-lucide="shield-check"></i><span><strong>${escapeHtml(et("unlockPromise"))}</strong><small>${escapeHtml(et("unlockPromiseSmall"))}</small></span></p>
    </section>`;
}

function renderAssetCard(asset) {
  const listing = asset.listing || {};
  const info = workInfo({ ...listing, product: asset.product, object: asset.object });
  const key = asset.productId || asset.generativeObjectId || "";
  return `
    <button type="button" class="economy-library-card" data-economy-owned="${escapeHtml(key)}">
      ${coverMarkup(info, { compact: true, badge: false })}
      <span><strong>${escapeHtml(info.title)}</strong><small>${escapeHtml(workTypes()[info.type]?.label || et("work"))} · ${escapeHtml(info.creator)}</small></span>
      <i data-lucide="chevron-right"></i>
    </button>`;
}

function renderLibrary(state, favorites = false) {
  if (favorites) {
    const list = state.marketplace.filter((listing) => (
      isWorkListing(listing) && state.favoriteKeys.has(listing.listingId)
    ));
    return `
      <section class="economy-view economy-view--library">
        <header class="economy-library-head"><h1>${escapeHtml(et("favoritesTitle"))}</h1><p>${escapeHtml(et("favoritesLead"))}</p></header>
        ${list.length
          ? `<div class="economy-market-grid">${list.map((item) => marketCard(item, state)).join("")}</div>`
          : `<div class="economy-empty"><span class="economy-empty__icon"><i data-lucide="heart"></i></span><h2>${escapeHtml(et("emptyFavoritesTitle"))}</h2><p>${escapeHtml(et("emptyFavoritesBody"))}</p><button type="button" class="economy-primary" data-economy-tab="market">${escapeHtml(et("browseMarket"))}</button></div>`}
      </section>`;
  }
  const works = state.assets.filter((asset) => workTypes()[workInfo({ product: asset.product, object: asset.object }).type]);
  const list = works;
  return `
    <section class="economy-view economy-view--library">
      <header class="economy-library-head"><h1>${escapeHtml(et("myWorksTitle"))}</h1><p>${escapeHtml(et("myWorksLead"))}</p></header>
      <div class="economy-library-list">${list.length ? list.map(renderAssetCard).join("") : `<div class="economy-empty"><span class="economy-empty__icon"><i data-lucide="archive"></i></span><h2>${escapeHtml(et("emptyAssetsTitle"))}</h2><p>${escapeHtml(et("emptyAssetsBody"))}</p><button type="button" class="economy-primary" data-economy-tab="market">${escapeHtml(et("browseMarket"))}</button></div>`}</div>
    </section>`;
}

function renderApp(state) {
  if (state.tab === "assets") return renderLibrary(state, false);
  if (state.tab === "favorites") return renderLibrary(state, true);
  return renderMarket(state);
}

async function resolveAssets(overview, marketplace, token) {
  const listingsByProduct = new Map(marketplace.filter((row) => row.productId).map((row) => [row.productId, row]));
  const listingsByObject = new Map(marketplace.filter((row) => row.generativeObjectId).map((row) => [row.generativeObjectId, row]));
  return Promise.all((overview?.ownerships || []).map(async (ownership) => {
    let object = null;
    if (ownership.generativeObjectId) {
      try { object = (await fetchGenerativeObject(ownership.generativeObjectId, { token })).object; } catch { object = null; }
    }
    const listing = ownership.productId ? listingsByProduct.get(ownership.productId) : listingsByObject.get(ownership.generativeObjectId);
    return { ...ownership, object, product: listing?.product || null, listing: listing || null, favorite: false };
  }));
}

function splitParagraphs(text) {
  return String(text || "").split(/\n{2,}/).map((row) => row.trim()).filter(Boolean);
}

function storyContent(info, owned) {
  const deliverable = info.deliverable || {};
  const paragraphs = splitParagraphs(owned ? (deliverable.content || info.object.content) : (deliverable.excerpt || info.subtitle));
  return `<div class="economy-story-reader ${owned ? "is-unlocked" : "is-preview"}">${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}${owned ? "" : `<span class="economy-story-fade"><i data-lucide="lock-keyhole"></i>${escapeHtml(et("readFullAfterPurchase"))}</span>`}</div>`;
}

function imagePreviews(info, owned) {
  const urls = info.previewUrls.length ? info.previewUrls : [info.coverUrl].filter(Boolean);
  const captions = info.deliverable?.captions || [];
  return `<div class="economy-image-preview">${urls.map((url, index) => `
    <figure class="${!owned && index > 0 ? "is-locked" : ""}">
      <div class="economy-work-cover economy-work-cover--${escapeHtml(info.theme)}"><img src="${escapeHtml(url)}" alt="${escapeHtml(captions[index] || `${info.title} ${index + 1}`)}" loading="lazy" /><span class="economy-work-cover__veil"></span>${!owned && index > 0 ? `<span class="economy-preview-lock"><i data-lucide="lock-keyhole"></i></span>` : ""}</div>
      ${owned ? `<figcaption>${escapeHtml(captions[index] || et("workIndex", { n: index + 1 }))}</figcaption>` : ""}
    </figure>`).join("")}</div>`;
}

export function mountEconomyUi(root, deps = {}) {
  if (!root) return { refresh() {} };
  const chrome = root.querySelector("[data-economy-chrome]");
  const scroll = root.querySelector("[data-economy-root]");
  const sheet = root.querySelector("[data-economy-sheet]");
  const sheetPanel = root.querySelector("[data-economy-sheet-panel]");
  const state = { tab: "market", marketType: "image_album", loading: false, overview: null, marketplace: [], recipes: [], assets: [], favoriteKeys: loadFavoriteKeys(), userActorId: "", companionActorId: "", companionName: et("brandFallback") };

  function toast(message, isError = false) {
    let node = root.querySelector("[data-economy-toast]");
    if (!node) { node = document.createElement("p"); node.dataset.economyToast = ""; node.className = "economy-toast"; root.append(node); }
    node.textContent = message;
    node.classList.toggle("is-error", isError);
    node.hidden = false;
    clearTimeout(Number(node.dataset.timer) || 0);
    node.dataset.timer = String(window.setTimeout(() => { node.hidden = true; }, 2600));
  }

  function closeSheet() {
    sheet.hidden = true;
    sheet.classList.remove("is-detail");
    sheetPanel.className = "economy-sheet__panel";
    sheetPanel.innerHTML = "";
    document.body.classList.remove("is-economy-sheet-open", "is-economy-detail-open");
  }

  function openSheet(html, className = "") {
    const isDetail = /\bdetail\b/.test(className);
    sheet.classList.toggle("is-detail", isDetail);
    sheetPanel.className = `economy-sheet__panel ${className}`.trim();
    sheetPanel.innerHTML = html;
    sheet.hidden = false;
    document.body.classList.add("is-economy-sheet-open");
    document.body.classList.toggle("is-economy-detail-open", isDetail);
    refreshIcons();
  }

  function draw() {
    chrome.hidden = false;
    chrome.innerHTML = renderChrome(state);
    scroll.innerHTML = renderApp(state);
    const balance = actorWallet(state, state.userActorId)?.balance;
    document.querySelectorAll("[data-economy-entry-balance]").forEach((node) => { node.textContent = balance == null ? "—" : coin(balance); });
    refreshIcons();
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    root.classList.add("is-loading");
    try {
      const companionId = getActiveCharacterId() || "";
      const companion = getCharacterSync(companionId);
      state.companionName = displayCompanionName(companion?.name || companion?.displayName);
      const boot = await bootstrapEconomy({ companionId, companionName: state.companionName });
      state.userActorId = boot.economy?.user?.actorId || "";
      state.companionActorId = boot.economy?.companion?.actorId || "";
      const [overviewPayload, marketPayload, recipePayload] = await Promise.all([
        fetchEconomyOverview({ companionId, companionName: state.companionName }),
        listEconomyMarketplace(),
        listProductionRecipes(),
      ]);
      state.overview = overviewPayload.economy || {};
      state.marketplace = marketPayload.listings || [];
      state.recipes = (recipePayload.recipes || []).filter((row) => workTypes()[row.outputType]);
      state.assets = await resolveAssets(state.overview, state.marketplace);
      draw();
    } catch (error) {
      chrome.hidden = true;
      const code = String(error?.code || error?.message || "market_unavailable");
      scroll.innerHTML = `<section class="economy-empty"><span class="economy-empty__icon"><i data-lucide="cloud-off"></i></span><h2>${escapeHtml(et("unavailableTitle"))}</h2><p>${escapeHtml(et("unavailableBody"))}</p><small>${escapeHtml(code)}</small><button type="button" class="economy-primary" data-economy-retry>${escapeHtml(et("retry"))}</button></section>`;
      refreshIcons();
    } finally {
      state.loading = false;
      root.classList.remove("is-loading");
    }
  }

  function openWork(listing) {
    if (!listing) return;
    const info = workInfo(listing);
    const owned = ownsListing(state, listing);
    const detail = info.deliverable || {};
    openSheet(`
      <article class="economy-detail">
        <div class="economy-detail__scroll">
          <div class="economy-detail__hero">${coverMarkup(info, { badge: false, titleOverlay: false })}<button type="button" class="economy-detail__back" data-economy-sheet-close aria-label="${escapeHtml(et("close"))}"><i data-lucide="chevron-left"></i></button><span class="economy-detail__count">${info.type === "image_album" ? et("imageCount", { n: detail.imageCount || info.previewUrls.length || 1 }) : et("wordCount", { n: detail.wordCount || et("shortStory") })}</span></div>
          <div class="economy-detail__body">
            <header class="economy-detail__title"><div><h2>${escapeHtml(info.title)}</h2><p>${escapeHtml(workTypes()[info.type]?.label || et("work"))}</p></div><strong>${owned ? et("unlocked") : coin(listing.price)}</strong></header>
            <div class="economy-detail__creator"><span class="economy-creator-avatar">${escapeHtml(info.creator.slice(0, 1))}</span><div><strong>${escapeHtml(info.creator)}</strong><small>${escapeHtml(et("characterCreator"))}</small></div><i data-lucide="badge-check"></i></div>
            <p class="economy-detail__desc">${escapeHtml(info.description)}</p>
            <div class="economy-detail__section"><header><h3>${owned ? et("fullWork") : et("workPreview")}</h3><span>${owned ? et("permanentlyUnlocked") : et("viewAllAfterPurchase")}</span></header>${info.type === "story_chapter" ? storyContent(info, owned) : imagePreviews(info, owned)}</div>
            <dl class="economy-detail__meta">
              <div><dt>${escapeHtml(et("workType"))}</dt><dd>${escapeHtml(workTypes()[info.type]?.label || et("work"))}</dd></div>
              ${info.type === "image_album" ? `<div><dt>${escapeHtml(et("includes"))}</dt><dd>${escapeHtml(et("imagePieces", { n: detail.imageCount || info.previewUrls.length || 1 }))}</dd></div><div><dt>${escapeHtml(et("mediaSpec"))}</dt><dd>${escapeHtml(marketCoverSizeLabel(detail))}</dd></div>` : `<div><dt>${escapeHtml(et("length"))}</dt><dd>${escapeHtml(et("aboutWords", { n: String(detail.wordCount || "—") }))}</dd></div><div><dt>${escapeHtml(et("coverSpec"))}</dt><dd>${escapeHtml(MARKET_MEDIA.coverLabel)}</dd></div>`}
              <div><dt>${escapeHtml(et("format"))}</dt><dd>${escapeHtml(detail.format || (info.type === "story_chapter" ? et("plainText") : "PNG"))}</dd></div>
            </dl>
            <p class="economy-detail__promise"><i data-lucide="shield-check"></i><span><strong>${owned ? et("alreadyYours") : et("unlockPromise")}</strong><small>${escapeHtml(et("purchasePromiseSmall"))}</small></span></p>
          </div>
        </div>
        <footer class="economy-detail__actions"><button type="button" class="economy-secondary ${state.favoriteKeys.has(listing.listingId) ? "is-active" : ""}" data-economy-favorite="${escapeHtml(listing.listingId)}"><i data-lucide="heart"></i>${state.favoriteKeys.has(listing.listingId) ? et("favorited") : et("favorite")}</button>${owned ? `<button type="button" class="economy-primary" data-economy-sheet-close>${escapeHtml(et("done"))}</button>` : `<button type="button" class="economy-primary" data-economy-confirm-buy="${escapeHtml(listing.listingId)}">${escapeHtml(et("buyAndFavorite", { price: coin(listing.price) }))}</button>`}</footer>
      </article>`, "economy-sheet__panel--detail");
  }

  function openPurchase(listingId) {
    openWork(state.marketplace.find((item) => item.listingId === listingId));
  }

  function openOwned(key) {
    const asset = state.assets.find((item) => item.productId === key || item.generativeObjectId === key);
    if (!asset) return;
    const listing = asset.listing || {
      listingId: `owned:${key}`,
      productId: asset.productId,
      generativeObjectId: asset.generativeObjectId,
      product: asset.product,
      object: asset.object,
      title: asset.product?.title || asset.object?.title,
      sellerActorId: asset.object?.authorActorId || "",
      price: 0,
    };
    openWork(listing);
  }

  function openComposeChooser(type = "image_album") {
    const recipe = state.recipes.find((row) => row.outputType === type) || state.recipes[0];
    if (!recipe) return;
    openSheet(`
      <header class="economy-compose-head"><div><small>${escapeHtml(et("composeEyebrow"))}</small><h2>${escapeHtml(et("composeTitle"))}</h2></div><button type="button" class="economy-icon-button" data-economy-sheet-close aria-label="${escapeHtml(et("close"))}"><i data-lucide="x"></i></button></header>
      <div class="economy-compose-types">
        ${Object.entries(workTypes()).map(([id, item]) => `<button type="button" data-economy-compose-type="${id}" class="${recipe.outputType === id ? "is-active" : ""}"><i data-lucide="${item.icon}"></i><span><strong>${item.label}</strong><small>${id === "image_album" ? et("imageAlbumHint") : et("storyHint")}</small></span></button>`).join("")}
      </div>
      <form data-economy-compose-form data-recipe-id="${escapeHtml(recipe.recipeId)}">
        <label class="economy-field"><span>${escapeHtml(et("workName"))}</span><input name="title" maxlength="80" required placeholder="${escapeHtml(et("workNamePlaceholder"))}" /></label>
        <label class="economy-field"><span>${escapeHtml(et("briefLabel"))}</span><textarea name="brief" rows="4" maxlength="1200" required placeholder="${escapeHtml(et("briefPlaceholder"))}"></textarea></label>
        <p class="economy-media-spec"><i data-lucide="ratio"></i><span>${escapeHtml(et("mediaSpecNote", { label: MARKET_MEDIA.coverLabel }))}</span></p>
        <div class="economy-commission-note"><span class="economy-creator-avatar">${escapeHtml(state.companionName.slice(0, 1))}</span><p><strong>${escapeHtml(et("commissionTitle", { name: state.companionName }))}</strong><small>${escapeHtml(et("commissionBody"))}</small></p></div>
        <button type="submit" class="economy-primary">${escapeHtml(et("commissionSubmit", { price: coin(recipe.nyraCoinCost) }))}</button>
      </form>`);
  }

  function openListing(objectId) {
    const asset = state.assets.find((item) => item.object?.objectId === objectId);
    if (!asset?.object || !workTypes()[asset.object.artifactType]) return;
    openSheet(`<header class="economy-compose-head"><div><small>${escapeHtml(et("publishEyebrow"))}</small><h2>${escapeHtml(asset.object.title)}</h2></div><button type="button" class="economy-icon-button" data-economy-sheet-close><i data-lucide="x"></i></button></header><form data-economy-list-form data-object-id="${escapeHtml(objectId)}"><label class="economy-field"><span>${escapeHtml(et("price"))}</span><input name="price" type="number" min="1" max="999" value="8" required inputmode="numeric" /></label><label class="economy-field"><span>${escapeHtml(et("workIntro"))}</span><textarea name="description" rows="3" maxlength="300">${escapeHtml(asset.object.abstract || "")}</textarea></label><button type="submit" class="economy-primary">${escapeHtml(et("listToMarket"))}</button></form>`);
  }

  root.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("[data-economy-sheet-close]")) { closeSheet(); return; }
    if (target.closest("[data-economy-refresh], [data-economy-retry]")) { void refresh(); return; }
    const tab = target.closest("[data-economy-tab]")?.getAttribute("data-economy-tab");
    if (tab) { state.tab = tab; draw(); return; }
    const type = target.closest("[data-economy-kind]")?.getAttribute("data-economy-kind");
    if (type) { state.marketType = type; draw(); return; }
    const buyId = target.closest("[data-economy-buy]")?.getAttribute("data-economy-buy");
    if (buyId) { event.preventDefault(); event.stopPropagation(); openPurchase(buyId); return; }
    const openId = target.closest("[data-economy-open]")?.getAttribute("data-economy-open");
    if (openId) { openPurchase(openId); return; }
    const ownedId = target.closest("[data-economy-owned]")?.getAttribute("data-economy-owned");
    if (ownedId) { openOwned(ownedId); return; }
    const compose = target.closest("[data-economy-compose]");
    if (compose) { openComposeChooser(); return; }
    const composeType = target.closest("[data-economy-compose-type]")?.getAttribute("data-economy-compose-type");
    if (composeType) { openComposeChooser(composeType); return; }
    const listObject = target.closest("[data-economy-list]")?.getAttribute("data-economy-list");
    if (listObject) { openListing(listObject); return; }
    const favorite = target.closest("[data-economy-favorite]");
    if (favorite) {
      const listingId = favorite.getAttribute("data-economy-favorite");
      if (state.favoriteKeys.has(listingId)) state.favoriteKeys.delete(listingId);
      else state.favoriteKeys.add(listingId);
      saveFavoriteKeys(state.favoriteKeys);
      openPurchase(listingId);
      return;
    }
    const confirmBuy = target.closest("[data-economy-confirm-buy]");
    if (confirmBuy) {
      const listingId = confirmBuy.getAttribute("data-economy-confirm-buy");
      const listing = state.marketplace.find((item) => item.listingId === listingId);
      if (!listing) return;
      confirmBuy.disabled = true;
      confirmBuy.textContent = et("unlocking");
      try {
        if (listing.official && listing.productId) {
          await purchaseOfficialProduct({ productId: listing.productId, productTitle: listing.title, product: listing.product, companionId: getActiveCharacterId(), companionName: state.companionName, idempotencyKey: requestKey("work-purchase") });
        } else {
          await purchaseEconomyListing({ listingId, buyerActorId: state.userActorId, idempotencyKey: requestKey("work-purchase") });
        }
        state.favoriteKeys.add(listingId);
        saveFavoriteKeys(state.favoriteKeys);
        await refresh();
        openPurchase(listingId);
        toast(et("purchaseDone"));
      } catch (error) {
        confirmBuy.disabled = false;
        confirmBuy.textContent = et("buyAndFavorite", { price: coin(listing.price) });
        toast(error?.code === "insufficient_balance" ? et("insufficientCoins") : et("purchaseFailed"), true);
      }
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.matches("[data-economy-compose-form]")) {
      event.preventDefault();
      const title = String(form.elements.title.value || "").trim();
      const brief = String(form.elements.brief.value || "").trim();
      const recipe = state.recipes.find((row) => row.recipeId === form.dataset.recipeId);
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = et("commissioning");
      try {
        await createEconomyIntent({ actorId: state.companionActorId, intentType: "creative", desire: `${title}：${brief}`, motivation: "用户从数字市场发起创作", priority: 0.82, persistence: 0.9, recipeId: recipe?.recipeId || "", budgetReserved: Number(recipe?.nyraCoinCost) || 0, expectedNextTrigger: "worker_next_tick" });
        closeSheet();
        toast(et("commissioned", { name: state.companionName }));
        await refresh();
      } catch (error) {
        submit.disabled = false;
        submit.textContent = et("commissionSubmit", { price: coin(recipe?.nyraCoinCost) });
        toast(error?.code === "insufficient_balance" ? et("companionInsufficient") : et("commissionFailed"), true);
      }
      return;
    }
    if (form.matches("[data-economy-list-form]")) {
      event.preventDefault();
      const objectId = form.dataset.objectId;
      const asset = state.assets.find((item) => item.object?.objectId === objectId);
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await createEconomyListing({ sellerActorId: state.userActorId, generativeObjectId: objectId, title: asset?.object?.title || et("work"), description: form.elements.description.value, kind: "artifact", price: Number(form.elements.price.value), license: "private_use", idempotencyKey: requestKey("work-listing") });
        closeSheet();
        toast(et("listed"));
        await refresh();
      } catch {
        submit.disabled = false;
        toast(et("listFailed"), true);
      }
    }
  });

  document.addEventListener("yueqi:economy-open", () => { deps.setPanel?.("economy"); void refresh(); });
  document.addEventListener("yueqi:economy-open-product", async (event) => {
    const productId = String(event?.detail?.productId || "").trim();
    deps.setPanel?.("economy");
    await refresh();
    const listing = state.marketplace.find((item) => item.productId === productId);
    if (listing) openWork(listing);
  });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest('[data-tab="economy"], [data-drawer-nav="economy"]')) window.setTimeout(() => void refresh(), 0);
  });
  document.addEventListener("yueqi:wallet-changed", () => { if (document.body.dataset.activePanel === "economy") void refresh(); });
  return { refresh, open: () => { deps.setPanel?.("economy"); return refresh(); } };
}
