/**
 * Task Center UI — running / awaiting / done; pause/cancel; approval exact effect.
 * Reads unified Agent + Assistant tasks via task-center-facade (OC-task-center-unify).
 */

import {
  listUnifiedTasks,
  getUnifiedTask,
  getPendingUnifiedApprovals,
  buildApprovalSheet,
  formatUnifiedAuditTimeline,
  approveUnifiedTask,
  rejectUnifiedTask,
  pauseUnifiedTask,
  resumeUnifiedTask,
  cancelUnifiedTask,
} from "../task-center-facade.js";
import { t } from "../../i18n/index.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STATE_LABEL = {
  draft: "tasks.states.draft",
  proposed: "tasks.states.proposed",
  awaiting_approval: "tasks.states.awaitingApproval",
  running: "tasks.states.running",
  paused: "tasks.states.paused",
  completed: "tasks.states.completed",
  failed: "tasks.states.failed",
  cancelled: "tasks.states.cancelled",
};

function stateLabel(state) {
  return STATE_LABEL[state] ? t(STATE_LABEL[state]) : state;
}

/**
 * @param {HTMLElement|null} root
 * @param {{
 *   getCharacterId?: () => string,
 *   onToast?: (msg: string) => void,
 *   refreshIcons?: () => void,
 *   getApproveOpts?: () => object,
 * }} [opts]
 */
export function mountTaskCenterUi(root, opts = {}) {
  if (!root) return { open() {}, refresh() {}, destroy() {} };

  let filter = "active"; // active | awaiting | done | all
  let selectedId = "";
  /** @type {(() => void)|null} */
  let onExternalRefresh = null;

  function characterId() {
    return opts.getCharacterId?.() || "";
  }

  function toast(msg) {
    opts.onToast?.(msg);
  }

  function approveOpts() {
    return opts.getApproveOpts?.() || {};
  }

  function buckets() {
    const cid = characterId();
    const all = listUnifiedTasks({ characterId: cid || undefined, limit: 80 });
    const awaiting = all.filter((t) => t.state === "awaiting_approval");
    const running = all.filter((t) =>
      t.state === "running" || t.state === "paused" || t.state === "proposed" || t.state === "draft");
    const done = all.filter((t) => ["completed", "failed", "cancelled"].includes(t.state));
    return { all, awaiting, running, done };
  }

  function renderList() {
    const { all, awaiting, running, done } = buckets();
    let rows = all;
    if (filter === "active") rows = [...awaiting, ...running];
    else if (filter === "awaiting") rows = awaiting;
    else if (filter === "done") rows = done;

    const list = root.querySelector("[data-task-list]");
    const counts = root.querySelector("[data-task-counts]");
    if (counts) {
      counts.textContent = t("tasks.counts", { running: running.length, awaiting: awaiting.length, done: done.length });
    }
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = `<p class="mini-task-empty">${t("tasks.empty")}</p>`;
      return;
    }
    list.innerHTML = rows
      .map((taskRow) => {
        const active = taskRow.id === selectedId ? "is-selected" : "";
        const sourceTag = taskRow.source === "assistant" ? t("tasks.assistant") : "";
        return `
          <button type="button" class="mini-task-row ${active}" data-task-select="${escapeHtml(taskRow.id)}">
            <span class="mini-task-row__state" data-state="${escapeHtml(taskRow.state)}">${escapeHtml(stateLabel(taskRow.state))}</span>
            <strong>${escapeHtml(taskRow.intent?.title || taskRow.intent?.capabilityId || t("tasks.task"))}</strong>
            <em>${escapeHtml(sourceTag || taskRow.intent?.capabilityId || "")}</em>
          </button>`;
      })
      .join("");
  }

  function renderDetail() {
    const detail = root.querySelector("[data-task-detail]");
    if (!detail) return;
    const task = selectedId ? getUnifiedTask(selectedId) : null;
    if (!task) {
      detail.innerHTML = `<p class="mini-task-empty">${t("tasks.selectHint")}</p>`;
      return;
    }

    const pending = (task.approvals || []).find((a) => a.decision === "pending");
    const sheet = pending ? buildApprovalSheet(pending) : null;
    const timeline = formatUnifiedAuditTimeline(task);
    const canPause = ["running", "awaiting_approval", "proposed"].includes(task.state);
    const canResume = task.state === "paused";
    const canCancel = !["completed", "failed", "cancelled"].includes(task.state);

    detail.innerHTML = `
      <header class="mini-task-detail__head">
        <strong>${escapeHtml(task.intent?.title || t("tasks.task"))}</strong>
        <span data-state="${escapeHtml(task.state)}">${escapeHtml(stateLabel(task.state))}</span>
      </header>
      <p class="mini-task-detail__summary">${escapeHtml(task.intent?.summary || "")}</p>
      ${
        task.outcome
          ? `<article class="mini-task-outcome" data-task-outcome>
              <strong>${escapeHtml(task.outcome.message)}</strong>
              ${task.outcome.nextActions?.length ? `<ul>${task.outcome.nextActions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : ""}
            </article>`
          : ""
      }
      ${
        sheet
          ? `<article class="mini-task-approval" data-task-approval>
              <strong>${t("tasks.approvalRequired", { risk: escapeHtml(sheet.risk) })}</strong>
              <p class="mini-task-approval__effect" data-exact-effect>${escapeHtml(sheet.exactEffect)}</p>
              <ul>${sheet.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
              <div class="mini-task-approval__actions">
                <button type="button" class="mini-app-cta" data-task-approve="${escapeHtml(sheet.id)}">${t("tasks.approve")}</button>
                <button type="button" class="mini-app-cta mini-app-cta--ghost" data-task-reject="${escapeHtml(sheet.id)}">${t("tasks.reject")}</button>
              </div>
            </article>`
          : ""
      }
      <div class="mini-task-actions">
        ${canPause ? `<button type="button" class="mini-text-btn" data-task-pause>${t("tasks.pause")}</button>` : ""}
        ${canResume ? `<button type="button" class="mini-text-btn" data-task-resume>${t("tasks.resume")}</button>` : ""}
        ${canCancel ? `<button type="button" class="mini-text-btn mini-text-btn--danger" data-task-cancel>${t("tasks.cancel")}</button>` : ""}
      </div>
      <div class="mini-task-audit">
        <strong>${t("tasks.audit")}</strong>
        <ol>${
          timeline.length
            ? timeline.map((ev) => `<li><time>${escapeHtml(String(ev.at || "").slice(11, 19))}</time> ${escapeHtml(ev.summary)}${ev.decision ? ` · ${escapeHtml(ev.decision)}` : ""}</li>`).join("")
            : `<li>${t("tasks.noAudit")}</li>`
        }</ol>
      </div>
    `;
  }

  function refresh() {
    renderList();
    renderDetail();
    opts.refreshIcons?.();
  }

  function open() {
    filter = "active";
    root.querySelectorAll("[data-task-filter]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-task-filter") === filter);
    });
    const { awaiting, running } = buckets();
    selectedId = awaiting[0]?.id || running[0]?.id || listUnifiedTasks({ limit: 1 })[0]?.id || "";
    refresh();
  }

  root.addEventListener("click", async (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const filterBtn = target.closest("[data-task-filter]");
    if (filterBtn) {
      filter = filterBtn.getAttribute("data-task-filter") || "active";
      root.querySelectorAll("[data-task-filter]").forEach((btn) => {
        btn.classList.toggle("is-active", btn === filterBtn);
      });
      refresh();
      return;
    }
    const select = target.closest("[data-task-select]");
    if (select) {
      selectedId = select.getAttribute("data-task-select") || "";
      refresh();
      return;
    }
    if (target.closest("[data-task-pause]") && selectedId) {
      await pauseUnifiedTask(selectedId);
      toast(t("tasks.toastPaused"));
      refresh();
      return;
    }
    if (target.closest("[data-task-resume]") && selectedId) {
      await resumeUnifiedTask(selectedId);
      toast(t("tasks.toastResumed"));
      refresh();
      return;
    }
    if (target.closest("[data-task-cancel]") && selectedId) {
      await cancelUnifiedTask(selectedId);
      toast(t("tasks.toastCancelled"));
      refresh();
      return;
    }
    const approveBtn = target.closest("[data-task-approve]");
    if (approveBtn && selectedId) {
      await approveUnifiedTask(selectedId, approveBtn.getAttribute("data-task-approve") || "", approveOpts());
      toast(t("tasks.toastApproved"));
      refresh();
      return;
    }
    const rejectBtn = target.closest("[data-task-reject]");
    if (rejectBtn && selectedId) {
      await rejectUnifiedTask(selectedId, rejectBtn.getAttribute("data-task-reject") || "");
      toast(t("tasks.toastRejected"));
      refresh();
    }
  });

  function bindExternalRefresh() {
    if (typeof window === "undefined") return;
    onExternalRefresh = () => refresh();
    window.addEventListener("yueqi.assist.task-created", onExternalRefresh);
    window.addEventListener("yueqi.assist.task-updated", onExternalRefresh);
    window.addEventListener("yueqi.task-center.refresh", onExternalRefresh);
  }
  bindExternalRefresh();

  return {
    open,
    refresh,
    destroy() {
      if (onExternalRefresh && typeof window !== "undefined") {
        window.removeEventListener("yueqi.assist.task-created", onExternalRefresh);
        window.removeEventListener("yueqi.assist.task-updated", onExternalRefresh);
        window.removeEventListener("yueqi.task-center.refresh", onExternalRefresh);
      }
    },
    /** @param {string} taskId */
    select(taskId) {
      selectedId = taskId;
      refresh();
    },
    getPendingCount() {
      const cid = characterId();
      return getPendingUnifiedApprovals(cid).length;
    },
  };
}

/**
 * Static HTML shell for phone screen.
 */
export function buildTaskCenterScreenHtml() {
  return `
    <section class="mini-view mini-tasks" data-phone-screen="tasks" hidden>
      <header class="mini-appbar">
        <button type="button" class="mini-icon-button" data-phone-back aria-label="${t("tasks.back")}"><i data-lucide="chevron-left"></i></button>
        <div><strong>${t("tasks.title")}</strong><span data-task-counts>${t("tasks.countPlaceholder")}</span></div>
        <span></span>
      </header>
      <div class="mini-task-filters" role="tablist" aria-label="${t("tasks.filterLabel")}">
        <button type="button" class="is-active" data-task-filter="active">${t("tasks.filters.active")}</button>
        <button type="button" data-task-filter="awaiting">${t("tasks.filters.awaiting")}</button>
        <button type="button" data-task-filter="done">${t("tasks.filters.done")}</button>
        <button type="button" data-task-filter="all">${t("tasks.filters.all")}</button>
      </div>
      <div class="mini-task-layout mini-app-scroll">
        <div class="mini-task-list" data-task-list></div>
        <div class="mini-task-detail" data-task-detail></div>
      </div>
    </section>
  `;
}
