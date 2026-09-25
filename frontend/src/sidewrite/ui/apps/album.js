import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { projectAlbumVm, projectAlbumItemDetail } from "../../../life/projections.js";
import { observeEvidence } from "../../daypack-access.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { crossLinksHtml, formatShortTime, photoStyle, softEmptyHtml } from "../shared.js";

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 */
export function mountAlbumApp(root, ctx) {
  if (!root) return { destroy() {}, showList() {}, showDetail() {} };

  let listScroll = 0;
  let view = "albums"; // albums | photos | detail
  let activeAlbumId = "";
  let cancelDwell = null;

  function stopDwell() {
    cancelDwell?.();
    cancelDwell = null;
  }

  function pack() {
    return ctx.getPack?.() || null;
  }

  function paintAlbums() {
    stopDwell();
    view = "albums";
    const vm = projectAlbumVm(pack(), { readIds: ctx.getReadIds?.() || new Set() });
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="album" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>相册</strong><span>${vm.albums.length} 个相册 · ${vm.count} 张</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          ${!vm.albums.length
            ? softEmptyHtml({ title: "还没有照片", body: "ta今天还没留下影像。" })
            : `<div class="ta-album-grid">${vm.albums.map((a) => `
              <button type="button" class="ta-album-card" data-ta-album="${escapeHtml(a.id)}">
                <span class="ta-album-cover" style="${photoStyle(a.coverAsset)}"></span>
                <strong>${escapeHtml(a.title)}</strong>
                <em class="ta-album-count">${a.count} 张</em>
              </button>
            `).join("")}</div>`}
        </div>
      </div>
    `;
    refreshIcons();
    const scroll = root.querySelector("[data-ta-scroll]");
    if (scroll) scroll.scrollTop = listScroll;
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "open_app",
      subApp: "album",
      summary: `用户打开了${ctx.character?.name || "TA"}的相册`,
    });
  }

  function paintAlbumPhotos(albumId) {
    stopDwell();
    view = "photos";
    activeAlbumId = albumId;
    const vm = projectAlbumVm(pack(), { readIds: ctx.getReadIds?.() || new Set() });
    const album = vm.albums.find((a) => a.id === albumId);
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="album" data-ta-pane="list">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>${escapeHtml(album?.title || "相册")}</strong><span>${album?.count || 0} 张</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          <div class="ta-photo-grid">
            ${(album?.items || []).map((p) => `
              <button type="button" class="ta-photo-tile ta-photo-tile--img" style="${photoStyle(p.assetRef)}" data-ta-photo="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)}"></button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    refreshIcons();
  }

  function paintDetail(photoId) {
    stopDwell();
    view = "detail";
    const dayPack = pack();
    const detail = projectAlbumItemDetail(dayPack, photoId);
    const item = detail?.item;
    if (item && dayPack) {
      observeEvidence({
        characterId: ctx.characterId,
        dayPackId: dayPack.id,
        evidenceId: item.id,
        dwellMs: 0,
        discoverable: item.discoverable,
      });
      ctx.onObserved?.();
    }
    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="album" data-ta-pane="detail">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>${escapeHtml(item?.title || "照片")}</strong><span>${escapeHtml(formatShortTime(item?.occurredAt))}</span></div>
          <span></span>
        </header>
        <div class="ta-sub-scroll" data-ta-scroll>
          <div class="ta-lightbox__stage ta-lightbox__stage--img" style="${photoStyle(item?.assetRef)}"></div>
          <p class="ta-lightbox__caption">${escapeHtml(item?.caption || "")}</p>
          <p class="ta-lightbox__meta">${escapeHtml([item?.location, formatShortTime(item?.occurredAt)].filter(Boolean).join(" · "))}</p>
          ${crossLinksHtml(detail?.linked || [])}
        </div>
      </div>
    `;
    refreshIcons();
    recordSidewriteEvent({
      characterId: ctx.characterId,
      action: "view_photo",
      subApp: "album",
      targetId: photoId,
      targetTitle: item?.title || "",
      summary: `用户查看了照片「${item?.title || ""}」`,
    });
    cancelDwell = startDwellTimer({
      characterId: ctx.characterId,
      subApp: "album",
      targetId: photoId,
      targetTitle: item?.title,
      summary: `用户在照片「${item?.title || ""}」停留了一会儿`,
    });
  }

  const onClick = (event) => {
    const cross = event.target.closest("[data-ta-cross-app]");
    if (cross) {
      ctx.onCrossLink?.(cross.dataset.taCrossApp, cross.dataset.taCrossId);
      return;
    }
    if (event.target.closest("[data-ta-nav-back]")) {
      if (view === "detail") {
        if (activeAlbumId) paintAlbumPhotos(activeAlbumId);
        else ctx.onBack?.(0);
      } else if (view === "photos") {
        paintAlbums();
      } else {
        ctx.onBackToDesktop?.();
      }
      return;
    }
    const albumId = event.target.closest("[data-ta-album]")?.dataset.taAlbum;
    if (albumId) {
      listScroll = root.querySelector("[data-ta-scroll]")?.scrollTop || 0;
      paintAlbumPhotos(albumId);
      return;
    }
    const photoId = event.target.closest("[data-ta-photo]")?.dataset.taPhoto;
    if (photoId) {
      ctx.onOpenDetail?.(photoId, listScroll);
    }
  };
  root.addEventListener("click", onClick);

  return {
    showList(_p, _s, scrollTop = 0) {
      listScroll = scrollTop;
      // If detailId looks like album-* container, show photos; else albums
      paintAlbums();
    },
    showDetail(id) {
      const dayPack = pack();
      const isAlbum = (dayPack?.evidence || []).some((e) => e.id === id && e.kind === "album");
      if (isAlbum) {
        paintAlbumPhotos(id);
        return;
      }
      // If photo, find its album for back nav
      const vm = projectAlbumVm(dayPack);
      const album = vm.albums.find((a) => a.items.some((p) => p.id === id));
      activeAlbumId = album?.id || "";
      paintDetail(id);
    },
    destroy() {
      stopDwell();
      root.removeEventListener("click", onClick);
    },
  };
}
