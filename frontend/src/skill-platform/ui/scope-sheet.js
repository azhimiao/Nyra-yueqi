/**
 * Scope Sheet — start-run authorization UI (plan §2.3).
 */

import { escapeHtml } from "../../lib/utils.js";
import { RUN_MODES } from "../schema.js";
import {
  defaultScopesForMode,
  normalizeScopes,
  scopesSummaryPlainLanguage,
  validateScopes,
} from "../scopes.js";
import { createSkillRunRecord } from "../run-store.js";
import { createProductionConversationApi } from "../conversation-binding.js";
import { tx } from "./i18n.js";

export const MODE_OPTIONS = Object.freeze([
  { id: "isolated_new", labelKey: "modeIsolated", hintKey: "modeIsolatedHint", primary: true },
  { id: "snapshot_copy", labelKey: "modeSnapshot", hintKey: "modeSnapshotHint", primary: false },
  { id: "shared_live", labelKey: "modeShared", hintKey: "modeSharedHint", primary: false },
]);

export const PRIMARY_MODE = "isolated_new";

/**
 * Product default for Explore starts: isolated session, no lover memory bridge.
 * @param {string} [mode]
 */
export function preferredStartMode(mode) {
  return RUN_MODES.includes(mode) ? mode : PRIMARY_MODE;
}

/**
 * Normalize scope sheet form → valid SkillRun create payload.
 * @param {object} form
 * @param {{ skillId: string, agentId?: string, characterId?: string, grantedCapabilities?: string[] }} base
 */
export function normalizeScopeSheetPayload(form, base) {
  // Explore product default: isolated session unless user explicitly picks another mode.
  const mode = preferredStartMode(form?.mode);
  const scopes = normalizeScopes({
    ...defaultScopesForMode(mode),
    conversationRead: form?.conversationRead,
    memoryRead: form?.memoryRead ?? "none",
    characterVisibility: form?.characterVisibility ?? "private",
    memoryWrite: form?.memoryWrite ?? "off",
  });
  const scopeCheck = validateScopes(scopes, {
    mode,
    characterId: base?.characterId,
  });
  if (!scopeCheck.ok) {
    return scopeCheck;
  }

  return {
    ok: true,
    value: {
      skillId: String(base?.skillId || "").trim(),
      agentId: base?.agentId ? String(base.agentId) : undefined,
      characterId: base?.characterId ? String(base.characterId) : undefined,
      mode,
      scopes: scopeCheck.value,
      grantedCapabilities: Array.isArray(base?.grantedCapabilities)
        ? base.grantedCapabilities
        : [],
      sourceConversationSessionId: form?.sourceConversationSessionId
        ? String(form.sourceConversationSessionId)
        : undefined,
      title: form?.title ? String(form.title) : undefined,
    },
  };
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   skillId: string,
 *   agentId?: string,
 *   skillName?: string,
 *   characterId?: string,
 *   characterName?: string,
 *   grantedCapabilities?: string[],
 *   conversationApi?: object,
 *   onStarted?: (run: object) => void,
 *   onCancel?: () => void,
 *   locale?: string,
 * }} opts
 */
export function mountScopeSheet(host, opts = {}) {
  if (!host) {
    return { open() {}, close() {}, destroy() {} };
  }

  let open = false;
  let mode = PRIMARY_MODE;
  let characterVisibility = "private";
  let memoryRead = "none";
  let memoryWrite = "off";

  function render() {
    const loc = opts.locale;
    const charLabel = escapeHtml(opts.characterName || tx("characterFallback", loc));
    const primaryModes = MODE_OPTIONS.filter((m) => m.primary);
    const advancedModes = MODE_OPTIONS.filter((m) => !m.primary);
    host.innerHTML = `
      <div class="explore-scope-sheet${open ? " is-open" : ""}" data-explore-scope hidden="${open ? "" : "hidden"}">
        <button type="button" class="explore-sheet__scrim" data-scope-close aria-label="${escapeHtml(tx("cancel", loc))}"></button>
        <div class="explore-sheet__panel" role="dialog" aria-modal="true">
          <header class="explore-sheet__head">
            <button type="button" class="explore-text-btn" data-scope-close>${escapeHtml(tx("cancel", loc))}</button>
            <strong>${escapeHtml(opts.skillName || opts.skillId || "")}</strong>
            <span></span>
          </header>
          <div class="explore-sheet__body explore-app-scroll">
            <p class="explore-sheet__lead">${escapeHtml(tx("separationNote", loc))}</p>
            <div class="explore-mode-list" data-scope-modes>
              ${primaryModes.map((m) => `
                <label class="explore-mode-card${mode === m.id ? " is-active" : ""}">
                  <input type="radio" name="explore-mode" value="${m.id}"${mode === m.id ? " checked" : ""} />
                  <strong>${escapeHtml(tx(m.labelKey, loc))}</strong>
                  <span>${escapeHtml(tx(m.hintKey, loc))}</span>
                </label>
              `).join("")}
            </div>
            <details class="explore-mode-advanced"${advancedModes.some((m) => m.id === mode) ? " open" : ""}>
              <summary>${escapeHtml(tx("modeAdvanced", loc))}</summary>
              <div class="explore-mode-list">
                ${advancedModes.map((m) => `
                  <label class="explore-mode-card${mode === m.id ? " is-active" : ""}">
                    <input type="radio" name="explore-mode" value="${m.id}"${mode === m.id ? " checked" : ""} />
                    <strong>${escapeHtml(tx(m.labelKey, loc))}</strong>
                    <span>${escapeHtml(tx(m.hintKey, loc))}</span>
                  </label>
                `).join("")}
              </div>
            </details>
            <p class="explore-sheet__lead">${escapeHtml(tx("visibilityQuestion", loc))}</p>
            <label class="explore-check-row">
              <input type="checkbox" data-scope-private checked disabled />
              <span>${escapeHtml(tx("visibilityPrivate", loc))}</span>
            </label>
            <label class="explore-check-row">
              <input type="checkbox" data-scope-char-visibility${characterVisibility === "selected_character" ? " checked" : ""} />
              <span>${escapeHtml(tx("visibilityCharacterNamed", loc, { character: charLabel }))}</span>
            </label>
            <p class="explore-sheet__hint">${escapeHtml(tx("memoryWriteOff", loc))}</p>
            <div class="explore-scope-summary" data-scope-summary></div>
          </div>
          <footer class="explore-sheet__foot">
            <button type="button" class="explore-cta" data-scope-start>${escapeHtml(tx("startRun", loc))}</button>
          </footer>
        </div>
      </div>
    `;
    refreshSummary();
  }

  function currentScopes() {
    return normalizeScopes({
      ...defaultScopesForMode(mode),
      characterVisibility,
      memoryRead,
      memoryWrite,
    });
  }

  function refreshSummary() {
    const node = host.querySelector("[data-scope-summary]");
    if (!node) return;
    node.textContent = scopesSummaryPlainLanguage(currentScopes());
  }

  function show() {
    open = true;
    const sheet = host.querySelector("[data-explore-scope]");
    if (sheet) {
      sheet.hidden = false;
      sheet.classList.add("is-open");
    } else {
      render();
    }
  }

  function hide() {
    open = false;
    const sheet = host.querySelector("[data-explore-scope]");
    if (sheet) {
      sheet.hidden = true;
      sheet.classList.remove("is-open");
    }
  }

  function onClick(event) {
    const close = event.target.closest("[data-scope-close]");
    if (close) {
      hide();
      opts.onCancel?.();
      return;
    }
    const modeCard = event.target.closest(".explore-mode-card");
    if (modeCard) {
      const input = modeCard.querySelector('input[type="radio"]');
      if (input) {
        mode = input.value;
        host.querySelectorAll(".explore-mode-card").forEach((el) => {
          el.classList.toggle("is-active", el.querySelector("input")?.value === mode);
        });
        refreshSummary();
      }
      return;
    }
    const charVis = event.target.closest("[data-scope-char-visibility]");
    if (charVis) {
      characterVisibility = charVis.checked ? "selected_character" : "private";
      refreshSummary();
      return;
    }
    if (event.target.closest("[data-scope-start]")) {
      const normalized = normalizeScopeSheetPayload(
        {
          mode,
          characterVisibility,
          memoryRead,
          memoryWrite,
          sourceConversationSessionId: opts.sourceConversationSessionId,
          title: opts.skillName,
        },
        {
          skillId: opts.skillId,
          agentId: opts.agentId,
          characterId: opts.characterId,
          grantedCapabilities: opts.grantedCapabilities,
        },
      );
      if (!normalized.ok) {
        opts.onError?.(normalized.reason);
        return;
      }
      const api = opts.conversationApi || createProductionConversationApi();
      const created = createSkillRunRecord(normalized.value, { conversationApi: api });
      if (!created.ok) {
        opts.onError?.(created.reason);
        return;
      }
      hide();
      opts.onStarted?.(created.value);
    }
  }

  host.addEventListener("click", onClick);
  render();

  return {
    open: show,
    close: hide,
    setMode(next) {
      if (RUN_MODES.includes(next)) mode = next;
      render();
    },
    getPayloadPreview() {
      return normalizeScopeSheetPayload(
        { mode, characterVisibility, memoryRead, memoryWrite },
        {
          skillId: opts.skillId,
          agentId: opts.agentId,
          characterId: opts.characterId,
          grantedCapabilities: opts.grantedCapabilities,
        },
      );
    },
    destroy() {
      host.removeEventListener("click", onClick);
      host.innerHTML = "";
    },
  };
}
