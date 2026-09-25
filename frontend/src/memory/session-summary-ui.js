/**
 * Shared checkbox picker for summarizing selected chat rounds into one memory.
 */

import { t } from "../i18n/index.js";
import { escapeHtml } from "../lib/utils.js";
import {
  listRecentRoundsForSummary,
  summarizeSelectedTurns,
} from "./session-summary.js";

function selectedKeysFromList(listEl) {
  if (!listEl) return [];
  return [...listEl.querySelectorAll("[data-summary-round]:checked")]
    .map((input) => Number(input.value))
    .filter((n) => Number.isFinite(n));
}

function renderRoundList(listEl, model, selected = []) {
  if (!listEl) return;
  const want = new Set((selected || []).map((k) => Number(k)));
  const rounds = model?.rounds || [];
  if (!rounds.length) {
    listEl.innerHTML = `<p class="session-summary-empty">${escapeHtml(t("mePanels.memory.summarizeEmpty"))}</p>`;
    return;
  }
  listEl.innerHTML = rounds.map((round) => {
    const ready = round.ready !== false;
    const checked = want.has(Number(round.key)) ? " checked" : "";
    const disabled = ready ? "" : " disabled";
    const userLine = round.userPreview
      ? `<p class="session-summary-round__line"><span>${escapeHtml(t("mePanels.memory.summarizeUser"))}</span>${escapeHtml(round.userPreview)}</p>`
      : "";
    const asstLine = round.assistantPreview
      ? `<p class="session-summary-round__line"><span>${escapeHtml(t("mePanels.memory.summarizeAssistant"))}</span>${escapeHtml(round.assistantPreview)}</p>`
      : "";
    const wait = ready
      ? ""
      : `<p class="session-summary-round__wait">${escapeHtml(t("mePanels.memory.summarizeNotReady"))}</p>`;
    return `
      <label class="session-summary-round${ready ? "" : " is-disabled"}">
        <input type="checkbox" data-summary-round value="${escapeHtml(String(round.key))}"${checked}${disabled} />
        <div class="session-summary-round__body">
          <strong>${escapeHtml(t("mePanels.memory.summarizeRound", { n: round.key + 1 }))}</strong>
          ${userLine}
          ${asstLine}
          ${wait}
        </div>
      </label>
    `;
  }).join("");
}

function setStatus(statusEl, text, tone = "") {
  if (!statusEl) return;
  statusEl.textContent = String(text || "");
  statusEl.hidden = !text;
  statusEl.dataset.tone = tone || "";
}

function setBusy(host, busy) {
  host.querySelectorAll("button, input").forEach((node) => {
    if (node.hasAttribute("data-session-summary-close")) return;
    node.disabled = Boolean(busy);
  });
  host.classList.toggle("is-busy", Boolean(busy));
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   collectProviderConfig: () => object|Promise<object>,
 *   getCharacterId: () => string,
 *   getCharacterName?: () => string,
 *   fileDrawer?: Function,
 *   callModel?: Function,
 *   onSaved?: (result: object) => void|Promise<void>,
 *   onClose?: () => void,
 * }} deps
 */
export function bindSessionSummaryPicker(host, deps = {}) {
  if (!host || host.dataset.sessionSummaryBound === "1") return host;
  host.dataset.sessionSummaryBound = "1";

  const listEl = host.querySelector("[data-session-summary-list]");
  const statusEl = host.querySelector("[data-session-summary-status]");
  let model = { rounds: [], lines: [], sessionId: "", characterId: "" };

  function refresh(selected = []) {
    const characterId = String(deps.getCharacterId?.() || "").trim();
    model = listRecentRoundsForSummary(characterId);
    renderRoundList(listEl, model, selected);
  }

  host.refreshSessionSummary = refresh;

  host.querySelector("[data-session-summary-select-all]")?.addEventListener("click", () => {
    const keys = (model.rounds || []).filter((round) => round.ready).map((round) => round.key);
    renderRoundList(listEl, model, keys);
  });

  host.querySelector("[data-session-summary-clear]")?.addEventListener("click", () => {
    renderRoundList(listEl, model, []);
  });

  const REASON_I18N = {
    NO_SESSION: "mePanels.memory.summarizeEmpty",
    EMPTY_SELECTION: "mePanels.memory.summarizeNeedSelection",
    EMPTY_TRANSCRIPT: "mePanels.memory.summarizeNeedSelection",
    PROVIDER_REQUIRED: "mePanels.memory.summarizeNeedProvider",
    TOO_LONG: "mePanels.memory.summarizeTooLong",
    PARSE_FAILED: "mePanels.memory.summarizeParseFailed",
  };

  host.querySelector("[data-session-summary-write]")?.addEventListener("click", async () => {
    const roundKeys = selectedKeysFromList(listEl);
    setStatus(statusEl, t("mePanels.memory.summarizeWorking"), "busy");
    setBusy(host, true);
    try {
      const result = await summarizeSelectedTurns({
        characterId: String(deps.getCharacterId?.() || "").trim(),
        roundKeys,
        collectProviderConfig: deps.collectProviderConfig,
        fileDrawer: deps.fileDrawer,
        callModel: deps.callModel,
        characterName: deps.getCharacterName?.() || "",
      });
      if (!result.ok) {
        const key = REASON_I18N[result.reason] || "mePanels.memory.summarizeFailed";
        setStatus(statusEl, t(key), "error");
        return;
      }
      setStatus(statusEl, t("mePanels.memory.summarizeDone"), "ok");
      renderRoundList(listEl, model, []);
      await deps.onSaved?.(result);
    } catch (error) {
      setStatus(statusEl, error?.message || t("mePanels.memory.summarizeFailed"), "error");
    } finally {
      setBusy(host, false);
    }
  });

  refresh();
  return host;
}

export function openSessionSummaryModal(modal) {
  if (!modal) return;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modal.refreshSessionSummary?.();
}

export function closeSessionSummaryModal(modal) {
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}
