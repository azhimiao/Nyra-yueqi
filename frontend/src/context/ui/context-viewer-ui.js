/**
 * Context Graph viewer — why remembered, source, last used; edit/delete/freeze/forbid.
 */

import { listItems } from "../store.js";
import {
  deleteMemory,
  editMemory,
  forbidProactiveUse,
  freezeMemory,
  getMemoryViewerModel,
} from "../actions.js";
import { migrateIntoContextGraph } from "../migrate.js";
import {
  clearContextTraces,
  getContextTrace,
  listContextTraces,
} from "../inspector.js";
import { t } from "../../i18n/index.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const KIND_LABEL = {
  episodic: "contextCenter.kinds.episodic",
  semantic: "contextCenter.kinds.semantic",
  procedural: "contextCenter.kinds.procedural",
  goal_project: "contextCenter.kinds.goalProject",
  relational: "contextCenter.kinds.relational",
};

/**
 * @param {HTMLElement|null} root
 * @param {{
 *   getCharacterId?: () => string,
 *   onToast?: (msg: string) => void,
 *   refreshIcons?: () => void,
 * }} [opts]
 */
export function mountContextViewerUi(root, opts = {}) {
  if (!root) return { open() {}, refresh() {}, destroy() {} };

  let filter = "all";
  let selectedId = "";
  let migrated = false;
  let view = "memory";
  let selectedTraceId = "";

  function characterId() {
    return opts.getCharacterId?.() || "";
  }

  function toast(msg) {
    opts.onToast?.(msg);
  }

  function ensureMigrated() {
    if (migrated) return;
    try {
      migrateIntoContextGraph({ readLiveStores: true });
    } catch {
      /* ignore */
    }
    migrated = true;
  }

  function rows() {
    const cid = characterId();
    let items = listItems({ characterId: cid || undefined, limit: 120 });
    if (filter !== "all") items = items.filter((i) => i.kind === filter);
    return items;
  }

  function renderList() {
    const list = root.querySelector("[data-ctx-list]");
    const counts = root.querySelector("[data-ctx-counts]");
    const items = rows();
    if (counts) {
      counts.textContent = t("contextCenter.counts", { count: items.length });
    }
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<p class="mini-context-empty">${t("contextCenter.empty")}</p>`;
      return;
    }
    list.innerHTML = items
      .map((item) => {
        const badges = [
          KIND_LABEL[item.kind] ? t(KIND_LABEL[item.kind]) : item.kind,
          item.frozen ? t("contextCenter.frozen") : "",
          item.forbidProactive ? t("contextCenter.proactiveBlocked") : "",
          item.conflictState !== "none" ? t("contextCenter.conflict") : "",
        ]
          .filter(Boolean)
          .map((b) => `<span class="mini-context-badge">${escapeHtml(b)}</span>`)
          .join("");
        return `
          <button type="button" class="mini-context-card${selectedId === item.id ? " is-selected" : ""}" data-ctx-select="${escapeHtml(item.id)}">
            <strong>${escapeHtml(item.summary || item.content)}</strong>
            <small>${badges}</small>
            <small class="mini-context-meta">${t("contextCenter.sourceConfidence", { source: escapeHtml(item.source), confidence: (Number(item.confidence) * 100).toFixed(0) })}</small>
          </button>
        `;
      })
      .join("");
  }

  function renderDetail() {
    const detail = root.querySelector("[data-ctx-detail]");
    if (!detail) return;
    if (!selectedId) {
      detail.innerHTML = `<p class="mini-context-empty">${t("contextCenter.selectHint")}</p>`;
      return;
    }
    const model = getMemoryViewerModel(selectedId);
    if (!model) {
      detail.innerHTML = `<p class="mini-context-empty">${t("contextCenter.missing")}</p>`;
      selectedId = "";
      return;
    }
    detail.innerHTML = `
      <h3>${escapeHtml(model.summary)}</h3>
      <dl>
        <dt>${t("contextCenter.whyRemembered")}</dt><dd>${escapeHtml(model.whyRemembered)}</dd>
        <dt>${t("contextCenter.source")}</dt><dd>${escapeHtml(model.source)}${model.sourceRef ? ` · ${escapeHtml(model.sourceRef)}` : ""}</dd>
        <dt>${t("contextCenter.occurredAt")}</dt><dd>${escapeHtml(model.occurredAt || "—")}</dd>
        <dt>${t("contextCenter.lastUsed")}</dt><dd>${escapeHtml(model.lastUsedAt || t("contextCenter.neverRetrieved"))}</dd>
        <dt>${t("contextCenter.privacy")}</dt><dd>${escapeHtml(model.privacyLevel)} · ${t("contextCenter.retention", { value: escapeHtml(model.retention) })}</dd>
        <dt>${t("contextCenter.conflict")}</dt><dd>${escapeHtml(model.conflictState)}</dd>
        <dt>${t("contextCenter.content")}</dt><dd>${escapeHtml(model.content)}</dd>
      </dl>
      <div class="mini-context-actions">
        <button type="button" data-ctx-action="edit">${t("contextCenter.edit")}</button>
        <button type="button" data-ctx-action="freeze">${model.frozen ? t("contextCenter.unfreeze") : t("contextCenter.freeze")}</button>
        <button type="button" data-ctx-action="forbid">${model.forbidProactive ? t("contextCenter.allowProactive") : t("contextCenter.forbidProactive")}</button>
        <button type="button" data-ctx-danger data-ctx-action="delete">${t("contextCenter.delete")}</button>
      </div>
    `;
  }

  function renderInspector() {
    const list = root.querySelector("[data-ctx-trace-list]");
    const detail = root.querySelector("[data-ctx-trace-detail]");
    const rows = listContextTraces({ characterId: characterId(), limit: 30 });
    if (list) {
      list.innerHTML = rows.length ? rows.map((trace) => `
        <button type="button" class="mini-context-card${selectedTraceId === trace.id ? " is-selected" : ""}" data-ctx-trace-select="${escapeHtml(trace.id)}">
          <strong>${escapeHtml(trace.request.purpose)} · ${escapeHtml(trace.request.appId || "unknown")}</strong>
          <small>${escapeHtml(trace.request.turnIntent || "—")} · ${Number(trace.trace.totalManagedTokens) || 0} tokens</small>
          <small class="mini-context-meta">${escapeHtml(trace.createdAt.replace("T", " ").slice(0, 19))}</small>
        </button>
      `).join("") : `<p class="mini-context-empty">${t("contextCenter.noTraces")}</p>`;
    }
    if (!detail) return;
    const trace = getContextTrace(selectedTraceId) || rows[0] || null;
    if (!trace) {
      detail.innerHTML = `<p class="mini-context-empty">${t("contextCenter.inspectorHint")}</p>`;
      return;
    }
    selectedTraceId = trace.id;
    const sourceRows = trace.provenance.length
      ? trace.provenance.map((item) => `<li><strong>${escapeHtml(item.source)}</strong><span>${escapeHtml(item.sourceId || "—")} · ${item.tokens || 0} tokens${item.score == null ? "" : ` · score ${Number(item.score).toFixed(2)}`}</span></li>`).join("")
      : `<li><span>${t("contextCenter.noLongTermSources")}</span></li>`;
    const blockRows = trace.blocks.length
      ? trace.blocks.map((item) => `<details><summary>${escapeHtml(item.id)} · ${item.tokens} tokens${item.truncated ? ` · ${t("contextCenter.truncated")}` : ""}</summary><pre>${escapeHtml(item.text)}</pre></details>`).join("")
      : `<p class="mini-context-empty">${t("contextCenter.noImplicitBlocks")}</p>`;
    const redactions = trace.redactions.length
      ? trace.redactions.map((item) => `<li>${escapeHtml(item.reason)}${item.source ? ` · ${escapeHtml(item.source)}` : ""}${item.count ? ` · ${t("contextCenter.items", { count: item.count })}` : ""}</li>`).join("")
      : `<li>${t("contextCenter.none")}</li>`;
    detail.innerHTML = `
      <h3>${escapeHtml(trace.request.purpose)} / ${escapeHtml(trace.request.turnIntent || "—")}</h3>
      <dl>
        <dt>${t("contextCenter.historyAuthority")}</dt><dd>${escapeHtml(trace.trace.historyAuthority || "—")}</dd>
        <dt>${t("contextCenter.sessionBranch")}</dt><dd>${escapeHtml(trace.request.conversationSessionId || "—")} / ${escapeHtml(trace.request.branchId || "—")}</dd>
        <dt>${t("contextCenter.budget")}</dt><dd>${t("contextCenter.budgetDetail", { used: trace.trace.totalManagedTokens, total: trace.trace.managedCapacity || trace.trace.totalBudget, reserve: trace.trace.outputReserve })}${trace.trace.withinBudget ? ` · ${t("contextCenter.withinBudget")}` : ` · ${t("contextCenter.overBudget")}`}</dd>
        <dt>${t("contextCenter.composition")}</dt><dd>${t("contextCenter.compositionDetail", { history: trace.trace.historyTokens, blocks: trace.trace.blockTokens, worldbook: trace.trace.worldbookTokens, current: trace.trace.currentTokens })}</dd>
      </dl>
      <h4>${t("contextCenter.injectedBlocks")}</h4>
      <div class="mini-context-trace-blocks">${blockRows}</div>
      <h4>${t("contextCenter.sources")}</h4><ul class="mini-context-source-list">${sourceRows}</ul>
      <h4>${t("contextCenter.redactions")}</h4><ul class="mini-context-source-list">${redactions}</ul>
    `;
  }

  function renderMode() {
    const memoryHost = root.querySelector("[data-ctx-memory-view]");
    const traceHost = root.querySelector("[data-ctx-trace-view]");
    if (memoryHost) memoryHost.hidden = view !== "memory";
    if (traceHost) traceHost.hidden = view !== "inspector";
    root.querySelectorAll("[data-ctx-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.getAttribute("data-ctx-mode") === view);
    });
    if (view === "inspector") renderInspector();
  }

  function refresh() {
    ensureMigrated();
    renderList();
    renderDetail();
    renderMode();
    opts.refreshIcons?.();
  }

  function onClick(event) {
    const modeButton = event.target.closest("[data-ctx-mode]");
    if (modeButton) {
      view = modeButton.getAttribute("data-ctx-mode") === "inspector" ? "inspector" : "memory";
      refresh();
      return;
    }
    const traceSelect = event.target.closest("[data-ctx-trace-select]");
    if (traceSelect) {
      selectedTraceId = traceSelect.getAttribute("data-ctx-trace-select") || "";
      renderInspector();
      return;
    }
    if (event.target.closest("[data-ctx-clear-traces]")) {
      clearContextTraces();
      selectedTraceId = "";
      toast(t("contextCenter.toastCleared"));
      renderInspector();
      return;
    }
    const filterBtn = event.target.closest("[data-ctx-filter]");
    if (filterBtn) {
      filter = filterBtn.getAttribute("data-ctx-filter") || "all";
      root.querySelectorAll("[data-ctx-filter]").forEach((b) => {
        b.classList.toggle("is-active", b === filterBtn);
      });
      refresh();
      return;
    }

    const select = event.target.closest("[data-ctx-select]");
    if (select) {
      selectedId = select.getAttribute("data-ctx-select") || "";
      refresh();
      return;
    }

    const actionBtn = event.target.closest("[data-ctx-action]");
    if (!actionBtn || !selectedId) return;
    const action = actionBtn.getAttribute("data-ctx-action");
    const model = getMemoryViewerModel(selectedId);

    if (action === "delete") {
      deleteMemory(selectedId);
      selectedId = "";
      toast(t("contextCenter.toastDeleted"));
      refresh();
      return;
    }
    if (action === "freeze") {
      freezeMemory(selectedId, !model?.frozen);
      toast(model?.frozen ? t("contextCenter.toastUnfrozen") : t("contextCenter.toastFrozen"));
      refresh();
      return;
    }
    if (action === "forbid") {
      forbidProactiveUse(selectedId, !model?.forbidProactive);
      toast(model?.forbidProactive ? t("contextCenter.toastProactiveAllowed") : t("contextCenter.toastProactiveBlocked"));
      refresh();
      return;
    }
    if (action === "edit") {
      const next = typeof window !== "undefined"
        ? window.prompt(t("contextCenter.promptEdit"), model?.content || "")
        : null;
      if (next == null) return;
      if (model?.frozen) {
        freezeMemory(selectedId, false);
      }
      const res = editMemory(selectedId, { content: next });
      toast(res.ok ? t("contextCenter.toastEdited") : res.error || t("contextCenter.editFailed"));
      refresh();
    }
  }

  root.addEventListener("click", onClick);
  document.addEventListener("yueqi:context-trace", refresh);

  return {
    open() {
      refresh();
    },
    refresh,
    destroy() {
      root.removeEventListener("click", onClick);
      document.removeEventListener("yueqi:context-trace", refresh);
    },
  };
}

/** Static HTML shell for phone screen */
export function buildContextViewerScreenHtml() {
  return `
    <section class="mini-view mini-context" data-phone-screen="context" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${t("contextCenter.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${t("contextCenter.title")}</strong><span data-ctx-counts>${t("contextCenter.subtitle")}</span></div>
        <span></span>
      </header>
      <div class="mini-context-modes" role="tablist" aria-label="${t("contextCenter.viewLabel")}">
        <button type="button" class="is-active" data-ctx-mode="memory">${t("contextCenter.memoryView")}</button>
        <button type="button" data-ctx-mode="inspector">${t("contextCenter.inspectorView")}</button>
      </div>
      <div data-ctx-memory-view>
      <div class="mini-context-filters" role="tablist" aria-label="${t("contextCenter.typeLabel")}">
        <button type="button" class="is-active" data-ctx-filter="all">${t("contextCenter.all")}</button>
        <button type="button" data-ctx-filter="episodic">${t("contextCenter.kinds.episodic")}</button>
        <button type="button" data-ctx-filter="semantic">${t("contextCenter.kinds.semantic")}</button>
        <button type="button" data-ctx-filter="relational">${t("contextCenter.kinds.relational")}</button>
        <button type="button" data-ctx-filter="goal_project">${t("contextCenter.kinds.goalProject")}</button>
        <button type="button" data-ctx-filter="procedural">${t("contextCenter.kinds.procedural")}</button>
      </div>
      <div class="mini-context-layout mini-app-scroll">
        <div class="mini-context-list" data-ctx-list></div>
        <div class="mini-context-detail" data-ctx-detail></div>
      </div>
      </div>
      <div class="mini-context-inspector mini-app-scroll" data-ctx-trace-view hidden>
        <div class="mini-context-trace-head"><p>${t("contextCenter.localOnlyNote")}</p><button type="button" data-ctx-clear-traces>${t("contextCenter.clear")}</button></div>
        <div class="mini-context-layout">
          <div class="mini-context-list" data-ctx-trace-list></div>
          <div class="mini-context-detail" data-ctx-trace-detail></div>
        </div>
      </div>
    </section>
  `;
}
