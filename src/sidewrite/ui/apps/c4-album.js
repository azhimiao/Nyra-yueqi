import { escapeHtml } from "../../../lib/utils.js";
import { refreshIcons } from "../../../lib/icons.js";
import { recordSidewriteEvent, startDwellTimer } from "../../projection.js";
import { generateAppPayload } from "../../generate/runner.js";

/**
 * C4 相册 — albums → grid → lightbox
 */
export function mountC4Album(root, ctx) {
  if (!root) return { destroy() {}, showList() {}, showDetail() {} };

  let payload = ctx.payload || { albums: [], itemsByAlbum: {} };
  let status = ctx.status || "empty";
  let listScroll = 0;
  let albumId = "";
  let cancelDwell = null;
  let busy = false;
  /** @type {"albums"|"grid"|"lightbox"} */
  let view = "albums";
  let photoId = "";

  function stopDwell() {
    cancelDwell?.();
    cancelDwell = null;
  }

  async function onGenerate() {
    if (busy) return;
    busy = true;
    status = "generating";
    paint();
    try {
      const result = await generateAppPayload(ctx.characterId, "c4", {
        character: ctx.character,
        collectProviderConfig: ctx.collectProviderConfig,
        useFixtureIfNoProvider: true,
      });
      payload = result.payload || payload;
      status = result.ok ? "ready" : "failed";
      ctx.onPayloadChange?.(payload, status);
    } finally {
      busy = false;
      paint();
    }
  }

  function emptyHtml(failed = false) {
    return `
      <div class="ta-empty ta-empty--soft">
        <div class="ta-empty__wash" aria-hidden="true"></div>
        <strong>${failed ? "暂时打不开" : "今天还没有更新"}</strong>
        <p>过一会儿再来看看ta留下的痕迹。</p>
      </div>
    `;
  }

  function paintAlbums() {
    const albums = payload.albums || [];
    return !albums.length
      ? emptyHtml(status === "failed")
      : `<div class="ta-album-grid">${albums.map((a) => `
          <button type="button" class="ta-album-card" data-ta-album="${escapeHtml(a.id)}">
            <span class="ta-album-cover" data-tone="coral"><em>${escapeHtml(a.coverHint || "📷")}</em><i>${a.count || 0}</i></span>
            <strong>${escapeHtml(a.title)}</strong>
          </button>
        `).join("")}</div>`;
  }

  function paintGrid() {
    const album = (payload.albums || []).find((a) => a.id === albumId);
    const items = payload.itemsByAlbum?.[albumId] || [];
    if (!items.length) {
      return `<div class="ta-empty"><strong>这个相册还没有照片</strong></div>`;
    }
    return `<div class="ta-photo-grid">${items.map((p) => `
      <button type="button" class="ta-photo-tile" data-ta-photo="${escapeHtml(p.id)}" data-tone="${escapeHtml(p.placeholder?.tone || "mint")}">
        <em>${escapeHtml(p.placeholder?.label || "图")}</em>
      </button>
    `).join("")}</div>`;
  }

  function paintLightbox() {
    const items = payload.itemsByAlbum?.[albumId] || [];
    const photo = items.find((p) => p.id === photoId) || items[0];
    if (!photo) return `<div class="ta-empty"><strong>找不到这张照片</strong></div>`;
    return `
      <div class="ta-lightbox">
        <div class="ta-lightbox__stage" data-tone="${escapeHtml(photo.placeholder?.tone || "mint")}">
          <em>${escapeHtml(photo.placeholder?.label || "图")}</em>
        </div>
        <p class="ta-lightbox__caption">${escapeHtml(photo.caption || "")}</p>
        <p class="ta-lightbox__meta">${escapeHtml(String(photo.takenAt || "").slice(0, 16).replace("T", " "))}${photo.locationHint ? ` · ${escapeHtml(photo.locationHint)}` : ""}</p>
      </div>
    `;
  }

  function paint() {
    stopDwell();
    const title =
      view === "albums" ? "相册"
        : view === "grid" ? ((payload.albums || []).find((a) => a.id === albumId)?.title || "相册")
          : "预览";
    let body = "";
    if (view === "albums") body = paintAlbums();
    else if (view === "grid") body = paintGrid();
    else body = paintLightbox();

    root.innerHTML = `
      <div class="ta-subapp" data-ta-app="c4" data-ta-pane="${view === "albums" ? "list" : "detail"}">
        <header class="ta-sub-appbar">
          <button type="button" class="mini-icon-button" data-ta-nav-back aria-label="返回"><i data-lucide="chevron-left"></i></button>
          <div><strong>${escapeHtml(title)}</strong><span>角色侧相册</span></div>
          <span></span>
        </header>
        ${status === "generating" && view === "albums" ? `<div class="ta-progress" role="status"><i></i><span>正在加载…</span></div>` : ""}
        <div class="ta-sub-scroll" data-ta-scroll>${body}</div>
      </div>
    `;
    refreshIcons();
    const scroll = root.querySelector("[data-ta-scroll]");
    if (scroll && view === "albums") scroll.scrollTop = listScroll;

    if (view === "albums") {
      recordSidewriteEvent({
        characterId: ctx.characterId,
        action: "open_app",
        subApp: "c4",
        summary: `用户打开了${ctx.character?.name || "TA"}的相册`,
      });
    } else if (view === "grid") {
      const album = (payload.albums || []).find((a) => a.id === albumId);
      recordSidewriteEvent({
        characterId: ctx.characterId,
        action: "view_album",
        subApp: "c4",
        targetId: albumId,
        targetTitle: album?.title || "",
        summary: `用户查看了相册「${album?.title || ""}」`,
      });
      cancelDwell = startDwellTimer({
        characterId: ctx.characterId,
        subApp: "c4",
        targetId: albumId,
        targetTitle: album?.title,
        summary: `用户在相册「${album?.title || ""}」停留了一会儿`,
      });
    }
  }

  const onClick = (event) => {
    if (event.target.closest("[data-ta-generate]")) {
      onGenerate();
      return;
    }
    if (event.target.closest("[data-ta-nav-back]")) {
      if (view === "lightbox") {
        view = "grid";
        paint();
        return;
      }
      if (view === "grid") {
        view = "albums";
        ctx.onBack?.(listScroll);
        paint();
        return;
      }
      ctx.onBackToDesktop?.();
      return;
    }
    const aid = event.target.closest("[data-ta-album]")?.dataset.taAlbum;
    if (aid) {
      const scroll = root.querySelector("[data-ta-scroll]");
      listScroll = scroll?.scrollTop || 0;
      albumId = aid;
      view = "grid";
      ctx.onOpenDetail?.(aid, listScroll);
      paint();
      return;
    }
    const pid = event.target.closest("[data-ta-photo]")?.dataset.taPhoto;
    if (pid) {
      photoId = pid;
      view = "lightbox";
      paint();
    }
  };
  root.addEventListener("click", onClick);

  return {
    showList(nextPayload, nextStatus, scrollTop = 0) {
      if (nextPayload) payload = nextPayload;
      if (nextStatus) status = nextStatus;
      listScroll = scrollTop;
      view = "albums";
      albumId = "";
      paint();
    },
    showDetail(id) {
      albumId = id;
      view = "grid";
      paint();
    },
    destroy() {
      stopDwell();
      root.removeEventListener("click", onClick);
    },
  };
}
