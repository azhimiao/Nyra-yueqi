/**
 * Branch panel — consumes Conversation V2 graph (§8.5 / §13.4).
 * List branches, switch, candidate swipe / regenerate hooks.
 */

import { escapeHtml } from "../../lib/utils.js";
import {
  getSession,
  selectVisibleHistory,
  switchBranch,
  switchCandidate,
  forkFromMessage,
  regenerate,
  getActiveCandidate,
} from "../../conversation/index.js";

/**
 * @param {import("../../conversation/schema.js").ConversationSession|null|undefined} session
 */
export function listConversationBranches(session) {
  if (!session?.branches) return [];
  return Object.values(session.branches)
    .filter((b) => b && b.status !== "archived")
    .map((branch) => {
      const chain = selectVisibleHistory(session, { branchId: branch.id, limit: 1 });
      const last = chain[chain.length - 1];
      return {
        id: branch.id,
        label: branch.label || branch.id.slice(-8),
        status: branch.status || "active",
        isActive: branch.id === session.activeBranchId,
        openingId: session.meta?.openingId || "",
        lastText: last?.text || "",
        updatedAt: branch.updatedAt || last?.createdAt || session.updatedAt || "",
        headMessageId: branch.headMessageId || "",
        checkpointCount: Array.isArray(branch.meta?.checkpoints)
          ? branch.meta.checkpoints.length
          : 0,
      };
    })
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/**
 * Active-branch assistant head candidates for swipe UI.
 * @param {import("../../conversation/schema.js").ConversationSession|null|undefined} session
 */
export function listActiveHeadCandidates(session) {
  if (!session?.branches || !session?.messageNodes) return [];
  const branch = session.branches[session.activeBranchId];
  if (!branch?.headMessageId) return [];
  const node = session.messageNodes[branch.headMessageId];
  if (!node || node.role !== "assistant") return [];
  const active = getActiveCandidate(node);
  return (node.candidates || [])
    .filter((c) => c && c.status !== "archived")
    .map((c, index) => ({
      id: c.id,
      index,
      total: node.candidates.length,
      content: String(c.content || ""),
      isActive: active?.id === c.id,
      messageId: node.id,
    }));
}

/**
 * @param {HTMLElement} host
 * @param {{
 *   getSessionId?: () => string,
 *   onSwitched?: () => void,
 *   onToast?: (msg: string) => void,
 *   onRegenerate?: (messageId: string) => void,
 * }} [deps]
 */
export function createBranchPanel(host, deps = {}) {
  if (!host) {
    return {
      open() {},
      close() {},
      refresh() {},
      isOpen: () => false,
      destroy() {},
    };
  }

  let open = false;

  host.classList.add("scenario-branch-panel");
  host.hidden = true;
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "时间线分支");
  host.innerHTML = `
    <div class="scenario-branch-panel__sheet" data-branch-sheet>
      <header class="scenario-branch-panel__head">
        <strong id="scenario-branch-panel-title">时间线</strong>
        <button type="button" class="scenario-btn" data-branch-close aria-label="关闭分支面板">关闭</button>
      </header>
      <div class="scenario-branch-panel__candidates" data-branch-candidates hidden role="group" aria-label="候选回复"></div>
      <div class="scenario-branch-panel__list" data-branch-list role="listbox" aria-label="分支列表"></div>
      <footer class="scenario-branch-panel__foot">
        <button type="button" class="scenario-btn" data-branch-fork>从这里分支</button>
        <button type="button" class="scenario-btn" data-branch-regen>重新生成</button>
      </footer>
    </div>
  `;
  host.setAttribute("aria-labelledby", "scenario-branch-panel-title");

  const listHost = host.querySelector("[data-branch-list]");
  const candHost = host.querySelector("[data-branch-candidates]");

  function sessionId() {
    return String(deps.getSessionId?.() || "").trim();
  }

  function paint() {
    const sid = sessionId();
    const session = sid ? getSession(sid) : null;
    const branches = listConversationBranches(session);
    if (listHost) {
      if (!branches.length) {
        listHost.innerHTML = `<p class="scenario-empty">还没有分支。开幕后会出现时间线。</p>`;
      } else {
        listHost.innerHTML = branches.map((b) => `
          <button type="button" role="option"
            class="scenario-branch-row ${b.isActive ? "is-active" : ""}"
            data-switch-branch="${escapeHtml(b.id)}"
            aria-pressed="${b.isActive ? "true" : "false"}"
            aria-selected="${b.isActive ? "true" : "false"}">
            <strong>${escapeHtml(b.label)}</strong>
            <span>${escapeHtml(b.lastText || "（空）")}</span>
            <em>${escapeHtml(b.updatedAt ? String(b.updatedAt).slice(0, 19).replace("T", " ") : "")}</em>
          </button>
        `).join("");
      }
    }

    const cands = listActiveHeadCandidates(session);
    if (candHost) {
      if (cands.length > 1) {
        candHost.hidden = false;
        const active = cands.find((c) => c.isActive) || cands[0];
        const idx = (active?.index ?? 0) + 1;
        candHost.innerHTML = `
          <div class="scenario-candidate-strip" data-candidate-strip>
            <button type="button" class="scenario-btn" data-cand-prev aria-label="上一个候选">‹</button>
            <span data-cand-label>${idx} / ${cands.length}</span>
            <button type="button" class="scenario-btn" data-cand-next aria-label="下一个候选">›</button>
          </div>
          <p class="scenario-candidate-preview">${escapeHtml((active?.content || "").slice(0, 160))}</p>
        `;
      } else {
        candHost.hidden = true;
        candHost.innerHTML = "";
      }
    }
  }

  function setOpen(next) {
    open = Boolean(next);
    if (open) {
      host.hidden = false;
      host.removeAttribute("hidden");
    } else {
      host.hidden = true;
      host.setAttribute("hidden", "");
    }
    host.classList.toggle("is-open", open);
    host.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) paint();
  }

  const onClick = (event) => {
    if (event.target.closest("[data-branch-close]")) {
      setOpen(false);
      return;
    }
    const switchBtn = event.target.closest("[data-switch-branch]");
    if (switchBtn) {
      const sid = sessionId();
      const bid = switchBtn.dataset.switchBranch;
      if (sid && bid) {
        const result = switchBranch(sid, bid);
        if (!result.ok) deps.onToast?.(result.reason || "无法切换分支");
        else {
          paint();
          deps.onSwitched?.();
        }
      }
      return;
    }
    if (event.target.closest("[data-cand-prev]") || event.target.closest("[data-cand-next]")) {
      const sid = sessionId();
      const session = sid ? getSession(sid) : null;
      const cands = listActiveHeadCandidates(session);
      if (!sid || cands.length < 2) return;
      const activeIdx = Math.max(0, cands.findIndex((c) => c.isActive));
      const delta = event.target.closest("[data-cand-next]") ? 1 : -1;
      const next = cands[(activeIdx + delta + cands.length) % cands.length];
      const result = switchCandidate(sid, next.messageId, next.id);
      if (!result.ok) deps.onToast?.(result.reason || "无法切换候选");
      else {
        paint();
        deps.onSwitched?.();
      }
      return;
    }
    if (event.target.closest("[data-branch-fork]")) {
      const sid = sessionId();
      const session = sid ? getSession(sid) : null;
      const branch = session?.branches?.[session.activeBranchId];
      if (!sid || !branch?.headMessageId) {
        deps.onToast?.("还没有可分叉的消息");
        return;
      }
      const result = forkFromMessage(sid, branch.headMessageId, {
        label: `分支 ${new Date().toLocaleTimeString()}`,
      });
      if (!result.ok) deps.onToast?.(result.reason || "分叉失败");
      else {
        paint();
        deps.onSwitched?.();
        deps.onToast?.("已创建新时间线");
      }
      return;
    }
    if (event.target.closest("[data-branch-regen]")) {
      const sid = sessionId();
      const session = sid ? getSession(sid) : null;
      const cands = listActiveHeadCandidates(session);
      const active = cands.find((c) => c.isActive);
      const text = active?.content || "";
      if (!sid) {
        deps.onToast?.("会话未就绪");
        return;
      }
      if (typeof deps.onRegenerate === "function") {
        if (!active?.messageId) {
          deps.onToast?.("没有可重新生成的回复");
          return;
        }
        deps.onRegenerate(active.messageId);
        return;
      }
      if (!text) {
        deps.onToast?.("没有可重生成的回复");
        return;
      }
      const result = regenerate(sid, text, { source: "branch_panel" });
      if (!result.ok) deps.onToast?.(result.reason || "重生成失败");
      else {
        paint();
        deps.onSwitched?.();
      }
    }
  };

  host.addEventListener("click", onClick);

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    refresh: paint,
    isOpen: () => open,
    /** Contract hooks for verify / e2e */
    api: {
      listBranches: () => listConversationBranches(getSession(sessionId())),
      listCandidates: () => listActiveHeadCandidates(getSession(sessionId())),
      switchBranch: (branchId) => switchBranch(sessionId(), branchId),
      switchCandidate: (messageId, candidateId) =>
        switchCandidate(sessionId(), messageId, candidateId),
      regenerate: (text) => regenerate(sessionId(), text, { source: "branch_panel_api" }),
    },
    destroy() {
      host.removeEventListener("click", onClick);
      host.replaceChildren();
      host.hidden = true;
    },
  };
}
