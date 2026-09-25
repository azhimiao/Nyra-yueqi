/**
 * Wire feature-control screens inside phone shell root.
 */

import { setSwitchState } from "../phone-shell/phone-controls.js";
import {
  applyAutonomyPreset,
  loadAutonomyPrefs,
  saveAutonomyPrefs,
  wakePatchFromAutonomy,
  AUTONOMY_CHANGED_EVENT,
  isAutonomyCapabilityEnabled,
} from "./autonomy-prefs.js";
import { listActivity, getActivity, appendActivity } from "./activity-log.js";
import {
  renderActivityDetailHtml,
  renderActivityListHtml,
  renderActivityRoleStatusHtml,
} from "./feature-control-ui.js";
import { getAgentPrefs, saveAgentPrefs } from "../agent/capabilities/prefs.js";
import { saveProactiveWakePrefs } from "../proactive/config.js";
import { getLifeState } from "./life-state.js";
import { getActiveCharacterId, getCharacterSync } from "../characters/store.js";
import { startMomentsAutoPost, stopMomentsAutoPost } from "../moments/auto-post.js";
import { rescheduleDiary } from "../diary/schedule.js";
import { refreshIcons } from "../lib/icons.js";
import { pt } from "../phone-shell/i18n.js";
import {
  paintCutoverProfileUi,
  wireCutoverProfileControls,
} from "../features/cutover-profile.js";
import { applyFeatureFlagsToUi } from "../features/flags.js";

export const DEVTOOLS_FLAG_KEY = "yueqi.developerMode";

export function isDeveloperModeEnabled() {
  try {
    return localStorage.getItem(DEVTOOLS_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDeveloperModeEnabled(on) {
  try {
    localStorage.setItem(DEVTOOLS_FLAG_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   openApp?: (id: string) => void,
 *   phoneToast?: (msg: string) => void,
 *   rescheduleProactiveScheduler?: () => void,
 *   setInAppFloatPreferredOn?: (on: boolean) => void,
 *   companionRuntime?: { getState?: () => object, syncLifePresence?: () => void },
 *   wakeCompanionLife?: (source: string) => object,
 *   listAssistTasks?: () => object[],
 *   getOpenClawLoaded?: () => boolean,
 * }} deps
 */
export function mountFeatureControlUi(root, deps = {}) {
  if (!root) return () => {};

  const onboard = root.querySelector("[data-autonomy-onboard]");
  const showOnboard = () => {
    const prefs = loadAutonomyPrefs();
    let flDone = false;
    try {
      const raw = JSON.parse(localStorage.getItem("yueqi.firstLight.v1") || "null");
      flDone = Boolean(raw?.done);
    } catch {
      flDone = false;
    }
    const firstLightActive = document.documentElement.classList.contains("first-light-active");
    // Autonomy preset picker only after First Light finished (or legacy migrate).
    if (!prefs.onboardingComplete && onboard && flDone && !firstLightActive) {
      onboard.hidden = false;
    } else if (onboard) {
      onboard.hidden = true;
    }
  };

  function syncWakeFromAutonomy() {
    const prefs = loadAutonomyPrefs();
    if (prefs.aiAutonomousLife && prefs.proactiveMessage) {
      saveProactiveWakePrefs(wakePatchFromAutonomy(prefs));
    }
    deps.rescheduleProactiveScheduler?.();
    if (isAutonomyCapabilityEnabled("autoMoments")) startMomentsAutoPost();
    else stopMomentsAutoPost();
    try {
      rescheduleDiary();
    } catch {
      /* diary may be unbound in tests */
    }
    if (typeof deps.setInAppFloatPreferredOn === "function") {
      deps.setInAppFloatPreferredOn(isAutonomyCapabilityEnabled("deskPetVisible"));
    }
  }

  function refreshActivityCenter() {
    const panel = root.querySelector("[data-activity-center-root]");
    if (!panel || panel.closest("[hidden]")) return;
    const characterId = getActiveCharacterId();
    const character = characterId ? getCharacterSync(characterId) : null;
    const life = characterId ? getLifeState(characterId) : {};
    const statusEl = panel.querySelector("[data-activity-role-status]");
    if (statusEl) {
      statusEl.innerHTML = renderActivityRoleStatusHtml(character?.name || pt("pop.defaultCharacter"), life, life.nextWakeAt || 0);
    }
    const listEl = panel.querySelector("[data-activity-recent-list]");
    if (listEl) listEl.innerHTML = renderActivityListHtml(listActivity(30));
    const tasksEl = panel.querySelector("[data-activity-running-tasks]");
    if (tasksEl) {
      const tasks = (deps.listAssistTasks?.() || []).filter((t) => {
        const st = String(t.status || t.state || "");
        return ["running", "paused", "awaiting_approval", "approval_required", "in_progress"].includes(st);
      });
      if (!tasks.length) {
        tasksEl.innerHTML = `<p class="mini-app-lead">${escapeText(pt("activity.noRunningTasks"))}</p>`;
      } else {
        tasksEl.innerHTML = tasks.map((t) => `
          <article class="mini-activity-task">
            <strong>${escapeText(t.title || t.name || t.kind || pt("activity.taskDefault"))}</strong>
            <span>${escapeText(pt("activity.sourcePrefix", { source: t.source || t.origin || pt("activity.assistant") }))}</span>
            <span>${escapeText(t.stepSummary || t.summary || t.status || "")}</span>
          </article>
        `).join("");
      }
    }
    refreshIcons(panel);
  }

  async function refreshDevtools() {
    const pre = root.querySelector("[data-devtools-status]");
    if (!pre) return;
    const prefs = loadAutonomyPrefs();
    const runtime = deps.companionRuntime?.getState?.() || {};
    const characterId = getActiveCharacterId();
    const life = characterId ? getLifeState(characterId) : {};
    let palaceCensus = null;
    try {
      const { runPalaceCensus } = await import("../memory/palace/legacy-census.js");
      const { getAllRecords } = await import("../storage/db.js");
      const rows = (await getAllRecords?.("memories")) || (await getAllRecords?.()) || [];
      const list = Array.isArray(rows) ? rows : [];
      palaceCensus = await runPalaceCensus(list);
    } catch (error) {
      palaceCensus = { error: error?.message || "census_unavailable" };
    }
    let experienceArchive = null;
    try {
      const { censusExperienceArchives } = await import("../phone-shell/experience-archive.js");
      experienceArchive = censusExperienceArchives();
    } catch (error) {
      experienceArchive = { error: error?.message || "archive_unavailable" };
    }
    let todayUnread = 0;
    try {
      const { countUnreadToday } = await import("../artifacts/today-inbox.js");
      todayUnread = countUnreadToday(characterId);
    } catch {
      todayUnread = 0;
    }
    const report = {
      openClawSliceLoaded: Boolean(deps.getOpenClawLoaded?.()),
      companion: {
        mood: runtime.mood || life.currentMood,
        playState: runtime.playState,
        presenceLabel: runtime.presenceLabel,
      },
      nextWakeAt: life.nextWakeAt ? new Date(life.nextWakeAt).toISOString() : null,
      autonomy: {
        preset: prefs.preset,
        aiAutonomousLife: prefs.aiAutonomousLife,
        usedToday: prefs.proactiveUsedToday,
        dailyCap: prefs.dailyCap,
      },
      agent: getAgentPrefs(),
      activityCount: listActivity(999).length,
      developerMode: true,
      palaceCensus,
      experienceArchive,
      todayUnread,
      p0Note: "legacy_unscoped rows must stay out of Pop prompts; migrate via census samples",
    };
    pre.textContent = JSON.stringify(report, null, 2);
    paintCutoverProfileUi(root);
    const palacePanel = root.querySelector("[data-palace-census-panel]");
    if (palacePanel) {
      palacePanel.textContent = JSON.stringify({
        total: palaceCensus?.total,
        legacyUnscoped: palaceCensus?.legacyUnscoped,
        scoped: palaceCensus?.scoped,
        samples: (palaceCensus?.sampleUnscoped || []).slice(0, 8),
        error: palaceCensus?.error,
      }, null, 2);
    }
    const archivePanel = root.querySelector("[data-experience-archive-panel]");
    if (archivePanel) {
      archivePanel.textContent = JSON.stringify({
        totalWithContent: experienceArchive?.totalWithContent,
        apps: experienceArchive?.apps,
        policy: experienceArchive?.policy,
        error: experienceArchive?.error,
      }, null, 2);
    }
  }

  root.querySelectorAll("[data-autonomy-onboard-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-autonomy-onboard-pick");
      applyAutonomyPreset(id);
      syncWakeFromAutonomy();
      showOnboard();
      deps.phoneToast?.(pt("toast.presetSelected", {
        preset: ({
          quiet: pt("autonomy.presetQuietLabel"),
          companion: pt("autonomy.presetCompanionLabel"),
          immersive: pt("autonomy.presetImmersiveLabel"),
        })[id] || "",
      }));
      appendActivity({
        title: pt("activity.userPickedPreset"),
        reason: `${pt("autonomy.presetGroup")}：${id}`,
        capability: pt("activity.companionSettings"),
        usedModel: false,
        source: "onboarding",
      });
    });
  });

  root.querySelectorAll("[data-autonomy-preset-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-autonomy-preset-id");
      if (id === "custom") {
        saveAutonomyPrefs({ preset: "custom", onboardingComplete: true });
      } else {
        applyAutonomyPreset(id);
      }
      syncWakeFromAutonomy();
      root.querySelectorAll("[data-autonomy-preset-id]").forEach((node) => {
        node.classList.toggle("is-active", node === btn);
      });
      deps.phoneToast?.("toast.presetUpdated");
    });
  });

  root.querySelectorAll("[data-autonomy-flag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-autonomy-flag");
      const on = btn.getAttribute("aria-checked") !== "true";
      setSwitchState(btn, on);
      const patch = { [key]: on, preset: "custom", onboardingComplete: true };
      saveAutonomyPrefs(patch);
      syncWakeFromAutonomy();
    });
  });

  root.querySelectorAll("[data-autonomy-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const key = input.getAttribute("data-autonomy-field");
      let value = input.value;
      if (["dailyCap", "dailyModelBudget", "dailyProactiveBudget"].includes(key)) {
        value = Number(value);
      }
      saveAutonomyPrefs({ [key]: value, preset: "custom", onboardingComplete: true });
      syncWakeFromAutonomy();
    });
  });

  root.querySelectorAll("[data-agent-flag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-agent-flag");
      const on = btn.getAttribute("aria-checked") !== "true";
      setSwitchState(btn, on);
      saveAgentPrefs({ [key]: on });
      deps.phoneToast?.(on ? "toast.toggledOn" : "toast.toggledOff");
    });
  });

  root.querySelectorAll("[data-agent-resource]").forEach((select) => {
    select.addEventListener("change", () => {
      const key = select.getAttribute("data-agent-resource");
      const resources = { ...getAgentPrefs().resources, [key]: select.value };
      saveAgentPrefs({ resources });
    });
  });

  root.addEventListener("click", (event) => {
    const row = event.target.closest("[data-activity-id]");
    if (row) {
      const item = getActivity(row.getAttribute("data-activity-id"));
      const detail = root.querySelector("[data-activity-detail]");
      const body = root.querySelector("[data-activity-detail-body]");
      if (detail && body) {
        detail.hidden = false;
        body.innerHTML = renderActivityDetailHtml(item);
      }
      return;
    }
    if (event.target.closest("[data-activity-detail-close]")) {
      const detail = root.querySelector("[data-activity-detail]");
      if (detail) detail.hidden = true;
      return;
    }
    const actionBtn = event.target.closest("[data-devtools-action]");
    if (actionBtn) {
      const action = actionBtn.getAttribute("data-devtools-action");
      if (action === "simulate-time") {
        const life = getLifeState(getActiveCharacterId());
        deps.wakeCompanionLife?.("long_offline");
        deps.phoneToast?.("toast.simulatedWake");
        void life;
      } else if (action === "trigger-proactive") {
        deps.wakeCompanionLife?.("long_offline");
        deps.phoneToast?.("toast.proactiveRequested");
      } else if (action === "create-test-task") {
        appendActivity({
          title: pt("activity.testTaskCreated"),
          reason: pt("activity.devDiagnostics"),
          capability: pt("activity.diagnostics"),
          usedModel: false,
          source: "devtools",
        });
        deps.phoneToast?.("toast.activityLogged");
      } else if (action === "clear-workspaces") {
        deps.phoneToast?.("toast.workspaceAutoRelease");
      } else if (action === "export-report") {
        refreshDevtools();
        const text = root.querySelector("[data-devtools-status]")?.textContent || "{}";
        try {
          const blob = new Blob([text], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `nyra-diagnostics-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          deps.phoneToast?.("toast.exportFail");
        }
      } else if (action === "export-palace-census") {
        const text = root.querySelector("[data-palace-census-panel]")?.textContent || "{}";
        try {
          const blob = new Blob([text], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `yueqi-palace-census-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
          deps.phoneToast?.("已导出 Palace census");
        } catch {
          deps.phoneToast?.("toast.exportFail");
        }
      } else if (action === "rebuild-palace") {
        const statusEl = root.querySelector("[data-palace-rebuild-status]");
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "重建中…";
        }
        import("../memory/palace/index.js")
          .then(async ({ rebuildPalaceFromSources }) => {
            const companionId = String(getActiveCharacterId() || "").trim();
            const [diaryModule, ledgerModule, timelineModule, storageModule] = await Promise.all([
              import("../diary/records.js"),
              import("../memory/candidate-ledger.js"),
              import("../timeline/repository.js"),
              import("../storage/db.js"),
            ]);
            const [diaryEntries, memoryRows] = await Promise.all([
              diaryModule.listDiaries(companionId),
              storageModule.getAllRecords("memories"),
            ]);
            const stableMemory = ledgerModule.recallStableMemory({
              companionId,
              userId: "local",
              limit: 100,
            });
            const timelineEvents = timelineModule.listTimelineEvents({
              companionId,
              limit: 500,
            });
            const bookChunks = (Array.isArray(memoryRows) ? memoryRows : []).filter((row) => {
              const sourceType = String(row?.sourceType || row?.sourceRef?.sourceType || row?.source || "");
              const rowCompanion = String(row?.companionId || row?.characterId || "");
              return sourceType === "book_chunk" && (!rowCompanion || rowCompanion === companionId);
            });
            const result = await rebuildPalaceFromSources({
              companionId,
              diaryEntries,
              stableMemory,
              timelineEvents,
              bookChunks,
            });
            const count = Number(result?.projected ?? result?.records?.length ?? result?.count ?? 0);
            if (statusEl) {
              statusEl.textContent = result?.ok === false
                ? `重建失败：${result.reason || "unknown"}`
                : `重建完成 · entries=${count}`;
            }
            deps.phoneToast?.(result?.ok === false ? "Palace 重建失败" : "Palace 已从权威源重建");
            refreshDevtools();
          })
          .catch((error) => {
            if (statusEl) statusEl.textContent = `重建失败：${error?.message || error}`;
            deps.phoneToast?.("Palace 重建失败");
          });
      } else if (action === "export-experience-archive") {
        import("../phone-shell/experience-archive.js").then(({ downloadExperienceArchiveBundle }) => {
          const result = downloadExperienceArchiveBundle();
          deps.phoneToast?.(result.ok ? `已导出归档（${result.totalWithContent} 项有内容）` : "导出失败");
        }).catch(() => deps.phoneToast?.("toast.exportFail"));
      }
      refreshDevtools();
    }
  });

  const onAutonomy = () => {
    showOnboard();
    syncWakeFromAutonomy();
    if (root.querySelector('[data-phone-screen="activity"]:not([hidden])')) {
      refreshActivityCenter();
    }
  };
  document.addEventListener(AUTONOMY_CHANGED_EVENT, onAutonomy);
  document.addEventListener("yueqi:locale-changed", () => {
    if (root.querySelector('[data-phone-screen="activity"]:not([hidden])')) {
      refreshActivityCenter();
    }
  });

  const observer = new MutationObserver(() => {
    const activity = root.querySelector('[data-phone-screen="activity"]');
    if (activity && !activity.hidden) refreshActivityCenter();
    const tools = root.querySelector('[data-phone-screen="devtools"]');
    if (tools && !tools.hidden) refreshDevtools();
  });
  observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["hidden"] });

  showOnboard();
  syncWakeFromAutonomy();

  const toolsRow = root.querySelector("[data-phone-open=\"devtools\"]");
  if (toolsRow) toolsRow.hidden = !isDeveloperModeEnabled();

  const unwireCutover = wireCutoverProfileControls({
    root,
    onChange: () => {
      try {
        applyFeatureFlagsToUi();
      } catch {
        /* app settings may be absent in phone-only tests */
      }
      paintCutoverProfileUi(root);
      deps.phoneToast?.("toast.saved");
    },
  });

  return () => {
    document.removeEventListener(AUTONOMY_CHANGED_EVENT, onAutonomy);
    observer.disconnect();
    unwireCutover?.();
  };
}

function escapeText(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
