/**
 * Character card import UI — preview / confirm / errors (F5 / F1).
 * Prefers unified .nychar / generic flow from src/portability/nychar when possible.
 */

import { escapeHtml } from "../lib/utils.js";
import { refreshIcons } from "../lib/icons.js";
import { t, getLocale } from "../i18n/index.js";
import { confirmAction } from "../ui/confirm.js";
import {
  extractJsonFromImage,
  mapParsedCardToCharacter,
  parseJsonCharacterCard,
  validateParsedCard,
} from "./import.js";
import { upsertCharacter, setActiveCharacterId, getCharacterSync } from "./store.js";
import { BUILTIN_CHARACTER_ID } from "../constants.js";
import { parseCharacterPackZip } from "../character-pack/pack-io.js";
import {
  detectCharacterPackage,
  installCharacterImport,
  messageForPortabilityError,
  prepareCharacterImport,
} from "../portability/index.js";

function isProtectedCharacterId(id) {
  const key = String(id || "").trim();
  if (!key) return false;
  if (key === BUILTIN_CHARACTER_ID) return true;
  return getCharacterSync(key)?.source === "builtin";
}

function overwriteActionHtml(deps = {}) {
  if (isProtectedCharacterId(deps.getEditingCharacterId?.())) {
    return `<p class="yueqi-import-warn">${escapeHtml(t("appShell.characterImport.overwriteBuiltinBlocked"))}</p>`;
  }
  return `<button type="button" class="ghost-action" data-overwrite>${escapeHtml(t("appShell.characterImport.overwriteEditing"))}</button>`;
}

/**
 * @param {{
 *   onToast?: (msg: string) => void,
 *   onImported?: (character: object) => void,
 *   onPackImported?: (pack: object) => void,
 *   getEditingCharacterId?: () => string,
 * }} deps
 */
export function openCharacterImportFlow(deps = {}) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept =
    ".nychar,.json,.png,.webp,.zip,application/json,image/png,image/webp,application/zip,application/vnd.nyra.character+zip";
  input.hidden = true;
  document.body.append(input);
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    await handleImportFile(file, deps);
  });
  input.click();
}

/**
 * @param {File} file
 * @param {object} deps
 */
export async function handleImportFile(file, deps = {}) {
  const name = String(file.name || "").toLowerCase();
  showParsingOverlay();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = detectCharacterPackage(bytes, {
      fileName: file.name,
      mimeType: file.type,
    });

    if (detected === "nychar" || name.endsWith(".nychar")) {
      let staged;
      try {
        staged = await prepareCharacterImport(bytes, {
          fileName: file.name,
          mimeType: file.type,
        });
      } catch (error) {
        hideParsingOverlay();
        showImportError(
          messageForPortabilityError(error, getLocale() === "en" ? "en" : "zh"),
          String(error?.detail || error?.message || ""),
          () => openCharacterImportFlow(deps),
        );
        return;
      }
      hideParsingOverlay();
      await showStagedImportPreview(staged, deps);
      return;
    }

    if (isZipBytes(bytes) && (name.endsWith(".zip") || detected === "unknown")) {
      // Prefer .nychar detect above; remaining ZIPs are legacy visual packs.
      let pack;
      try {
        pack = parseCharacterPackZip(bytes);
      } catch (error) {
        // Last chance: unified parser may still recognize a mislabeled package
        try {
          const staged = await prepareCharacterImport(bytes, {
            fileName: file.name,
            mimeType: file.type,
          });
          hideParsingOverlay();
          await showStagedImportPreview(staged, deps);
          return;
        } catch {
          hideParsingOverlay();
          showImportError(t("appShell.characterImport.invalidZip"), String(error?.message || ""), () => openCharacterImportFlow(deps));
          return;
        }
      }
      hideParsingOverlay();
      deps.onToast?.(t("appShell.characterImport.visualPackDone"));
      deps.onPackImported?.(pack);
      return;
    }

    // Generic JSON / image card via unified prepare when possible
    try {
      const staged = await prepareCharacterImport(
        name.endsWith(".json") || file.type === "application/json"
          ? new TextDecoder().decode(bytes)
          : bytes,
        { fileName: file.name, mimeType: file.type },
      );
      hideParsingOverlay();
      await showStagedImportPreview(staged, deps);
      return;
    } catch {
      /* fall through to legacy path */
    }

    let text = "";
    if (name.endsWith(".json") || file.type === "application/json") {
      text = new TextDecoder().decode(bytes);
    } else if (name.endsWith(".png") || name.endsWith(".webp") || file.type.startsWith("image/")) {
      text = extractJsonFromImage(bytes) || "";
      if (!text) {
        hideParsingOverlay();
        showImportError(t("appShell.characterImport.noPersona"), t("appShell.characterImport.noImageJson"), () => openCharacterImportFlow(deps));
        return;
      }
    } else {
      text = new TextDecoder().decode(bytes);
    }

    let parsed;
    try {
      parsed = parseJsonCharacterCard(text, { fileName: file.name });
    } catch (error) {
      hideParsingOverlay();
      showImportError(
        String(error?.message || t("appShell.characterImport.invalidJson")),
        t("appShell.characterImport.tryOpenJson"),
        () => openCharacterImportFlow(deps),
      );
      return;
    }

    const validation = validateParsedCard(parsed);
    if (!validation.ok) {
      hideParsingOverlay();
      showImportError(
        validation.errors[0] || t("appShell.characterImport.noPersona"),
        validation.warnings.join("；") || "",
        () => openCharacterImportFlow(deps),
      );
      return;
    }

    hideParsingOverlay();
    await showImportPreview(parsed, validation.warnings, deps);
  } catch (error) {
    hideParsingOverlay();
    console.warn("[yueqi.import]", error);
    showImportError(t("errors.generic"), String(error?.message || t("appShell.characterImport.parseFailed")), () => openCharacterImportFlow(deps));
  }
}

function isZipBytes(bytes) {
  return bytes?.[0] === 0x50 && bytes?.[1] === 0x4b;
}

function lossyLines(lossy) {
  if (!lossy || typeof lossy !== "object") return [];
  const lines = [];
  for (const key of ["dropped", "transformed", "unsupported", "unsafe", "unresolved"]) {
    for (const item of lossy[key] || []) lines.push(String(item));
  }
  return lines;
}

async function showStagedImportPreview(staged, deps) {
  const preview = staged.preview || {};
  const warnings = lossyLines(staged.lossy);
  const summary = String(preview.description || "").slice(0, 120);
  const avatar = preview.avatarUrl && (preview.avatarUrl.startsWith("https://") || preview.avatarUrl.startsWith("data:"))
    ? preview.avatarUrl
    : "";
  const initial = (preview.name || "?").slice(0, 1);
  const kindLabel = t(staged.kind === "nychar" ? "appShell.characterImport.nycharKind" : "appShell.characterImport.genericKind");
  const extra =
    staged.kind === "nychar"
      ? t("appShell.characterImport.nycharMeta", { worldbook: preview.worldbookEntryCount || 0, relationship: preview.relationshipType || "—", assets: preview.assetCount || 0 })
      : t("appShell.characterImport.tags", { count: Array.isArray(preview.tags) ? preview.tags.length : 0 });

  const modal = document.createElement("section");
  modal.className = "modal confirm-modal is-open yueqi-import-preview";
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <article class="modal-panel confirm-panel yueqi-import-panel" role="dialog" aria-modal="true">
      <header><h2>${escapeHtml(t("appShell.characterImport.preview"))}</h2></header>
      <div class="yueqi-import-grid">
        <div class="yueqi-import-summary">
          <p><strong>${escapeHtml(preview.name || "")}</strong></p>
          <p>${escapeHtml(preview.identity || t("appShell.characterImport.noIdentity"))}</p>
          <p class="yueqi-import-desc">${escapeHtml(summary)}${(preview.description || "").length > 120 ? "…" : ""}</p>
          <p class="yueqi-import-meta">${escapeHtml(kindLabel)} · ${escapeHtml(extra)}</p>
          ${warnings.length ? `<p class="yueqi-import-warn">${escapeHtml(warnings.slice(0, 8).join("；"))}</p>` : ""}
        </div>
        <div class="yueqi-import-avatar" ${avatar ? "" : 'data-empty="1"'}>
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : `<span>${escapeHtml(initial)}</span>`}
        </div>
      </div>
      <footer class="yueqi-import-actions">
        <button type="button" class="ghost-action" data-close>${escapeHtml(t("common.cancel"))}</button>
        ${overwriteActionHtml(deps)}
        <button type="button" class="send-button" data-import-new>${escapeHtml(t("appShell.characterImport.importNew"))}</button>
      </footer>
    </article>
  `;
  const close = () => modal.remove();
  modal.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
  modal.querySelector("[data-import-new]")?.addEventListener("click", async () => {
    if (warnings.length) {
      const ok = await confirmAction({
        title: t("appShell.characterImport.lossyTitle"),
        message: t("appShell.characterImport.lossyMessage", { warnings: warnings.slice(0, 6).join("\n") }),
        confirmLabel: t("appShell.characterImport.continue"),
        cancelLabel: t("common.cancel"),
      });
      if (!ok) return;
    }
    const character = await installCharacterImport(staged, { upsertCharacter });
    close();
    const setCompanion = await confirmAction({
      title: t("appShell.characterImport.addedTitle"),
      message: t("appShell.characterImport.addedMessage"),
      confirmLabel: t("appShell.characterImport.setCompanion"),
      cancelLabel: t("appShell.characterImport.later"),
    });
    if (setCompanion) await setActiveCharacterId(character.id);
    deps.onToast?.(t("appShell.characterImport.addedToast"));
    deps.onImported?.(character);
  });
  modal.querySelector("[data-overwrite]")?.addEventListener("click", async () => {
    const editId = deps.getEditingCharacterId?.() || "";
    if (isProtectedCharacterId(editId)) {
      deps.onToast?.(t("appShell.characterImport.overwriteBuiltinBlocked"));
      return;
    }
    const ok = await confirmAction({
      title: t("appShell.characterImport.overwriteTitle"),
      message: t("appShell.characterImport.overwriteMessage"),
      confirmLabel: t("shared.overlay.overwrite"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    const character = await installCharacterImport(staged, {
      upsertCharacter,
      overwriteId: editId || undefined,
    });
    close();
    deps.onToast?.(t("appShell.characterImport.overwritten"));
    deps.onImported?.(character);
  });
  document.body.append(modal);
  refreshIcons();
}

function showParsingOverlay() {
  hideParsingOverlay();
  const el = document.createElement("div");
  el.className = "yueqi-import-overlay";
  el.dataset.importOverlay = "1";
  el.innerHTML = `<div class="yueqi-import-overlay__card"><span class="yueqi-import-overlay__spin"></span><p>${escapeHtml(t("appShell.characterImport.parsing"))}</p></div>`;
  document.body.append(el);
}

function hideParsingOverlay() {
  document.querySelectorAll("[data-import-overlay]").forEach((n) => n.remove());
}

function showImportError(title, detail, onRetry) {
  const modal = document.createElement("section");
  modal.className = "modal confirm-modal is-open";
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <article class="modal-panel confirm-panel" role="dialog" aria-modal="true">
      <header><h2>${escapeHtml(title)}</h2></header>
      <p class="confirm-message">${escapeHtml(detail || t("appShell.characterImport.tryAnother"))}</p>
      <footer>
        <button type="button" class="ghost-action" data-close>${escapeHtml(t("common.close"))}</button>
        <button type="button" class="send-button" data-retry>${escapeHtml(t("appShell.characterImport.chooseAgain"))}</button>
      </footer>
    </article>
  `;
  const close = () => modal.remove();
  modal.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
  modal.querySelector("[data-retry]")?.addEventListener("click", () => {
    close();
    onRetry?.();
  });
  document.body.append(modal);
}

async function showImportPreview(parsed, warnings, deps) {
  const summary = String(parsed.description || "").slice(0, 120);
  const avatar = parsed.avatar && (parsed.avatar.startsWith("https://") || parsed.avatar.startsWith("data:"))
    ? parsed.avatar
    : "";
  const initial = (parsed.name || "?").slice(0, 1);
  const modal = document.createElement("section");
  modal.className = "modal confirm-modal is-open yueqi-import-preview";
  modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <article class="modal-panel confirm-panel yueqi-import-panel" role="dialog" aria-modal="true">
      <header><h2>${escapeHtml(t("appShell.characterImport.preview"))}</h2></header>
      <div class="yueqi-import-grid">
        <div class="yueqi-import-summary">
          <p><strong>${escapeHtml(parsed.name || "")}</strong></p>
          <p>${escapeHtml(parsed.identity || t("appShell.characterImport.noIdentity"))}</p>
          <p class="yueqi-import-desc">${escapeHtml(summary)}${parsed.description?.length > 120 ? "…" : ""}</p>
          <p class="yueqi-import-meta">${escapeHtml(t("appShell.characterImport.tags", { count: Array.isArray(parsed.tags) ? parsed.tags.length : 0 }))}</p>
          ${warnings?.length ? `<p class="yueqi-import-warn">${escapeHtml(warnings.join("；"))}</p>` : ""}
        </div>
        <div class="yueqi-import-avatar" ${avatar ? "" : 'data-empty="1"'}>
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="" />` : `<span>${escapeHtml(initial)}</span>`}
        </div>
      </div>
      <footer class="yueqi-import-actions">
        <button type="button" class="ghost-action" data-close>${escapeHtml(t("common.cancel"))}</button>
        ${overwriteActionHtml(deps)}
        <button type="button" class="send-button" data-import-new>${escapeHtml(t("appShell.characterImport.importNew"))}</button>
      </footer>
    </article>
  `;
  const close = () => modal.remove();
  modal.querySelectorAll("[data-close]").forEach((n) => n.addEventListener("click", close));
  modal.querySelector("[data-import-new]")?.addEventListener("click", async () => {
    const character = mapParsedCardToCharacter(parsed);
    await upsertCharacter(character);
    close();
    const setCompanion = await confirmAction({
      title: t("appShell.characterImport.addedTitle"),
      message: t("appShell.characterImport.addedMessage"),
      confirmLabel: t("appShell.characterImport.setCompanion"),
      cancelLabel: t("appShell.characterImport.later"),
    });
    if (setCompanion) await setActiveCharacterId(character.id);
    deps.onToast?.(t("appShell.characterImport.addedToast"));
    deps.onImported?.(character);
  });
  modal.querySelector("[data-overwrite]")?.addEventListener("click", async () => {
    const editId = deps.getEditingCharacterId?.() || "";
    if (isProtectedCharacterId(editId)) {
      deps.onToast?.(t("appShell.characterImport.overwriteBuiltinBlocked"));
      return;
    }
    const ok = await confirmAction({
      title: t("appShell.characterImport.overwriteTitle"),
      message: t("appShell.characterImport.overwriteMessage"),
      confirmLabel: t("shared.overlay.overwrite"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;
    const character = mapParsedCardToCharacter(parsed, editId ? { id: editId } : {});
    await upsertCharacter(character);
    close();
    deps.onToast?.(t("appShell.characterImport.overwritten"));
    deps.onImported?.(character);
  });
  document.body.append(modal);
  refreshIcons();
}
