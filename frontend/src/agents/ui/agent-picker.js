/**
 * Agent Picker — bottom sheet / chip list; updates selection.js.
 */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";
import {
  getActiveAgent,
  listSelectableAgents,
  selectAgent,
} from "../selection.js";
import { tx } from "../../skill-platform/ui/i18n.js";

/** @type {HTMLElement|null} */
let globalHost = null;

/** @type {WeakMap<HTMLElement, ReturnType<typeof createPickerController>>} */
const hostControllers = new WeakMap();

/** @type {Set<(agent: object) => void>} */
const listeners = new Set();

/**
 * @param {HTMLElement} host
 * @param {{ conversationSessionId?: string, onSelected?: (agent: object) => void, locale?: string }} [opts]
 */
function createPickerController(host, opts = {}) {
  let open = false;
  let sessionId = opts.conversationSessionId || "";

  function syncHostChrome() {
    host.hidden = !open;
    host.setAttribute("aria-hidden", open ? "false" : "true");
    host.classList.toggle("is-open", open);
  }

  function render() {
    if (!host) return;
    const agents = listSelectableAgents();
    const active = getActiveAgent(sessionId);
    // Closed: keep portal out of layout entirely (no in-flow leak under Pop tabs).
    if (!open) {
      host.innerHTML = "";
      syncHostChrome();
      return;
    }
    host.innerHTML = `
      <div class="explore-agent-picker is-open" data-agent-picker>
        <button type="button" class="explore-sheet__scrim" data-picker-close aria-label="Close"></button>
        <div class="explore-sheet__panel explore-sheet__panel--picker" role="dialog" aria-modal="true">
          <header class="explore-sheet__head">
            <button type="button" class="explore-text-btn" data-picker-close>${escapeHtml(tx("cancel", opts.locale))}</button>
            <strong>${escapeHtml(tx("selectAgent", opts.locale))}</strong>
            <span></span>
          </header>
          <div class="explore-agent-list explore-app-scroll" data-picker-list>
            ${agents.map((agent) => `
              <button type="button" class="explore-agent-row${agent.id === active?.id ? " is-active" : ""}" data-picker-agent="${escapeHtml(agent.id)}">
                <span class="explore-agent-row__icon" data-tone="sea"><i data-lucide="${escapeHtml(agent.icon || "bot")}"></i></span>
                <span class="explore-agent-row__body">
                  <strong>${escapeHtml(agent.name)}</strong>
                  <em>${escapeHtml(agent.tagline || "")}</em>
                </span>
                ${agent.id === active?.id ? '<span class="explore-agent-row__badge">✓</span>' : ""}
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    syncHostChrome();
    refreshIcons(host);
  }

  function show(nextSessionId) {
    if (nextSessionId != null) sessionId = String(nextSessionId);
    open = true;
    render();
  }

  function hide() {
    open = false;
    render();
  }

  function onClick(event) {
    if (event.target.closest("[data-picker-close]")) {
      hide();
      return;
    }
    const row = event.target.closest("[data-picker-agent]");
    if (!row) return;
    const agentId = row.dataset.pickerAgent;
    const result = selectAgent(agentId, { conversationSessionId: sessionId || undefined });
    if (result.ok) {
      opts.onSelected?.(result.value);
      for (const fn of listeners) {
        try {
          fn(result.value);
        } catch {
          /* ignore */
        }
      }
      hide();
    }
  }

  host.addEventListener("click", onClick);
  render();

  return {
    open: show,
    close: hide,
    refresh: render,
    destroy() {
      host.removeEventListener("click", onClick);
      hostControllers.delete(host);
      if (globalHost === host) globalHost = null;
      open = false;
      host.innerHTML = "";
      syncHostChrome();
    },
  };
}

/**
 * Mount a persistent picker host (phone shell or document body).
 * Reuses the existing controller for the same host (avoids duplicate listeners).
 * @param {HTMLElement} host
 * @param {{ conversationSessionId?: string, onSelected?: (agent: object) => void, locale?: string }} [opts]
 */
export function mountAgentPickerHost(host, opts = {}) {
  if (!host) {
    return { open() {}, close() {}, refresh() {}, destroy() {} };
  }

  const existing = hostControllers.get(host);
  if (existing) {
    if (!globalHost) globalHost = host;
    return existing;
  }

  const ctrl = createPickerController(host, opts);
  hostControllers.set(host, ctrl);
  if (!globalHost) globalHost = host;
  return ctrl;
}

/**
 * Open agent picker from anywhere (P6 / Pop hook).
 * @param {{ conversationSessionId?: string, host?: HTMLElement }} [opts]
 */
export function openAgentPicker(opts = {}) {
  const host = opts.host || globalHost;
  if (!host) return { ok: false, reason: "picker_not_mounted" };
  const ctrl = hostControllers.get(host) || mountAgentPickerHost(host, {
    conversationSessionId: opts.conversationSessionId,
  });
  ctrl.open(opts.conversationSessionId);
  return { ok: true };
}

/**
 * Render active agent chip HTML for composer chrome.
 * @param {{ conversationSessionId?: string, locale?: string }} [opts]
 */
export function renderAgentChipHtml(opts = {}) {
  const agent = getActiveAgent(opts.conversationSessionId);
  return `
    <button type="button" class="explore-agent-chip" data-open-agent-picker title="${escapeHtml(tx("selectAgent", opts.locale))}">
      <i data-lucide="${escapeHtml(agent?.icon || "sparkles")}"></i>
      <span>${escapeHtml(agent?.name || tx("qijiAssistant", opts.locale))}</span>
      <em>${escapeHtml(tx("selectAgent", opts.locale))}</em>
    </button>
  `;
}

export function onAgentSelected(fn) {
  if (typeof fn !== "function") return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getActiveAgentSummary(conversationSessionId) {
  const agent = getActiveAgent(conversationSessionId);
  return {
    id: agent?.id,
    name: agent?.name,
    icon: agent?.icon,
  };
}
