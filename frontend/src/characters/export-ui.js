/**
 * Character export UI — Nyra .nychar full pack vs generic card.
 */

import {
  buildNycharPackage,
  exportCharacterAsGenericCard,
  messageForPortabilityError,
} from "../portability/index.js";
import { t } from "../i18n/index.js";

function downloadBytes(filename, bytes, mime) {
  const blob = new Blob([bytes], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename, text, mime) {
  const blob = new Blob([text], { type: mime || "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {object} character
 * @param {{
 *   onToast?: (msg: string) => void,
 *   getAssetBytes?: (ref: string) => Promise<Uint8Array|null>,
 *   collectWorldbookForCharacter?: (character: object) => object[]|Promise<object[]>,
 * }} [deps]
 */
export function openCharacterExportFlow(character, deps = {}) {
  if (!character?.id) {
    deps.onToast?.(t("appShell.characterExport.none"));
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "yx-import-overlay";
  overlay.innerHTML = `
    <div class="yx-import-card" role="dialog" aria-modal="true" aria-label="${escapeText(t("appShell.characterExport.title"))}">
      <h3>${escapeText(t("appShell.characterExport.title"))}</h3>
      <p class="yx-import-lead">${escapeText(character.name || t("character.unnamed"))}</p>
      <div class="yx-import-actions" style="flex-direction:column;gap:8px;align-items:stretch">
        <button type="button" class="primary-action" data-export-nychar>${escapeText(t("appShell.characterExport.fullPack"))}</button>
        <p class="mini-app-lead" style="margin:0">${escapeText(t("appShell.characterExport.fullPackHint"))}</p>
        <button type="button" class="ghost-action" data-export-generic>${escapeText(t("appShell.characterExport.generic"))}</button>
        <p class="mini-app-lead" style="margin:0">${escapeText(t("appShell.characterExport.genericHint"))}</p>
        <button type="button" class="ghost-action" data-export-cancel>${escapeText(t("common.cancel"))}</button>
      </div>
    </div>
  `;
  document.body.append(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("[data-export-cancel]")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("[data-export-nychar]")?.addEventListener("click", async () => {
    try {
      const built = await buildNycharPackage(character, {
        getAssetBytes: deps.getAssetBytes,
        collectWorldbookForCharacter: deps.collectWorldbookForCharacter,
      });
      const safe = String(character.name || "character").replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40);
      downloadBytes(`${safe}.nychar`, built.bytes, "application/vnd.nyra.character+zip");
      deps.onToast?.(t("appShell.characterExport.fullDone"));
      close();
    } catch (error) {
      deps.onToast?.(messageForPortabilityError(error) || error.message || t("appShell.characterExport.failed"));
    }
  });

  overlay.querySelector("[data-export-generic]")?.addEventListener("click", async () => {
    try {
      const ok = window.confirm(
        t("appShell.characterExport.lossyConfirm"),
      );
      if (!ok) return;
      const card = exportCharacterAsGenericCard(character, { version: "v3" });
      const safe = String(character.name || "character").replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40);
      downloadText(`${safe}.json`, card.json || JSON.stringify(card.card || card, null, 2), "application/json");
      const lossyCount = (card.warnings?.length || 0) + (card.lossy?.dropped?.length || 0);
      if (lossyCount) {
        deps.onToast?.(t("appShell.characterExport.genericDoneLossy", { count: lossyCount }));
      } else {
        deps.onToast?.(t("appShell.characterExport.genericDone"));
      }
      close();
    } catch (error) {
      deps.onToast?.(messageForPortabilityError(error) || error.message || t("appShell.characterExport.failed"));
    }
  });
}

function escapeText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
