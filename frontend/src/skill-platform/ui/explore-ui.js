/**
 * Explore App — two surfaces only:
 * 1) Chat (full dialogue, like Pop)
 * 2) Plugin market (install / manage Skill plugins)
 */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";
import { emitAppEvent } from "../../world/app-events.js";
import { getLocale } from "../../i18n/index.js";
import {
  ensureWorkAgentReady,
  getDefaultWorkAgent,
  getWorkAgentSessionSkillId,
  listWorkAgentPlugins,
  BUILTIN_WORK_AGENT_ID,
  BUILTIN_HOST_SKILL_ID,
} from "../../agents/work-agent.js";
import { getCatalogEntry, getInstallation, upsertInstallation, skillFilesMissing } from "../store.js";
import { previewSkillBundle } from "../importer.js";
import { inspectZipBytes } from "../package-intake.js";
import {
  installSkillWithGrants,
  setSkillEnabled,
  uninstallSkillFromPlatform,
  missingInstallGrants,
  capabilityLabel,
} from "../install-flow.js";
import { createSkillRunRecord } from "../run-store.js";
import { listSkillRuns } from "../run-store.js";
import { createProductionConversationApi } from "../conversation-binding.js";
import { defaultScopesForMode } from "../scopes.js";
import { ensureExplorePlayPacksSeeded, listExploreSocialGames, ensurePlayPackFiles } from "../play-seed.js";
import { mountSkillSessionUi } from "./skill-session-ui.js";
import { tx } from "./i18n.js";
import { BUILTIN_CHARACTER_ID } from "../../constants.js";
import {
  routeExploreIntent,
  listAssistantTasks,
  EXTERNAL_REQUIRED_USER_MESSAGE,
} from "../../task-runtime/index.js";
import {
  runWorldbookMergeTask,
  approveWorldbookMergeTask,
  rejectWorldbookMergeTask,
} from "../../task-runtime/lazy-runners.js";
import { formatUserErrorFromReason, safeUserFacingText } from "../../onboarding/errors.js";

export function buildExploreScreenHtml() {
  return `
    <section class="mini-view mini-explore-host" data-phone-screen="explore" hidden>
      <div class="explore-host" data-explore-root>
        <header class="explore-appbar">
          <button type="button" class="explore-icon-btn" data-phone-back data-explore-back aria-label=""><i data-lucide="chevron-left"></i></button>
          <div class="explore-appbar__title"><strong data-explore-title></strong><span data-explore-subtitle></span></div>
          <button type="button" class="explore-icon-btn" data-explore-pick-file hidden data-explore-appbar-import aria-label=""><i data-lucide="plus"></i></button>
        </header>
        <div class="explore-tabs explore-tabs--three" role="tablist">
          <button type="button" class="is-active" data-explore-tab="chat"></button>
          <button type="button" data-explore-tab="tasks"></button>
          <button type="button" data-explore-tab="market"></button>
        </div>
        <div class="explore-body" data-explore-main></div>
        <div data-explore-session-host class="explore-session-host" hidden></div>
        <input type="file" accept=".zip,.yueqi-skill,application/zip" hidden data-explore-file-input />
        <input type="file" webkitdirectory directory multiple hidden data-explore-folder-input />
      </div>
    </section>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   onToast?: (msg: string) => void,
 *   getCharacterId?: () => string,
 *   getCharacterName?: () => string,
 *   modelFn?: Function,
 *   locale?: string,
 *   onPlayInPop?: (gameId: string) => void,
 * }} [deps]
 */
export function mountExploreApp(root, deps = {}) {
  const host = root?.querySelector?.("[data-explore-root]") || root;
  if (!host) return { open() {}, destroy() {} };

  ensureWorkAgentReady();
  ensureExplorePlayPacksSeeded();

  let tab = "chat";
  let pendingPreview = null;
  /** @type {string} */
  let activeRunId = "";
  /** @type {string} — empty = default host core */
  let activeSkillId = "";
  let sessionUi = null;
  let pendingKickoff = false;
  /** @type {string} */
  let exploreGoal = "";
  /** @type {object|null} */
  let lastExploreTask = null;

  const locale = () => deps.locale || getLocale();
  const main = () => host.querySelector("[data-explore-main]");
  const sessionHost = () => host.querySelector("[data-explore-session-host]");
  const importBtn = () => host.querySelector("[data-explore-appbar-import]");

  function resolveCharacterId() {
    return String(deps.getCharacterId?.() || "").trim() || BUILTIN_CHARACTER_ID;
  }

  function sessionSkillId() {
    return activeSkillId || getWorkAgentSessionSkillId();
  }

  function findActiveRun(skillId) {
    const sid = skillId || sessionSkillId();
    const runs = listSkillRuns({
      agentId: BUILTIN_WORK_AGENT_ID,
      status: "active",
    });
    return runs.find((r) => r.skillId === sid && r.mode === "isolated_new") || null;
  }

  function ensureChatRun(skillId) {
    const sid = skillId || sessionSkillId();
    // Repair missing prompt files (old installs only kept catalog in localStorage)
    if (skillFilesMissing(sid)) {
      ensureExplorePlayPacksSeeded();
    }
    const existing = findActiveRun(sid);
    if (existing) return { ok: true, value: existing };
    const catalog = getCatalogEntry(sid);
    if (!catalog) {
      return { ok: false, reason: "skill_not_installed" };
    }
    return createSkillRunRecord(
      {
        skillId: sid,
        agentId: BUILTIN_WORK_AGENT_ID,
        characterId: resolveCharacterId(),
        mode: "isolated_new",
        scopes: defaultScopesForMode("isolated_new"),
        grantedCapabilities: getInstallation(sid)?.grants?.capabilities || [],
        title: catalog?.name || getDefaultWorkAgent()?.name || tx("workAgent", locale()),
      },
      { conversationApi: createProductionConversationApi() },
    );
  }

  function showChat() {
    const sh = sessionHost();
    const m = main();
    if (!sh || !m) return;

    const shouldKickoff = pendingKickoff;
    pendingKickoff = false;

    const created = ensureChatRun(sessionSkillId());
    if (!created.ok) {
      m.hidden = false;
      sh.hidden = true;
      const reason = created.reason || "";
      m.innerHTML = `<p class="explore-empty">${escapeHtml(tx("playFail", locale()))}: ${escapeHtml(reason)}</p>`;
      deps.onToast?.(`${tx("playFail", locale())}: ${reason}`);
      return;
    }

    activeRunId = created.value.id;
    m.hidden = true;
    m.innerHTML = "";
    sh.hidden = false;
    sessionUi?.destroy?.();
    sessionUi = mountSkillSessionUi(sh, {
      runId: activeRunId,
      modelFn: deps.modelFn,
      locale: locale(),
      embedded: true,
      onToast: deps.onToast,
      onBack: () => {
        /* chat tab has no back — home button leaves explore */
      },
    });
    sessionUi.open(activeRunId);
    refreshIcons(host);
    if (shouldKickoff) {
      // Defer so composer/DOM is ready; opens the game scene immediately
      window.setTimeout(() => {
        sessionUi?.kickoff?.(tx("kickoffWord", locale()));
      }, 40);
    }
  }

  function playSkill(skillId) {
    const sid = String(skillId || "").trim();
    if (!sid || sid === BUILTIN_HOST_SKILL_ID) {
      activeSkillId = "";
      pendingKickoff = false;
      tab = "chat";
      render();
      return;
    }

    activeSkillId = sid;
    pendingKickoff = true;
    const inst = getInstallation(sid);
    if (inst && inst.enabled === false) {
      upsertInstallation({ ...inst, enabled: true });
    }
    const ready = ensurePlayPackFiles(sid);
    if (!ready.ok || skillFilesMissing(sid)) {
      pendingKickoff = false;
      deps.onToast?.(tx("playFail", locale()));
      return;
    }

    tab = "chat";
    render();
    deps.onToast?.(tx("playStarted", locale()));
  }

  function takeToPop(gameId) {
    const id = String(gameId || "").trim();
    if (!id) return;
    if (typeof deps.onPlayInPop === "function") {
      deps.onPlayInPop(id);
      deps.onToast?.(tx("takenToPop", locale()));
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("yueqi.explore.play-in-pop", { detail: { gameId: id } }));
      deps.onToast?.(tx("takenToPop", locale()));
    } catch {
      deps.onToast?.(tx("takeToPopFail", locale()));
    }
  }

  function hideChat() {
    const sh = sessionHost();
    const m = main();
    if (sh) sh.hidden = true;
    if (m) m.hidden = false;
    sessionUi?.destroy?.();
    sessionUi = null;
  }

  function renderPluginRow(skillId, loc) {
    const catalog = getCatalogEntry(skillId);
    const inst = getInstallation(skillId);
    const enabled = inst?.enabled !== false;
    const isHost = skillId === BUILTIN_HOST_SKILL_ID;
    const isPlay = catalog?.category === "play" || catalog?.category === "relationship";
    const pending = !isHost && catalog && inst && missingInstallGrants(catalog, inst).length > 0;
    return `
      <article class="explore-market-row" data-plugin-id="${escapeHtml(skillId)}">
        <div class="explore-market-icon" aria-hidden="true"><i data-lucide="${isHost ? "bot" : (isPlay ? "gamepad-2" : "puzzle")}"></i></div>
        <div class="explore-market-row__body">
          <strong>${escapeHtml(catalog?.name || skillId)}</strong>
          <span class="explore-market-row__meta">${escapeHtml(
            isHost ? tx("hostPlugin", loc) : (catalog?.description || tx("pluginDesc", loc)),
          )}${pending ? escapeHtml(tx("pendingAuth", loc)) : ""}</span>
          <div class="explore-market-row__actions">
            ${isHost
              ? `<em class="explore-market-badge">${escapeHtml(tx("hostPlugin", loc))}</em>`
              : `
                <button type="button" class="explore-market-play" data-explore-play="${escapeHtml(skillId)}" ${enabled && !pending ? "" : "disabled"}>${escapeHtml(tx("playNow", loc))}</button>
                <button type="button" class="explore-market-get" data-explore-toggle-plugin="${escapeHtml(skillId)}">${escapeHtml(enabled ? tx("disable", loc) : tx("enable", loc))}</button>
                <button type="button" class="explore-market-get is-ghost" data-explore-uninstall-plugin="${escapeHtml(skillId)}">${escapeHtml(tx("uninstall", loc))}</button>
              `
            }
          </div>
        </div>
      </article>
    `;
  }

  function renderSocialRow(game, loc) {
    return `
      <article class="explore-market-row" data-social-game="${escapeHtml(game.id)}">
        <div class="explore-market-icon" aria-hidden="true"><i data-lucide="users"></i></div>
        <div class="explore-market-row__body">
          <strong>${escapeHtml(game.title)}</strong>
          <span class="explore-market-row__meta">${escapeHtml(game.blurb)}</span>
          <div class="explore-market-row__actions">
            <button type="button" class="explore-market-play" data-explore-to-pop="${escapeHtml(game.id)}">${escapeHtml(tx("takeToPop", loc))}</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderMarket() {
    const loc = locale();
    const plugins = listWorkAgentPlugins({ includeHost: true });
    const soloIds = plugins.filter((id) => id === BUILTIN_HOST_SKILL_ID || getCatalogEntry(id));
    const soloRows = soloIds.map((id) => renderPluginRow(id, loc)).join("");
    const socialRows = listExploreSocialGames().map((g) => renderSocialRow(g, loc)).join("");

    return `
      <div class="explore-market">
        <div class="explore-market-hero">
          <strong>${escapeHtml(tx("marketTitle", loc))}</strong>
          <p>${escapeHtml(tx("marketLead", loc))}</p>
          <p class="explore-market-hero__hint">${escapeHtml(tx("playPacksHint", loc))}</p>
        </div>
        <div class="explore-market-actions">
          <button type="button" class="explore-cta" data-explore-pick-file>${escapeHtml(tx("importFile", loc))}</button>
          <button type="button" class="explore-cta explore-cta--ghost" data-explore-pick-folder>${escapeHtml(tx("importFolder", loc))}</button>
        </div>
        ${pendingPreview ? renderPreviewCard(pendingPreview) : ""}
        ${pendingPreview ? `<button type="button" class="explore-cta explore-cta--block" data-explore-confirm-import>${escapeHtml(tx("confirmInstall", loc))}</button>` : ""}

        <h3 class="explore-market-section">${escapeHtml(tx("soloSection", loc))}</h3>
        <p class="explore-market-section-lead">${escapeHtml(tx("soloSectionLead", loc))}</p>
        <div class="explore-market-list">
          ${soloRows || `<p class="explore-empty explore-empty--inline">${escapeHtml(tx("emptyPlugins", loc))}</p>`}
        </div>

        <h3 class="explore-market-section">${escapeHtml(tx("socialSection", loc))}</h3>
        <p class="explore-market-section-lead">${escapeHtml(tx("socialSectionLead", loc))}</p>
        <div class="explore-market-list">
          ${socialRows || `<p class="explore-empty explore-empty--inline">${escapeHtml(tx("emptySocial", loc))}</p>`}
        </div>
      </div>
    `;
  }

  function renderTasks() {
    const tasks = listAssistantTasks()
      .filter((t) => t.title?.includes("世界书") || t.candidate?.kind === "worldbook-merge" || t.title === "世界书合并")
      .slice(-8)
      .reverse();
    const card = lastExploreTask
      ? `
      <article class="explore-task-card" data-explore-task-id="${escapeHtml(lastExploreTask.id)}">
        <header>
          <strong>${escapeHtml(lastExploreTask.title)}</strong>
          <span class="explore-id-scroll">${escapeHtml(lastExploreTask.status)}</span>
        </header>
        <p>${escapeHtml(lastExploreTask.stepSummary || "")}</p>
        ${lastExploreTask.diff?.summary ? `<p class="explore-task-meta">${escapeHtml((lastExploreTask.diff.summary || []).join(" · "))}</p>` : ""}
        ${lastExploreTask.status === "WAITING_FOR_APPROVAL" ? `
          <div class="explore-task-actions">
            <button type="button" data-explore-task-reject="${escapeHtml(lastExploreTask.id)}">${escapeHtml(tx("tasksReject", locale()))}</button>
            <button type="button" class="is-primary" data-explore-task-approve="${escapeHtml(lastExploreTask.id)}">${escapeHtml(tx("tasksApprove", locale()))}</button>
          </div>
        ` : ""}
        ${lastExploreTask.status === "EXTERNAL_BACKEND_REQUIRED" ? `<pre class="explore-external">${escapeHtml(EXTERNAL_REQUIRED_USER_MESSAGE)}</pre>` : ""}
      </article>
    `
      : "";
    const history = tasks
      .map(
        (t) => `
      <li><strong>${escapeHtml(t.title)}</strong> · ${escapeHtml(t.status)} · ${escapeHtml(t.stepSummary || "")}</li>
    `,
      )
      .join("");
    return `
      <div class="explore-tasks">
        <div class="explore-market-hero">
          <strong>${escapeHtml(tx("tasksTitle", locale()))}</strong>
          <p>${escapeHtml(tx("tasksLead", locale()))}</p>
        </div>
        <form class="explore-task-form" data-explore-task-form>
          <textarea rows="4" maxlength="800" placeholder="${escapeHtml(tx("tasksPlaceholder", locale()))}" data-explore-goal>${escapeHtml(exploreGoal)}</textarea>
          <button type="submit" class="explore-cta explore-cta--block">${escapeHtml(tx("tasksCreate", locale()))}</button>
        </form>
        ${card}
        <h3 class="explore-market-section">${escapeHtml(tx("tasksRecent", locale()))}</h3>
        <ul class="explore-task-history">${history || `<li class="explore-empty explore-empty--inline">${escapeHtml(tx("tasksEmpty", locale()))}</li>`}</ul>
      </div>
    `;
  }

  function renderPreviewCard(preview) {
    const skill = preview.skills?.[0];
    if (!skill) return "";
    const p = skill.preview;
    const caps = skill.manifest?.requestedCapabilities || [];
    const grantBlock = caps.length
      ? `
        <fieldset class="explore-grant-sheet">
          <legend>${escapeHtml(tx("grantLegend", locale()))}</legend>
          ${caps.map((cap) => `
            <label class="explore-grant-row">
              <input type="checkbox" data-explore-grant-cap="${escapeHtml(cap)}" checked />
              <span>${escapeHtml(capabilityLabel(cap))}</span>
            </label>
          `).join("")}
        </fieldset>
      `
      : "";
    return `
      <article class="explore-cap-card">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || "")}</p>
        <p class="explore-cap-card__note">${escapeHtml(tx("importAttachNote", locale()))}</p>
        ${grantBlock}
      </article>
    `;
  }

  function render() {
    const loc = locale();
    ensureWorkAgentReady();
    const titleEl = host.querySelector("[data-explore-title]");
    const subtitleEl = host.querySelector("[data-explore-subtitle]");
    if (titleEl) titleEl.textContent = tx("appTitle", loc);
    if (subtitleEl) {
      if (tab === "chat") {
        const cat = getCatalogEntry(sessionSkillId());
        subtitleEl.textContent = cat?.name || getDefaultWorkAgent()?.name || tx("workAgent", loc);
      } else if (tab === "tasks") {
        subtitleEl.textContent = tx("tasksSubtitle", loc);
      } else {
        subtitleEl.textContent = tx("marketTitle", loc);
      }
    }

    const backBtn = host.querySelector("[data-explore-back]");
    if (backBtn) backBtn.setAttribute("aria-label", tx("backAria", loc));
    const barImportEl = importBtn();
    if (barImportEl) barImportEl.setAttribute("aria-label", tx("importAria", loc));

    host.querySelectorAll("[data-explore-tab]").forEach((btn) => {
      const map = { chat: "tabChat", market: "tabMarket", tasks: "tabTasks" };
      const key = map[btn.dataset.exploreTab] || "tabChat";
      btn.classList.toggle("is-active", btn.dataset.exploreTab === tab);
      btn.setAttribute("aria-selected", btn.dataset.exploreTab === tab ? "true" : "false");
      btn.textContent = tx(key, loc);
    });

    const barImport = importBtn();
    if (barImport) barImport.hidden = tab !== "market";

    if (tab === "chat") {
      showChat();
      return;
    }

    hideChat();
    const m = main();
    if (!m) return;
    m.innerHTML = tab === "tasks" ? renderTasks() : renderMarket();
    refreshIcons(host);
  }

  async function readFilesFromInput(input) {
    /** @type {Record<string, string>} */
    const files = {};
    for (const file of input?.files ? [...input.files] : []) {
      const path = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
      const lower = path.toLowerCase();

      if (lower.endsWith(".zip") || lower.endsWith(".yueqi-skill") || file.type === "application/zip") {
        try {
          const inspected = inspectZipBytes(new Uint8Array(await file.arrayBuffer()));
          if (!inspected.ok) {
            return { ok: false, reason: inspected.errors?.[0] || "unsafe_zip", files };
          }
          for (const [zipPath, content] of Object.entries(inspected.files || {})) {
            if (/\.(md|txt|json|ya?ml)$/i.test(zipPath) || /(^|\/)SKILL\.md$/i.test(zipPath)) {
              files[zipPath] = String(content ?? "");
            }
          }
        } catch {
          return { ok: false, reason: "zip_read_failed", files };
        }
        continue;
      }

      if (!/\.(md|txt|json|ya?ml)$/i.test(path) && !path.endsWith("SKILL.md")) continue;
      try {
        files[path] = await file.text();
      } catch {
        /* skip */
      }
    }
    return { ok: true, files };
  }

  async function handleImportFiles(files) {
    const preview = previewSkillBundle(files, { sourceLabel: "explore-plugin" });
    if (!preview.ok) {
      deps.onToast?.(`${tx("importFail", locale())}: ${preview.reason}`);
      pendingPreview = null;
      render();
      return;
    }
    pendingPreview = { ...preview, _files: files };
    tab = "market";
    render();
  }

  async function confirmImport() {
    if (!pendingPreview?.skills?.length || !pendingPreview._files) return;
    ensureWorkAgentReady();
    const manifest = pendingPreview.skills[0]?.manifest;
    const caps = manifest?.requestedCapabilities || [];
    /** @type {string[]} */
    const grantedCapabilities = [];
    if (caps.length) {
      host.querySelectorAll("[data-explore-grant-cap]").forEach((el) => {
        if (el instanceof HTMLInputElement && el.checked) {
          grantedCapabilities.push(String(el.dataset.exploreGrantCap || ""));
        }
      });
    }
    const result = installSkillWithGrants({
      files: pendingPreview._files,
      sourceLabel: "explore-plugin",
      confirm: true,
      grantedCapabilities,
      attachToAgentId: BUILTIN_WORK_AGENT_ID,
    });
    if (!result.ok) {
      const msg = formatUserErrorFromReason(result.reason || result.action || "import_fail", getLocale());
      deps.onToast?.(`${tx("importFail", locale())}: ${msg}`);
      return;
    }
    pendingPreview = null;
    deps.onToast?.(tx("pluginInstalled", locale()));
    render();
  }

  function onClick(event) {
    const tabBtn = event.target.closest("[data-explore-tab]");
    if (tabBtn && tabBtn.closest(".explore-tabs")) {
      const next = tabBtn.dataset.exploreTab;
      tab = next === "market" || next === "tasks" || next === "chat" ? next : "chat";
      render();
      return;
    }
    const approve = event.target.closest("[data-explore-task-approve]");
    if (approve) {
      approve.disabled = true;
      approveWorldbookMergeTask(approve.getAttribute("data-explore-task-approve"))
        .then((r) => {
          lastExploreTask = r.task || lastExploreTask;
          if (r.ok) {
            emitAppEvent("explore.task.completed", {
              appId: "explore",
              taskId: lastExploreTask?.id || "",
              intent: "worldbook_merge",
              summary: r.speech || tx("tasksApproved", locale()),
            });
          }
          deps.onToast?.(r.speech || (r.ok ? tx("tasksApproved", locale()) : tx("tasksApproveFail", locale())));
          render();
        })
        .catch((err) => deps.onToast?.(safeUserFacingText(err?.message || err) || tx("tasksApproveFail", locale())));
      return;
    }
    const reject = event.target.closest("[data-explore-task-reject]");
    if (reject) {
      const r = rejectWorldbookMergeTask(reject.getAttribute("data-explore-task-reject"));
      lastExploreTask = r.task || lastExploreTask;
      deps.onToast?.(tx("tasksRejected", locale()));
      render();
      return;
    }
    if (event.target.closest("[data-explore-pick-file], [data-explore-appbar-import]")) {
      host.querySelector("[data-explore-file-input]")?.click();
      return;
    }
    if (event.target.closest("[data-explore-pick-folder]")) {
      host.querySelector("[data-explore-folder-input]")?.click();
      return;
    }
    if (event.target.closest("[data-explore-confirm-import]")) {
      confirmImport();
      return;
    }
    const play = event.target.closest("[data-explore-play]");
    if (play) {
      playSkill(play.dataset.explorePlay);
      return;
    }
    const toPop = event.target.closest("[data-explore-to-pop]");
    if (toPop) {
      takeToPop(toPop.dataset.exploreToPop);
      return;
    }
    const toggle = event.target.closest("[data-explore-toggle-plugin]");
    if (toggle) {
      const skillId = toggle.dataset.exploreTogglePlugin;
      const inst = getInstallation(skillId);
      if (inst && skillId !== BUILTIN_HOST_SKILL_ID) {
        setSkillEnabled(skillId, inst.enabled === false);
        render();
      }
      return;
    }
    const uninstall = event.target.closest("[data-explore-uninstall-plugin]");
    if (uninstall) {
      const skillId = uninstall.dataset.exploreUninstallPlugin;
      if (!skillId || skillId === BUILTIN_HOST_SKILL_ID) return;
      if (!window.confirm(tx("uninstallConfirm", locale()))) return;
      const r = uninstallSkillFromPlatform(skillId);
      deps.onToast?.(r.ok ? tx("uninstalled", locale()) : (r.reason || tx("uninstallFail", locale())));
      render();
    }
  }

  async function onTaskSubmit(event) {
    const form = event.target.closest("[data-explore-task-form]");
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector("[data-explore-goal]");
    const goal = String(input?.value || "").trim();
    exploreGoal = goal;
    if (!goal) return;
    const decision = routeExploreIntent(goal);
    if (decision.mode === "external-required") {
      lastExploreTask = {
        id: `ext-${Date.now()}`,
        title: tx("tasksExternalTitle", locale()),
        status: "EXTERNAL_BACKEND_REQUIRED",
        stepSummary: EXTERNAL_REQUIRED_USER_MESSAGE,
      };
      deps.onToast?.(tx("tasksExternalToast", locale()));
      render();
      return;
    }
    if (decision.mode !== "local-agent" || decision.intent !== "worldbook_merge") {
      deps.onToast?.(tx("tasksWorldbookOnly", locale()));
      return;
    }
    deps.onToast?.(tx("tasksRunning", locale()));
    const bookA = [
      { id: "src-a1", title: "月光港", content: "港口夜色", triggers: ["月光"] },
      { id: "src-a2", title: "重复项", content: "A版", triggers: ["重复"] },
    ];
    const bookB = [
      { id: "src-b1", title: "潮汐街", content: "街巷", triggers: ["潮汐"] },
      { id: "src-b2", title: "重复项", content: "B版应去重", triggers: ["重复"] },
    ];
    const result = await runWorldbookMergeTask({
      instruction: goal,
      bookA,
      bookB,
      sourceIds: [],
    });
    lastExploreTask = result.task;
    deps.onToast?.(result.speech || (result.ok ? tx("tasksUpdated", locale()) : tx("tasksFailed", locale())));
    render();
  }

  async function onFileChange(event) {
    const input = /** @type {HTMLInputElement} */ (event.target);
    const read = await readFilesFromInput(input);
    if (!read.ok) {
      deps.onToast?.(`${tx("importFail", locale())}: ${read.reason}`);
      input.value = "";
      return;
    }
    const files = read.files || {};
    if (!Object.keys(files).length) {
      deps.onToast?.(tx("importFail", locale()));
      return;
    }
    await handleImportFiles(files);
    input.value = "";
  }

  host.addEventListener("click", onClick);
  host.addEventListener("submit", onTaskSubmit);
  host.querySelector("[data-explore-file-input]")?.addEventListener("change", onFileChange);
  host.querySelector("[data-explore-folder-input]")?.addEventListener("change", onFileChange);
  render();

  function openTab(nextTab) {
    const raw = String(nextTab || "chat");
    if (raw === "tasks" || raw === "task") tab = "tasks";
    else if (raw === "chat" || raw === "find") tab = "chat";
    else if (["import", "plugins", "library", "market", "more", "mine"].includes(raw)) tab = "market";
    else tab = "chat";
    render();
    return { ok: true, tab };
  }

  function onNavigate(event) {
    const detail = event.detail || {};
    if (detail.tab) openTab(detail.tab);
  }
  window.addEventListener("yueqi.explore.navigate", onNavigate);

  function onLocaleChanged() {
    render();
  }
  window.addEventListener("yueqi:locale-changed", onLocaleChanged);

  return {
    open(opts = {}) {
      if (opts.tab) openTab(opts.tab);
      else {
        tab = "chat";
        render();
      }
    },
    openTab,
    refresh: render,
    destroy() {
      window.removeEventListener("yueqi:locale-changed", onLocaleChanged);
      window.removeEventListener("yueqi.explore.navigate", onNavigate);
      host.removeEventListener("click", onClick);
      host.removeEventListener("submit", onTaskSubmit);
      sessionUi?.destroy?.();
    },
  };
}

let globalExploreApi = null;

export function registerExploreApp(api) {
  globalExploreApi = api || null;
}

export function openExploreTab(tab = "chat", opts = {}) {
  try {
    window.dispatchEvent(new CustomEvent("yueqi.explore.navigate", { detail: { tab } }));
  } catch {
    /* ignore */
  }
  if (globalExploreApi?.openTab) return globalExploreApi.openTab(tab, opts);
  if (globalExploreApi?.open) {
    globalExploreApi.open({ tab, ...opts });
    return { ok: true, tab };
  }
  return { ok: false, reason: "explore_not_mounted" };
}

export { openAgentPicker } from "../../agents/ui/agent-picker.js";
