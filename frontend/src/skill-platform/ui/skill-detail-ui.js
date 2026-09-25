/**
 * Skill / Agent detail — install, update, disable, delete.
 */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";
import {
  getCatalogEntry,
  getInstallation,
  upsertInstallation,
  deleteSkillCompletely,
  listUpgradeCandidates,
} from "../store.js";
import { buildCapabilityPreview } from "../importer.js";
import {
  deleteAgentProfile,
  findProfileBySkillId,
  getAgentProfile,
} from "../../agents/profile-store.js";
import { listSkillRuns } from "../run-store.js";
import { tx } from "./i18n.js";

/**
 * @param {HTMLElement} host
 * @param {{
 *   skillId?: string,
 *   agentId?: string,
 *   onBack?: () => void,
 *   onStart?: (ctx: { skillId: string, agentId?: string }) => void,
 *   onToast?: (msg: string) => void,
 *   locale?: string,
 * }} opts
 */
export function mountSkillDetailUi(host, opts = {}) {
  if (!host) return { open() {}, refresh() {}, destroy() {} };

  let skillId = opts.skillId || "";
  let agentId = opts.agentId || "";

  function resolveContext() {
    if (agentId && !skillId) {
      const profile = getAgentProfile(agentId);
      skillId = profile?.skillIds?.[0] || "";
    }
    if (skillId && !agentId) {
      const profile = findProfileBySkillId(skillId);
      agentId = profile?.id || "";
    }
    return { skillId, agentId };
  }

  function render() {
    resolveContext();
    const loc = opts.locale;
    const catalog = skillId ? getCatalogEntry(skillId) : null;
    const installation = skillId ? getInstallation(skillId) : null;
    const profile = agentId ? getAgentProfile(agentId) : findProfileBySkillId(skillId);
    const upgrade = skillId ? listUpgradeCandidates()[skillId] : null;
    const runs = skillId ? listSkillRuns({ skillId }) : [];
    const preview = catalog ? buildCapabilityPreview(catalog) : null;

    if (!catalog && !profile) {
      host.innerHTML = `<p class="explore-empty">${escapeHtml(tx("emptyLibrary", loc))}</p>`;
      return;
    }

    // General assistant without a skill — not the lover; do not open Pop from here
    if (!catalog && profile && (profile.builtin || profile.kind === "general")) {
      host.innerHTML = `
        <div class="explore-detail">
          <header class="explore-detail__hero">
            <span class="explore-detail__icon" data-tone="sea"><i data-lucide="${escapeHtml(profile.icon || "sparkles")}"></i></span>
            <div>
              <h2>${escapeHtml(profile.name)}</h2>
              <p>${escapeHtml(tx("qijiGuide", loc))}</p>
            </div>
          </header>
          <section class="explore-detail__actions">
            <button type="button" class="explore-cta explore-cta--ghost" data-detail-back>${escapeHtml(tx("back", loc))}</button>
          </section>
        </div>
      `;
      refreshIcons(host);
      return;
    }

    const enabled = installation?.enabled !== false;
    host.innerHTML = `
      <div class="explore-detail">
        <header class="explore-detail__hero">
          <span class="explore-detail__icon" data-tone="sea"><i data-lucide="${escapeHtml(profile?.icon || "compass-heart")}"></i></span>
          <div>
            <h2>${escapeHtml(preview?.name || profile?.name || skillId)}</h2>
            <p>${escapeHtml(preview?.description || profile?.tagline || "")}</p>
            <span class="explore-badge${enabled ? "" : " is-muted"}">${escapeHtml(enabled ? tx("skillEnabled", loc) : tx("skillDisabled", loc))}</span>
          </div>
        </header>

        ${preview ? `
          <section class="explore-detail__section">
            <strong>${escapeHtml(tx("willRead", loc))}</strong>
            <ul>${(preview.willRead || []).map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
            <strong>${escapeHtml(tx("mayPropose", loc))}</strong>
            <ul>${(preview.mayProposeTasks || []).map((l) => `<li>${escapeHtml(l)}</li>`).join("") || `<li>—</li>`}</ul>
            <strong>${escapeHtml(tx("risks", loc))}</strong>
            <ul>${(preview.risks || []).map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>
          </section>
        ` : ""}

        <section class="explore-detail__actions">
          ${skillId && enabled ? `<button type="button" class="explore-cta" data-detail-start>${escapeHtml(tx("start", loc))}</button>` : ""}
          ${skillId ? `
            <button type="button" class="explore-cta explore-cta--ghost" data-detail-toggle>${escapeHtml(enabled ? tx("disable", loc) : tx("enable", loc))}</button>
          ` : ""}
          ${upgrade ? `<button type="button" class="explore-cta explore-cta--ghost" data-detail-upgrade>${escapeHtml(tx("update", loc))}</button>` : ""}
          ${!profile?.builtin ? `<button type="button" class="explore-cta explore-cta--danger" data-detail-delete>${escapeHtml(tx("delete", loc))}</button>` : ""}
        </section>

        <details class="explore-detail__dev">
          <summary>${escapeHtml(tx("developer", loc))}</summary>
          <dl>
            <dt>skillId</dt><dd>${escapeHtml(skillId || "—")}</dd>
            <dt>agentId</dt><dd>${escapeHtml(agentId || "—")}</dd>
            <dt>version</dt><dd>${escapeHtml(installation?.version || catalog?.version || "—")}</dd>
            <dt>runs</dt><dd>${runs.length}</dd>
          </dl>
        </details>
      </div>
    `;
    refreshIcons(host);
  }

  function onClick(event) {
    if (event.target.closest("[data-detail-back]")) {
      opts.onBack?.();
      return;
    }
    if (event.target.closest("[data-detail-start]")) {
      resolveContext();
      opts.onStart?.({ skillId, agentId });
      return;
    }
    if (event.target.closest("[data-detail-toggle]")) {
      resolveContext();
      const inst = getInstallation(skillId);
      if (!inst) return;
      const nextEnabled = inst.enabled === false;
      upsertInstallation({ ...inst, enabled: nextEnabled });
      opts.onToast?.(nextEnabled ? tx("skillEnabled", opts.locale) : tx("skillDisabled", opts.locale));
      render();
      return;
    }
    if (event.target.closest("[data-detail-delete]")) {
      resolveContext();
      const runs = listSkillRuns({ skillId });
      const msg = `${tx("deleteConfirm", opts.locale)} (${runs.length} runs)`;
      if (typeof window !== "undefined" && !window.confirm(msg)) return;
      deleteSkillCompletely(skillId);
      if (agentId) deleteAgentProfile(agentId);
      opts.onToast?.(tx("delete", opts.locale));
      opts.onBack?.();
      return;
    }
    if (event.target.closest("[data-detail-upgrade]")) {
      opts.onToast?.(tx("upgradeConflict", opts.locale));
    }
  }

  host.addEventListener("click", onClick);

  return {
    open(next = {}) {
      skillId = next.skillId || skillId;
      agentId = next.agentId || agentId;
      render();
    },
    refresh: render,
    destroy() {
      host.removeEventListener("click", onClick);
      host.innerHTML = "";
    },
  };
}
