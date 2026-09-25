/**
 * Scenario player UI — immersive stage (CEV2 §6).
 * Single source of truth: scenario/store + runtime phase.
 */

import { escapeHtml } from "../../lib/utils.js";
import { refreshIcons } from "../../lib/icons.js";
import { listCharacters, getCharacterSync } from "../../characters/store.js";
import { characterToCollectedProfile } from "../../characters/profile.js";
import { resolveCharacterAvatarUrl, resolveScenarioPortraitUrl } from "../../characters/avatar.js";
import { callModel } from "../../model/client.js";
import { canSpeak, synthesizeSpeech, stopSpeech } from "../../voice/tts.js";
import { normalizeCast, resolveScenarioLead } from "../cast.js";
import {
  appendBeats,
  getActiveRun,
  getRun,
  getScript,
  listScripts,
  saveRun,
  startRun,
  upsertUserScript,
} from "../store.js";
import {
  beatsFromScenarioTurn,
  buildDirectorMessages,
  markDirectorGeneration,
  offlineDirectorTurn,
  parseDirectorOutput,
  allowOfflineDirector,
} from "../runtime/director-adapter.js";
import { phaseAfterTurn, phaseFromRun, transitionPhase } from "../runtime/state-machine.js";
import {
  applyTurnToRunState,
  commitFinaleMemory,
  pauseScenarioRun,
  resumeScenarioRun,
} from "../runtime/persistence.js";
import { appendCohabitEvent } from "../../life/bridge.js";
import { listLibraryItems, continueLabel, openingGreeting, workCoverSrc } from "../library/index.js";
import { pickFinaleSummary } from "../presets.js";
import { createStageRenderer } from "./stage-renderer.js";
import { createStageController } from "./stage-controller.js";
import { createDialogueLayer } from "./dialogue-layer.js";
import { createChoiceLayer } from "./choice-layer.js";
import { createControls } from "./controls.js";
import { createBranchPanel, listActiveHeadCandidates } from "./branch-panel.js";
import { planScenarioRewind, rewindFromMessage, rewindScenarioConversation } from "./rewind.js";
import {
  appendAssistantTurn,
  appendUserTurn,
  enterImmersive,
  exitImmersive,
  getSession,
  saveUiState,
  selectVisibleHistory,
  editMessageContent,
  forkFromMessage,
  switchCandidate,
  rollbackHead,
} from "../../conversation/index.js";
import {
  enterExperience,
  pauseExperience,
  resumeExperience,
  endExperience,
  runExperienceDirectorTurn,
  createDeterministicExperienceModelStub,
  getExperienceSession,
  syncExperienceBranch,
  ensureScenarioExperiencePackage,
  registerScenarioExperiencePackages,
  getPackageOpening,
  proposeCandidatesFromSignals,
  acceptCandidate,
  commitFinaleReview,
  suggestPostSceneCompanionAction,
} from "../../experience/index.js";
import { saveAppUiState, loadAppUiState } from "../../phone-shell/app-lifecycle.js";
import { formatUserErrorFromReason } from "../../onboarding/errors.js";
import { isScenarioHistoryRow, rebindAwayFromCompanionDm } from "../../experience/conversation-bind.js";

registerScenarioExperiencePackages(listScripts());

/** E2E-only semantic stub (not production offline plot). Opt-in via localStorage / window flag. */
function isE2eExperienceStub() {
  try {
    if (typeof window !== "undefined" && window.__YUEQI_E2E_EXPERIENCE_STUB__) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem("yueqi.e2e.experienceStub") === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Reuse one stub instance so turn counters and semantic markers stay consistent within a session. */
let sharedE2eExperienceStub = null;
function getE2eExperienceStub() {
  if (!sharedE2eExperienceStub) {
    sharedE2eExperienceStub = createDeterministicExperienceModelStub();
  }
  return sharedE2eExperienceStub;
}

async function resolveProviderConfig(deps) {
  const raw = deps.collectProviderConfig?.();
  return raw && typeof raw.then === "function" ? await raw : raw;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   collectProviderConfig?: () => object,
 *   onOpenDiary?: (payload?: { runId?: string, diaryId?: string, eventId?: string, summary?: string }) => void,
 *   listWorldbook?: () => Promise<Array<{ id: string, title?: string, name?: string }>>,
 *   onToast?: (msg: string) => void,
 *   onRuntimeAction?: (payload: object) => void,
 *   onBackgroundComplete?: (payload: object) => void,
 *   onFullscreenChange?: (fullscreen: boolean) => void,
 *   onHome?: () => void,
 * }} [deps]
 */
export function mountScenarioTheater(root, deps = {}) {
  if (!root) return { destroy() {} };

  let view = "select";
  let draftScriptId = "";
  /** @type {{ leadId: string, memberIds: string[] }} */
  let draftCast = { leadId: "", memberIds: [] };
  /** @type {string[]} */
  let draftLoreIds = [];
  let runId = "";
  /** Highlighted character on select screen (tap again to confirm). */
  let selectHighlightId = "";
  /** @type {Array<{ id: string, text: string, intent?: string }>} */
  let lastChoices = [];
  /** @type {object|null} */
  let lastTurn = null;
  let busy = false;
  /** True when generation continues after user left the stage (Home). */
  let backgroundGeneration = false;
  let destroyed = false;
  let authorOpen = false;
  let entering = false;
  let enterTimer = 0;
  /** @type {string} Conversation Runtime session id (shared with Pop chat for lead). */
  let conversationSessionId = "";
  /** @type {string} Experience Runtime session id (W3 night-rain production). */
  let experienceSessionId = "";
  /** @type {string} Selected opening for experience-backed scripts. */
  let draftOpeningId = "";
  /** @type {{ reason: string, draft: string, choiceId: string }|null} */
  let lastError = null;
  /** Pending user draft preserved across retryable errors. */
  let pendingDraft = "";
  /** Preserved scroll / draft / branch for Home return (§10.4). */
  let uiSnapshot = {
    scrollTop: 0,
    draft: "",
    branchId: "",
    sceneView: "select",
  };

  root.classList.add("mini-scenario");
  root.innerHTML = `
    <div class="scenario-shell" data-scenario-shell>
      <section class="scenario-view is-active" data-scenario-view="select">
        <header class="scenario-funnel-bar">
          <button type="button" class="scenario-back" data-scenario-exit aria-label="关闭"><i data-lucide="chevron-left"></i></button>
          <div>
            <strong>情景剧</strong>
            <span>作品库</span>
          </div>
          <span></span>
        </header>
        <button type="button" class="scenario-continue-banner" data-scenario-continue hidden>继续未完的一场</button>
        <div class="scenario-cast-strip" data-scenario-select-rail></div>
        <div class="scenario-work-wall" data-scenario-work-wall></div>
      </section>

      <section class="scenario-view" data-scenario-view="chapters" hidden>
        <header class="scenario-funnel-bar">
          <button type="button" class="scenario-back" data-scenario-to-select aria-label="返回作品库"><i data-lucide="chevron-left"></i></button>
          <div>
            <strong data-chapters-char-name>情景剧</strong>
            <span data-chapters-package-title>挑一刻，从这里继续</span>
          </div>
          <button type="button" class="scenario-header-action" data-scenario-author aria-label="写一个新开场"><i data-lucide="pen-line"></i></button>
        </header>
        <button type="button" class="scenario-continue-banner" data-scenario-continue hidden>继续未完的一场</button>
        <div class="scenario-chapter-map" data-scenario-chapter-map></div>
        <div class="scenario-script-list scenario-script-list--compact" data-scenario-scripts hidden></div>
        <form class="scenario-author" data-scenario-author-form hidden>
          <h3>写一个新处境</h3>
          <label><span>场景名</span><input type="text" maxlength="40" data-author-title required placeholder="给这个处境一个名字" /></label>
          <label><span>此刻发生了什么</span><textarea rows="2" maxlength="200" data-author-premise required placeholder="只写起点，不替你们决定结局"></textarea></label>
          <label><span>第一眼</span><textarea rows="2" maxlength="240" data-author-opening placeholder="进入时看到、听到或感受到什么"></textarea></label>
          <label><span>情绪</span>
            <select data-author-mood>
              <option value="warm">暖</option>
              <option value="rain">雨</option>
              <option value="night">夜</option>
              <option value="city">城</option>
            </select>
          </label>
          <div class="scenario-cta">
            <button type="submit" class="scenario-btn is-primary">保存并进入</button>
            <button type="button" class="scenario-btn" data-author-cancel>取消</button>
          </div>
        </form>
      </section>

      <section class="scenario-view scenario-stage-view" data-scenario-view="stage" hidden>
        <div class="scenario-stage scenario-stage--story" data-scenario-stage data-tension="1">
          <header class="scenario-stage-bar" data-scenario-bar></header>
          <div class="scenario-story-scroll" data-scenario-story-scroll>
            <section class="scenario-story-meta" aria-label="当前情景">
              <div class="scenario-stage-main scenario-story-cover" data-scenario-stage-main></div>
              <div class="scenario-story-meta__copy">
                <span data-scenario-story-pair>这场戏刚开幕</span>
                <h2 data-scenario-story-title>此刻</h2>
                <p data-scenario-story-premise>你们从这一刻继续。</p>
              </div>
            </section>
          <div class="scenario-dialogue-host" data-scenario-dialogue></div>
            <div class="scenario-director-error" data-scenario-director-error hidden role="alert"></div>
          </div>
          <div class="scenario-choices scenario-choices--secondary" data-scenario-choices></div>
          <form class="scenario-composer scenario-composer--primary" data-scenario-form></form>
          <aside class="scenario-branch-host" data-scenario-branch-host hidden></aside>
        </div>
      </section>

      <section class="scenario-view" data-scenario-view="finale" hidden>
        <div class="scenario-finale">
          <h2>先停在这里</h2>
          <textarea rows="5" data-scenario-summary placeholder="这段经历对你们意味着什么…"></textarea>
          <div class="scenario-cta">
            <button type="button" class="scenario-btn is-primary" data-scenario-to-diary>写进日记</button>
            <button type="button" class="scenario-btn" data-scenario-again>再开一场</button>
            <button type="button" class="scenario-btn" data-scenario-to-select>回选角</button>
          </div>
        </div>
      </section>
    </div>
  `;

  const shell = root.querySelector("[data-scenario-shell]");
  const stageHost = root.querySelector("[data-scenario-stage-main]");
  const dialogueHost = root.querySelector("[data-scenario-dialogue]");
  const choicesHost = root.querySelector("[data-scenario-choices]");
  const barHost = root.querySelector("[data-scenario-bar]");
  const formHost = root.querySelector("[data-scenario-form]");
  const branchHost = root.querySelector("[data-scenario-branch-host]");
  const storyScroll = root.querySelector("[data-scenario-story-scroll]");
  const storyPair = root.querySelector("[data-scenario-story-pair]");
  const storyTitle = root.querySelector("[data-scenario-story-title]");
  const storyPremise = root.querySelector("[data-scenario-story-premise]");

  const stage = createStageRenderer(stageHost);
  const stageController = createStageController({
    renderStage: (payload) => stage.render(payload),
    onTtsHook: (envelope) => maybeSpeak({
      dialogue: envelope.dialogue,
      voice: { enabled: true, style: envelope.voiceStyle },
    }),
  });
  const dialogue = createDialogueLayer(dialogueHost, {
    onAction: (action, message) => handleDialogueAction(action, message),
  });
  const choices = createChoiceLayer(choicesHost, {
    onChoice: (choice) => advance(choice.text, { choiceId: choice.id }),
  });
  const controls = createControls(barHost, formHost, {
    onRewind: () => handleRewind(),
    onPause: () => handlePause(),
    onFinale: () => openFinale(),
    onFreeSay: (text) => advance(text, { freeSay: true }),
    onBranches: () => branchPanel.toggle(),
  });
  const branchPanel = createBranchPanel(branchHost, {
    getSessionId: () => conversationSessionId,
    onToast: (msg) => deps.onToast?.(msg),
    onSwitched: () => {
      const session = conversationSessionId ? getSession(conversationSessionId) : null;
      if (session) uiSnapshot.branchId = session.activeBranchId || "";
      if (experienceSessionId) syncExperienceBranch(experienceSessionId);
      restoreExperienceUiFromRuntime();
      paintStage(getRun(runId));
      persistUiSnapshot();
    },
    onRegenerate: (messageId) => {
      if (messageId) advance("", { _retry: true, _regenerateMessageId: messageId });
    },
  });

  function formatCharacterBrief(character) {
    if (!character) return "";
    const profile = characterToCollectedProfile(character);
    return [
      `Name: ${profile.name}`,
      profile.alias ? `Alias: ${profile.alias}` : "",
      profile.identity ? `Identity: ${profile.identity}` : "",
      profile.model ? `Model notes: ${profile.model}` : "",
      profile.base ? `Persona: ${profile.base}` : "",
      profile.tokens?.length ? `Traits: ${profile.tokens.join(", ")}` : "",
      profile.ranges?.length ? `Behavior ranges: ${profile.ranges.join(", ")}` : "",
    ].filter(Boolean).join("\n");
  }

  function conversationMessages() {
    const session = conversationSessionId ? getSession(conversationSessionId) : null;
    if (!session) return [];
    return selectVisibleHistory(session, { limit: 80 }).filter(isScenarioHistoryRow).map((row) => {
      const node = session.messageNodes?.[row.messageId || row.id];
      const cands = (node?.candidates || []).filter((c) => c && c.status !== "archived");
      const candidateIndex = Math.max(0, cands.findIndex((c) => c.id === node?.activeCandidateId));
      return {
        ...row,
        candidateCount: cands.length || row.candidateCount || 1,
        candidateIndex,
      };
    });
  }

  function restoreExperienceUiFromRuntime() {
    if (!experienceSessionId) return;
    const exp = getExperienceSession(experienceSessionId);
    if (!exp) return;
    lastChoices = (exp.suggestedActions || []).map((item, index) => ({
      id: `suggest-${index}`,
      text: item.text,
      intent: item.intent || "",
    }));
    const display = exp.lastDisplay || {};
    const performance = exp.lastPerformance || {};
    lastTurn = {
      narration: display.narration || "",
      dialogue: display.dialogue || "",
      contentBlocks: display.contentBlocks || [],
      emotion: performance.emotion || "warm",
      expressionId: performance.expressionId || "soft_smile",
      actionId: performance.actionId || "talking_default",
      backgroundId: performance.backgroundId || "",
      camera: performance.camera || { shot: "medium" },
      voice: { style: performance.voiceStyle || "soft" },
    };
  }

  async function handleDialogueAction(action, message) {
    if (!message?.id || !conversationSessionId) return;
    if (action === "copy") {
      try {
        await navigator.clipboard.writeText(message.text || "");
        deps.onToast?.("已复制");
      } catch {
        deps.onToast?.("复制失败");
      }
      return;
    }
    if (action === "edit" && message.role === "user") {
      const nextText = String(message.editedText || "").trim();
      if (!nextText) return;
      const edited = editMessageContent(conversationSessionId, message.id, nextText, {
        source: "scenario_message_action",
      });
      if (!edited.ok) deps.onToast?.(edited.reason || "编辑失败");
      else {
        if (experienceSessionId) syncExperienceBranch(experienceSessionId);
        restoreExperienceUiFromRuntime();
        paintStage(getRun(runId));
      }
      return;
    }
    if (action === "swipe-prev" || action === "swipe-next") {
      swipeLastCandidate(action === "swipe-next" ? 1 : -1);
      return;
    }
    if (action === "delete") {
      const history = conversationMessages();
      const last = history[history.length - 1];
      const result = last?.id === message.id
        ? rollbackHead(conversationSessionId)
        : rewindFromMessage(conversationSessionId, message.id);
      if (!result.ok) deps.onToast?.(result.reason || "回退失败");
      else afterConversationRewind();
      return;
    }
    if (action === "delete-from") {
      const result = rewindFromMessage(conversationSessionId, message.id);
      if (!result.ok) deps.onToast?.(result.reason || "回退失败");
      else afterConversationRewind();
      return;
    }
    if (action === "fork") {
      const forked = forkFromMessage(conversationSessionId, message.id, {
        label: `分支 ${new Date().toLocaleTimeString()}`,
        meta: { source: "scenario_message_action" },
      });
      if (!forked.ok) deps.onToast?.(forked.reason || "分支失败");
      else {
        if (experienceSessionId) syncExperienceBranch(experienceSessionId);
        restoreExperienceUiFromRuntime();
        paintStage(getRun(runId));
        deps.onToast?.("已从这条消息创建分支");
      }
      return;
    }
    if (action === "regenerate" && message.role === "assistant") {
      await advance("", { _retry: true, _regenerateMessageId: message.id });
    }
  }

  function swipeLastCandidate(delta) {
    const session = conversationSessionId ? getSession(conversationSessionId) : null;
    const cands = listActiveHeadCandidates(session);
    if (cands.length < 2) return;
    const active = cands.find((item) => item.isActive) || cands[0];
    const next = cands[(active.index + delta + cands.length) % cands.length];
    const switched = switchCandidate(conversationSessionId, next.messageId, next.id);
    if (!switched.ok) deps.onToast?.(switched.reason || "换一版失败");
    else afterConversationRewind({ toast: "" });
  }

  function afterConversationRewind({ toast = "已回到上一句" } = {}) {
    stopSpeech();
    if (experienceSessionId) {
      syncExperienceBranch(experienceSessionId);
      restoreExperienceUiFromRuntime();
    } else {
      lastChoices = [];
    }
    const run = getRun(runId);
    if (run?.beats?.length && conversationSessionId) {
      const remaining = conversationMessages().length;
      saveRun({
        ...run,
        beats: run.beats.slice(0, remaining),
        phase: "waiting_user",
        directorState: { ...(run.directorState || {}), phase: "waiting_user" },
      });
    }
    paintStage(getRun(runId));
    persistUiSnapshot();
    if (toast) deps.onToast?.(toast);
  }

  async function handleRewind() {
    if (busy) {
      deps.onToast?.("这一轮还在写，写完再退");
      return;
    }
    if (conversationSessionId) {
      const result = rewindScenarioConversation(conversationSessionId);
      if (!result.ok) {
        deps.onToast?.(result.reason || "回退失败");
        return;
      }
      if (result.leave) {
        await handlePause();
        return;
      }
      afterConversationRewind();
      return;
    }
    const run = getRun(runId);
    const beats = run?.beats || [];
    const plan = planScenarioRewind(beats.map((beat) => ({
      role: beat.kind === "user" || beat.kind === "choice" ? "user" : "assistant",
    })));
    if (plan.kind === "leave") {
      await handlePause();
      return;
    }
    stopSpeech();
    lastChoices = [];
    saveRun({
      ...run,
      beats: beats.slice(0, Math.max(0, beats.length - plan.count)),
      phase: "waiting_user",
      directorState: { ...(run.directorState || {}), phase: "waiting_user" },
    });
    paintStage(getRun(runId));
    persistUiSnapshot();
    deps.onToast?.("已回到上一句");
  }

  function notifyFullscreen() {
    const immersive = view === "stage";
    root.classList.toggle("is-immersive-stage", immersive);
    shell?.classList.toggle("is-immersive", immersive);
    try {
      deps.onFullscreenChange?.(immersive);
    } catch {
      /* optional */
    }
  }

  function captureUiSnapshot() {
    const input = formHost?.querySelector("[data-scenario-input]");
    const session = conversationSessionId ? getSession(conversationSessionId) : null;
    uiSnapshot = {
      scrollTop: Number(storyScroll?.scrollTop) || 0,
      draft: String(input?.value || pendingDraft || ""),
      branchId: session?.activeBranchId || uiSnapshot.branchId || "",
      sceneView: view,
      runId,
      experienceSessionId,
      conversationSessionId,
      openingId: draftOpeningId,
    };
    return { ...uiSnapshot };
  }

  function persistUiSnapshot() {
    const snap = captureUiSnapshot();
    saveAppUiState("scenario", snap);
    if (conversationSessionId) {
      try {
        saveUiState(conversationSessionId, {
          draft: snap.draft,
          scrollAnchor: String(snap.scrollTop),
        });
      } catch {
        /* optional */
      }
    }
    return snap;
  }

  function restoreUiSnapshot(state) {
    const snap = state || loadAppUiState("scenario") || uiSnapshot;
    if (!snap) return;
    uiSnapshot = { ...uiSnapshot, ...snap };
    if (snap.draft != null) {
      pendingDraft = String(snap.draft);
      const input = formHost?.querySelector("[data-scenario-input]");
      if (input && !input.value) input.value = pendingDraft;
    }
    if (Number.isFinite(Number(snap.scrollTop)) && storyScroll) {
      storyScroll.scrollTop = Number(snap.scrollTop);
    }
  }

  function setView(next) {
    view = next;
    root.querySelectorAll("[data-scenario-view]").forEach((node) => {
      const active = node.dataset.scenarioView === next;
      node.classList.toggle("is-active", active);
      node.hidden = !active;
    });
    shell?.setAttribute("data-view", next);
    notifyFullscreen();
    refreshIcons();
  }

  /** 头像 only — never pet/package/dev art. Empty → initials. */
  function resolveCastAvatar(ch = {}) {
    return resolveCharacterAvatarUrl(ch);
  }

  async function renderSelect() {
    const rail = root.querySelector("[data-scenario-select-rail]");
    const wall = root.querySelector("[data-scenario-work-wall]");
    if (!rail) return;
    rail.innerHTML = `<p class="scenario-cast-strip__note">每部作品有自己的角色和关系，不会接着日常聊天继续。</p>`;
    if (wall) {
      const works = listLibraryItems();
      if (!works.length) {
        wall.innerHTML = `<p class="scenario-empty">还没有作品。可以从下方写一个新开场，或先导入作品包。</p>`;
      } else {
        wall.innerHTML = works.map((item) => {
          const cover = workCoverSrc(item);
          const mood = escapeHtml(item.mood || "warm");
          const playing = item.progress?.status === "active" || item.progress?.status === "paused";
          const cta = playing ? "继续" : "开始";
          const tags = (item.tags || []).slice(0, 3).map((tag) => `<i>${escapeHtml(tag)}</i>`).join("");
          const coverMedia = cover
            ? `<img class="scenario-work-card__art" src="${escapeHtml(cover)}" alt="" draggable="false" />`
            : "";
          return `
            <button type="button" class="scenario-work-card" data-mood="${mood}"
              data-pick-work="${escapeHtml(item.id)}"
              data-pick-script="${escapeHtml(item.id)}">
              <span class="scenario-work-card__cover">
                ${coverMedia}
                ${playing ? `<b class="scenario-work-card__badge">未完</b>` : ""}
              </span>
              <span class="scenario-work-card__meta">
                <small>${tags || `<i>${escapeHtml(item.emotionTag || "开放")}</i>`}</small>
                <strong>${escapeHtml(item.title)}</strong>
                <em>${escapeHtml(item.premise || "")}</em>
                <span class="scenario-work-card__go">${cta}<i data-lucide="arrow-right"></i></span>
              </span>
            </button>
          `;
        }).join("");
      }
    }
    const continueHome = root.querySelector("[data-scenario-view=\"select\"] [data-scenario-continue]");
    if (continueHome) {
      const active = getActiveRun();
      const label = continueLabel();
      continueHome.hidden = !active;
      continueHome.textContent = label || "继续未完的一场";
    }
    refreshIcons();
  }

  async function openWork(scriptId) {
    const wanted = String(scriptId || draftScriptId || "script-rain-station").trim();
    const script = getScript(wanted) || getScript("script-rain-station");
    if (script) draftScriptId = script.id;
    const pkg = script ? ensureScenarioExperiencePackage(script) : null;
    const lead = resolveScenarioLead(pkg || script, {});
    draftCast = normalizeCast({
      leadId: lead.id,
      memberIds: [lead.id],
      isolated: true,
      lead,
      leadName: lead.name,
      persona: lead.persona,
    });
    draftLoreIds = [...(script?.loreEntryIds || [])];
    draftOpeningId = "";
    authorOpen = false;
    const form = root.querySelector("[data-scenario-author-form]");
    if (form) form.hidden = true;
    const charName = root.querySelector("[data-chapters-char-name]");
    const pkgTitle = root.querySelector("[data-chapters-package-title]");
    if (charName) charName.textContent = script?.title || "开场";
    if (pkgTitle) pkgTitle.textContent = "选一个开场，角色和关系从这里重设";
    await renderChapters();
    setView("chapters");
  }

  async function openChaptersForCharacter() {
    await openWork(draftScriptId || "script-rain-station");
  }

  async function renderChapters() {
    const map = root.querySelector("[data-scenario-chapter-map]");
    const continueBtn = root.querySelector("[data-scenario-view=\"chapters\"] [data-scenario-continue]");
    const list = root.querySelector("[data-scenario-scripts]");
    const active = getActiveRun();
    const label = continueLabel();
    if (continueBtn) {
      const sameWork = !active?.scriptId || active.scriptId === draftScriptId;
      continueBtn.hidden = !(label && sameWork);
      continueBtn.textContent = label || "继续未完的一场";
    }

    const script = getScript(draftScriptId);
    const pkg = script ? ensureScenarioExperiencePackage(script) : null;
    const openings = pkg?.openings || [];

    if (map) {
      if (openings.length) {
        if (!draftOpeningId) draftOpeningId = openings[0].id;
        map.innerHTML = `
          <header class="scenario-opening-list__head">
            <span>开场</span>
            <strong>选一句开场白，走进去</strong>
            <em>${openings.length} 种关系</em>
          </header>
          <div class="scenario-opening-list">
            ${openings.map((opening, i) => {
              const on = draftOpeningId === opening.id;
              const greet = openingGreeting(opening);
              return `
                <button type="button" class="scenario-opening-card ${on ? "is-on" : ""}"
                  data-opening-id="${escapeHtml(opening.id)}"
                  data-opening-enter="${escapeHtml(opening.id)}">
                  <span class="scenario-opening-card__index">${String(i + 1).padStart(2, "0")}</span>
                  <span class="scenario-opening-card__copy">
                    <strong>${escapeHtml(opening.title)}</strong>
                    <em class="scenario-opening-teaser">${escapeHtml(opening.relationshipPremise || opening.teaser || "")}</em>
                    ${greet ? `<q>${escapeHtml(greet)}</q>` : ""}
                    <span>从这里进入<i data-lucide="arrow-right"></i></span>
                  </span>
                </button>
              `;
            }).join("")}
          </div>
        `;
        map.style.minHeight = "";
      } else {
        map.innerHTML = `<p class="scenario-empty">这个处境没有开场快照。可从下方书架进入，或自写一个。</p>`;
      }
    }

    if (list) {
      list.hidden = true;
      list.innerHTML = "";
    }
    refreshIcons();
  }

  function toggleAuthor(show) {
    authorOpen = show;
    const form = root.querySelector("[data-scenario-author-form]");
    const map = root.querySelector("[data-scenario-chapter-map]");
    if (form) form.hidden = !show;
    if (map) map.hidden = show;
  }

  async function beginExperienceRun({ openingId } = {}) {
    if (openingId) draftOpeningId = openingId;
    if (!draftScriptId) draftScriptId = "script-rain-station";
    const scriptForCast = getScript(draftScriptId);
    const pkgForCast = scriptForCast ? ensureScenarioExperiencePackage(scriptForCast) : null;
    const openingForCast = pkgForCast
      ? getPackageOpening(pkgForCast, draftOpeningId)
      : null;
    const scenarioLead = resolveScenarioLead(pkgForCast || scriptForCast, openingForCast || {});
    draftCast = normalizeCast({
      leadId: scenarioLead.id,
      memberIds: [scenarioLead.id],
      isolated: true,
      lead: scenarioLead,
      leadName: scenarioLead.name,
      persona: scenarioLead.persona,
    });
    try {
      if (draftLoreIds.length) {
        const scriptForLore = getScript(draftScriptId);
        if (scriptForLore && (scriptForLore.source === "user" || scriptForLore.source === "cocreate")) {
          upsertUserScript({ ...scriptForLore, loreEntryIds: draftLoreIds });
        }
      }
      const script = getScript(draftScriptId);
      const demoOffline = Boolean(deps.devDemo || deps.forceOfflineFixed);
      const pkg = script ? ensureScenarioExperiencePackage(script) : null;
      const useExperience = Boolean(pkg) && !demoOffline;

      const run = startRun({
        scriptId: draftScriptId,
        cast: draftCast,
        backgroundId: script?.backgroundId || "",
        loreEntryIds: draftLoreIds,
      });

      if (useExperience) {
        saveRun({ ...run, beats: [], productionRuntime: "experience" });
      }

      if (useExperience) {
        const exp = enterExperience({
          packageId: pkg.id,
          openingId: draftOpeningId || undefined,
          characterId: draftCast?.leadId || "",
          legacyRunId: run.id,
          package: pkg,
          meta: { loreEntryIds: draftLoreIds },
        });
        if (!exp.ok) {
          deps.onToast?.(`开幕失败：${exp.reason || "experience"}`);
          return;
        }
        experienceSessionId = exp.value.id;
        conversationSessionId = exp.conversationSessionId || "";
        lastChoices = (exp.value.suggestedActions || []).map((a, i) => ({
          id: `suggest-${i}`,
          text: a.text,
          intent: a.intent || "",
        }));
        const perf = exp.value?.lastPerformance || exp.opening?.initialPerformance || {};
        const display = exp.value?.lastDisplay || {};
        lastTurn = {
          actionId: perf.actionId || "talking_default",
          expressionId: perf.expressionId || "soft_smile",
          emotion: perf.emotion || "warm",
          backgroundId: perf.backgroundId || script?.backgroundId || "",
          narration: display.narration || "",
          dialogue: display.dialogue || "",
          contentBlocks: display.contentBlocks || [],
        };
        saveRun({
          ...getRun(run.id),
          experienceSessionId,
          conversationSessionId,
          openingId: draftOpeningId,
          backgroundId: lastTurn.backgroundId || script?.backgroundId || "",
        });
        try {
          deps.sidewrite?.emitEvent?.({
            type: "scenario_cohabit_opened",
            characterId: draftCast?.leadId || "",
            scriptId: draftScriptId,
            runId: run.id,
            experienceSessionId,
            at: Date.now(),
          });
        } catch {
          /* ignore */
        }
      } else {
        experienceSessionId = "";
        conversationSessionId = "";
      }

      await openStage(getRun(run.id) || run, { enter: true });
      if (!useExperience) await advance("");
    } catch (error) {
      console.warn("begin experience failed", error);
      deps.onToast?.("未能进入舞台");
    }
  }

  /** @deprecated kept name for older restore paths */
  async function refreshLobby() {
    await renderSelect();
  }

  async function openCurtain(scriptId) {
    draftScriptId = scriptId;
    draftLoreIds = [...(getScript(scriptId)?.loreEntryIds || [])];
    draftOpeningId = "";
    await renderChapters();
    setView("chapters");
  }

  async function renderLoreChips() {
    const wrap = root.querySelector("[data-scenario-lore]");
    const host = root.querySelector("[data-scenario-lore-chips]");
    if (!wrap || !host) return;
    let entries = [];
    try {
      entries = (await deps.listWorldbook?.()) || [];
    } catch {
      entries = [];
    }
    if (!entries.length) {
      wrap.hidden = true;
      host.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    host.innerHTML = entries.slice(0, 24).map((entry) => {
      const id = String(entry.id || "");
      const label = entry.title || entry.name || id;
      const on = draftLoreIds.includes(id);
      return `
        <button type="button" class="scenario-lore-chip ${on ? "is-on" : ""}" data-lore-id="${escapeHtml(id)}" aria-pressed="${on}">
          ${escapeHtml(label)}
        </button>
      `;
    }).join("");
  }

  async function renderCastPicker() {
    const host = root.querySelector("[data-scenario-cast-list]");
    if (!host) return;
    const characters = await listCharacters();
    draftCast = normalizeCast(draftCast);
    if (!characters.length) {
      host.innerHTML = '<p class="scenario-empty">还没有角色卡，先去创建角色吧。</p>';
      return;
    }
    host.innerHTML = characters.map((character) => {
      const selected = draftCast.memberIds.includes(character.id);
      const lead = draftCast.leadId === character.id;
      const avatar = resolveCharacterAvatarUrl(character);
      const initial = escapeHtml((character.name || "?").slice(0, 1));
      return `
        <button type="button"
          class="scenario-cast-chip ${selected ? "is-selected" : ""} ${lead ? "is-lead" : ""}"
          data-cast-id="${escapeHtml(character.id)}"
          aria-pressed="${selected ? "true" : "false"}">
          ${avatar
            ? `<img src="${escapeHtml(avatar)}" alt="" />`
            : `<span class="scenario-cast-chip__initial" aria-hidden="true">${initial}</span>`}
          <span>${escapeHtml(character.name || "角色")}</span>
          ${lead ? "<em>主演</em>" : selected ? "<em>配角</em>" : ""}
        </button>
      `;
    }).join("");
  }

  function toggleCast(characterId) {
    const id = String(characterId || "").trim();
    if (!id) return;
    const set = new Set(draftCast.memberIds);
    if (set.has(id)) {
      if (set.size <= 1) return;
      set.delete(id);
      draftCast.memberIds = [...set];
      if (draftCast.leadId === id) draftCast.leadId = draftCast.memberIds[0];
    } else {
      set.add(id);
      draftCast.memberIds = [...set];
      if (!draftCast.leadId) draftCast.leadId = id;
    }
    draftCast = normalizeCast(draftCast);
    renderCastPicker();
  }

  function setLead(characterId) {
    const id = String(characterId || "").trim();
    if (!id) return;
    if (!draftCast.memberIds.includes(id)) draftCast.memberIds = [...draftCast.memberIds, id];
    draftCast.leadId = id;
    draftCast = normalizeCast(draftCast);
    renderCastPicker();
  }

  function paintDirectorError() {
    const el = root.querySelector("[data-scenario-director-error]");
    if (!el) return;
    if (!lastError) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    const rawReason = String(lastError.reason || "");
    let reason = "这一轮没有生成完成";
    let hint = "你的输入已经保留，可以稍后重试。";
    if (rawReason.includes("missing_provider_config")) {
      reason = "还没有配置可用的模型";
      hint = "请先在接口设置中配置模型。你的输入仍保留在当前世界线，配置后可直接重试。";
    } else if (rawReason.includes("invalid_or_unparseable_model_output")) {
      reason = "这次回复没有被完整读懂";
      hint = "你的输入已经保留，重试不会播放预先写好的假剧情。";
    } else if (rawReason.includes("model_call_failed")) {
      reason = "模型连接暂时失败";
      hint = "检查网络与接口状态后重试；本轮不会写入预先编排的替代剧情。";
    } else if (rawReason.includes("empty_turn")) {
      reason = "这一轮没有生成有效内容";
    }
    el.innerHTML = `
      <strong>${escapeHtml(reason)}</strong>
      <p>${escapeHtml(hint)}</p>
      <div class="scenario-director-error__actions">
        <button type="button" class="scenario-btn is-primary" data-scenario-retry>重试这一轮</button>
      </div>
    `;
  }

  function paintStage(run, { enter = false } = {}) {
    if (!run) return;
    const script = getScript(run.scriptId);
    controls.setTitle(script?.title || "台上");
    const tension = Math.max(0, Math.min(3, Number(run.directorState?.tension ?? 1)));
    const stageEl = root.querySelector("[data-scenario-stage]");
    stageEl?.setAttribute("data-tension", String(tension));
    const meter = root.querySelector("[data-tension-meter]");
    meter?.setAttribute("data-tension", String(tension));

    const scriptPkg = script ? ensureScenarioExperiencePackage(script) : null;
    const exp = experienceSessionId ? getExperienceSession(experienceSessionId) : null;
    const opening = scriptPkg
      ? getPackageOpening(scriptPkg, exp?.openingId || run.openingId || draftOpeningId)
      : null;
    const scenarioLead = run.cast?.lead || resolveScenarioLead(scriptPkg || script, opening || {});
    const companionLead = run.cast?.isolated ? null : getCharacterSync(run.cast?.leadId);
    const leadName = scenarioLead.name || run.cast?.leadName || companionLead?.name || "对方";
    const leadAvatar = resolveScenarioPortraitUrl(companionLead) || "";
    const actionId = lastTurn?.actionId || run.directorState?.lastActionId || "greet";
    const expressionId = lastTurn?.expressionId || run.directorState?.lastExpressionId || "soft_smile";
    const emotion = lastTurn?.emotion || run.directorState?.lastEmotion || "warm";
    const backgroundId = lastTurn?.backgroundId || run.directorState?.backgroundId || script?.backgroundId || "";

    if (enter) {
      entering = true;
      window.clearTimeout(enterTimer);
      enterTimer = window.setTimeout(() => {
        entering = false;
        stage.setEntering(false);
      }, 1600);
    }

    // Listening pose while generating; idle machine / preload via stage controller.
    stageController.applyPerformance({
      backgroundId,
      mood: script?.mood || "",
      sceneId: script?.sceneId || lastTurn?.sceneId || "",
      actionId: busy ? "listen" : actionId,
      expressionId,
      emotion,
      portraitUrl: resolveScenarioPortraitUrl(lead) || "",
      characterId: run.cast?.leadId || lead?.id || "",
      entering: enter || entering,
      camera: lastTurn?.camera || { shot: "medium" },
      dialogue: lastTurn?.dialogue || "",
      narration: lastTurn?.narration || "",
      listening: Boolean(busy),
    });

    if (storyPair) storyPair.textContent = opening?.title || scenarioLead.relationshipLine || "这场戏刚开幕";
    if (storyTitle) storyTitle.textContent = script?.title || "未命名情景";
    if (storyPremise) {
      storyPremise.textContent = opening?.relationshipPremise || script?.premise || "故事从此刻继续。";
    }
    dialogue.render({
      messages: experienceSessionId ? conversationMessages() : undefined,
      beats: experienceSessionId ? [] : (run.beats || []),
      leadName,
      leadAvatar,
    });
    choices.render(lastChoices);
    paintDirectorError();
    shell?.setAttribute("data-phase", phaseFromRun(run));
    if (branchPanel.isOpen()) branchPanel.refresh();
    if (storyScroll) {
      window.requestAnimationFrame(() => {
        storyScroll.scrollTop = storyScroll.scrollHeight;
      });
    }
  }

  /**
   * Enter honest error state without advancing the formal scenario with fake dialogue.
   * @param {object} run
   * @param {{ reason: string, draft?: string, choiceId?: string, source?: string }} detail
   */
  function enterDirectorError(run, detail) {
    const reason = String(detail.reason || "model_unavailable");
    lastError = {
      reason,
      draft: String(detail.draft || pendingDraft || ""),
      choiceId: String(detail.choiceId || ""),
    };
    pendingDraft = lastError.draft;
    // Telemetry: never mark offline_fallback as a successful advance.
    markDirectorGeneration(run, {
      source: "model",
      reason: `retryable_error:${reason}`,
      scriptId: run?.scriptId,
    });
    if (run?.id) {
      saveRun({
        ...run,
        phase: "waiting_user",
        directorState: {
          ...(run.directorState || {}),
          phase: "waiting_user",
          lastGenerationSource: "model",
          lastGenerationReason: `retryable_error:${reason}`,
          lastError: reason,
        },
      });
    }
    deps.onToast?.(formatUserErrorFromReason(reason));
    paintStage(getRun(runId) || run);
  }

  async function maybeSpeak(turn) {
    if (!turn?.voice?.enabled || !turn?.dialogue) return;
    if (!canSpeak()) return;
    try {
      const blob = await synthesizeSpeech(turn.dialogue);
      // Fire-and-forget playback via temporary audio — failure must not block stage
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play().catch(() => URL.revokeObjectURL(url));
    } catch {
      /* TTS degrade */
    }
  }

  function notifyRuntime(turn) {
    if (!turn) return;
    try {
      deps.onRuntimeAction?.({
        actionId: turn.actionId,
        expressionId: turn.expressionId,
        emotion: turn.emotion,
        text: turn.dialogue,
        voice: turn.voice,
      });
    } catch {
      /* optional */
    }
  }

  /** Best-effort Conversation Runtime — never break the stage. */
  function syncConversationEnter(run) {
    try {
      const rebound = rebindAwayFromCompanionDm({
        conversationSessionId: run?.conversationSessionId || conversationSessionId,
        packageId: run?.experiencePackageId || run?.scriptId || "",
        openingId: run?.openingId || draftOpeningId,
        runId: run?.id || "",
        characterId: run?.cast?.leadId || "",
      });
      const session = rebound.ok ? rebound.session : null;
      if (!session) return;
      conversationSessionId = session.id;
      enterImmersive(session.id, {
        scenarioId: run.scriptId || "",
        runId: run.id || "",
        loreEntryIds: run.loreEntryIds || draftLoreIds || [],
        experienceSessionId: run.experienceSessionId || experienceSessionId || "",
        packageId: run.experiencePackageId || "",
        openingId: run.openingId || draftOpeningId || "",
      });
      if (run?.id) {
        const live = getRun(run.id) || run;
        if (live && live.conversationSessionId !== session.id) {
          saveRun({ ...live, conversationSessionId: session.id });
        }
      }
    } catch (error) {
      console.warn("conversation enterImmersive failed", error);
    }
  }

  function syncConversationExit() {
    if (!conversationSessionId) return;
    try {
      exitImmersive(conversationSessionId);
    } catch (error) {
      console.warn("conversation exitImmersive failed", error);
    }
  }

  function syncConversationAdvance(userText, turn, meta = {}) {
    if (!conversationSessionId) return;
    try {
      const clean = String(userText || "").trim();
      if (clean) {
        appendUserTurn(conversationSessionId, clean, {
          choiceId: meta.choiceId || "",
          freeSay: Boolean(meta.freeSay),
          beatId: meta.beatId || "",
          source: "scenario_advance",
        });
      }
      const assistantText = String(turn?.dialogue || turn?.narration || "").trim();
      if (assistantText) {
        appendAssistantTurn(conversationSessionId, assistantText, {
          pose: turn?.actionId || "",
          expressionId: turn?.expressionId || "",
          emotion: turn?.emotion || "",
          choices: turn?.choices || [],
          beatId: turn?.beatId || "",
          sources: turn?.sources || [],
          backgroundId: turn?.backgroundId || "",
          source: "scenario_director",
        });
      }
    } catch (error) {
      console.warn("conversation append turns failed", error);
    }
  }

  async function openStage(run, { enter = false } = {}) {
    runId = run.id;
    experienceSessionId = run.experienceSessionId || experienceSessionId || "";
    conversationSessionId = run.conversationSessionId || conversationSessionId || "";
    syncConversationEnter(run);
    if (experienceSessionId) {
      syncExperienceBranch(experienceSessionId);
      restoreExperienceUiFromRuntime();
    }
    if (!lastChoices.length && !experienceSessionId) {
      lastChoices = [
        { id: "lean-in", text: "靠近一点", intent: "closeness" },
        { id: "ask", text: "轻轻问一句", intent: "curious" },
        { id: "silence", text: "先不说话", intent: "pause" },
      ];
    }
    setView("stage");
    paintStage(getRun(runId) || run, { enter });
  }

  async function advance(userText, meta = {}) {
    if (busy || !runId) return;
    const run = getRun(runId);
    if (!run || run.status === "ended") return;
    busy = true;
    choices.setBusy(true);
    controls.setDisabled(true);
    try {
      const stepped = transitionPhase(phaseFromRun(run), "resolving");
      saveRun({
        ...run,
        phase: stepped.ok ? "resolving" : phaseFromRun(run),
        directorState: { ...(run.directorState || {}), phase: stepped.ok ? "resolving" : phaseFromRun(run) },
      });

      const clean = String(userText || "").trim();
      if (clean) pendingDraft = clean;
      const activeExperienceSessionId = experienceSessionId || run.experienceSessionId || "";

      // Show user beat immediately; skip re-append on retry of the same draft.
      if (clean && !meta._retry && !activeExperienceSessionId) {
        appendBeats(runId, [{
          id: `beat-${Date.now()}-u`,
          at: Date.now(),
          kind: meta.choiceId ? "choice" : "user",
          text: clean,
          choiceId: meta.choiceId || "",
        }]);
      }

      let turn = null;
      /** @type {"model"|"offline_fixed"|"offline_fallback"|"e2e_stub"} */
      let generationSource = "model";
      let generationReason = "";
      const config = await resolveProviderConfig(deps);
      const e2eStub = isE2eExperienceStub();
      const directorOpts = {
        choiceId: meta.choiceId || "",
        devDemo: Boolean(meta.devDemo),
        forceOfflineFixed: Boolean(meta.forceOfflineFixed),
      };
      const useOfflineFixed = allowOfflineDirector(meta) || allowOfflineDirector(directorOpts);
      const expSessionId = activeExperienceSessionId;
      const useExperienceRuntime = Boolean(expSessionId) && !useOfflineFixed;

      // W2: offlineDirectorTurn only behind explicit devDemo / forceOfflineFixed (never default).
      // W3: night-rain production → Experience Runtime (canonical assemble + Conversation V2).
      if (useOfflineFixed) {
        generationSource = "offline_fixed";
        generationReason = meta.devDemo ? "dev_demo" : "force_offline_fixed";
        turn = offlineDirectorTurn(getRun(runId), clean, {
          ...directorOpts,
          generationSource,
          generationReason,
        });
      } else if (useExperienceRuntime) {
        if (!e2eStub && (!config?.apiKey || !config?.baseUrl)) {
          enterDirectorError(getRun(runId) || run, {
            reason: "missing_provider_config",
            draft: clean,
            choiceId: meta.choiceId || "",
          });
          return;
        }
        try {
          const lead = getCharacterSync(run.cast?.leadId);
          const stubCall = e2eStub ? getE2eExperienceStub() : null;
          const result = await runExperienceDirectorTurn({
            experienceSessionId: expSessionId,
            userInput: clean,
            skipUserAppend: Boolean(meta._retry),
            regenerateMessageId: meta._regenerateMessageId || "",
            characterName: lead?.name || "",
            characterBrief: formatCharacterBrief(lead),
            callModel: stubCall
              || (async ({ messages }) => {
                const modelResult = await callModel(config, messages, {
                  stream: false,
                  businessPurpose: "creative.scenario_experience_director",
                  capability: "chat",
                  companionId: lead?.id || "",
                });
                return { content: modelResult?.content || "" };
              }),
          });
          if (!result.ok || !result.output) {
            enterDirectorError(getRun(runId) || run, {
              reason: result.reason || "experience_director_failed",
              draft: clean,
              choiceId: meta.choiceId || "",
            });
            return;
          }
          const out = result.output;
          turn = {
            ok: true,
            narration: out.display.narration,
            dialogue: out.display.dialogue,
            contentBlocks: out.contentBlocks || out.display.contentBlocks || [],
            emotion: out.performance.emotion,
            expressionId: out.performance.expressionId,
            actionId: out.performance.actionId,
            backgroundId: out.performance.backgroundId || run.directorState?.backgroundId,
            camera: out.performance.camera,
            voice: { style: out.performance.voiceStyle },
            choices: (out.suggestedActions || []).map((a, i) => ({
              id: `suggest-${i}`,
              text: a.text,
              intent: a.intent || "",
            })),
            suggestEnding: Boolean(out.ending?.mayEnd),
            memoryCandidate: "",
            _generationSource: e2eStub ? "e2e_stub" : "model",
            _generationReason: e2eStub ? "e2e_experience_stub" : "experience_runtime",
            _experience: true,
          };
          generationSource = e2eStub ? "e2e_stub" : "model";
          generationReason = e2eStub ? "e2e_experience_stub" : "experience_runtime";
          markDirectorGeneration(getRun(runId), {
            source: generationSource,
            reason: generationReason,
            scriptId: run.scriptId,
          });
          // Director already wrote Conversation V2 — skip duplicate sync below.
          meta._experienceSynced = true;
        } catch (error) {
          console.warn("experience director failed — honest error (no offline plot)", error);
          enterDirectorError(getRun(runId) || run, {
            reason: `model_call_failed:${error?.message || error || "unknown"}`,
            draft: clean,
            choiceId: meta.choiceId || "",
          });
          return;
        }
      } else if (!e2eStub && (!config?.apiKey || !config?.baseUrl)) {
        enterDirectorError(getRun(runId) || run, {
          reason: "missing_provider_config",
          draft: clean,
          choiceId: meta.choiceId || "",
        });
        return;
      } else {
        try {
          const current = getRun(runId);
          const messages = await buildDirectorMessages(current, clean);
          const result = await callModel(config, messages, {
            stream: false,
            businessPurpose: "creative.scenario_director",
            capability: "chat",
            companionId: current?.cast?.leadId || "",
          });
          turn = parseDirectorOutput(result?.content || "", {
            tension: current.directorState?.tension,
            sceneId: current.scriptId,
            speakerId: current.cast?.leadId,
            characterId: current.cast?.leadId,
            backgroundId: current.directorState?.backgroundId || getScript(current.scriptId)?.backgroundId,
            allowSilentOffline: false,
          });
          if (!turn || turn.ok === false || turn.offline || (!turn.dialogue && !turn.narration)) {
            enterDirectorError(current || run, {
              reason: turn?.error || "invalid_or_unparseable_model_output",
              draft: clean,
              choiceId: meta.choiceId || "",
            });
            return;
          }
          generationSource = "model";
          generationReason = "";
          markDirectorGeneration(current, {
            source: "model",
            reason: "",
            scriptId: current?.scriptId,
          });
          turn._generationSource = "model";
          turn._generationReason = "";
        } catch (error) {
          console.warn("scenario director failed — honest error (no offline plot)", error);
          enterDirectorError(getRun(runId) || run, {
            reason: `model_call_failed:${error?.message || error || "unknown"}`,
            draft: clean,
            choiceId: meta.choiceId || "",
          });
          return;
        }
      }

      if (!turn?.dialogue && !turn?.narration) {
        enterDirectorError(getRun(runId) || run, {
          reason: "empty_turn_after_primary",
          draft: clean,
          choiceId: meta.choiceId || "",
        });
        return;
      }

      lastError = null;
      pendingDraft = "";
      lastTurn = turn;
      if (!turn._experience) appendBeats(runId, beatsFromScenarioTurn(turn));
      const latest = getRun(runId);
      const directorState = applyTurnToRunState(latest, turn);
      const nextPhase = phaseAfterTurn(turn, { beatCount: (latest.beats || []).length });
      saveRun({
        ...latest,
        phase: nextPhase,
        directorState: {
          ...directorState,
          phase: nextPhase,
          lastGenerationSource: generationSource,
          lastGenerationReason: generationReason,
          lastError: "",
        },
      });
      lastChoices = (turn.choices || []).map((c) => ({
        id: c.id,
        text: c.text || c.label,
        intent: c.intent || "",
      }));
      if (!meta._experienceSynced) {
      syncConversationAdvance(clean, turn, meta);
      }
      paintStage(getRun(runId));
      notifyRuntime(turn);
      maybeSpeak(turn);
      if (backgroundGeneration) {
        backgroundGeneration = false;
        try {
          deps.onBackgroundComplete?.({
            appId: "scenario",
            runId,
            experienceSessionId,
            conversationSessionId,
            label: "情景推进完成",
          });
        } catch {
          /* optional */
        }
        deps.onToast?.("情景推进完成，点此回去继续");
      }
    } finally {
      busy = false;
      choices.setBusy(false);
      controls.setDisabled(false);
    }
  }

  async function handlePause() {
    if (!runId) return;
    stopSpeech();
    persistUiSnapshot();
    pauseScenarioRun(runId);
    if (experienceSessionId) {
      pauseExperience(experienceSessionId, { draft: pendingDraft });
    }
    // Do not cancel in-flight generation — mark background (§10.4).
    if (busy) backgroundGeneration = true;
    syncConversationExit();
    branchPanel.close();
    await renderChapters();
    setView("chapters");
  }

  function openFinale() {
    // Finale is always user-ended — never beat-tree confluence (§8.6 / W4).
    const run = getRun(runId);
    if (experienceSessionId) {
      endExperience(experienceSessionId, { reason: "user_finale" });
    }
    syncConversationExit();
    const summary = root.querySelector("[data-scenario-summary]");
    const script = getScript(run?.scriptId);
    const lead = getCharacterSync(run?.cast?.leadId)?.name || "TA";
    const presetSummary = run ? pickFinaleSummary(run.scriptId, run) : "";
    const candidate = run?.directorState?.memoryCandidate || "";
    if (summary) {
      summary.value = run?.summary
        || candidate
        || presetSummary
        || `《${script?.title || "这一幕"}》里，${lead}与你把故事停在了一个刚好的地方。`;
    }
    if (run) {
      saveRun({
        ...run,
        status: "ended",
        phase: "finale",
        summary: summary?.value || "",
        endedBy: "user",
        directorState: { ...(run.directorState || {}), phase: "finale" },
      });
    }
    experienceSessionId = "";
    branchPanel.close();
    setView("finale");
    persistUiSnapshot();
  }

  async function writeFinaleToDiary() {
    const run = getRun(runId) || getActiveRun();
    const summaryEl = root.querySelector("[data-scenario-summary]");
    const finaleSummary = String(summaryEl?.value || run?.summary || "").trim();
    if (!finaleSummary) {
      deps.onToast?.("先写下这一幕留下了什么");
      return;
    }
    if (!run?.id) {
      deps.onToast?.("没有可写的演出");
      return;
    }
    // Keep summary field filled for the write path (openFinale also prefills).
    if (summaryEl && !String(summaryEl.value || "").trim()) {
      summaryEl.value = finaleSummary;
    }
    const result = await commitFinaleMemory(run.id, finaleSummary);

    // W5: experience-backed finale also reviews accepted worldline only.
    const expSid = String(run.experienceSessionId || experienceSessionId || "").trim();
    if (expSid && result.ok) {
      try {
        const session = getExperienceSession(expSid);
        const branchId = String(
          session?.activeBranchId || run.conversationBranchId || "main",
        ).trim();
        const characterId = String(
          session?.characterId || run.cast?.leadId || "",
        ).trim();
        if (characterId && branchId) {
          const proposed = proposeCandidatesFromSignals({
            characterId,
            experienceSessionId: expSid,
            branchId,
            signals: [
              {
                summary: finaleSummary,
                type: "shared_event",
                confidence: 0.75,
                sourceMessageIds: [],
                proposedRelationPatch: { intimacyDelta: 1, kind: "shared_experience" },
              },
            ],
            source: "experience.finale",
          });
          for (const c of proposed.created || []) {
            acceptCandidate(c.id);
          }
          for (const c of proposed.reused || []) {
            if (String(c.status) === "pending" || String(c.status) === "proposed") {
              acceptCandidate(c.id);
            }
          }
          commitFinaleReview({
            experienceSessionId: expSid,
            branchId,
            characterId,
            packageTitle: getScript(run.scriptId)?.title || "",
            runKind: session?.meta?.runKind || "",
            sessionMeta: session?.meta || {},
          });
          const companion = suggestPostSceneCompanionAction({ characterId });
          if (companion.ok) {
            deps.onRuntimeAction?.({
              type: "post_scene_companion",
              actionId: companion.actionId,
              hint: companion.hint,
              projectionKey: companion.projectionKey,
              candidateId: companion.candidateId,
            });
          }
        }
      } catch (error) {
        console.warn("experience finale review failed", error);
      }
    }

    const diaryPayload = {
      runId: result.runId || run.id,
      diaryId: result.diaryId || "",
      eventId: result.eventId || "",
      summary: result.summary || finaleSummary,
    };
    if (result.alreadyCommitted) {
      deps.onToast?.("已经写过了");
      deps.onPetIdle?.();
      deps.onOpenDiary?.(diaryPayload);
      return;
    }
    if (result.ok) {
      deps.onToast?.("已写进日记");
      deps.onPetIdle?.();
      deps.onOpenDiary?.(diaryPayload);
    } else {
      deps.onToast?.("出了点小状况");
    }
  }

  const onClick = async (event) => {
    if (destroyed) return;

    const selectChar = event.target.closest("[data-scenario-select-char]")?.dataset.scenarioSelectChar;
    if (selectChar) {
      selectHighlightId = selectChar;
      await renderSelect();
      return;
    }
    if (event.target.closest("[data-scenario-select-confirm]")) {
      if (selectHighlightId) await openChaptersForCharacter(selectHighlightId);
      return;
    }
    if (event.target.closest("[data-scenario-exit]")) {
      if (view === "stage" || view === "finale") syncConversationExit();
      // Root lobby back must leave the app — never no-op on select.
      if (typeof deps.onHome === "function") {
        deps.onHome();
      } else {
        console.warn("[scenario] data-scenario-exit: onHome missing");
      }
      return;
    }
    if (event.target.closest("[data-scenario-to-select]")) {
      if (view === "stage" || view === "finale") syncConversationExit();
      selectHighlightId = draftCast.leadId || selectHighlightId;
      await renderSelect();
      setView("select");
      return;
    }
    if (event.target.closest("[data-scenario-author]")) {
      toggleAuthor(true);
      return;
    }
    if (event.target.closest("[data-author-cancel]")) {
      toggleAuthor(false);
      await renderChapters();
      return;
    }
    if (event.target.closest("[data-scenario-continue], [data-scenario-continue-chip]")) {
      const active = getActiveRun();
      if (active) {
        const resumed = resumeScenarioRun(active.id) || active;
        experienceSessionId = resumed.experienceSessionId || "";
        if (experienceSessionId) {
          resumeExperience(experienceSessionId);
        }
        lastTurn = {
          actionId: resumed.directorState?.lastActionId || "talking_default",
          expressionId: resumed.directorState?.lastExpressionId || "soft_smile",
          emotion: resumed.directorState?.lastEmotion || "warm",
          backgroundId: resumed.directorState?.backgroundId || "",
        };
        await openStage(resumed, { enter: false });
      }
      return;
    }
    const enterOpening = event.target.closest("[data-opening-enter]")?.dataset.openingEnter;
    if (enterOpening) {
      await beginExperienceRun({ openingId: enterOpening });
      return;
    }
    const workId = event.target.closest("[data-pick-work]")?.dataset.pickWork
      || event.target.closest("[data-pick-script]")?.dataset.pickScript;
    if (workId) {
      await openWork(workId, selectHighlightId);
      return;
    }
    if (event.target.closest("[data-scenario-to-lobby], [data-scenario-to-chapters]")) {
      if (view === "stage" || view === "finale") syncConversationExit();
      if (draftCast.leadId) {
        await openChaptersForCharacter(draftCast.leadId);
      } else {
        await renderSelect();
        setView("select");
      }
      return;
    }
    if (event.target.closest("[data-scenario-retry]")) {
      const draft = lastError?.draft || pendingDraft || "";
      const choiceId = lastError?.choiceId || "";
      await advance(draft, { choiceId, _retry: true });
      return;
    }
    if (event.target.closest("[data-scenario-to-diary]")) {
      await writeFinaleToDiary();
      return;
    }
    if (event.target.closest("[data-scenario-again]")) {
      if (draftCast.leadId) await openChaptersForCharacter(draftCast.leadId);
      else {
        await renderSelect();
        setView("select");
      }
    }
  };

  root.addEventListener("click", onClick);
  root.querySelector("[data-scenario-author-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = String(root.querySelector("[data-author-title]")?.value || "").trim();
    const premise = String(root.querySelector("[data-author-premise]")?.value || "").trim();
    const openingBeat = String(root.querySelector("[data-author-opening]")?.value || "").trim();
    const mood = String(root.querySelector("[data-author-mood]")?.value || "warm");
    if (!title || !premise) return;
    const script = upsertUserScript({ title, premise, openingBeat, mood, source: "user" });
    ensureScenarioExperiencePackage(script);
    toggleAuthor(false);
    draftScriptId = script.id;
    deps.onToast?.("处境已保存");
    await beginExperienceRun({});
  });

  // Keyboard 1–4 for choices on desktop
  const onKey = (event) => {
    if (view !== "stage" || busy) return;
    const n = Number(event.key);
    if (n >= 1 && n <= 4 && lastChoices[n - 1]) {
      event.preventDefault();
      advance(lastChoices[n - 1].text, { choiceId: lastChoices[n - 1].id });
    }
  };
  window.addEventListener("keydown", onKey);

  renderSelect().then(() => setView("select"));
  refreshIcons();

  return {
    refresh: () => {
      restoreUiSnapshot();
      return refreshLobby();
    },
    /** Capture UI for App Lifecycle (scroll / draft / branch / scene). */
    captureUiState: () => persistUiSnapshot(),
    restoreUiState: (state) => restoreUiSnapshot(state),
    /** Called when phone leaves scenario to Home — keep generation alive. */
    onBackground: () => {
      if (busy) backgroundGeneration = true;
      return persistUiSnapshot();
    },
    onForeground: () => {
      backgroundGeneration = false;
      restoreUiSnapshot();
      if (runId && view === "stage") paintStage(getRun(runId));
      branchPanel.refresh();
    },
    getBackgroundJob: () => (busy || backgroundGeneration
      ? { busy: true, label: "情景推进中" }
      : null),
    /** Test / capture hook */
    getState: () => ({
      view,
      runId,
      conversationSessionId,
      experienceSessionId,
      openingId: draftOpeningId,
      phase: runId ? phaseFromRun(getRun(runId)) : "library",
      choices: lastChoices,
      lastActionId: lastTurn?.actionId || "",
      productionRuntime: experienceSessionId ? "experience" : "",
      backgroundGeneration,
      uiSnapshot: { ...uiSnapshot },
    }),
    branchPanel,
    destroy() {
      destroyed = true;
      window.clearTimeout(enterTimer);
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("click", onClick);
      stopSpeech();
      stageController.destroy();
      stage.destroy();
      dialogue.destroy();
      choices.destroy();
      controls.destroy();
      branchPanel.destroy();
      root.replaceChildren();
    },
  };
}
