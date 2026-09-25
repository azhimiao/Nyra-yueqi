/**
 * Shared composer chrome — Pop bar layout:
 * + (表情/转账/…) · 角色回复 · 输入 · 麦 · 发送
 */

import {
  addStickerFromFile,
  deleteCustomStickers,
  listCustomStickers,
} from "../assets-hub/stickers.js";
import { refreshIcons } from "../lib/icons.js";
import { escapeHtml } from "../lib/utils.js";
import { t } from "../i18n/index.js";

/**
 * @param {object} opts
 * @param {(kind: string) => void} [opts.onPlusAction] — transfer|image|voice|location
 */
export function bindComposerChrome(opts = {}) {
  const {
    plusBtn,
    emojiBtn,
    micBtn,
    holdBtn,
    sendBtn,
    speakBtn,
    textInput,
    plusSheet,
    stickerSheet,
    fileInput,
    form,
    onPickImage,
    onPickSticker,
    onPlusAction,
    onCharacterSpeak,
    onToast,
    hasPendingAttachment,
    getPendingAttachment,
    onClearAttachment,
    ns = "composer",
  } = opts;

  let audioMode = false;
  let manageMode = false;
  let submitLock = false;
  const selectedIds = new Set();
  let attachmentPreviewHost = null;
  let attachmentPreviewKey = "";

  /** Grow to roughly five lines, then scroll inside the pill. */
  const MAX_FIELD_HEIGHT = 132;

  ensureStickerChrome();
  ensureAttachmentPreview();
  syncSendState();

  function ensureAttachmentPreview() {
    if (typeof getPendingAttachment !== "function" || !form?.parentElement) return;
    attachmentPreviewHost = form.parentElement.querySelector("[data-composer-attachment-preview]");
    if (!attachmentPreviewHost) {
      attachmentPreviewHost = document.createElement("div");
      attachmentPreviewHost.className = `${ns}-attachment-preview`;
      attachmentPreviewHost.dataset.composerAttachmentPreview = "";
      attachmentPreviewHost.hidden = true;
      form.parentElement.insertBefore(attachmentPreviewHost, form);
      attachmentPreviewHost.addEventListener("click", (event) => {
        if (!event.target.closest("[data-composer-attachment-remove]")) return;
        event.preventDefault();
        onClearAttachment?.();
        renderAttachmentPreview();
        syncSendState();
      });
    }
  }

  function renderAttachmentPreview() {
    if (!attachmentPreviewHost) return;
    const attachment = getPendingAttachment?.();
    if (!attachment) {
      attachmentPreviewKey = "";
      attachmentPreviewHost.hidden = true;
      attachmentPreviewHost.replaceChildren();
      return;
    }
    const isImage = attachment.type === "image" && attachment.dataUrl;
    const label = String(attachment.name || (isImage ? "图片" : "附件"));
    const nextKey = `${attachment.type}|${label}|${attachment.size || 0}|${attachment.dataUrl || ""}`;
    if (nextKey === attachmentPreviewKey) return;
    attachmentPreviewKey = nextKey;
    const size = Number(attachment.size) > 0
      ? `${(Number(attachment.size) / 1024 / 1024).toFixed(1)} MB`
      : "";
    attachmentPreviewHost.innerHTML = `
      <div class="${ns}-attachment-preview__media ${isImage ? "is-image" : "is-file"}">
        ${isImage
          ? `<img src="${escapeHtml(attachment.dataUrl)}" alt="${escapeHtml(label)}" />`
          : `<i data-lucide="file" aria-hidden="true"></i>`}
      </div>
      <div class="${ns}-attachment-preview__copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(size || (isImage ? "图片" : "附件已准备好，可直接发送"))}</span>
      </div>
      <button type="button" class="${ns}-attachment-preview__remove" data-composer-attachment-remove aria-label="移除附件" title="移除附件">
        <i data-lucide="x"></i>
      </button>`;
    attachmentPreviewHost.hidden = false;
    refreshIcons();
  }

  function isMultilineField() {
    return textInput?.tagName === "TEXTAREA";
  }

  function autoGrowField() {
    if (!isMultilineField()) return;
    textInput.style.height = "auto";
    const content = textInput.scrollHeight;
    // A composer mounted inside a hidden screen measures 0; leave CSS in charge
    // until it is laid out, otherwise the pill sticks at zero height.
    if (!content) {
      textInput.style.removeProperty("height");
      return;
    }
    textInput.style.height = `${Math.min(content, MAX_FIELD_HEIGHT)}px`;
    textInput.style.overflowY = content > MAX_FIELD_HEIGHT ? "auto" : "hidden";
  }

  function ensureStickerChrome() {
    if (!stickerSheet) return;
    if (stickerSheet.querySelector("[data-sticker-chrome]")) return;
    stickerSheet.innerHTML = `
      <div class="${ns}-sticker-chrome" data-sticker-chrome>
        <header class="${ns}-sheet__head ${ns}-sticker-head">
          <strong>${escapeHtml(t("shared.sticker.myStickers"))}</strong>
          <button type="button" class="${ns}-sticker-manage" data-sticker-manage hidden>${escapeHtml(t("shared.sticker.manage"))}</button>
        </header>
        <div class="${ns}-sticker-grid" data-sticker-grid></div>
        <div class="${ns}-sticker-manage-bar" data-sticker-manage-bar hidden>
          <button type="button" class="${ns}-sticker-delete" data-sticker-delete disabled>${escapeHtml(t("shared.sticker.choose"))}</button>
        </div>
        <div class="${ns}-sticker-add" data-sticker-add hidden>
          <div class="${ns}-sticker-add__panel">
            <header>
              <strong>${escapeHtml(t("shared.sticker.addSticker"))}</strong>
              <button type="button" data-sticker-add-close aria-label="${escapeHtml(t("common.close"))}"><i data-lucide="x"></i></button>
            </header>
            <p>${escapeHtml(t("shared.sticker.addHint"))}</p>
            <label class="${ns}-sticker-add__file">
              <span>${escapeHtml(t("shared.sticker.image"))}</span>
              <input type="file" accept="image/*" data-sticker-add-file />
            </label>
            <label class="${ns}-sticker-add__note">
              <span>${escapeHtml(t("shared.sticker.note"))}</span>
              <input type="text" maxlength="80" data-sticker-add-note placeholder="${escapeHtml(t("shared.sticker.notePlaceholder"))}" />
            </label>
            <footer>
              <button type="button" data-sticker-add-close>${escapeHtml(t("common.cancel"))}</button>
              <button type="button" class="is-primary" data-sticker-add-save>${escapeHtml(t("shared.sticker.add"))}</button>
            </footer>
          </div>
        </div>
      </div>
    `;
  }

  // Every programmatic write to the field (retry, game invite, sticker prompt,
  // location) already calls this, so growing here keeps the pill in step.
  function syncSendState() {
    autoGrowField();
    renderAttachmentPreview();
    if (!sendBtn) return;
    const hasText = Boolean(String(textInput?.value || "").trim());
    const hasAttachment = typeof hasPendingAttachment === "function"
      ? Boolean(hasPendingAttachment())
      : false;
    const canSend = (hasText || hasAttachment) && !audioMode;
    sendBtn.classList.toggle("is-active", canSend);
    // Mobile chat has one trailing action slot. Mirror mature messaging apps:
    // show voice while the field is empty, then replace it in place with Send.
    // Rendering both controls at once made narrow composers wrap to two rows.
    sendBtn.hidden = !canSend;
    sendBtn.disabled = !canSend;
    if (micBtn) micBtn.hidden = !audioMode && canSend;
  }

  function closeSheets() {
    if (plusSheet) plusSheet.hidden = true;
    if (stickerSheet) stickerSheet.hidden = true;
    plusBtn?.classList.remove("is-open", "is-active");
    plusBtn?.setAttribute("aria-expanded", "false");
    emojiBtn?.classList.remove("is-active");
    exitManage();
    hideAdd();
  }

  function setAudioMode(next) {
    audioMode = Boolean(next);
    closeSheets();
    if (textInput) textInput.hidden = audioMode;
    if (holdBtn) holdBtn.hidden = !audioMode;
    micBtn?.classList.toggle("is-audio-mode", audioMode);
    micBtn?.classList.toggle("is-active", audioMode);
    const icon = micBtn?.querySelector("[data-lucide]");
    if (icon) {
      icon.setAttribute("data-lucide", audioMode ? "keyboard" : "mic");
      refreshIcons();
    }
    micBtn?.setAttribute(
      "aria-label",
      audioMode ? t("shared.sticker.keyboardInput") : t("phone.pop.voiceInput"),
    );
    syncSendState();
    if (!audioMode) textInput?.focus?.();
  }

  function openPlus() {
    if (!plusSheet) {
      onPickImage?.();
      fileInput?.click();
      return;
    }
    const opening = plusSheet.hidden;
    if (stickerSheet) stickerSheet.hidden = true;
    emojiBtn?.classList.remove("is-active");
    exitManage();
    hideAdd();
    if (opening) {
      plusSheet.hidden = false;
      plusBtn?.classList.add("is-open", "is-active");
      plusBtn?.setAttribute("aria-expanded", "true");
      refreshIcons();
    } else {
      plusSheet.hidden = true;
      plusBtn?.classList.remove("is-open", "is-active");
      plusBtn?.setAttribute("aria-expanded", "false");
    }
  }

  function exitManage() {
    manageMode = false;
    selectedIds.clear();
    const manageBtn = stickerSheet?.querySelector("[data-sticker-manage]");
    const bar = stickerSheet?.querySelector("[data-sticker-manage-bar]");
    if (manageBtn) manageBtn.textContent = t("shared.sticker.manage");
    if (bar) bar.hidden = true;
  }

  function hideAdd() {
    const add = stickerSheet?.querySelector("[data-sticker-add]");
    if (add) add.hidden = true;
    const file = stickerSheet?.querySelector("[data-sticker-add-file]");
    const note = stickerSheet?.querySelector("[data-sticker-add-note]");
    if (file) file.value = "";
    if (note) note.value = "";
  }

  function renderStickers() {
    ensureStickerChrome();
    const grid = stickerSheet?.querySelector("[data-sticker-grid]");
    const manageBtn = stickerSheet?.querySelector("[data-sticker-manage]");
    const deleteBtn = stickerSheet?.querySelector("[data-sticker-delete]");
    if (!grid) return;
    const stickers = listCustomStickers();
    if (manageBtn) manageBtn.hidden = stickers.length === 0;

    grid.innerHTML = [
      `<button type="button" class="${ns}-sticker ${ns}-sticker--add" data-sticker-open-add ${manageMode ? "disabled" : ""}>
        <i data-lucide="plus"></i><span>${escapeHtml(t("shared.sticker.addTile"))}</span>
      </button>`,
      ...stickers.map((s) => {
        const selected = selectedIds.has(s.id);
        return `
          <button type="button" class="${ns}-sticker ${manageMode ? "is-manage" : ""} ${selected ? "is-selected" : ""}"
            data-sticker-id="${escapeHtml(s.id)}"
            data-sticker-url="${escapeHtml(s.url)}"
            data-sticker-desc="${escapeHtml(s.description)}"
            aria-label="${escapeHtml(s.description)}">
            <img src="${escapeHtml(s.url)}" alt="" loading="lazy" />
            ${manageMode && selected ? '<span class="is-check" aria-hidden="true">✓</span>' : ""}
          </button>`;
      }),
    ].join("");

    if (deleteBtn) {
      const n = selectedIds.size;
      deleteBtn.disabled = n === 0;
      deleteBtn.textContent = n > 0
        ? t("shared.sticker.deleteCount", { count: n })
        : t("shared.sticker.choose");
    }
    refreshIcons();
  }

  function submitForm() {
    if (audioMode || submitLock) return;
    const text = String(textInput?.value || "").trim();
    const hasAttachment = typeof hasPendingAttachment === "function"
      ? Boolean(hasPendingAttachment())
      : false;
    if (!text && !hasAttachment) return;
    // Guard double-tap / Enter+click. Form submit handlers clear the field.
    submitLock = true;
    if (textInput) {
      if (text) textInput.dataset.pendingSendText = text;
      else delete textInput.dataset.pendingSendText;
    }
    closeSheets();
    try {
      if (form?.requestSubmit) form.requestSubmit();
      else form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    } finally {
      autoGrowField();
      window.setTimeout(() => {
        submitLock = false;
      }, 450);
    }
  }

  function handlePlusKind(kind) {
    if (kind === "sticker") {
      if (plusSheet) plusSheet.hidden = true;
      plusBtn?.classList.remove("is-open", "is-active");
      plusBtn?.setAttribute("aria-expanded", "false");
      openStickers(true);
      return;
    }
    closeSheets();
    if (kind === "image") {
      onPlusAction?.("image");
      onPickImage?.();
      fileInput?.click();
      return;
    }
    if (kind === "voice") {
      onPlusAction?.("voice");
      setAudioMode(true);
      return;
    }
    onPlusAction?.(kind);
  }

  function openStickers(forceOpen = false) {
    if (!stickerSheet) return;
    const opening = forceOpen || stickerSheet.hidden;
    if (plusSheet) plusSheet.hidden = true;
    plusBtn?.classList.remove("is-open", "is-active");
    plusBtn?.setAttribute("aria-expanded", "false");
    if (opening) {
      ensureStickerChrome();
      renderStickers();
      stickerSheet.hidden = false;
      emojiBtn?.classList.add("is-active");
      refreshIcons();
    } else {
      stickerSheet.hidden = true;
      emojiBtn?.classList.remove("is-active");
      exitManage();
      hideAdd();
    }
  }

  plusBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPlus();
  });

  emojiBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openStickers();
  });

  micBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setAudioMode(!audioMode);
  });

  sendBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    submitForm();
  });

  speakBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (speakBtn.classList.contains("is-busy") || speakBtn.disabled) return;
    closeSheets();
    onCharacterSpeak?.();
  });

  textInput?.addEventListener("input", syncSendState);
  textInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    // IME candidate selection also fires Enter; never send a half-typed word.
    if (event.isComposing || event.keyCode === 229) return;
    if (event.shiftKey && isMultilineField()) return;
    event.preventDefault();
    submitForm();
  });

  plusSheet?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-composer-plus-action], [data-phone-plus-action]");
    if (!action) return;
    const kind = action.getAttribute("data-composer-plus-action")
      || action.getAttribute("data-phone-plus-action");
    if (kind) handlePlusKind(kind);
  });

  stickerSheet?.addEventListener("click", (event) => {
    if (event.target.closest("[data-sticker-manage]")) {
      manageMode = !manageMode;
      selectedIds.clear();
      const manageBtn = stickerSheet.querySelector("[data-sticker-manage]");
      const bar = stickerSheet.querySelector("[data-sticker-manage-bar]");
      if (manageBtn) {
        manageBtn.textContent = manageMode
          ? t("shared.sticker.done")
          : t("shared.sticker.manage");
      }
      if (bar) bar.hidden = !manageMode;
      renderStickers();
      return;
    }

    if (event.target.closest("[data-sticker-delete]")) {
      if (!selectedIds.size) return;
      if (!window.confirm(t("shared.sticker.deleteConfirm", { count: selectedIds.size }))) return;
      deleteCustomStickers([...selectedIds]);
      selectedIds.clear();
      manageMode = false;
      const manageBtn = stickerSheet.querySelector("[data-sticker-manage]");
      const bar = stickerSheet.querySelector("[data-sticker-manage-bar]");
      if (manageBtn) manageBtn.textContent = t("shared.sticker.manage");
      if (bar) bar.hidden = true;
      renderStickers();
      onToast?.(t("shared.sticker.deleted"));
      return;
    }

    if (event.target.closest("[data-sticker-add-close]")) {
      hideAdd();
      return;
    }

    if (event.target.closest("[data-sticker-add-save]")) {
      const fileInput = stickerSheet.querySelector("[data-sticker-add-file]");
      const noteInput = stickerSheet.querySelector("[data-sticker-add-note]");
      const file = fileInput?.files?.[0];
      const note = String(noteInput?.value || "").trim();
      if (!file) {
        onToast?.(t("shared.sticker.chooseImage"));
        return;
      }
      if (!note) {
        onToast?.(t("shared.sticker.noteRequired"));
        return;
      }
      const saveBtn = event.target.closest("[data-sticker-add-save]");
      if (saveBtn) saveBtn.disabled = true;
      addStickerFromFile(file, note)
        .then(() => {
          hideAdd();
          renderStickers();
          onToast?.(t("shared.sticker.added"));
        })
        .catch((error) => {
          onToast?.(String(error?.message || t("shared.sticker.addFailed")).slice(0, 80));
        })
        .finally(() => {
          if (saveBtn) saveBtn.disabled = false;
        });
      return;
    }

    if (event.target.closest("[data-sticker-open-add]")) {
      if (manageMode) return;
      const add = stickerSheet.querySelector("[data-sticker-add]");
      if (add) add.hidden = false;
      stickerSheet.querySelector("[data-sticker-add-note]")?.focus?.();
      refreshIcons();
      return;
    }

    const tile = event.target.closest("[data-sticker-id]");
    if (!tile) return;
    const id = tile.getAttribute("data-sticker-id") || "";
    const url = tile.getAttribute("data-sticker-url") || "";
    const description = tile.getAttribute("data-sticker-desc") || t("shared.sticker.fallback");
    if (manageMode) {
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      renderStickers();
      return;
    }
    closeSheets();
    onPickSticker?.({ id, url, description });
  });

  textInput?.addEventListener("focus", () => closeSheets());
  textInput?.addEventListener("click", () => closeSheets());

  return {
    closeSheets,
    setAudioMode,
    isAudioMode: () => audioMode,
    renderStickers,
    syncSendState,
    openStickers,
    setSpeakBusy(busy) {
      if (!speakBtn) return;
      speakBtn.classList.toggle("is-busy", Boolean(busy));
      speakBtn.classList.toggle("is-active", Boolean(busy));
      speakBtn.disabled = Boolean(busy);
    },
  };
}
