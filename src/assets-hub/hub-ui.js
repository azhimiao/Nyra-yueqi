/**
 * 资源库 App (F5 / F6).
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { listCharactersSync } from "../characters/store.js";
import { resolveCharacterAvatarUrl } from "../characters/avatar.js";
import { listWorldbookEntries } from "../worldbook/store.js";
import {
  deleteCustomSticker,
  listCustomStickers,
  loadAssetsHubBag,
  touchRecentAsset,
  addStickerFromFile,
} from "./stickers.js";
import { openCharacterImportFlow } from "../characters/import-ui.js";
import { openQijianDraftUi } from "../qijian/qijian-ui.js";
import { t } from "../i18n/index.js";

/**
 * @param {HTMLElement} root
 * @param {{
 *   onToast?: (msg: string) => void,
 *   onOpenSettings?: (route: string) => void,
 *   onOpenApp?: (id: string) => void,
 *   collectLibraryState?: () => { books?: object[] },
 *   getEditingCharacterId?: () => string,
 *   onCharacterImported?: (c: object) => void,
 * }} [deps]
 */
export function mountAssetsHub(root, deps = {}) {
  if (!root) return { destroy() {}, open() {}, refresh() {} };

  let view = "home";
  let search = "";
  let stickerMode = false;

  function counts() {
    const characters = listCharactersSync();
    const books = deps.collectLibraryState?.()?.books || [];
    const stickers = listCustomStickers();
    return {
      characters,
      books,
      stickers,
      worldbookCount: 0,
    };
  }

  async function render() {
    const bag = loadAssetsHubBag();
    const c = counts();
    let worldbook = [];
    try {
      worldbook = await listWorldbookEntries();
    } catch {
      worldbook = [];
    }
    const q = search.trim().toLowerCase();
    const showSection = (title) => !q || title.toLowerCase().includes(q) || title.includes(search.trim());

    if (view === "stickers" || stickerMode) {
      root.innerHTML = renderStickersView();
      wireCommon();
      refreshIcons();
      return;
    }

    root.innerHTML = `
      <div class="assets-hub">
        <header class="assets-hub__top">
          <div>
            <p class="assets-hub__brand">${t("assetsHub.brand")}</p>
            <h1>${t("assetsHub.title")}</h1>
          </div>
          <div class="assets-hub__top-actions">
            <button type="button" class="ghost-action" data-assets-import aria-label="${t("assetsHub.import")}">${t("assetsHub.import")}</button>
          </div>
        </header>
        <label class="assets-hub__search">
          <span class="visually-hidden">${t("assetsHub.search")}</span>
          <input type="search" placeholder="${t("assetsHub.searchPlaceholder")}" data-assets-search value="${escapeHtml(search)}" />
        </label>
        <div class="assets-hub__grid">
          ${
            showSection(t("assetsHub.characters"))
              ? sectionCard(t("assetsHub.characters"), c.characters.length, () => {
                  const recent = c.characters.slice(-3).reverse();
                  return recent.length
                    ? `<div class="assets-hub__avatars">${recent
                        .map(
                          (ch) =>
                            `<span class="assets-hub__avatar" title="${escapeHtml(ch.name)}">${
                              resolveCharacterAvatarUrl(ch)
                                ? `<img src="${escapeHtml(resolveCharacterAvatarUrl(ch))}" alt="" />`
                                : escapeHtml((ch.name || "?").slice(0, 1))
                            }</span>`,
                        )
                        .join("")}</div>`
                    : `<p class="assets-hub__empty">${t("assetsHub.noCharacters")} <button type="button" data-import-char>${t("assetsHub.importAction")}</button></p>`;
                }, "characters")
              : ""
          }
          ${
            showSection(t("assetsHub.worldbook"))
              ? sectionCard(
                  t("assetsHub.worldbook"),
                  worldbook.length,
                  () => {
                    const titles = worldbook.slice(0, 3).map((e) => e.title).filter(Boolean);
                    return titles.length
                      ? `<ul class="assets-hub__titles">${titles.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
                      : `<p class="assets-hub__empty">${t("assetsHub.noWorldbook")} <button type="button" data-open-worldbook>${t("assetsHub.editAction")}</button></p>`;
                  },
                  "worldbook",
                )
              : ""
          }
          ${
            showSection(t("assetsHub.books"))
              ? sectionCard(
                  t("assetsHub.books"),
                  c.books.length,
                  () => {
                    const covers = c.books.slice(0, 3);
                    return covers.length
                      ? `<div class="assets-hub__avatars">${covers
                          .map(
                            (b) =>
                              `<span class="assets-hub__avatar assets-hub__avatar--book">${escapeHtml(
                                (b.title || t("assetsHub.bookFallback")).slice(0, 1),
                              )}</span>`,
                          )
                          .join("")}</div>`
                      : `<p class="assets-hub__empty">${t("assetsHub.noBooks")} <button type="button" data-open-read>${t("assetsHub.importAction")}</button></p>`;
                  },
                  "books",
                )
              : ""
          }
          ${
            showSection(t("assetsHub.stickers"))
              ? sectionCard(
                  t("assetsHub.stickers"),
                  c.stickers.length,
                  () =>
                    c.stickers.length
                      ? `<div class="assets-hub__stickers-preview">${c.stickers
                          .slice(0, 4)
                          .map((s) => `<img src="${escapeHtml(s.url)}" alt="" />`)
                          .join("")}</div>`
                      : `<p class="assets-hub__empty">${t("assetsHub.noStickersPreview")}</p>`,
                  "stickers",
                )
              : ""
          }
        </div>
        <section class="assets-hub__list" data-assets-detail hidden></section>
      </div>
    `;
    wireCommon();
    refreshIcons();
    void bag;
  }

  function sectionCard(title, count, bodyFn, kind) {
    return `
      <article class="assets-hub__card" data-assets-section="${kind}">
        <header>
          <h2>${escapeHtml(title)}</h2>
          <em>${escapeHtml(String(count))}</em>
        </header>
        <div class="assets-hub__card-body">${bodyFn()}</div>
        <button type="button" class="assets-hub__open" data-open-section="${kind}">${t("assetsHub.view")}</button>
      </article>
    `;
  }

  function renderStickersView() {
    const stickers = listCustomStickers();
    return `
      <div class="assets-hub">
        <header class="assets-hub__top">
          <button type="button" class="ghost-action" data-assets-back>${t("assetsHub.back")}</button>
          <h1>${t("assetsHub.myStickers")}</h1>
        </header>
        <ul class="assets-hub__sticker-list">
          ${stickers.length ? stickers.map((s) => `
            <li>
              <span class="assets-hub__sticker-thumb"><img src="${escapeHtml(s.url)}" alt="" /></span>
              <div>
                <strong>${escapeHtml(s.description)}</strong>
                <p class="assets-hub__sticker-url">${escapeHtml(s.url.slice(0, 64))}${s.url.length > 64 ? "…" : ""}</p>
              </div>
              <button type="button" class="ghost-action" data-del-sticker="${escapeHtml(s.id)}">${t("assetsHub.delete")}</button>
            </li>`).join("") : `<li class="assets-hub__empty">${t("assetsHub.noStickers")}</li>`}
        </ul>
        <form class="assets-hub__sticker-form" data-sticker-file-form>
          <h3>${t("assetsHub.addSticker")}</h3>
          <p class="assets-hub__hint">${t("assetsHub.stickerHint")}</p>
          <label><span>${t("assetsHub.image")}</span><input name="file" type="file" accept="image/*" required /></label>
          <label><span>${t("assetsHub.description")}</span><input name="description" required maxlength="80" placeholder="${t("assetsHub.descriptionPlaceholder")}" /></label>
          <button type="submit" class="send-button">${t("assetsHub.add")}</button>
        </form>
      </div>
    `;
  }

  function wireCommon() {
    root.querySelector("[data-assets-search]")?.addEventListener("input", (event) => {
      search = event.target.value || "";
      render();
    });
    root.querySelector("[data-assets-import]")?.addEventListener("click", () => {
      openCharacterImportFlow({
        onToast: deps.onToast,
        onImported: deps.onCharacterImported,
        getEditingCharacterId: deps.getEditingCharacterId,
      });
    });
    root.querySelector("[data-import-char]")?.addEventListener("click", () => {
      openCharacterImportFlow({
        onToast: deps.onToast,
        onImported: deps.onCharacterImported,
        getEditingCharacterId: deps.getEditingCharacterId,
      });
    });
    root.querySelector("[data-open-worldbook]")?.addEventListener("click", () => {
      deps.onOpenSettings?.("worldbook");
    });
    root.querySelector("[data-open-read]")?.addEventListener("click", () => {
      deps.onOpenApp?.("read");
    });
    root.querySelectorAll("[data-open-section]").forEach((btn) => {
      btn.addEventListener("click", () => openSection(btn.getAttribute("data-open-section")));
    });
    root.querySelectorAll("[data-assets-section]").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        openSection(card.getAttribute("data-assets-section"));
      });
    });
    root.querySelector("[data-assets-back]")?.addEventListener("click", () => {
      stickerMode = false;
      view = "home";
      render();
    });
    root.querySelector("[data-sticker-file-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      const file = form.file?.files?.[0];
      const description = String(form.description?.value || "").trim();
      if (!file) {
        deps.onToast?.(t("assetsHub.chooseImage"));
        return;
      }
      if (!description) {
        deps.onToast?.(t("assetsHub.enterDescription"));
        return;
      }
      try {
        await addStickerFromFile(file, description);
        deps.onToast?.(t("assetsHub.stickerAdded"));
        render();
      } catch (error) {
        deps.onToast?.(String(error?.message || t("assetsHub.importFailed")).slice(0, 80));
      }
    });
    root.querySelectorAll("[data-del-sticker]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteCustomSticker(btn.getAttribute("data-del-sticker"));
        render();
      });
    });
  }

  function openSection(kind) {
    if (kind === "stickers") {
      stickerMode = true;
      view = "stickers";
      render();
      return;
    }
    if (kind === "worldbook") {
      deps.onOpenSettings?.("worldbook");
      return;
    }
    if (kind === "books") {
      deps.onOpenApp?.("read");
      return;
    }
    if (kind === "characters") {
      const characters = listCharactersSync();
      const detail = root.querySelector("[data-assets-detail]");
      if (!detail) return;
      detail.hidden = false;
      detail.innerHTML = `
        <h3>${t("assetsHub.characters")}</h3>
        ${
          characters.length
            ? `<ul class="assets-hub__char-list">${characters
                .map(
                  (ch) => `
              <li>
                <strong>${escapeHtml(ch.name)}</strong>
                <div class="assets-hub__char-actions">
                  <button type="button" data-edit-char="${escapeHtml(ch.id)}">${t("assetsHub.edit")}</button>
                  <button type="button" data-qijian-char="${escapeHtml(ch.id)}">${t("assetsHub.polish")}</button>
                </div>
              </li>`,
                )
                .join("")}</ul>`
            : `<p class="assets-hub__empty">${t("assetsHub.noCharacters")}</p>`
        }
        <button type="button" class="send-button" data-import-char>${t("assetsHub.importFromFile")}</button>
      `;
      detail.querySelector("[data-import-char]")?.addEventListener("click", () => {
        openCharacterImportFlow({
          onToast: deps.onToast,
          onImported: (c) => {
            deps.onCharacterImported?.(c);
            render();
          },
          getEditingCharacterId: deps.getEditingCharacterId,
        });
      });
      detail.querySelectorAll("[data-edit-char]").forEach((btn) => {
        btn.addEventListener("click", () => {
          touchRecentAsset("character", btn.getAttribute("data-edit-char"));
          deps.onOpenSettings?.("identity");
          deps.onOpenApp?.("profile");
        });
      });
      detail.querySelectorAll("[data-qijian-char]").forEach((btn) => {
        btn.addEventListener("click", () => {
          openQijianDraftUi({
            characterId: btn.getAttribute("data-qijian-char"),
            onToast: deps.onToast,
          });
        });
      });
    }
  }

  function open() {
    view = "home";
    stickerMode = false;
    render();
  }

  render();
  return {
    open,
    refresh: render,
    destroy() {
      root.innerHTML = "";
    },
  };
}
