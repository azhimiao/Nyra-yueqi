/**
 * Phone gallery: group list → photos in group → lightbox.
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { isGallerySafePhotoUrl } from "./phone-data.js";
import { pt } from "./i18n.js";
import { openNyraConfirmSheet, openNyraInputSheet } from "../ui/nyra-overlay.js";

const TONES = ["rose", "green", "blue", "gold"];

function safePhotoUrl(url) {
  return isGallerySafePhotoUrl(url) ? String(url).trim() : "";
}

function toneForName(name = "") {
  let hash = 0;
  for (const ch of String(name)) hash = (hash + ch.charCodeAt(0) * 17) % TONES.length;
  return TONES[hash] || "rose";
}

export function mountPhoneGallery(root, {
  listGroups,
  listPhotosInGroup,
  createGroup,
  renameGroup,
  deleteGroup,
  addPhotosToGroup,
  removePhoto,
  markIdentityQa,
  onHome,
} = {}) {
  if (!root) return { destroy() {}, open() {}, refresh() {}, openToMediaId() {} };

  const groupsEl = root.querySelector("[data-phone-album-stacks]");
  const gridEl = root.querySelector("[data-phone-album-grid]");
  const titleEl = root.querySelector("[data-gallery-title]");
  const actionBtn = root.querySelector("[data-gallery-action]");
  const lightbox = root.querySelector("[data-phone-album-lightbox]");
  const lightboxImg = root.querySelector("[data-lightbox-img]");
  const lightboxDots = root.querySelector("[data-lightbox-dots]");
  const lightboxQa = root.querySelector("[data-lightbox-qa]");
  const paneGroups = root.querySelector('[data-gallery-pane="stacks"]');
  const paneGrid = root.querySelector('[data-gallery-pane="grid"]');
  const fileInput = root.querySelector("[data-gallery-file]");

  let groups = [];
  let currentGroupId = "";
  let currentPhotos = [];
  let lightboxIndex = 0;
  let startX = 0;
  let tracking = false;
  let busy = false;

  function setPane(name) {
    if (paneGroups) paneGroups.hidden = name !== "stacks";
    if (paneGrid) paneGrid.hidden = name !== "grid";
    const group = groups.find((item) => item.id === currentGroupId);
    if (titleEl) {
      titleEl.textContent = name === "grid" && group ? group.name : pt("gallery.myGroups");
    }
    const backBtn = root.querySelector("[data-gallery-back]");
    if (backBtn) {
      const isPhoneScreen = root.hasAttribute("data-phone-screen");
      backBtn.hidden = isPhoneScreen ? false : name !== "grid";
    }
    if (actionBtn) {
      const virtual = Boolean(group?.virtual) || currentGroupId === "pg-visual-relationship";
      actionBtn.hidden = name === "grid" && virtual;
      actionBtn.dataset.galleryAction = name === "grid" ? "add-photos" : "add-group";
      const addPhotos = pt("gallery.addPhotos");
      const addGroup = pt("gallery.addGroup");
      actionBtn.setAttribute("aria-label", name === "grid" ? addPhotos : addGroup);
      const isPhoneScreen = root.hasAttribute("data-phone-screen");
      const label = name === "grid" ? addPhotos : addGroup;
      const icon = name === "grid" ? "image-plus" : "folder-plus";
      actionBtn.innerHTML = isPhoneScreen
        ? `<i data-lucide="${icon}"></i>`
        : `<i data-lucide="${icon}"></i><span class="icon-fallback">+</span><span>${escapeHtml(label)}</span>`;
      refreshIcons();
    }
  }

  function closeLightbox() {
    if (lightbox) lightbox.hidden = true;
    root.classList.remove("is-lightbox");
    const backBtn = root.querySelector("[data-gallery-back]");
    if (backBtn && !root.hasAttribute("data-phone-screen")) {
      backBtn.hidden = !currentGroupId;
    }
  }

  function openLightbox(index) {
    if (!currentPhotos.length) return;
    lightboxIndex = Math.max(0, Math.min(currentPhotos.length - 1, index));
    const photo = currentPhotos[lightboxIndex];
    const url = safePhotoUrl(photo.url);
    if (lightboxImg) {
      if (url) {
        lightboxImg.hidden = false;
        lightboxImg.src = url;
      } else {
        lightboxImg.hidden = true;
        lightboxImg.removeAttribute("src");
      }
    }
    if (lightboxDots) {
      lightboxDots.innerHTML = currentPhotos.map((_, i) => `
        <i class="${i === lightboxIndex ? "is-on" : ""}"></i>
      `).join("");
    }
    if (lightboxQa) {
      const isIdentity = currentGroupId === "pg-visual-identity";
      lightboxQa.hidden = !isIdentity || !markIdentityQa;
    }
    if (lightbox) lightbox.hidden = false;
    root.classList.add("is-lightbox");
  }

  function coverUrls(group) {
    return (group.photos || [])
      .map((photo) => safePhotoUrl(photo.url))
      .filter(Boolean)
      .slice(0, 3);
  }

  function renderGroups() {
    if (!groupsEl) return;
    root.classList.toggle("is-empty", !groups.length);
    if (!groups.length) {
      groupsEl.innerHTML = `
        <div class="nyra-empty mini-album-empty">
          <span class="nyra-empty__icon" aria-hidden="true"><i data-lucide="images"></i></span>
          <strong class="nyra-empty__title">${escapeHtml(pt("gallery.emptyTitle"))}</strong>
          <p class="nyra-empty__body">${escapeHtml(pt("gallery.emptyBody"))}</p>
          <button type="button" class="nyra-empty__action mini-album-empty__btn" data-gallery-create-group>${escapeHtml(pt("gallery.createGroup"))}</button>
        </div>
      `;
      refreshIcons(root);
      return;
    }
    groupsEl.innerHTML = groups.map((group, stackIndex) => {
      const fan = coverUrls(group);
      const count = group.photos?.length || group.count || 0;
      const locked = Boolean(group.locked || group.virtual);
      const required = Boolean(group.required) || group.id === "pg-visual-identity" || group.semantic === "identity";
      const metaLine = required && count === 0
        ? pt("gallery.requiredHint")
        : pt("gallery.photosCount", { n: count });
      return `
        <article class="mini-album-stack-card${required ? " is-required" : ""}" style="--stack-i:${stackIndex}">
          <button type="button" class="mini-album-stack" data-album-key="${escapeHtml(group.id)}">
            <div class="mini-album-stack__fan" aria-hidden="true">
              ${fan.length ? fan.map((url, i) => `
                <img src="${escapeHtml(url)}" alt="" style="--fan-i:${i}" />
              `).join("") : `
                <span class="mini-album-stack__placeholder"><i data-lucide="images"></i></span>
              `}
            </div>
            <div class="mini-album-stack__meta">
              <strong>
                ${escapeHtml(group.name)}
                ${required ? `<em class="mini-album-stack__need">${escapeHtml(pt("gallery.required"))}</em>` : ""}
              </strong>
              <span>${escapeHtml(metaLine)}</span>
            </div>
          </button>
          ${locked ? "" : `
          <div class="mini-album-stack__actions">
            <button type="button" data-rename-group="${escapeHtml(group.id)}">${escapeHtml(pt("gallery.rename"))}</button>
            <button type="button" data-delete-group="${escapeHtml(group.id)}">${escapeHtml(pt("gallery.delete"))}</button>
          </div>`}
        </article>
      `;
    }).join("");
    refreshIcons();
  }

  function renderGrid() {
    if (!gridEl) return;
    const cells = currentPhotos.map((photo, index) => {
      const url = safePhotoUrl(photo.url);
      return `
      <button type="button" class="mini-album-cell ${url ? "" : "is-missing"}" data-photo-index="${index}">
        ${url
          ? `<img src="${escapeHtml(url)}" alt="" />`
          : `<span class="mini-album-cell__missing"><i data-lucide="image-off"></i></span>`}
      </button>
    `;
    }).join("");
    gridEl.innerHTML = `
      ${cells}
      ${currentGroupId === "pg-visual-relationship" ? "" : `
      <button type="button" class="mini-album-cell mini-album-cell--add" data-gallery-add-photos>
        <i data-lucide="plus"></i>
        <span>${escapeHtml(pt("gallery.addPhotos"))}</span>
      </button>`}
    `;
    refreshIcons();
  }

  async function loadGroups() {
    const raw = await Promise.resolve(listGroups?.() || []);
    groups = Array.isArray(raw) ? raw : [];
  }

  async function openGroup(groupId) {
    currentGroupId = groupId;
    currentPhotos = await Promise.resolve(listPhotosInGroup?.(groupId) || []);
    if (!Array.isArray(currentPhotos)) currentPhotos = [];
    setPane("grid");
    closeLightbox();
    renderGrid();
  }

  async function refresh() {
    currentGroupId = "";
    currentPhotos = [];
    await loadGroups();
    setPane("stacks");
    closeLightbox();
    renderGroups();
  }

  async function handleCreateGroup() {
    const name = await openNyraInputSheet({
      title: pt("gallery.promptGroupName"),
      placeholder: pt("gallery.defaultGroupName"),
      defaultValue: pt("gallery.defaultGroupName"),
      confirmLabel: pt("gallery.createGroup"),
      cancelLabel: pt("screens.cancel"),
      maxLength: 24,
    });
    if (name == null) return;
    const trimmed = String(name).trim().slice(0, 24);
    if (!trimmed) return;
    await Promise.resolve(createGroup?.(trimmed));
    await refresh();
  }

  async function handleRenameGroup(id) {
    const group = groups.find((item) => item.id === id);
    const name = await openNyraInputSheet({
      title: pt("gallery.promptRename"),
      defaultValue: group?.name || "",
      confirmLabel: pt("screens.confirm"),
      cancelLabel: pt("screens.cancel"),
      maxLength: 24,
    });
    if (name == null) return;
    const trimmed = String(name).trim().slice(0, 24);
    if (!trimmed) return;
    await Promise.resolve(renameGroup?.(id, trimmed));
    await loadGroups();
    if (currentGroupId === id) setPane("grid");
    renderGroups();
    if (currentGroupId === id) {
      const next = groups.find((item) => item.id === id);
      if (titleEl && next) titleEl.textContent = next.name;
    }
  }

  async function handleDeleteGroup(id) {
    const group = groups.find((item) => item.id === id);
    const ok = await openNyraConfirmSheet({
      title: pt("gallery.deleteGroupTitle"),
      body: pt("gallery.confirmDelete", { name: group?.name || "" }),
      confirmLabel: pt("gallery.delete"),
      cancelLabel: pt("screens.cancel"),
      danger: true,
    });
    if (!ok) return;
    await Promise.resolve(deleteGroup?.(id));
    if (currentGroupId === id) {
      currentGroupId = "";
      currentPhotos = [];
      setPane("stacks");
    }
    await loadGroups();
    renderGroups();
  }

  function pickPhotos() {
    if (!currentGroupId) return;
    fileInput?.click();
  }

  async function onFilesSelected(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || !currentGroupId || busy) return;
    busy = true;
    try {
      await Promise.resolve(addPhotosToGroup?.(currentGroupId, files));
      await openGroup(currentGroupId);
      await loadGroups();
    } finally {
      busy = false;
    }
  }

  async function onClick(event) {
    if (event.target.closest("[data-lightbox-close]")) {
      closeLightbox();
      return;
    }
    const qaStatus = event.target.closest("[data-identity-qa]")?.dataset.identityQa;
    if (qaStatus && markIdentityQa) {
      const photo = currentPhotos[lightboxIndex];
      if (photo?.mediaId) {
        await Promise.resolve(markIdentityQa(photo.mediaId, qaStatus));
      }
      return;
    }
    if (event.target.closest("[data-gallery-back]")) {
      if (!lightbox?.hidden) {
        closeLightbox();
        return;
      }
      if (currentGroupId) {
        currentGroupId = "";
        currentPhotos = [];
        setPane("stacks");
        await loadGroups();
        renderGroups();
        return;
      }
      if (root.hasAttribute("data-phone-screen")) onHome?.();
      return;
    }
    if (event.target.closest("[data-gallery-action='add-group'], [data-gallery-create-group]")) {
      await handleCreateGroup();
      return;
    }
    if (event.target.closest("[data-gallery-action='add-photos'], [data-gallery-add-photos]")) {
      pickPhotos();
      return;
    }
    const renameId = event.target.closest("[data-rename-group]")?.dataset.renameGroup;
    if (renameId) {
      await handleRenameGroup(renameId);
      return;
    }
    const deleteId = event.target.closest("[data-delete-group]")?.dataset.deleteGroup;
    if (deleteId) {
      await handleDeleteGroup(deleteId);
      return;
    }
    const albumKey = event.target.closest("[data-album-key]")?.dataset.albumKey;
    if (albumKey) {
      await openGroup(albumKey);
      return;
    }
    const photoIndex = event.target.closest("[data-photo-index]")?.dataset.photoIndex;
    if (photoIndex != null) {
      openLightbox(Number(photoIndex));
    }
  }

  function onPointerDown(event) {
    if (lightbox?.hidden) return;
    tracking = true;
    startX = event.clientX;
  }

  function onPointerUp(event) {
    if (!tracking || lightbox?.hidden) return;
    tracking = false;
    const dx = event.clientX - startX;
    if (dx > 40) openLightbox(lightboxIndex - 1);
    else if (dx < -40) openLightbox(lightboxIndex + 1);
  }

  async function openToMediaId(mediaId) {
    const id = String(mediaId || "").trim();
    if (!id) {
      await refresh();
      return;
    }
    await loadGroups();
    for (const group of groups) {
      const photos = await Promise.resolve(listPhotosInGroup?.(group.id) || []);
      if (!Array.isArray(photos)) continue;
      const index = photos.findIndex((photo) => (
        String(photo.mediaId || "") === id || String(photo.id || "") === id
      ));
      if (index >= 0) {
        await openGroup(group.id);
        openLightbox(index);
        return;
      }
    }
    await refresh();
  }

  root.addEventListener("click", onClick);
  fileInput?.addEventListener("change", onFilesSelected);
  lightbox?.addEventListener("pointerdown", onPointerDown);
  lightbox?.addEventListener("pointerup", onPointerUp);

  return {
    open: refresh,
    refresh,
    openToMediaId,
    destroy() {
      root.removeEventListener("click", onClick);
      fileInput?.removeEventListener("change", onFilesSelected);
      lightbox?.removeEventListener("pointerdown", onPointerDown);
      lightbox?.removeEventListener("pointerup", onPointerUp);
    },
  };
}

export { toneForName };
