/**
 * ActionProposal confirmation card (C2) — shared by App chat + phone Pop chat.
 * Reads/writes the same proposal-repository via approve / reject / undo APIs.
 */

import { escapeHtml } from "../lib/utils.js";
import { t } from "../i18n/index.js";
import {
  approveProposal,
  rejectProposal,
  undoProposal,
  getProposalRecord,
  onActionProposal,
  listPendingProposals,
} from "../turn-understanding/index.js";
import { normalizeProposalStatus, isSuccessStatus } from "../turn-understanding/proposal-repository.js";

const STATUS_LABEL = {
  proposed: "shared.actionProposal.statusProposed",
  approved: "shared.actionProposal.statusApproved",
  executing: "shared.actionProposal.statusExecuting",
  completed: "shared.actionProposal.statusCompleted",
  executed: "shared.actionProposal.statusCompleted",
  rejected: "shared.actionProposal.statusRejected",
  failed: "shared.actionProposal.statusFailed",
  expired: "shared.actionProposal.statusExpired",
  undone: "shared.actionProposal.statusUndone",
};

/**
 * Format when-line without inventing clock times for coarse periods.
 * @param {object} record store or repo-shaped record
 */
export function formatProposalWhenLine(record) {
  const proposal = record?.proposal || record || {};
  const params = proposal.parameters || record?.parameters || {};
  const snap = record?.temporalSnapshot || {};
  const tz = String(params.timezone || snap.timezone || "").trim();

  if (params.time || (params.hour != null && params.hour !== "")) {
    let time = params.time ? String(params.time).slice(0, 5) : "";
    if (!time) {
      let hour = Number(params.hour);
      const minute = Number(params.minute ?? 0);
      const hint = `${params.whenText || ""} ${params.period || ""}`;
      // Match executor resolveProposalTime — 下午三点 → 15:00, never leave 03:00.
      if (/下午|午后|晚上|傍晚|afternoon/i.test(hint) && hour > 0 && hour < 12) hour += 12;
      if (/上午|早上|清晨|morning/i.test(hint) && hour === 12) hour = 0;
      time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    const date = String(params.date || "").slice(0, 10)
      || (params.startsAt ? String(params.startsAt).slice(0, 10) : "");
    const bits = [date, time, tz].filter(Boolean);
    return bits.join(" · ") || time;
  }

  if (params.startsAt) {
    const d = new Date(params.startsAt);
    if (!Number.isNaN(d.getTime())) {
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return [ymd, hm, tz].filter(Boolean).join(" · ");
    }
  }

  const whenText = String(params.whenText || "").trim();
  if (whenText) {
    // Prefer period wording already present (下午 / 晚上) — never invent 15:00.
    return tz ? `${whenText} · ${tz}` : whenText;
  }

  if (params.period === "afternoon" || /下午/.test(String(params.whenText || ""))) {
    const afternoon = t("shared.actionProposal.afternoon");
    return tz ? `${afternoon} · ${tz}` : afternoon;
  }

  return tz || "";
}

/**
 * @param {object} record
 */
export function resolveCardUiStatus(record) {
  const raw = String(record?.status || record?.proposal?.status || "proposed");
  if (isSuccessStatus(raw)) return "completed";
  return normalizeProposalStatus(raw);
}

function canShowUndo(record) {
  const status = resolveCardUiStatus(record);
  if (status !== "completed") return false;
  if (record?.undoInfo?.reversible === false) return false;
  if (record?.undoInfo?.eventId || record?.executionResult?.eventId) return true;
  if (record?.proposal?.reversible) return true;
  const cap = String(record?.proposal?.capabilityId || "");
  return cap.includes("calendar");
}

/**
 * @param {object} record
 * @param {{ variant?: "app"|"phone" }} [opts]
 */
export function renderActionProposalCardHtml(record, opts = {}) {
  const proposal = record?.proposal || {};
  const proposalId = String(proposal.proposalId || record?.proposalId || "").trim();
  const status = resolveCardUiStatus(record);
  const risk = String(proposal.risk || record?.risk || "R2");
  const title = String(proposal.title || t("shared.actionProposal.pendingAction")).trim();
  const exactEffect = String(proposal.exactEffect || record?.exactEffect || "").trim();
  const whenLine = formatProposalWhenLine(record);
  const target = describeTarget(proposal);
  const statusLabel = STATUS_LABEL[status] ? t(STATUS_LABEL[status]) : status;
  const variant = opts.variant === "phone" ? "phone" : "app";
  const busy = status === "executing";
  const pending = status === "proposed" || status === "approved";
  const showUndo = canShowUndo(record);
  const summary = record?.executionResult?.summary
    || (status === "failed" ? (record?.executionResult?.reason || t("shared.actionProposal.executionFailed")) : "");

  const actions = pending
    ? `
      <div class="action-proposal-card__actions">
        <button type="button" class="action-proposal-card__btn is-confirm" data-apc-action="confirm" data-proposal-id="${escapeHtml(proposalId)}" ${busy ? "disabled" : ""}>${escapeHtml(t("common.confirm"))}</button>
        <button type="button" class="action-proposal-card__btn is-reject" data-apc-action="reject" data-proposal-id="${escapeHtml(proposalId)}" ${busy ? "disabled" : ""}>${escapeHtml(t("shared.actionProposal.reject"))}</button>
      </div>`
    : showUndo
      ? `
      <div class="action-proposal-card__actions">
        <button type="button" class="action-proposal-card__btn is-undo" data-apc-action="undo" data-proposal-id="${escapeHtml(proposalId)}">${escapeHtml(t("shared.actionProposal.undo"))}</button>
      </div>`
      : "";

  return `
    <article class="action-proposal-card is-${escapeHtml(variant)} is-${escapeHtml(status)}" data-action-proposal-card data-proposal-id="${escapeHtml(proposalId)}" data-status="${escapeHtml(status)}" aria-live="polite">
      <header class="action-proposal-card__head">
        <strong class="action-proposal-card__title">${escapeHtml(title)}</strong>
        <span class="action-proposal-card__risk" data-risk="${escapeHtml(risk)}">${escapeHtml(risk)}</span>
      </header>
      <p class="action-proposal-card__effect">${escapeHtml(exactEffect || t("shared.actionProposal.defaultEffect"))}</p>
      ${whenLine ? `<p class="action-proposal-card__when">${escapeHtml(whenLine)}</p>` : ""}
      ${target ? `<p class="action-proposal-card__target">${escapeHtml(target)}</p>` : ""}
      <p class="action-proposal-card__status">${escapeHtml(statusLabel)}${summary ? ` · ${escapeHtml(String(summary).slice(0, 80))}` : ""}</p>
      ${actions}
    </article>
  `;
}

function describeTarget(proposal) {
  const id = String(proposal?.capabilityId || "");
  const op = String(proposal?.operation || "");
  if (id.includes("calendar") || op.includes("reminder") || op === "create") {
    return t("shared.actionProposal.targetCalendar");
  }
  if (id.includes("weather")) return t("shared.actionProposal.targetWeather");
  if (id.includes("web")) return t("shared.actionProposal.targetWeb");
  if (id.includes("messaging") || id.includes("external")) return t("shared.actionProposal.targetMessaging");
  if (id) return t("shared.actionProposal.targetOther", { id });
  return "";
}

/**
 * Mount / refresh cards into a host element. App and phone share this module.
 *
 * @param {{
 *   host: HTMLElement,
 *   getCompanionId?: () => string,
 *   variant?: "app"|"phone",
 *   onChanged?: (detail: object) => void,
 * }} opts
 * @returns {{ refresh: () => void, destroy: () => void, upsert: (proposalId: string) => void }}
 */
export function bindActionProposalCards(opts = {}) {
  const host = opts.host;
  if (!host) {
    return { refresh() {}, destroy() {}, upsert() {} };
  }

  const variant = opts.variant === "phone" ? "phone" : "app";
  /** @type {Map<string, object>} */
  const shown = new Map();

  function companionId() {
    try {
      return String(opts.getCompanionId?.() || "").trim();
    } catch {
      return "";
    }
  }

  function renderAll() {
    const ids = [...shown.keys()];
    if (!ids.length) {
      host.innerHTML = "";
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.innerHTML = ids
      .map((id) => {
        const record = getProposalRecord(id) || shown.get(id);
        if (!record) return "";
        return renderActionProposalCardHtml(record, { variant });
      })
      .filter(Boolean)
      .join("");
  }

  function upsert(proposalId, seed = null) {
    const id = String(proposalId || "").trim();
    if (!id) return;
    const record = getProposalRecord(id) || seed;
    if (!record) return;
    const cid = companionId();
    const scopeCid = String(record.scope?.companionId || "").trim();
    if (cid && scopeCid && cid !== scopeCid) return;
    shown.set(id, record);
    renderAll();
  }

  function refresh() {
    listPendingProposals({ companionId: companionId() || undefined }).forEach((rec) => {
      const id = rec?.proposal?.proposalId || rec?.proposalId;
      if (id) shown.set(id, rec);
    });
    // Keep completed-with-undo cards that are already shown
    for (const id of [...shown.keys()]) {
      const fresh = getProposalRecord(id);
      if (fresh) shown.set(id, fresh);
    }
    renderAll();
  }

  const unsub = onActionProposal((proposal, meta) => {
    const id = String(proposal?.proposalId || "").trim();
    if (!id) return;
    upsert(id, {
      proposal,
      status: "proposed",
      scope: meta?.scope || {},
      temporalSnapshot: meta?.temporalSnapshot || null,
      exactEffect: proposal?.exactEffect || meta?.exactEffect || "",
    });
    opts.onChanged?.({ type: "proposed", proposalId: id, proposal, meta });
  });

  async function handleAction(action, proposalId, button) {
    const id = String(proposalId || "").trim();
    if (!id || !action) return;
    if (button) {
      button.disabled = true;
      button.classList.add("is-pressed");
    }
    const card = [...host.querySelectorAll("[data-action-proposal-card]")].find(
      (el) => el.getAttribute("data-proposal-id") === id,
    );
    if (card) card.dataset.status = "executing";

    let result;
    try {
      if (action === "confirm") {
        result = await approveProposal(id);
      } else if (action === "reject") {
        result = rejectProposal(id);
      } else if (action === "undo") {
        result = await undoProposal(id);
      } else {
        result = { ok: false, reason: "unknown_action" };
      }
    } catch (err) {
      result = { ok: false, reason: String(err?.message || err) };
    }

    upsert(id);
    // If rejected/expired/failed and not undoable, still keep card briefly for status
    if (result?.ok === false && action === "confirm") {
      upsert(id);
    }
    opts.onChanged?.({ type: action, proposalId: id, result });
    renderAll();
  }

  const onClick = (event) => {
    const btn = event.target.closest?.("[data-apc-action]");
    if (!btn || !host.contains(btn)) return;
    event.preventDefault();
    const action = btn.getAttribute("data-apc-action");
    const proposalId = btn.getAttribute("data-proposal-id") || "";
    if (btn.disabled) {
      // Disabled must not swallow — still give feedback
      btn.classList.add("is-pressed");
      window.setTimeout(() => btn.classList.remove("is-pressed"), 120);
      return;
    }
    void handleAction(action, proposalId, btn);
  };

  host.addEventListener("click", onClick);
  host.classList.add("action-proposal-host");
  host.dataset.actionProposalHost = variant;
  refresh();

  return {
    refresh,
    upsert,
    destroy() {
      unsub();
      host.removeEventListener("click", onClick);
      shown.clear();
      host.innerHTML = "";
    },
  };
}
